/**
 * Customer notifications: admin notices/offers, order delivery steps and
 * wallet updates.
 *
 * Every notification is stored (the in-app inbox), sent live to open apps over
 * /api/events, and pushed through FCM to installed apps when Firebase is
 * configured (see push.mjs).
 */
import express from "express";
import db, { now } from "./db.mjs";
import { ah, requireUser } from "./auth.mjs";
import { liveConnectionCount, publish, publishAll } from "./live.mjs";
import { THEME_ACCENTS, pushConfigured, pushToTokens } from "./push.mjs";

export const ORDER_STATUSES = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

/** Broadcasts older than this are not shown to customers who signed up later. */
const BROADCAST_BACKFILL_MS = 30 * 864e5;
/** An offer pops up on app launch for this long after it was sent (unless it expires first). */
const FEATURED_MAX_AGE_MS = 14 * 864e5;

const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const taka = (n) => `৳${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

const N_FIELDS = `n.id, n.kind, n.title, n.body, n.link, n.image, n.cta, n.coupon, n.badge, n.theme,
  n.expires_at AS expiresAt, n.popup, n.created_at AS createdAt`;
const N_SELECT = `SELECT ${N_FIELDS} FROM notifications n`;

const shape = (r) => ({ ...r, popup: !!r.popup });

async function insertNotification(userId, n, createdBy = null) {
  const row = {
    userId,
    kind: str(n.kind, 20) || "notice",
    title: str(n.title, 140),
    body: str(n.body, 600),
    link: str(n.link, 300),
    image: str(n.image, 500),
    cta: str(n.cta, 40),
    coupon: str(n.coupon, 30),
    badge: str(n.badge, 30),
    theme: str(n.theme, 20),
    expiresAt: n.expiresAt ? new Date(n.expiresAt) : null,
    popup: n.popup ? 1 : 0,
    createdAt: now(),
    createdBy,
  };
  const info = await db.run(
    `INSERT INTO notifications
       (user_id, kind, title, body, link, image, cta, coupon, badge, theme, expires_at, popup, created_at, created_by)
     VALUES (:userId, :kind, :title, :body, :link, :image, :cta, :coupon, :badge, :theme, :expiresAt, :popup,
             :createdAt, :createdBy)`,
    row,
  );
  const { userId: _u, createdBy: _c, ...rest } = row;
  return shape({ id: Number(info.insertId), ...rest, read: false });
}

async function pushAndRecord(notification, tokens) {
  const { sent } = await pushToTokens(tokens, notification);
  if (sent) await db.run("UPDATE notifications SET push_sent = ? WHERE id = ?", [sent, notification.id]);
}

/** Store a notification for one customer and deliver it everywhere they are signed in. */
export async function notifyUser(userId, n) {
  if (!userId) return null;
  const notification = await insertNotification(userId, n);
  publish(userId, "notification", notification);
  if (pushConfigured()) {
    const tokens = (await db.all("SELECT token FROM push_tokens WHERE user_id = ?", [userId])).map((r) => r.token);
    void pushAndRecord(notification, tokens).catch(() => {});
  }
  return notification;
}

/** Store a store-wide notification and deliver it to every app and browser. */
export async function broadcast(n, createdBy) {
  const notification = await insertNotification(null, n, createdBy);
  publishAll("notification", notification);
  if (pushConfigured()) {
    const tokens = (await db.all("SELECT token FROM push_tokens")).map((r) => r.token);
    void pushAndRecord(notification, tokens).catch(() => {});
  }
  return notification;
}

// ------------------------------------------------------------- order steps
const ORDER_MESSAGES = {
  placed: (o) => ({
    title: "Order placed",
    body: `We received order ${o.id} (${o.itemsCount} item${o.itemsCount === 1 ? "" : "s"}, ${taka(o.total)}${
      o.paymentMethod === "wallet" ? ", paid from your wallet" : ""
    }). A pharmacist will confirm it shortly.`,
  }),
  confirmed: (o) => ({
    title: "Order confirmed",
    body: `Order ${o.id} is confirmed and our pharmacist is preparing it.`,
  }),
  packed: (o) => ({
    title: "Order packed",
    body: `Order ${o.id} is packed and ready for our delivery partner.`,
  }),
  shipped: (o) => ({
    title: "Order shipped",
    body: `Order ${o.id} has left the pharmacy and is on its way to your area.`,
  }),
  out_for_delivery: (o) => ({
    title: "Out for delivery",
    body: `Our rider is on the way with order ${o.id}. ${
      o.paymentMethod === "cod" ? `Please keep ${taka(o.total)} ready.` : "Please keep your phone nearby."
    }`,
  }),
  delivered: (o) => ({
    title: "Order delivered",
    body: `Order ${o.id} has been delivered. Thank you for choosing Niramoy Pharmacy!`,
  }),
  cancelled: (o) => ({
    title: "Order cancelled",
    body: `Order ${o.id} has been cancelled.`,
  }),
};

export async function recordOrderEvent(orderId, status, note = "", createdBy = null, q = db) {
  await q.run(
    "INSERT INTO order_events (order_id, status, note, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
    [orderId, status, str(note, 300), now(), createdBy],
  );
}

export async function orderEvents(orderId) {
  return db.all(
    `SELECT status, note, created_at AS at FROM order_events WHERE order_id = ? ORDER BY created_at, id`,
    [orderId],
  );
}

/**
 * Tell the customer their order moved to `status`. `order` needs
 * id, userId, total, itemsCount and paymentMethod. Guest orders are skipped.
 * `refunded` is the amount returned to the wallet on cancellation.
 */
export async function notifyOrderStatus(order, status, note = "", refunded = 0) {
  if (!order.userId || !ORDER_MESSAGES[status]) return;
  const msg = ORDER_MESSAGES[status](order);
  const extra = str(note, 300);
  let body = extra ? `${msg.body} ${status === "cancelled" ? "Reason: " : ""}${extra}` : msg.body;
  if (refunded) body += `${/[.!?]$/.test(body) ? "" : "."} ${taka(refunded)} has been refunded to your wallet.`;
  publish(order.userId, "order", { id: order.id, status, events: await orderEvents(order.id) });
  await notifyUser(order.userId, { kind: "order", title: msg.title, body, link: `/account/orders/${order.id}` });
}

// ------------------------------------------------------------ customer API
async function visibility(userId) {
  const user = await db.get("SELECT created_at AS createdAt FROM users WHERE id = ?", [userId]);
  const signup = user ? new Date(user.createdAt).getTime() : Date.now();
  const since = new Date(Math.min(signup, Date.now() - BROADCAST_BACKFILL_MS));
  const seen = await db.get("SELECT seen_at AS seenAt FROM notification_reads WHERE user_id = ?", [userId]);
  return {
    where: "(n.user_id = :userId OR (n.user_id IS NULL AND n.created_at >= :since))",
    params: { userId, since, seenAt: seen?.seenAt ?? new Date(0) },
  };
}

export async function unreadCount(userId) {
  const { where, params } = await visibility(userId);
  const row = await db.get(
    `SELECT COUNT(*) n FROM notifications n WHERE ${where} AND n.created_at > :seenAt`,
    params,
  );
  return Number(row.n);
}

export function createNotificationRouter() {
  const router = express.Router();

  router.get("/api/account/notifications", requireUser, ah(async (req, res) => {
    const { where, params } = await visibility(req.user.id);
    const rows = await db.all(`${N_SELECT} WHERE ${where} ORDER BY n.created_at DESC, n.id DESC LIMIT 100`, params);
    const seenAt = new Date(params.seenAt).getTime();
    res.json({
      notifications: rows.map((r) => shape({ ...r, read: new Date(r.createdAt).getTime() <= seenAt })),
      unread: await unreadCount(req.user.id),
    });
  }));

  router.get("/api/account/notifications/unread", requireUser, ah(async (req, res) => {
    res.json({ unread: await unreadCount(req.user.id) });
  }));

  // Store-wide offers are public: guests see them too, and a push tap opens one by id.
  router.get("/api/broadcasts/featured", ah(async (req, res) => {
    const offer = await db.get(
      `${N_SELECT} WHERE n.user_id IS NULL AND n.popup = 1 AND n.created_at >= ?
         AND (n.expires_at IS NULL OR n.expires_at > ?)
       ORDER BY n.created_at DESC, n.id DESC LIMIT 1`,
      [new Date(Date.now() - FEATURED_MAX_AGE_MS), now()],
    );
    res.json({ offer: offer ? shape({ ...offer, read: true }) : null });
  }));

  router.get("/api/broadcasts/:id", ah(async (req, res) => {
    const row = await db.get(`${N_SELECT} WHERE n.id = ? AND n.user_id IS NULL`, [Number(req.params.id)]);
    if (!row) return res.status(404).json({ error: "This offer is no longer available." });
    res.json({ notification: shape({ ...row, read: true }) });
  }));

  router.post("/api/account/notifications/seen", requireUser, ah(async (req, res) => {
    await db.run(
      "INSERT INTO notification_reads (user_id, seen_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE seen_at = VALUES(seen_at)",
      [req.user.id, now()],
    );
    publish(req.user.id, "notifications-seen", {});
    res.json({ unread: 0 });
  }));

  // Device tokens: re-registered on every app start and after sign-in/out so the
  // token always follows whoever is signed in on that phone.
  router.post("/api/push/register", ah(async (req, res) => {
    const token = str(req.body?.token, 512);
    const platform = ["android", "ios"].includes(req.body?.platform) ? req.body.platform : "android";
    if (token.length < 20) return res.status(400).json({ error: "Invalid device token." });
    await db.run(
      `INSERT INTO push_tokens (token, user_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), updated_at = VALUES(updated_at)`,
      [token, req.user?.id ?? null, platform, now(), now()],
    );
    res.json({ ok: true });
  }));

  router.post("/api/push/unregister", ah(async (req, res) => {
    const token = str(req.body?.token, 512);
    if (token) await db.run("DELETE FROM push_tokens WHERE token = ?", [token]);
    res.json({ ok: true });
  }));

  return router;
}

// --------------------------------------------------------------- admin API
const BROADCAST_KINDS = ["notice", "offer"];

/** Admin endpoints, mounted on the (already admin-guarded) /api/admin router. */
export function mountAdminNotifications(router) {
  router.get("/notifications", ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const total = (await db.get("SELECT COUNT(*) n FROM notifications WHERE user_id IS NULL")).n;
    const notifications = (
      await db.all(
        `SELECT ${N_FIELDS}, n.push_sent AS pushSent, u.name AS createdByName
         FROM notifications n LEFT JOIN users u ON u.id = n.created_by
         WHERE n.user_id IS NULL
         ORDER BY n.created_at DESC, n.id DESC LIMIT ${(page - 1) * limit}, ${limit}`,
      )
    ).map(shape);
    const devices = await db.get(
      "SELECT COUNT(*) total, SUM(user_id IS NOT NULL) signedIn FROM push_tokens",
    );
    const customers = (await db.get("SELECT COUNT(*) n FROM users WHERE role = 'customer'")).n;
    res.json({
      total,
      page,
      limit,
      notifications,
      stats: {
        pushConfigured: pushConfigured(),
        devices: Number(devices.total || 0),
        signedInDevices: Number(devices.signedIn || 0),
        liveNow: liveConnectionCount(),
        customers: Number(customers),
      },
    });
  }));

  router.post("/notifications", ah(async (req, res) => {
    const kind = str(req.body?.kind, 20);
    const title = str(req.body?.title, 140);
    const body = str(req.body?.body, 600);
    const link = str(req.body?.link, 300);
    const image = str(req.body?.image, 500);
    const cta = str(req.body?.cta, 40);
    const coupon = str(req.body?.coupon, 30).toUpperCase();
    const badge = str(req.body?.badge, 30);
    const theme = str(req.body?.theme, 20) || "violet";
    const popup = !!req.body?.popup;
    const expiresRaw = str(req.body?.expiresAt, 40);
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
    const errors = {};
    if (!BROADCAST_KINDS.includes(kind)) errors.kind = "Choose notice or offer.";
    if (title.length < 3) errors.title = "Write a title of at least 3 characters.";
    if (body.length < 3) errors.body = "Write a message.";
    if (link && !/^(\/|https?:\/\/)/.test(link)) errors.link = "Links must start with / or http(s)://";
    if (coupon && !/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(coupon)) {
      errors.coupon = "Coupon codes use letters, numbers, - and _ only.";
    }
    if (!THEME_ACCENTS[theme]) errors.theme = "Choose one of the colour themes.";
    if (expiresAt && Number.isNaN(expiresAt.getTime())) errors.expiresAt = "Pick a valid end time.";
    else if (expiresAt && expiresAt.getTime() < Date.now() + 60_000) errors.expiresAt = "The end time must be in the future.";
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], errors });
    }
    const notification = await broadcast(
      { kind, title, body, link, image, cta, coupon, badge, theme, expiresAt, popup },
      req.user.id,
    );
    res.status(201).json({ notification });
  }));

  router.delete("/notifications/:id", ah(async (req, res) => {
    const info = await db.run("DELETE FROM notifications WHERE id = ? AND user_id IS NULL", [Number(req.params.id)]);
    if (!info.affectedRows) return res.status(404).json({ error: "Notification not found." });
    res.json({ ok: true });
  }));
}
