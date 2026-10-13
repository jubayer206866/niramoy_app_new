/**
 * Admin CMS API (/api/admin/*).
 *
 * Everything here is guarded by requireAdmin. Catalogue entities (products,
 * categories, banners, site text) are written straight to the catalogue
 * tables for correct SQL-side sort/filter, and snapshotted into
 * admin_overrides so a re-harvest does not erase the team's work.
 * Uploaded images are written to public/img/uploads; only their URL is stored.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db, { now } from "./db.mjs";
import { ah, requireAdmin } from "./auth.mjs";
import { saveOverride, dropOverride, readOverride } from "./admin-overrides.mjs";
import {
  mountAdminWallet,
  notifyTxn,
  orderRefunded,
  refundOrderToWallet,
  walletBalance,
} from "./wallet.mjs";
import {
  ORDER_STATUSES,
  mountAdminNotifications,
  notifyOrderStatus,
  orderEvents,
  recordOrderEvent,
} from "./notifications.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_IMG = path.join(ROOT, "public", "img");
const UPLOAD_DIR = path.join(PUBLIC_IMG, "uploads");

const UPLOAD_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".ico"]);
const MEDIA_DIRS = {
  uploads: UPLOAD_DIR,
  banners: path.join(PUBLIC_IMG, "banners"),
  categories: path.join(PUBLIC_IMG, "categories"),
  products: path.join(PUBLIC_IMG, "products"),
};

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const flag = (v) => (v ? 1 : 0);
const slugify = (s) =>
  str(s, 140)
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "item";

const PRODUCT_COLS = [
  "id", "slug", "name", "type", "form", "strength", "generic", "brand", "rx",
  "short_desc", "description_html", "note", "meta_title", "unit_label", "price",
  "mrp", "discount_percent", "stock_status", "rating", "rating_count", "cold",
  "view_count", "trending_score", "image", "images", "hidden",
];

const P_SELECT = `id, slug, name, type, form, strength, generic, brand, rx,
  short_desc AS shortDesc, description_html AS descriptionHtml, note,
  meta_title AS metaTitle, unit_label AS unitLabel, price, mrp,
  discount_percent AS discountPercent, stock_status AS stockStatus,
  rating, rating_count AS ratingCount, cold, view_count AS viewCount,
  trending_score AS trendingScore, image, images, hidden`;

const ORDER_SELECT = `SELECT id, user_id AS userId, name, phone, email, address, city, note,
  payment_method AS paymentMethod, subtotal, delivery_fee AS deliveryFee,
  discount, total, items_count AS itemsCount, status, created_at AS placedAt
  FROM orders`;

const ORDER_ITEMS_SELECT = `SELECT product_id AS id, name, slug, unit_label AS unitLabel, image, price, mrp, qty
  FROM order_items WHERE order_id = ? ORDER BY id`;

const CUSTOMER_SELECT = `SELECT id, name, email, phone, role, created_at AS createdAt,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = users.id) AS orders,
  (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = users.id
     AND o.status != 'cancelled') AS spend
  FROM users WHERE id = ?`;

function toProduct(r) {
  if (!r) return null;
  let images = [];
  try {
    images = JSON.parse(r.images || "[]");
  } catch {
    images = [];
  }
  const { images: _i, hidden, ...rest } = r;
  return {
    ...rest,
    rx: !!r.rx,
    cold: !!r.cold,
    stockStatus: r.stockStatus === 1,
    hidden: hidden === 1,
    images,
  };
}

const catsOf = async (productId) =>
  (
    await db.all(
      "SELECT category_slug FROM product_categories WHERE product_id = ? ORDER BY category_slug",
      [productId],
    )
  ).map((r) => r.category_slug);

const fullProductRow = (id) => db.get("SELECT * FROM products WHERE id = ?", [id]);

/** Write a product edit to the live catalogue and snapshot it durably. */
async function persistProduct(id, categories, userId) {
  const row = await fullProductRow(id);
  if (!row) return null;
  const prev = await readOverride("product", id);
  await saveOverride(
    "product",
    id,
    row,
    { categories: categories ?? (await catsOf(id)), isNew: prev?.meta?.isNew || undefined },
    userId,
  );
  return row;
}

async function replaceCategories(q, id, categories) {
  await q.run("DELETE FROM product_categories WHERE product_id = ?", [id]);
  for (const c of categories) {
    await q.run("INSERT IGNORE INTO product_categories (product_id,category_slug) VALUES (?,?)", [
      id,
      c,
    ]);
  }
}

const siteValues = async () =>
  Object.fromEntries(
    (await db.all("SELECT `key`, value FROM site_text")).map((r) => [r.key, r.value ?? ""]),
  );

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAdmin);

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const count = async (sql, params) => (await db.get(sql, params)).n;

  mountAdminWallet(router);
  mountAdminNotifications(router);

  // ------------------------------------------------------------- overview
  router.get("/overview", ah(async (_req, res) => {
    const kpis = {
      orders: await count("SELECT COUNT(*) n FROM orders"),
      ordersToday: await count("SELECT COUNT(*) n FROM orders WHERE created_at >= UTC_DATE()"),
      pending: await count("SELECT COUNT(*) n FROM orders WHERE status IN ('placed','confirmed','packed')"),
      revenue: (await db.get("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status != 'cancelled'")).v,
      customers: await count("SELECT COUNT(*) n FROM users WHERE role != 'admin'"),
      newCustomers7d: await count(
        "SELECT COUNT(*) n FROM users WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY",
      ),
      products: await count("SELECT COUNT(*) n FROM products WHERE hidden = 0"),
      outOfStock: await count("SELECT COUNT(*) n FROM products WHERE hidden = 0 AND stock_status = 0"),
      hidden: await count("SELECT COUNT(*) n FROM products WHERE hidden = 1"),
    };

    const statuses = await db.all(
      "SELECT status, COUNT(*) count FROM orders GROUP BY status ORDER BY count DESC",
    );

    const dayRows = await db.all(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') day, SUM(total) revenue, COUNT(*) orders
       FROM orders WHERE created_at >= UTC_DATE() - INTERVAL 13 DAY AND status != 'cancelled'
       GROUP BY day`,
    );
    const byDay = new Map(dayRows.map((r) => [r.day, r]));
    const revenue14d = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
      const hit = byDay.get(day);
      return { day, revenue: hit ? hit.revenue : 0, orders: hit ? hit.orders : 0 };
    });

    const recentOrders = await db.all(
      `SELECT id, name, phone, total, status, items_count AS itemsCount, created_at AS placedAt
       FROM orders ORDER BY created_at DESC LIMIT 8`,
    );

    const topProducts = await db.all(
      `SELECT product_id AS id, name, image, SUM(qty) units, SUM(qty * price) revenue
       FROM order_items GROUP BY product_id, name, image
       ORDER BY units DESC, revenue DESC LIMIT 8`,
    );

    const outOfStock = await db.all(
      `SELECT id, name, image, price, unit_label AS unitLabel FROM products
       WHERE hidden = 0 AND stock_status = 0 ORDER BY trending_score DESC LIMIT 8`,
    );

    res.json({ kpis, statuses, revenue14d, recentOrders, topProducts, outOfStock });
  }));

  // ------------------------------------------------------------- products
  router.get("/products", ah(async (req, res) => {
    const q = str(req.query.q, 120);
    const cat = str(req.query.cat, 80);
    const status = str(req.query.status, 20) || "visible";
    const stock = str(req.query.stock, 20) || "all";
    const sort = str(req.query.sort, 20);
    const limit = Math.min(Math.max(num(req.query.limit, 20), 1), 100);
    const page = Math.max(num(req.query.page, 1), 1);

    const where = [];
    const params = {};
    if (q) {
      where.push(`(name LIKE :q OR slug LIKE :q OR brand LIKE :q OR generic LIKE :q)`);
      params.q = `%${q}%`;
    }
    if (cat) {
      where.push(`id IN (SELECT product_id FROM product_categories WHERE category_slug = :cat)`);
      params.cat = cat;
    }
    if (status === "hidden") where.push("hidden = 1");
    else if (status !== "all") where.push("hidden = 0");
    if (stock === "in") where.push("stock_status = 1");
    if (stock === "out") where.push("stock_status = 0");

    const SORTS = {
      newest: "id DESC",
      name: "name ASC",
      "price-asc": "price ASC",
      "price-desc": "price DESC",
      popular: "trending_score DESC",
      low: "price ASC",
    };
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = await count(`SELECT COUNT(*) n FROM products ${whereSql}`, params);
    const rows = await db.all(
      `SELECT ${P_SELECT},
        (SELECT GROUP_CONCAT(category_slug) FROM product_categories pc
           WHERE pc.product_id = products.id) AS catSlugs
       FROM products ${whereSql}
       ORDER BY ${SORTS[sort] || SORTS.newest}
       LIMIT ${(page - 1) * limit}, ${limit}`,
      params,
    );

    res.json({
      total,
      page,
      limit,
      products: rows.map((r) => ({
        ...toProduct(r),
        categories: r.catSlugs ? r.catSlugs.split(",") : [],
      })),
    });
  }));

  router.get("/products/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    const row = await db.get(`SELECT ${P_SELECT} FROM products WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ error: "Product not found." });
    res.json({ product: toProduct(row), categories: await catsOf(id) });
  }));

  function validateProductBody(body) {
    const errors = {};
    const name = str(body?.name, 200);
    if (name.length < 2) errors.name = "Product name is required.";
    const price = Number(body?.price);
    if (!Number.isFinite(price) || price < 0) errors.price = "Enter a valid price.";
    return { errors, name, price };
  }

  router.post("/products", ah(async (req, res) => {
    const { errors, name, price } = validateProductBody(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    let slug = slugify(req.body?.slug || name);
    if (await db.get("SELECT 1 FROM products WHERE slug = ?", [slug])) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }
    const id = (
      await db.get("SELECT COALESCE(MAX(id), 999999) + 1 n FROM products WHERE id >= 1000000")
    ).n;
    const categories = Array.isArray(req.body?.categories)
      ? req.body.categories.map(String).filter(Boolean)
      : [];
    const images = Array.isArray(req.body?.images) ? req.body.images.map(String) : [];
    const image = str(req.body?.image, 400) || images[0] || "";

    const row = {
      id,
      slug,
      name,
      type: str(req.body?.type, 60),
      form: str(req.body?.form, 60),
      strength: str(req.body?.strength, 80),
      generic: str(req.body?.generic, 120),
      brand: str(req.body?.brand, 120),
      rx: flag(req.body?.rx),
      short_desc: str(req.body?.shortDesc, 400),
      description_html: String(req.body?.descriptionHtml ?? "").slice(0, 40000),
      note: str(req.body?.note, 400),
      meta_title: str(req.body?.metaTitle, 200),
      unit_label: str(req.body?.unitLabel, 80),
      price,
      mrp: num(req.body?.mrp, price),
      discount_percent: num(req.body?.discountPercent, 0),
      stock_status: flag(req.body?.stockStatus ?? true),
      rating: num(req.body?.rating, 0),
      rating_count: num(req.body?.ratingCount, 0),
      cold: flag(req.body?.cold),
      view_count: 0,
      trending_score: 0,
      image,
      images: JSON.stringify(images.length ? images : image ? [image] : []),
      hidden: flag(req.body?.hidden),
    };

    await db.tx(async (q) => {
      await q.run(
        `INSERT INTO products (${PRODUCT_COLS.join(",")})
         VALUES (${PRODUCT_COLS.map((c) => `:${c}`).join(",")})`,
        row,
      );
      await replaceCategories(q, id, categories);
    });

    const saved = await fullProductRow(id);
    await saveOverride("product", id, saved, { categories, isNew: true }, req.user.id);
    res.status(201).json({ product: toProduct(saved), categories });
  }));

  router.patch("/products/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    const current = await fullProductRow(id);
    if (!current) return res.status(404).json({ error: "Product not found." });

    const errors = {};
    const body = req.body || {};
    const sets = [];
    const params = { id };

    if (body.name !== undefined) {
      const name = str(body.name, 200);
      if (name.length < 2) errors.name = "Product name is required.";
      else {
        sets.push("name = :name");
        params.name = name;
      }
    }
    if (body.slug !== undefined) {
      const slug = slugify(body.slug || current.slug);
      const clash = await db.get("SELECT 1 FROM products WHERE slug = ? AND id != ?", [slug, id]);
      if (clash) errors.slug = "That slug is already used by another product.";
      else {
        sets.push("slug = :slug");
        params.slug = slug;
      }
    }
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) errors.price = "Enter a valid price.";
      else {
        sets.push("price = :price");
        params.price = price;
      }
    }
    const plain = {
      type: ["type", 60],
      form: ["form", 60],
      strength: ["strength", 80],
      generic: ["generic", 120],
      brand: ["brand", 120],
      shortDesc: ["short_desc", 400],
      note: ["note", 400],
      metaTitle: ["meta_title", 200],
      unitLabel: ["unit_label", 80],
    };
    for (const [key, [col, max]] of Object.entries(plain)) {
      if (body[key] === undefined) continue;
      sets.push(`${col} = :${key}`);
      params[key] = str(body[key], max);
    }
    if (body.descriptionHtml !== undefined) {
      sets.push("description_html = :descriptionHtml");
      params.descriptionHtml = String(body.descriptionHtml).slice(0, 40000);
    }
    if (body.mrp !== undefined) {
      sets.push("mrp = :mrp");
      params.mrp = num(body.mrp, 0);
    }
    if (body.discountPercent !== undefined) {
      sets.push("discount_percent = :discountPercent");
      params.discountPercent = num(body.discountPercent, 0);
    }
    for (const key of ["rx", "cold", "hidden"]) {
      if (body[key] === undefined) continue;
      sets.push(`${key} = :${key}`);
      params[key] = flag(body[key]);
    }
    if (body.stockStatus !== undefined) {
      sets.push("stock_status = :stock_status");
      params.stock_status = flag(body.stockStatus);
    }
    if (body.image !== undefined) {
      sets.push("image = :image");
      params.image = str(body.image, 400);
    }
    if (body.images !== undefined) {
      const images = Array.isArray(body.images) ? body.images.map(String) : [];
      sets.push("images = :images");
      params.images = JSON.stringify(images);
      if (body.image === undefined) {
        sets.push("image = :image");
        params.image = images[0] || "";
      }
    }

    if (Object.keys(errors).length) return res.status(400).json({ errors });
    if (!sets.length && body.categories === undefined) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    let categories = await catsOf(id);
    await db.tx(async (q) => {
      if (sets.length) await q.run(`UPDATE products SET ${sets.join(", ")} WHERE id = :id`, params);
      if (Array.isArray(body.categories)) {
        categories = body.categories.map(String).filter(Boolean);
        await replaceCategories(q, id, categories);
      }
    });

    await persistProduct(id, categories, req.user.id);
    res.json({ product: toProduct(await fullProductRow(id)), categories });
  }));

  router.delete("/products/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    if (!(await db.get("SELECT 1 FROM products WHERE id = ?", [id]))) {
      return res.status(404).json({ error: "Product not found." });
    }
    await db.tx(async (q) => {
      await q.run("DELETE FROM product_categories WHERE product_id = ?", [id]);
      await q.run("DELETE FROM faqs WHERE product_id = ?", [id]);
      await q.run("DELETE FROM products WHERE id = ?", [id]);
    });
    await dropOverride("product", id);
    res.json({ ok: true });
  }));

  // ----------------------------------------------------------- categories
  router.get("/categories", ah(async (_req, res) => {
    const rows = await db.all(
      `SELECT id, slug, name, icon, has_page AS hasPage,
        (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_slug = categories.slug) AS productCount
       FROM categories ORDER BY id`,
    );
    res.json(rows.map((r) => ({ ...r, hasPage: !!r.hasPage })));
  }));

  router.post("/categories", ah(async (req, res) => {
    const name = str(req.body?.name, 80);
    const slug = slugify(req.body?.slug || name);
    if (name.length < 2) return res.status(400).json({ errors: { name: "Name is required." } });
    if (!/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ errors: { slug: "Use lowercase letters, numbers and dashes." } });
    if (await db.get("SELECT 1 FROM categories WHERE slug = ?", [slug])) {
      return res.status(409).json({ errors: { slug: "That category already exists." } });
    }
    const id = (await db.get("SELECT COALESCE(MAX(id),0) + 1 n FROM categories")).n;
    const row = {
      id,
      slug,
      name,
      icon: str(req.body?.icon, 400),
      has_page: flag(req.body?.hasPage ?? true),
    };
    await db.run(
      "INSERT INTO categories (id,slug,name,icon,has_page) VALUES (:id,:slug,:name,:icon,:has_page)",
      row,
    );
    await saveOverride("category", slug, row, {}, req.user.id);
    res.status(201).json({ category: { ...row, hasPage: !!row.has_page } });
  }));

  router.patch("/categories/:slug", ah(async (req, res) => {
    const slug = str(req.params.slug, 80);
    const current = await db.get("SELECT * FROM categories WHERE slug = ?", [slug]);
    if (!current) return res.status(404).json({ error: "Category not found." });
    const row = {
      id: current.id,
      slug: current.slug,
      name: req.body?.name !== undefined ? str(req.body.name, 80) : current.name,
      icon: req.body?.icon !== undefined ? str(req.body.icon, 400) : current.icon,
      has_page:
        req.body?.hasPage !== undefined ? flag(req.body.hasPage) : current.has_page,
    };
    if (row.name.length < 2) return res.status(400).json({ errors: { name: "Name is required." } });
    await db.run(
      "UPDATE categories SET name = :name, icon = :icon, has_page = :has_page WHERE slug = :slug",
      row,
    );
    await saveOverride("category", slug, row, {}, req.user.id);
    res.json({ category: { ...row, hasPage: !!row.has_page } });
  }));

  router.delete("/categories/:slug", ah(async (req, res) => {
    const slug = str(req.params.slug, 80);
    const inUse = await count(
      "SELECT COUNT(*) n FROM product_categories WHERE category_slug = ?",
      [slug],
    );
    if (inUse) {
      return res
        .status(409)
        .json({ error: `${inUse} product(s) still belong to this category. Reassign them first.` });
    }
    const info = await db.run("DELETE FROM categories WHERE slug = ?", [slug]);
    if (!info.affectedRows) return res.status(404).json({ error: "Category not found." });
    await dropOverride("category", slug);
    res.json({ ok: true });
  }));

  // -------------------------------------------------------------- banners
  const bannerSelect =
    "SELECT id, title, subtitle, link, image, machine FROM banners ORDER BY id";

  router.get("/banners", ah(async (_req, res) => res.json(await db.all(bannerSelect))));

  router.post("/banners", ah(async (req, res) => {
    const id = (await db.get("SELECT COALESCE(MAX(id),0) + 1 n FROM banners")).n;
    const row = {
      id,
      title: str(req.body?.title, 120),
      subtitle: str(req.body?.subtitle, 200),
      link: str(req.body?.link, 300),
      image: str(req.body?.image, 400),
      machine: str(req.body?.machine, 80) || "top_carousel_1",
    };
    await db.run(
      "INSERT INTO banners (id,title,subtitle,link,image,machine) VALUES (:id,:title,:subtitle,:link,:image,:machine)",
      row,
    );
    await saveOverride("banner", id, row, {}, req.user.id);
    res.status(201).json({ banner: row });
  }));

  router.patch("/banners/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    const current = await db.get("SELECT * FROM banners WHERE id = ?", [id]);
    if (!current) return res.status(404).json({ error: "Banner not found." });
    const row = {
      id,
      title: req.body?.title !== undefined ? str(req.body.title, 120) : current.title,
      subtitle: req.body?.subtitle !== undefined ? str(req.body.subtitle, 200) : current.subtitle,
      link: req.body?.link !== undefined ? str(req.body.link, 300) : current.link,
      image: req.body?.image !== undefined ? str(req.body.image, 400) : current.image,
      machine: req.body?.machine !== undefined ? str(req.body.machine, 80) : current.machine,
    };
    await db.run(
      "UPDATE banners SET title=:title, subtitle=:subtitle, link=:link, image=:image, machine=:machine WHERE id=:id",
      row,
    );
    await saveOverride("banner", id, row, {}, req.user.id);
    res.json({ banner: row });
  }));

  router.delete("/banners/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    const info = await db.run("DELETE FROM banners WHERE id = ?", [id]);
    if (!info.affectedRows) return res.status(404).json({ error: "Banner not found." });
    await dropOverride("banner", id);
    res.json({ ok: true });
  }));

  // ----------------------------------------------------------- site text
  router.get("/site", ah(async (_req, res) => {
    res.json(await siteValues());
  }));

  router.put("/site", ah(async (req, res) => {
    const values = req.body?.values;
    if (!values || typeof values !== "object") {
      return res.status(400).json({ error: "values object is required." });
    }
    await db.tx(async (q) => {
      for (const [key, raw] of Object.entries(values)) {
        const k = str(key, 60);
        const value = str(raw, 5000);
        if (!k) continue;
        await q.run("REPLACE INTO site_text (`key`,value) VALUES (?,?)", [k, value]);
        await saveOverride("site", k, { value }, {}, req.user.id, q);
      }
    });
    res.json(await siteValues());
  }));

  // -------------------------------------------------------------- orders
  router.get("/orders", ah(async (req, res) => {
    const status = str(req.query.status, 20);
    const q = str(req.query.q, 120);
    const limit = Math.min(Math.max(num(req.query.limit, 20), 1), 100);
    const page = Math.max(num(req.query.page, 1), 1);
    const where = [];
    const params = {};
    if (status && status !== "all") {
      where.push("status = :status");
      params.status = status;
    }
    if (q) {
      where.push(`(id LIKE :q OR name LIKE :q OR phone LIKE :q OR address LIKE :q)`);
      params.q = `%${q}%`;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = await count(`SELECT COUNT(*) n FROM orders ${whereSql}`, params);
    const orders = await db.all(
      `${ORDER_SELECT} ${whereSql} ORDER BY created_at DESC LIMIT ${(page - 1) * limit}, ${limit}`,
      params,
    );
    const counts = await db.all("SELECT status, COUNT(*) count FROM orders GROUP BY status");
    res.json({ total, page, limit, orders, counts });
  }));

  router.get("/orders/:id", ah(async (req, res) => {
    const order = await db.get(`${ORDER_SELECT} WHERE id = ?`, [str(req.params.id, 40)]);
    if (!order) return res.status(404).json({ error: "Order not found." });
    const items = await db.all(ORDER_ITEMS_SELECT, [order.id]);
    const customer = order.userId ? await db.get(CUSTOMER_SELECT, [order.userId]) : null;
    const customerOrders = customer
      ? await db.all(
          `SELECT id, status, total, created_at AS placedAt FROM orders
           WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
          [customer.id],
        )
      : [];
    const events = await orderEvents(order.id);
    const walletRefunded = order.paymentMethod === "wallet" && (await orderRefunded(order.id));
    res.json({ order: { ...order, items, events, walletRefunded }, customer, customerOrders });
  }));

  router.patch("/orders/:id", ah(async (req, res) => {
    const id = str(req.params.id, 40);
    const status = str(req.body?.status, 20);
    const note = str(req.body?.note, 300);
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${ORDER_STATUSES.join(", ")}.` });
    }
    const order = await db.get(`${ORDER_SELECT} WHERE id = ?`, [id]);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (order.status === status) {
      return res.status(409).json({ error: "The order already has this status." });
    }
    if (order.status === "cancelled" && order.paymentMethod === "wallet" && (await orderRefunded(id))) {
      return res.status(409).json({
        error: "This order was paid from the wallet and refunded when it was cancelled, so it can't be reopened. Ask the customer to order again.",
      });
    }
    let refund = null;
    await db.tx(async (q) => {
      await q.run("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
      await recordOrderEvent(id, status, note, req.user.id, q);
      if (status === "cancelled") refund = await refundOrderToWallet(q, id, note);
    });
    const items = await db.all(ORDER_ITEMS_SELECT, [id]);
    res.json({ order: { ...order, status, items, events: await orderEvents(id) }, refunded: refund?.amount ?? 0 });
    void (async () => {
      await notifyOrderStatus({ ...order, status }, status, note, refund?.amount ?? 0);
      if (refund) await notifyTxn(refund.userId, refund.txnId, "admin");
    })().catch((err) => console.warn(`orders: notify failed (${err.message})`));
  }));

  // ----------------------------------------------------------- customers
  router.get("/customers", ah(async (req, res) => {
    const q = str(req.query.q, 120);
    const role = str(req.query.role, 20);
    const limit = Math.min(Math.max(num(req.query.limit, 20), 1), 100);
    const page = Math.max(num(req.query.page, 1), 1);
    const where = [];
    const params = {};
    if (q) {
      where.push(`(u.name LIKE :q OR u.email LIKE :q OR u.phone LIKE :q)`);
      params.q = `%${q}%`;
    }
    if (role === "admin") where.push("u.role = 'admin'");
    if (role === "customer") where.push("u.role != 'admin'");
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = await count(`SELECT COUNT(*) n FROM users u ${whereSql}`, params);
    const customers = await db.all(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at AS createdAt,
         (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
         (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id
            AND o.status != 'cancelled') AS spend
       FROM users u ${whereSql}
       ORDER BY u.created_at DESC LIMIT ${(page - 1) * limit}, ${limit}`,
      params,
    );
    res.json({ total, page, limit, customers });
  }));

  router.get("/customers/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    const customer = await db.get(CUSTOMER_SELECT, [id]);
    if (!customer) return res.status(404).json({ error: "Customer not found." });
    const addresses = await db.all(
      `SELECT id, label, name, phone, address, city, area, is_default AS isDefault
       FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`,
      [id],
    );
    const orders = await db.all(
      `SELECT id, status, total, items_count AS itemsCount, payment_method AS paymentMethod,
              address, city, created_at AS placedAt
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [id],
    );
    const reviews = await db.all(
      `SELECT product_id AS productId, rating, body, created_at AS createdAt
       FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [id],
    );
    res.json({
      customer,
      addresses: addresses.map((a) => ({ ...a, isDefault: !!a.isDefault })),
      orders,
      reviews,
      wallet: await walletBalance(id),
    });
  }));

  router.patch("/customers/:id", ah(async (req, res) => {
    const id = num(req.params.id);
    const role = str(req.body?.role, 20);
    if (!["admin", "customer"].includes(role)) {
      return res.status(400).json({ error: "Role must be admin or customer." });
    }
    const target = await db.get("SELECT id, role FROM users WHERE id = ?", [id]);
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.role === "admin" && role !== "admin") {
      const admins = await count("SELECT COUNT(*) n FROM users WHERE role = 'admin'");
      if (admins <= 1) {
        return res.status(400).json({ error: "The store must keep at least one administrator." });
      }
      if (id === req.user.id) {
        return res.status(400).json({ error: "You cannot remove your own admin access." });
      }
    }
    await db.run("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [role, now(), id]);
    res.json({ customer: await db.get(CUSTOMER_SELECT, [id]) });
  }));

  // --------------------------------------------------------------- media
  const dirCache = new Map();
  const MEDIA_TTL = 60_000;
  function listMedia(dirKey, q) {
    const dir = MEDIA_DIRS[dirKey];
    if (!dir || !fs.existsSync(dir)) return [];
    let entry = dirCache.get(dirKey);
    if (!entry || Date.now() - entry.at > MEDIA_TTL) {
      const names = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => d.name)
        .filter((n) => UPLOAD_EXTS.has(path.extname(n).toLowerCase()));
      entry = { at: Date.now(), names };
      dirCache.set(dirKey, entry);
    }
    let out = entry.names;
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter((n) => n.toLowerCase().includes(needle));
    }
    out = [...out].sort();
    if (dirKey === "products") out = out.slice(0, 300);
    return out.map((name) => {
      const full = path.join(dir, name);
      let size = 0;
      let mtime = 0;
      try {
        const st = fs.statSync(full);
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        /* raced with a delete */
      }
      return { name, url: `/img/${dirKey}/${name}`, size, mtime, dir: dirKey };
    });
  }

  router.get("/media", (req, res) => {
    const dir = str(req.query.dir, 20) || "uploads";
    if (!MEDIA_DIRS[dir]) return res.status(400).json({ error: "Unknown media folder." });
    const files = listMedia(dir, str(req.query.q, 80));
    res.json({ dir, files: files.slice(0, 400), writable: dir === "uploads" });
  });

  router.post("/media", (req, res) => {
    const name = path.basename(str(req.body?.name, 180));
    const ext = path.extname(name).toLowerCase();
    if (!UPLOAD_EXTS.has(ext)) {
      return res.status(400).json({ error: "Only image files are allowed (png, jpg, webp, gif)." });
    }
    const data = String(req.body?.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!data) return res.status(400).json({ error: "Image data is missing." });
    let buf;
    try {
      buf = Buffer.from(data, "base64");
    } catch {
      return res.status(400).json({ error: "Image data could not be decoded." });
    }
    if (!buf.length) return res.status(400).json({ error: "Image data could not be decoded." });
    if (buf.length > 6 * 1024 * 1024) {
      return res.status(413).json({ error: "Images must be 6 MB or smaller." });
    }
    const filename = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
    dirCache.delete("uploads");
    res.status(201).json({
      file: {
        name: filename,
        url: `/img/uploads/${filename}`,
        size: buf.length,
        mtime: Date.now(),
        dir: "uploads",
      },
    });
  });

  router.delete("/media", (req, res) => {
    const dir = str(req.query.dir, 20) || "uploads";
    if (dir !== "uploads") return res.status(403).json({ error: "That folder is read-only." });
    const name = path.basename(str(req.query.name, 180));
    const full = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(full)) return res.status(404).json({ error: "File not found." });
    fs.rmSync(full);
    dirCache.delete("uploads");
    res.json({ ok: true });
  });

  return router;
}
