/**
 * End-to-end smoke test for live events and notifications: order steps,
 * withdrawal results, admin broadcasts, inbox/unread and push tokens.
 *
 * Creates a throwaway customer + admin, listens on /api/events like the app
 * does, then deletes everything it created. Run on the server:
 *   set -a; . /etc/niramoy-web.env; set +a
 *   BASE_URL=http://127.0.0.1:4000 node scripts/_notify-smoke.mjs
 */
import db from "../server/db.mjs";

const BASE = process.env.BASE_URL || "http://localhost:4000";
const stamp = Date.now();
const customerEmail = `notify-smoke-${stamp}@example.com`;
const adminEmail = `notify-smoke-admin-${stamp}@example.com`;
const orderIds = [];
const broadcastIds = [];
const streams = [];
let fails = 0;

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Session-Token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}

function check(label, ok, extra = "") {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` - ${extra}` : ""}`);
}

async function register(email, name) {
  const r = await call(null, "POST", "/api/auth/register", { name, email, password: "notify-smoke-123" });
  return r.data?.token;
}

/** Open /api/events like the app; collected events can be awaited with waitFor. */
async function listen(token) {
  const ctrl = new AbortController();
  const events = [];
  const waiters = new Set();
  const res = await fetch(`${BASE}/api/events`, {
    headers: token ? { "X-Session-Token": token } : {},
    signal: ctrl.signal,
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  (async () => {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let cut;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          events.push({ event, data: JSON.parse(data) });
          for (const w of waiters) w();
        }
      }
    } catch {
      /* aborted */
    }
  })();
  const stream = {
    events,
    contentType: res.headers.get("content-type"),
    close: () => ctrl.abort(),
    waitFor(pred, ms = 4000) {
      return new Promise((resolve) => {
        const test = () => {
          const hit = events.find(pred);
          if (hit) {
            waiters.delete(test);
            clearTimeout(timer);
            resolve(hit);
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(test);
          resolve(null);
        }, ms);
        waiters.add(test);
        test();
      });
    },
  };
  streams.push(stream);
  return stream;
}

const isNote = (title) => (e) => e.event === "notification" && e.data.title === title;

const main = async () => {
  const user = await register(customerEmail, "Notify Smoke");
  check("customer registered", !!user);
  const userId = (await db.get("SELECT id FROM users WHERE email = ?", [customerEmail])).id;

  const live = await listen(user);
  const guest = await listen(null);
  check("event stream is text/event-stream", /text\/event-stream/.test(live.contentType ?? ""), live.contentType);
  const ready = await live.waitFor((e) => e.event === "ready");
  check("stream sends ready with user id", ready?.data?.user === userId, JSON.stringify(ready?.data));
  const guestReady = await guest.waitFor((e) => e.event === "ready");
  check("guest stream connects", guestReady?.data?.user === null);

  // ---- order placed + delivery steps
  const product = await db.get("SELECT id FROM products WHERE hidden = 0 AND stock_status = 1 LIMIT 1");
  let r = await call(user, "POST", "/api/orders", {
    items: [{ id: product.id, qty: 2 }],
    name: "Notify Smoke",
    phone: "01712345678",
    address: "House 1, Road 2, Dhanmondi",
    paymentMethod: "cod",
  });
  const order = r.data?.order;
  if (order) orderIds.push(order.id);
  check("order placed", r.status === 201 && !!order);
  check("order has placed event", order?.events?.length === 1 && order.events[0].status === "placed");
  const placedNote = await live.waitFor(isNote("Order placed"));
  check("customer notified: order placed", !!placedNote, placedNote?.data?.body);
  check("placed notification links to order", placedNote?.data?.link === `/account/orders/${order?.id}`);

  const admin = await register(adminEmail, "Notify Admin");
  await db.run("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);

  r = await call(user, "PATCH", `/api/admin/orders/${order.id}`, { status: "confirmed" });
  check("customer cannot change order status", r.status === 403, `status ${r.status}`);

  const steps = [
    ["confirmed", "Order confirmed", ""],
    ["packed", "Order packed", ""],
    ["shipped", "Order shipped", ""],
    ["out_for_delivery", "Out for delivery", "Rider Karim, 01811111111"],
    ["delivered", "Order delivered", ""],
  ];
  for (const [status, title, note] of steps) {
    r = await call(admin, "PATCH", `/api/admin/orders/${order.id}`, { status, note });
    check(`admin marks ${status}`, r.status === 200 && r.data.order.status === status, `status ${r.status}`);
    const n = await live.waitFor(isNote(title));
    check(`  customer notified: ${title}`, !!n, n?.data?.body);
    if (note) check("  admin note included", n?.data?.body?.includes(note), n?.data?.body);
    if (status === "out_for_delivery") check("  COD amount reminder", /Please keep ৳/.test(n?.data?.body ?? ""));
    const o = await live.waitFor((e) => e.event === "order" && e.data.status === status);
    check(`  order event for live refresh`, o?.data?.id === order.id && o.data.events.length >= 2);
  }
  r = await call(admin, "PATCH", `/api/admin/orders/${order.id}`, { status: "delivered" });
  check("same status twice refused", r.status === 409, `status ${r.status}`);
  r = await call(admin, "PATCH", `/api/admin/orders/${order.id}`, { status: "teleported" });
  check("unknown status refused", r.status === 400);

  r = await call(user, "GET", `/api/account/orders/${order.id}`);
  check(
    "customer order shows 6 timestamped steps",
    r.data?.order?.events?.map((e) => e.status).join(",") === "placed,confirmed,packed,shipped,out_for_delivery,delivered",
    r.data?.order?.events?.map((e) => e.status).join(","),
  );
  check("guest received no private order notifications", !guest.events.some((e) => e.event === "notification"));

  // ---- cancellation with reason
  r = await call(user, "POST", "/api/orders", {
    items: [{ id: product.id, qty: 1 }],
    name: "Notify Smoke",
    phone: "01712345678",
    address: "House 1, Road 2, Dhanmondi",
  });
  const order2 = r.data?.order;
  if (order2) orderIds.push(order2.id);
  r = await call(admin, "PATCH", `/api/admin/orders/${order2.id}`, { status: "cancelled", note: "Out of stock" });
  const cancelled = await live.waitFor(isNote("Order cancelled"));
  check("customer notified: cancelled with reason", /Reason: Out of stock/.test(cancelled?.data?.body ?? ""), cancelled?.data?.body);

  // ---- wallet withdrawal results
  await call(user, "POST", "/api/account/wallet/deposit", { amount: 1000, method: "bkash", account: "01712345678" });
  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: 400, method: "nagad", account: "01812345678" });
  const w1 = r.data?.transactions?.[0];
  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: 200, method: "bkash", account: "01712345678" });
  const w2 = r.data?.transactions?.[0];

  await call(admin, "PATCH", `/api/admin/wallet/${w1.id}`, { status: "completed", note: "TrxID ABC123" });
  const paid = await live.waitFor(isNote("Withdrawal paid"));
  check("customer notified: withdrawal paid", /৳400 has been sent to your Nagad 01812345678/.test(paid?.data?.body ?? ""), paid?.data?.body);
  const walletEvt = await live.waitFor((e) => e.event === "wallet" && e.data.source === "admin" && e.data.txn.id === w1.id);
  check("wallet screen live event (paid)", walletEvt?.data?.txn?.status === "completed" && walletEvt.data.balance === 400, JSON.stringify(walletEvt?.data?.balance));

  await call(admin, "PATCH", `/api/admin/wallet/${w2.id}`, { status: "rejected", note: "Number not registered" });
  const rejected = await live.waitFor(isNote("Withdrawal rejected"));
  check("customer notified: withdrawal rejected + reason", /Reason: Number not registered/.test(rejected?.data?.body ?? ""), rejected?.data?.body);
  const walletEvt2 = await live.waitFor((e) => e.event === "wallet" && e.data.txn.id === w2.id && e.data.txn.status === "rejected");
  check("wallet screen live event (rejected, money back)", walletEvt2?.data?.balance === 600, JSON.stringify(walletEvt2?.data?.balance));

  // ---- admin broadcasts
  r = await call(user, "POST", "/api/admin/notifications", { kind: "offer", title: "x", body: "y" });
  check("customer cannot broadcast", r.status === 403);
  r = await call(admin, "POST", "/api/admin/notifications", { kind: "offer", title: "Hi", body: "" });
  check("broadcast validation", r.status === 400 && !!r.data?.errors?.title && !!r.data?.errors?.body);
  r = await call(admin, "POST", "/api/admin/notifications", { kind: "offer", title: "Smoke 10% off", body: "Test", link: "javascript:alert(1)" });
  check("unsafe link refused", r.status === 400 && !!r.data?.errors?.link);

  const offerTitle = `Smoke offer ${stamp}`;
  r = await call(admin, "POST", "/api/admin/notifications", {
    kind: "offer",
    title: offerTitle,
    body: "Flat 10% off for the smoke test",
    link: "/products",
    image: "/img/banners/x.jpg",
  });
  if (r.data?.notification?.id) broadcastIds.push(r.data.notification.id);
  check("admin sends offer", r.status === 201 && r.data.notification.kind === "offer");
  check("offer reaches signed-in customer live", !!(await live.waitFor(isNote(offerTitle))));
  check("offer reaches signed-out app live", !!(await guest.waitFor(isNote(offerTitle))));

  const noticeTitle = `Smoke notice ${stamp}`;
  r = await call(admin, "POST", "/api/admin/notifications", { kind: "notice", title: noticeTitle, body: "Holiday schedule" });
  if (r.data?.notification?.id) broadcastIds.push(r.data.notification.id);
  check("notice reaches customer live", !!(await live.waitFor(isNote(noticeTitle))));

  // ---- inbox + unread
  r = await call(user, "GET", "/api/account/notifications");
  const inbox = r.data?.notifications ?? [];
  const mine = inbox.filter((n) => n.title !== offerTitle && n.title !== noticeTitle && n.kind !== "offer" && n.kind !== "notice");
  check("inbox has 6 + 2 order and 2 wallet notifications", mine.length === 10, `got ${mine.length}`);
  check("inbox includes both broadcasts", inbox.some((n) => n.title === offerTitle) && inbox.some((n) => n.title === noticeTitle));
  check("inbox newest first", inbox[0]?.title === noticeTitle, inbox[0]?.title);
  check("unread count matches", r.data?.unread === inbox.filter((n) => !n.read).length && r.data.unread >= 12, `unread ${r.data?.unread}`);
  r = await call(user, "GET", "/api/auth/me");
  check("/me carries unread count", r.data?.unreadNotifications >= 12, `unread ${r.data?.unreadNotifications}`);

  r = await call(user, "POST", "/api/account/notifications/seen");
  check("mark all seen", r.status === 200 && r.data.unread === 0);
  check("other devices told to clear badge", !!(await live.waitFor((e) => e.event === "notifications-seen")));
  r = await call(user, "GET", "/api/account/notifications/unread");
  check("unread now 0", r.data?.unread === 0, `unread ${r.data?.unread}`);
  r = await call(null, "GET", "/api/account/notifications");
  check("inbox requires sign-in", r.status === 401);

  // ---- push tokens
  const token = `smoke-token-${stamp}-abcdefghijklmnopqrstuvwxyz`;
  r = await call(null, "POST", "/api/push/register", { token, platform: "android" });
  check("signed-out device registers", r.status === 200);
  let row = await db.get("SELECT user_id AS userId FROM push_tokens WHERE token = ?", [token]);
  check("  stored without user", row && row.userId === null);
  r = await call(user, "POST", "/api/push/register", { token, platform: "android" });
  row = await db.get("SELECT user_id AS userId FROM push_tokens WHERE token = ?", [token]);
  check("sign-in re-links token to customer", row?.userId === userId);
  r = await call(null, "POST", "/api/push/register", { token: "short" });
  check("junk token refused", r.status === 400);

  r = await call(admin, "GET", "/api/admin/notifications");
  check("admin history lists broadcasts", r.status === 200 && r.data.notifications.some((n) => n.title === offerTitle));
  check("admin stats", r.data?.stats?.devices >= 1 && r.data.stats.liveNow >= 2 && typeof r.data.stats.pushConfigured === "boolean", JSON.stringify(r.data?.stats));

  r = await call(user, "POST", "/api/push/unregister", { token });
  row = await db.get("SELECT token FROM push_tokens WHERE token = ?", [token]);
  check("device unregisters", !row);

  r = await call(admin, "DELETE", `/api/admin/notifications/${broadcastIds[1]}`);
  check("admin deletes a broadcast", r.status === 200);
  r = await call(user, "GET", "/api/account/notifications");
  check("deleted broadcast gone from inbox", !r.data.notifications.some((n) => n.title === noticeTitle));

  r = await call(admin, "GET", `/api/admin/orders/${order.id}`);
  check("admin order page has history", r.data?.order?.events?.length === 6);
};

try {
  await main();
} catch (err) {
  fails++;
  console.error("ERROR", err);
} finally {
  for (const s of streams) s.close();
  if (orderIds.length) await db.run("DELETE FROM orders WHERE id IN (?)", [orderIds]);
  if (broadcastIds.length) await db.run("DELETE FROM notifications WHERE id IN (?)", [broadcastIds]);
  const info = await db.run("DELETE FROM users WHERE email IN (?, ?)", [customerEmail, adminEmail]);
  console.log(
    `cleanup: removed ${orderIds.length} orders, ${broadcastIds.length} broadcasts, ${info.affectedRows} test users (their notifications and wallet rows cascade)`,
  );
  await db.pool.end();
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall notification checks passed");
  process.exitCode = fails ? 1 : 0;
}
