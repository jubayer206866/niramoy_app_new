/**
 * Account API: registration, sessions, profile, addresses, wishlist, reviews
 * and order placement.
 *
 * Mounted from server/index.mjs, which passes in `productsByIds` so this module
 * can resolve prices/images from the catalogue.
 */
import express from "express";
import db, { now } from "./db.mjs";
import {
  ah,
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireUser,
  setSessionCookie,
  sha256,
  throttle,
  validateRegistration,
  verifyPassword,
} from "./auth.mjs";

const DELIVERY_FREE_OVER = 1000;
const DELIVERY_FEE = 60;

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);

export function createAccountRouter({ productsByIds }) {
  const router = express.Router();

  const newOrderId = () =>
    `AG-${Date.now().toString(36).toUpperCase()}${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;

  const readAddresses = async (userId) =>
    (
      await db.all(
        `SELECT id,label,name,phone,address,city,area,is_default AS isDefault
         FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`,
        [userId],
      )
    ).map((a) => ({ ...a, isDefault: !!a.isDefault }));

  const readOrder = async (orderId, userId = null) => {
    const order = await db.get(
      `SELECT id,user_id AS userId,name,phone,email,address,city,note,
              payment_method AS paymentMethod,subtotal,delivery_fee AS deliveryFee,
              discount,total,items_count AS itemsCount,status,created_at AS placedAt
       FROM orders WHERE id = ?`,
      [orderId],
    );
    if (!order) return null;
    if (userId != null && order.userId != null && order.userId !== userId) return null;
    const items = await db.all(
      `SELECT product_id AS id,name,slug,unit_label AS unitLabel,image,price,mrp,qty
       FROM order_items WHERE order_id = ? ORDER BY id`,
      [orderId],
    );
    return { ...order, items };
  };

  // ---------------------------------------------------------------- auth
  router.post("/api/auth/register", ah(async (req, res) => {
    const name = str(req.body?.name, 80);
    const email = str(req.body?.email, 120).toLowerCase();
    const phone = str(req.body?.phone, 24);
    const password = String(req.body?.password ?? "");

    const errors = validateRegistration({ name, email, password });
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    if (await db.get("SELECT 1 FROM users WHERE email = ?", [email])) {
      return res.status(409).json({ errors: { email: "That email is already registered." } });
    }

    const info = await db.run(
      `INSERT INTO users (name,email,phone,password_hash,created_at,updated_at)
       VALUES (?,?,?,?,?,?)`,
      [name, email, phone, hashPassword(password), now(), now()],
    );

    const userId = Number(info.insertId);
    const { token, expires } = await createSession(userId, req.headers["user-agent"]);
    setSessionCookie(res, token, expires);
    const user = await db.get(
      "SELECT id,name,email,phone,role,created_at AS createdAt FROM users WHERE id = ?",
      [userId],
    );
    // `token` is what the packaged app persists (it is cross-origin and has no
    // usable cookie); the web client keeps using the httpOnly cookie.
    res.status(201).json({ user: publicUser(user), token });
  }));

  router.post("/api/auth/login", ah(async (req, res) => {
    const email = str(req.body?.email, 120).toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!throttle(`login:${req.ip}:${email}`)) {
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }
    const row = await db.get(
      "SELECT id,name,email,phone,role,password_hash,created_at AS createdAt FROM users WHERE email = ?",
      [email],
    );
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const { token, expires } = await createSession(row.id, req.headers["user-agent"]);
    setSessionCookie(res, token, expires);
    res.json({ user: publicUser(row), token });
  }));

  router.post("/api/auth/logout", ah(async (req, res) => {
    await destroySession(req.sessionToken);
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  router.get("/api/auth/me", ah(async (req, res) => {
    const addresses = req.user ? await readAddresses(req.user.id) : [];
    const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0] || null;
    const wishlistCount = req.user
      ? (await db.get("SELECT COUNT(*) n FROM wishlist WHERE user_id = ?", [req.user.id])).n
      : 0;
    const orderCount = req.user
      ? (await db.get("SELECT COUNT(*) n FROM orders WHERE user_id = ?", [req.user.id])).n
      : 0;
    res.json({
      user: publicUser(req.user),
      addresses,
      defaultAddress,
      wishlistCount,
      orderCount,
    });
  }));

  // ------------------------------------------------------------- profile
  router.patch("/api/account/profile", requireUser, ah(async (req, res) => {
    const name = str(req.body?.name, 80);
    const phone = str(req.body?.phone, 24);
    if (name.length < 2) return res.status(400).json({ errors: { name: "Please enter your full name." } });
    await db.run("UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?", [
      name,
      phone,
      now(),
      req.user.id,
    ]);
    const user = await db.get(
      "SELECT id,name,email,phone,role,created_at AS createdAt FROM users WHERE id = ?",
      [req.user.id],
    );
    res.json({ user: publicUser(user) });
  }));

  router.post("/api/account/password", requireUser, ah(async (req, res) => {
    const current = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");
    if (next.length < 6)
      return res.status(400).json({ errors: { newPassword: "Password must be at least 6 characters." } });
    const row = await db.get("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    if (!verifyPassword(current, row.password_hash))
      return res.status(400).json({ errors: { currentPassword: "Current password is incorrect." } });

    await db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [
      hashPassword(next),
      now(),
      req.user.id,
    ]);
    // other sessions are invalidated, the current one stays valid
    await db.run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", [
      req.user.id,
      sha256(req.sessionToken || ""),
    ]);
    res.json({ ok: true });
  }));

  // ----------------------------------------------------------- addresses
  router.get("/api/account/addresses", requireUser, ah(async (req, res) => {
    res.json({ addresses: await readAddresses(req.user.id) });
  }));

  /** Insert or update an address; pass `q` to run inside an outer transaction. */
  async function saveAddress(userId, body, id = null, q = null) {
    const name = str(body?.name, 80);
    const phone = str(body?.phone, 24);
    const address = str(body?.address, 300);
    if (!name || !phone || address.length < 6) return null;
    const payload = {
      label: str(body?.label, 30) || "Home",
      name,
      phone,
      address,
      city: str(body?.city, 40) || "Dhaka",
      area: str(body?.area, 60),
      isDefault: body?.isDefault ? 1 : 0,
    };
    const write = async (t) => {
      if (payload.isDefault) {
        await t.run("UPDATE addresses SET is_default = 0 WHERE user_id = ?", [userId]);
      }
      if (id) {
        await t.run(
          `UPDATE addresses SET label=:label,name=:name,phone=:phone,address=:address,
           city=:city,area=:area,is_default=:isDefault WHERE id=:id AND user_id=:userId`,
          { ...payload, id, userId },
        );
        return id;
      }
      const info = await t.run(
        `INSERT INTO addresses (user_id,label,name,phone,address,city,area,is_default,created_at)
         VALUES (:userId,:label,:name,:phone,:address,:city,:area,:isDefault,:createdAt)`,
        { ...payload, userId, createdAt: now() },
      );
      return Number(info.insertId);
    };
    return q ? write(q) : db.tx(write);
  }

  router.post("/api/account/addresses", requireUser, ah(async (req, res) => {
    const id = await saveAddress(req.user.id, req.body);
    if (!id) return res.status(400).json({ error: "Name, phone and address are required." });
    res.status(201).json({ addresses: await readAddresses(req.user.id) });
  }));

  router.patch("/api/account/addresses/:id", requireUser, ah(async (req, res) => {
    const id = await saveAddress(req.user.id, req.body, Number(req.params.id));
    if (!id) return res.status(400).json({ error: "Name, phone and address are required." });
    res.json({ addresses: await readAddresses(req.user.id) });
  }));

  router.delete("/api/account/addresses/:id", requireUser, ah(async (req, res) => {
    await db.run("DELETE FROM addresses WHERE id = ? AND user_id = ?", [
      Number(req.params.id),
      req.user.id,
    ]);
    res.json({ addresses: await readAddresses(req.user.id) });
  }));

  // ------------------------------------------------------------ wishlist
  const readWishlist = async (userId) =>
    (
      await db.all(
        "SELECT product_id AS id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC",
        [userId],
      )
    ).map((r) => r.id);

  router.get("/api/account/wishlist/ids", requireUser, ah(async (req, res) => {
    res.json({ ids: await readWishlist(req.user.id) });
  }));

  router.get("/api/account/wishlist", requireUser, ah(async (req, res) => {
    const ids = await readWishlist(req.user.id);
    const products = (await productsByIds(ids)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    res.json({ ids, products });
  }));

  router.post("/api/account/wishlist", requireUser, ah(async (req, res) => {
    const productId = Number(req.body?.productId);
    if (!productId) return res.status(400).json({ error: "productId is required." });
    await db.run("INSERT IGNORE INTO wishlist (user_id,product_id,created_at) VALUES (?,?,?)", [
      req.user.id,
      productId,
      now(),
    ]);
    res.json({ ids: await readWishlist(req.user.id) });
  }));

  router.delete("/api/account/wishlist/:productId", requireUser, ah(async (req, res) => {
    await db.run("DELETE FROM wishlist WHERE user_id = ? AND product_id = ?", [
      req.user.id,
      Number(req.params.productId),
    ]);
    res.json({ ids: await readWishlist(req.user.id) });
  }));

  // ------------------------------------------------------------- reviews
  router.get("/api/reviews/:productId", ah(async (req, res) => {
    const productId = Number(req.params.productId);
    const rows = await db.all(
      `SELECT r.id,r.rating,r.body,r.created_at AS createdAt,u.name
       FROM reviews r JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ? ORDER BY r.created_at DESC LIMIT 50`,
      [productId],
    );
    const agg = await db.get("SELECT COUNT(*) n, AVG(rating) avg FROM reviews WHERE product_id = ?", [
      productId,
    ]);
    const mine = req.user
      ? (await db.get("SELECT rating,body FROM reviews WHERE product_id = ? AND user_id = ?", [
          productId,
          req.user.id,
        ])) || null
      : null;
    res.json({
      reviews: rows,
      count: agg.n,
      average: agg.avg ? Number(Number(agg.avg).toFixed(2)) : 0,
      mine,
    });
  }));

  router.post("/api/account/reviews", requireUser, ah(async (req, res) => {
    const productId = Number(req.body?.productId);
    const rating = Math.min(Math.max(Number(req.body?.rating) || 0, 1), 5);
    const body = str(req.body?.body, 1000);
    if (!productId) return res.status(400).json({ error: "productId is required." });
    await db.run(
      `INSERT INTO reviews (product_id,user_id,rating,body,created_at) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating), body = VALUES(body)`,
      [productId, req.user.id, rating, body, now()],
    );
    res.status(201).json({ ok: true });
  }));

  // -------------------------------------------------------------- orders
  router.post("/api/orders", ah(async (req, res) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = rawItems
      .map((i) => ({ id: Number(i?.id), qty: Math.min(Math.max(Number(i?.qty) || 0, 1), 99) }))
      .filter((i) => i.id > 0);
    if (!items.length) return res.status(400).json({ error: "Your cart is empty." });

    const found = await productsByIds(items.map((i) => i.id));
    const byId = new Map(found.map((p) => [p.id, p]));
    const missing = items.filter((i) => !byId.has(i.id));
    if (missing.length)
      return res.status(400).json({ error: `Some products are no longer available (${missing.map((m) => m.id).join(", ")}).` });

    const name = str(req.body?.name, 80);
    const phone = str(req.body?.phone, 24);
    const address = str(req.body?.address, 300);
    const city = str(req.body?.city, 40) || "Dhaka";
    const email = str(req.body?.email, 120);
    const note = str(req.body?.note, 300);
    const paymentMethod = ["cod", "bkash", "card"].includes(req.body?.paymentMethod)
      ? req.body.paymentMethod
      : "cod";
    if (!name || !phone || address.length < 6)
      return res.status(400).json({ error: "Name, phone and delivery address are required." });

    const lines = items.map((i) => {
      const p = byId.get(i.id);
      return {
        productId: p.id,
        name: p.name,
        slug: p.slug,
        unitLabel: p.unitLabel || "",
        image: p.image || "",
        price: p.price,
        mrp: p.mrp || 0,
        qty: i.qty,
      };
    });
    const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
    const deliveryFee = subtotal >= DELIVERY_FREE_OVER ? 0 : DELIVERY_FEE;
    const discount = 0;
    const total = subtotal + deliveryFee - discount;
    const id = newOrderId();

    await db.tx(async (q) => {
      await q.run(
        `INSERT INTO orders (id,user_id,name,phone,email,address,city,note,payment_method,
          subtotal,delivery_fee,discount,total,items_count,status,created_at)
         VALUES (:id,:userId,:name,:phone,:email,:address,:city,:note,:paymentMethod,
          :subtotal,:deliveryFee,:discount,:total,:itemsCount,'placed',:createdAt)`,
        {
          id,
          userId: req.user?.id ?? null,
          name,
          phone,
          email,
          address,
          city,
          note,
          paymentMethod,
          subtotal,
          deliveryFee,
          discount,
          total,
          itemsCount: lines.reduce((n, l) => n + l.qty, 0),
          createdAt: now(),
        },
      );
      for (const l of lines) {
        await q.run(
          `INSERT INTO order_items (order_id,product_id,name,slug,unit_label,image,price,mrp,qty)
           VALUES (:orderId,:productId,:name,:slug,:unitLabel,:image,:price,:mrp,:qty)`,
          { ...l, orderId: id },
        );
      }
      if (req.user && req.body?.saveAddress) {
        await saveAddress(req.user.id, { name, phone, address, city }, null, q);
      }
    });

    res.status(201).json({ order: await readOrder(id) });
  }));

  router.get("/api/account/orders", requireUser, ah(async (req, res) => {
    const rows = await db.all(
      `SELECT id,name,phone,address,city,payment_method AS paymentMethod,subtotal,
              delivery_fee AS deliveryFee,discount,total,items_count AS itemsCount,
              status,created_at AS placedAt
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [req.user.id],
    );
    const itemRows = await db.all(
      `SELECT order_id AS orderId, product_id AS id,name,slug,unit_label AS unitLabel,image,price,mrp,qty
       FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)`,
      [req.user.id],
    );
    const byOrder = new Map();
    for (const it of itemRows) {
      if (!byOrder.has(it.orderId)) byOrder.set(it.orderId, []);
      byOrder.get(it.orderId).push(it);
    }
    res.json({ orders: rows.map((o) => ({ ...o, items: byOrder.get(o.id) || [] })) });
  }));

  router.get("/api/account/orders/:id", ah(async (req, res) => {
    const order = await readOrder(req.params.id, req.user?.id ?? null);
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json({ order });
  }));

  router.get("/api/account/overview", requireUser, ah(async (req, res) => {
    const orders = await db.get(
      "SELECT COUNT(*) n, COALESCE(SUM(total),0) spend FROM orders WHERE user_id = ?",
      [req.user.id],
    );
    const wishlist = (await db.get("SELECT COUNT(*) n FROM wishlist WHERE user_id = ?", [req.user.id])).n;
    const addresses = (await db.get("SELECT COUNT(*) n FROM addresses WHERE user_id = ?", [req.user.id])).n;
    const reviews = (await db.get("SELECT COUNT(*) n FROM reviews WHERE user_id = ?", [req.user.id])).n;
    res.json({
      orders: orders.n,
      spend: orders.spend,
      wishlist,
      addresses,
      reviews,
      saved: orders.spend,
    });
  }));

  return router;
}
