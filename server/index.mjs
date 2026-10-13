import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import db, { ensureSchema } from "./db.mjs";
import { ah, attachUser } from "./auth.mjs";
import { createAccountRouter } from "./account-routes.mjs";
import { createAdminRouter } from "./admin-routes.mjs";
import { syncOverrides, ensureAdminAccount } from "./admin-overrides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

await ensureSchema();
const applied = await syncOverrides();
if (applied) console.log(`admin: replayed ${applied} override(s) onto the catalogue`);
const seeded = await ensureAdminAccount();
if (seeded) {
  console.warn(
    `admin: seeded first administrator - ${seeded.email} / ${seeded.password} (change it, or set ADMIN_EMAIL/ADMIN_PASSWORD)`,
  );
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: "8mb" }));
app.use((req, _res, next) => {
  if (!req.url.startsWith("/img/")) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  }
  next();
});

// ---------- cross-origin (packaged mobile app) ----------
// The Capacitor shell runs on its own origin and talks to us over the LAN, so
// it needs CORS. Credentials are deliberately NOT allowed: the app carries its
// session in the X-Session-Token header, which keeps cookies (and the
// SameSite/HTTPS problems that come with them) out of the picture.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // capacitor://localhost (iOS), http://localhost (Android) and plain web origins
  if (origin && /^(https?|capacitor|ionic|file):\/\//.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Token");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------- helpers ----------
const P_COLS = `id, slug, name, type, form, strength, generic, brand, rx,
  short_desc AS shortDesc, description_html AS descriptionHtml, note,
  meta_title AS metaTitle, unit_label AS unitLabel, price, mrp,
  discount_percent AS discountPercent, stock_status AS stockStatus,
  rating, rating_count AS ratingCount, cold, view_count AS viewCount,
  trending_score AS trendingScore, image, images, hidden`;

function rowToProduct(r) {
  if (!r) return null;
  let images = [];
  try {
    images = JSON.parse(r.images || "[]");
  } catch {
    images = [];
  }
  const { images: _img, hidden: _hidden, ...rest } = r;
  return {
    ...rest,
    rx: !!r.rx,
    cold: !!r.cold,
    stockStatus: r.stockStatus === 1,
    images,
  };
}

const qAll = `SELECT ${P_COLS} FROM products`;

function parseSort(sort) {
  const map = {
    popular: "trending_score DESC",
    "price-asc": "price ASC",
    "price-desc": "price DESC",
    rating: "rating DESC, rating_count DESC",
    discount: "discount_percent DESC",
    newest: "id DESC",
    default: "trending_score DESC",
  };
  return map[sort] || map.default;
}

// ---------- routes ----------
app.get("/api/categories", ah(async (_req, res) => {
  const rows = await db.all(
    `SELECT c.slug, c.name, c.icon, c.has_page AS hasPage,
      (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_slug = c.slug) AS productCount
    FROM categories c ORDER BY c.id`,
  );
  res.json(rows.map((r) => ({ ...r, hasPage: !!r.hasPage })));
}));

app.get("/api/banners", ah(async (_req, res) => {
  res.json(await db.all("SELECT id,title,subtitle,link,image,machine FROM banners"));
}));

app.get("/api/site", ah(async (_req, res) => {
  const rows = await db.all("SELECT `key`,value FROM site_text");
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));

app.get("/api/products", ah(async (req, res) => {
  const {
    cat,
    q,
    sort = "popular",
    page = 1,
    limit = 24,
    rx,
    brand,
    minPrice,
    maxPrice,
  } = req.query;
  const where = [];
  const params = {};
  where.push("hidden = 0"); // admin-unpublished products never reach the storefront
  if (cat) {
    where.push(
      `id IN (SELECT product_id FROM product_categories WHERE category_slug = :cat)`,
    );
    params.cat = String(cat);
  }
  if (q) {
    where.push(
      `(name LIKE :q OR brand LIKE :q OR generic LIKE :q OR type LIKE :q)`,
    );
    params.q = `%${q}%`;
  }
  if (rx === "1") where.push("rx = 1");
  if (rx === "0") where.push("rx = 0");
  if (brand) {
    where.push("brand = :brand");
    params.brand = String(brand);
  }
  if (minPrice) {
    where.push("price >= :minPrice");
    params.minPrice = Number(minPrice);
  }
  if (maxPrice) {
    where.push("price <= :maxPrice");
    params.maxPrice = Number(maxPrice);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const lim = Math.min(parseInt(limit, 10) || 24, 60);
  const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
  const total = (await db.get(`SELECT COUNT(*) n FROM products ${whereSql}`, params)).n;
  const rows = await db.all(
    `${qAll} ${whereSql} ORDER BY ${parseSort(sort)} LIMIT ${lim} OFFSET ${off}`,
    params,
  );
  res.json({
    total,
    page: Number(page),
    limit: lim,
    products: rows.map(rowToProduct),
  });
}));

app.get("/api/products/:id", ah(async (req, res) => {
  const row = await db.get(`${qAll} WHERE id = ?`, [Number(req.params.id)]);
  if (!row || row.hidden) return res.status(404).json({ error: "Product not found" });
  const product = rowToProduct(row);
  const faqs = await db.all("SELECT question, answer FROM faqs WHERE product_id = ? ORDER BY id", [
    product.id,
  ]);
  const related = await db.all(
    `SELECT ${P_COLS} FROM products
    WHERE id IN (SELECT product_id FROM product_categories WHERE category_slug IN
      (SELECT category_slug FROM product_categories WHERE product_id = :id))
      AND id != :id AND hidden = 0
    ORDER BY trending_score DESC LIMIT 8`,
    { id: product.id },
  );
  res.json({ product: { ...product, faqs }, related: related.map(rowToProduct) });
}));

app.get("/api/brands", ah(async (_req, res) => {
  res.json(
    await db.all(
      `SELECT brand AS name, COUNT(*) AS count FROM products
      WHERE brand != '' AND hidden = 0 GROUP BY brand ORDER BY count DESC LIMIT 50`,
    ),
  );
}));

app.get("/api/facets/:cat", ah(async (req, res) => {
  const brands = await db.all(
    `SELECT brand AS name, COUNT(*) AS count FROM products
    WHERE hidden = 0
      AND id IN (SELECT product_id FROM product_categories WHERE category_slug = ?)
    GROUP BY brand ORDER BY count DESC`,
    [req.params.cat],
  );
  res.json({ brands });
}));

app.get("/api/home", ah(async (_req, res) => {
  const banners = await db.all(
    "SELECT id,title,subtitle,link,image,machine FROM banners WHERE machine LIKE '%top_carousel%'",
  );
  const carousel = async (cat, title, limit = 10) => ({
    title,
    cat,
    products: (
      await db.all(
        `SELECT ${P_COLS} FROM products
        WHERE hidden = 0
          AND id IN (SELECT product_id FROM product_categories WHERE category_slug = :cat)
        ORDER BY trending_score DESC LIMIT ${Number(limit)}`,
        { cat },
      )
    ).map(rowToProduct),
  });
  res.json({
    banners,
    sections: await Promise.all([
      carousel("sexual-wellness", "Best Picks"),
      carousel("beauty", "Glow Me"),
      carousel("medicines", "Himalaya: Natural savings"),
      carousel("baby-mom-care", "Baby & Mom Care"),
      carousel("supplement", "Your Daily Care Essentials"),
      carousel("homecare", "Home Essentials"),
      carousel("herbal", "Herbal Care"),
      carousel("food", "Food & Nutrition"),
    ]),
  });
}));

// ---------- accounts ----------
/** Resolve products by id for wishlists / order placement. */
async function productsByIds(ids) {
  const clean = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n)))];
  if (!clean.length) return [];
  const rows = await db.all(`SELECT ${P_COLS} FROM products WHERE hidden = 0 AND id IN (?)`, [
    clean,
  ]);
  return rows.map(rowToProduct);
}

app.use(attachUser);
app.use(createAccountRouter({ productsByIds }));
app.use("/api/admin", createAdminRouter());

app.use("/img", express.static(path.join(ROOT, "public", "img"), { maxAge: "7d", immutable: true }));

// Serve built SPA (npm run build && npm run server => full site on one port)
const DIST = path.join(ROOT, "dist");
app.use(express.static(DIST));
app.get(/^\/(?!api|img).*/, (_req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.use((err, req, res, _next) => {
  console.error(`${req.method} ${req.url} failed:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => {
  console.log(`Niramoy Pharmacy API listening on http://localhost:${PORT}`);
  console.log(`DB: mysql://${process.env.MYSQL_HOST || "127.0.0.1"}/${process.env.MYSQL_DATABASE || "niramoy_web"}`);
});
