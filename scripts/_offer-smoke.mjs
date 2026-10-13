/**
 * Smoke test for rich marketing notifications: admin validation, theme,
 * badge, coupon, countdown and pop-up fields, the live event payload, the
 * public featured/offer endpoints and the tray text sent to FCM.
 *
 * Creates a throwaway admin and one "[Test]" offer, then deletes both. Run on the server:
 *   set -a; . /etc/niramoy-web.env; set +a
 *   BASE_URL=http://127.0.0.1:4000 node scripts/_offer-smoke.mjs
 */
import db from "../server/db.mjs";
import { pushMessage } from "../server/push.mjs";

const BASE = process.env.BASE_URL || "http://localhost:4000";
const adminEmail = `offer-smoke-admin-${Date.now()}@example.com`;
const ids = [];
let fails = 0;
let stream;

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Session-Token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

function check(label, ok, extra = "") {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` - ${extra}` : ""}`);
}

/** Guest event stream; resolves the first `notification` event matching `test`. */
async function listen() {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/events`, { signal: ctrl.signal });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const events = [];
  (async () => {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += value;
        let cut;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          const event = /^event: ?(.*)$/m.exec(frame)?.[1];
          const data = /^data: ?(.*)$/m.exec(frame)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      }
    } catch {
      /* closed */
    }
  })();
  return {
    close: () => ctrl.abort(),
    async waitFor(test, ms = 5000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = events.find(test);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    },
  };
}

const main = async () => {
  const reg = await call(null, "POST", "/api/auth/register", {
    name: "Offer Smoke",
    email: adminEmail,
    password: "offer-smoke-123",
  });
  const admin = reg.data?.token;
  await db.run("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);
  check("admin ready", !!admin);

  const base = { kind: "offer", title: "[Test] Smoke offer", body: "Rich offer smoke test" };
  let r = await call(admin, "POST", "/api/admin/notifications", { ...base, coupon: "bad code!" });
  check("rejects invalid coupon", r.status === 400 && !!r.data?.errors?.coupon, JSON.stringify(r.data));
  r = await call(admin, "POST", "/api/admin/notifications", { ...base, theme: "neon" });
  check("rejects unknown theme", r.status === 400 && !!r.data?.errors?.theme);
  r = await call(admin, "POST", "/api/admin/notifications", { ...base, expiresAt: new Date(Date.now() - 3600e3).toISOString() });
  check("rejects past end time", r.status === 400 && !!r.data?.errors?.expiresAt);

  stream = await listen();
  await new Promise((r) => setTimeout(r, 300));
  const expiresAt = new Date(Date.now() + 2 * 3600e3).toISOString();
  r = await call(admin, "POST", "/api/admin/notifications", {
    ...base,
    image: "/img/uploads/does-not-matter.jpg",
    cta: "Grab the deal",
    coupon: "smoke10",
    badge: "10% OFF",
    theme: "sunset",
    expiresAt,
    popup: true,
    link: "/products",
  });
  const sent = r.data?.notification;
  if (sent?.id) ids.push(sent.id);
  check("admin sends rich offer", r.status === 201 && !!sent, JSON.stringify(r.data));
  check(
    "fields stored",
    sent?.coupon === "SMOKE10" && sent.badge === "10% OFF" && sent.theme === "sunset" && sent.cta === "Grab the deal" && sent.popup === true,
    JSON.stringify(sent),
  );
  check("end time stored", sent && new Date(sent.expiresAt).toISOString() === expiresAt, sent?.expiresAt);

  const live = await stream.waitFor((e) => e.event === "notification" && e.data.id === sent?.id);
  check("live event carries pop-up fields", live?.data?.popup === true && live.data.coupon === "SMOKE10" && live.data.theme === "sunset");

  r = await call(null, "GET", "/api/broadcasts/featured");
  check("featured offer is the new pop-up", r.status === 200 && r.data?.offer?.id === sent?.id, JSON.stringify(r.data?.offer?.id));
  r = await call(null, "GET", `/api/broadcasts/${sent?.id}`);
  check("offer opens by id without sign-in", r.status === 200 && r.data?.notification?.badge === "10% OFF");
  r = await call(null, "GET", "/api/broadcasts/999999999");
  check("unknown offer is 404", r.status === 404);

  r = await call(admin, "GET", "/api/admin/notifications");
  const listed = r.data?.notifications?.find((n) => n.id === sent?.id);
  check("admin history has rich fields", listed?.popup === true && listed.coupon === "SMOKE10" && !!listed.expiresAt);

  const tray = pushMessage(sent);
  check("tray title includes badge", tray.title === "[Test] Smoke offer · 10% OFF", tray.title);
  check("tray body includes coupon and deadline", /Use code SMOKE10 · Ends /.test(tray.body), tray.body);
  check("tray tinted with theme", tray.color === "#F43F5E", tray.color);
  check(
    "tray image is absolute",
    !process.env.PUBLIC_URL || tray.image === `${process.env.PUBLIC_URL.replace(/\/+$/, "")}/img/uploads/does-not-matter.jpg`,
    tray.image,
  );

  r = await call(admin, "DELETE", `/api/admin/notifications/${sent?.id}`);
  check("offer deleted", r.status === 200);
  r = await call(null, "GET", "/api/broadcasts/featured");
  check("deleted offer no longer featured", r.data?.offer?.id !== sent?.id);
};

try {
  await main();
} catch (err) {
  fails++;
  console.error("ERROR", err);
} finally {
  stream?.close();
  if (ids.length) await db.run("DELETE FROM notifications WHERE id IN (?)", [ids]);
  await db.run("DELETE FROM users WHERE email = ?", [adminEmail]);
  await db.pool.end();
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall offer checks passed");
  process.exitCode = fails ? 1 : 0;
}
