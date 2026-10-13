/**
 * Sends (or cleans up) a "[Test]" broadcast through the running server, so the
 * phone can be checked by eye. Run on the server with the MySQL env loaded:
 *   node scripts/_notify-demo.mjs send "Title" "Body"
 *   node scripts/_notify-demo.mjs offer [imagePath]   # rich pop-up offer with a store banner
 *   node scripts/_notify-demo.mjs cleanup
 */
import db from "../server/db.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:4000";
const [mode, title, body] = process.argv.slice(2);
const email = "notify-demo-admin@example.com";

async function call(token, method, path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Session-Token": token } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function demoAdmin() {
  let r = await call(null, "POST", "/api/auth/login", { email, password: "notify-demo-123" });
  if (r.status !== 200) {
    r = await call(null, "POST", "/api/auth/register", { name: "Notify Demo", email, password: "notify-demo-123" });
  }
  await db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  return r.data.token;
}

try {
  if (mode === "send") {
    const r = await call(await demoAdmin(), "POST", "/api/admin/notifications", {
      kind: "notice",
      title: `[Test] ${title}`,
      body,
      link: "/account/notifications",
    });
    console.log(`sent ${r.status} id=${r.data?.notification?.id}`);
  } else if (mode === "offer") {
    const image = title || (await db.get("SELECT image FROM banners WHERE image <> '' ORDER BY id LIMIT 1"))?.image || "";
    const r = await call(await demoAdmin(), "POST", "/api/admin/notifications", {
      kind: "offer",
      theme: "sunset",
      badge: "30% OFF",
      title: "[Test] ⚡ Flash sale on vitamins",
      body: "Stock up on vitamins and supplements at our lowest prices of the month. Today only!",
      cta: "Grab the deal",
      coupon: "FLASH30",
      link: "/products",
      image,
      expiresAt: new Date(Date.now() + 6 * 3600e3).toISOString(),
      popup: true,
    });
    console.log(`sent ${r.status} id=${r.data?.notification?.id} image=${image}`);
  } else if (mode === "cleanup") {
    const n = await db.run("DELETE FROM notifications WHERE user_id IS NULL AND title LIKE '[Test]%'");
    const u = await db.run("DELETE FROM users WHERE email = ?", [email]);
    console.log(`removed ${n.affectedRows} test notices, ${u.affectedRows} demo admin`);
  }
} finally {
  await db.pool.end();
}
