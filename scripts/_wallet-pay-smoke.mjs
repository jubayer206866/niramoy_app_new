/**
 * End-to-end smoke test for paying orders from the wallet: checkout,
 * insufficient balance, concurrent spending, cancellation refunds.
 *
 * Creates throwaway customers + an admin and deletes everything afterwards.
 *   set -a; . /etc/niramoy-web.env; set +a
 *   BASE_URL=http://127.0.0.1:4000 node scripts/_wallet-pay-smoke.mjs
 */
import db from "../server/db.mjs";

const BASE = process.env.BASE_URL || "http://localhost:4000";
const stamp = Date.now();
const emails = [`pay-smoke-${stamp}@example.com`, `pay-smoke-b-${stamp}@example.com`, `pay-smoke-admin-${stamp}@example.com`];
const orderIds = [];
let stream = null;
let fails = 0;

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

async function register(email) {
  return (await call(null, "POST", "/api/auth/register", { name: "Pay Smoke", email, password: "pay-smoke-123" })).data?.token;
}

async function listen(token) {
  const ctrl = new AbortController();
  const events = [];
  const res = await fetch(`${BASE}/api/events`, { headers: { "X-Session-Token": token }, signal: ctrl.signal });
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
          const event = /event: (.*)/.exec(frame)?.[1];
          const data = /data: (.*)/.exec(frame)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      }
    } catch {
      /* aborted */
    }
  })();
  const waitFor = async (pred, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  return { waitFor, close: () => ctrl.abort() };
}

const order = (token, product, qty, paymentMethod) =>
  call(token, "POST", "/api/orders", {
    items: [{ id: product.id, qty }],
    name: "Pay Smoke",
    phone: "01712345678",
    address: "House 1, Road 2, Dhanmondi",
    paymentMethod,
  }).then((r) => {
    if (r.data?.order?.id) orderIds.push(r.data.order.id);
    return r;
  });

const main = async () => {
  const user = await register(emails[0]);
  const userId = (await db.get("SELECT id FROM users WHERE email = ?", [emails[0]])).id;
  stream = await listen(user);
  // A product cheap enough that two units stay under the free-delivery threshold.
  const product = await db.get(
    "SELECT id, price FROM products WHERE hidden = 0 AND stock_status = 1 AND price BETWEEN 50 AND 300 ORDER BY id LIMIT 1",
  );
  const totalFor = (qty) => product.price * qty + (product.price * qty >= 1000 ? 0 : 60);

  let r = await order(null, product, 1, "wallet");
  check("guest cannot pay by wallet", r.status === 401, `status ${r.status}`);

  r = await order(user, product, 1, "wallet");
  check("empty wallet refused", r.status === 400 && /not enough/.test(r.data?.error ?? ""), r.data?.error);
  const count = (await db.get("SELECT COUNT(*) n FROM orders WHERE user_id = ?", [userId])).n;
  check("no order created when payment fails", Number(count) === 0, `orders ${count}`);

  await call(user, "POST", "/api/account/wallet/deposit", { amount: 1000, method: "bkash", account: "01712345678" });
  r = await order(user, product, 2, "wallet");
  const paid = r.data?.order;
  const expected = totalFor(2);
  check("wallet order placed", r.status === 201 && paid?.paymentMethod === "wallet", `status ${r.status}`);
  check("order total charged", Math.abs(paid?.total - expected) < 0.01, `total ${paid?.total} expected ${expected}`);

  r = await call(user, "GET", "/api/account/wallet");
  const after = Math.round((1000 - expected) * 100) / 100;
  check("balance reduced by order total", r.data?.balance === after, `balance ${r.data?.balance} expected ${after}`);
  const pay = r.data?.transactions?.[0];
  check("payment row references the order", pay?.type === "payment" && pay.account === paid?.id && pay.status === "completed");
  const live = await stream.waitFor((e) => e.event === "wallet" && e.data.txn?.type === "payment");
  check("wallet screen updated live", live?.data?.balance === after, JSON.stringify(live?.data?.balance));
  const placedNote = await stream.waitFor((e) => e.event === "notification" && e.data.title === "Order placed");
  check("order notification mentions wallet", /paid from your wallet/.test(placedNote?.data?.body ?? ""), placedNote?.data?.body);

  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: Math.floor(after) + 1, method: "bkash", account: "01712345678" });
  check("spent money cannot be withdrawn", r.status === 400, `status ${r.status}`);

  r = await call(user, "GET", "/api/account/overview");
  check("dashboard balance matches", r.data?.wallet === after, `wallet ${r.data?.wallet}`);

  // ---- concurrent checkouts must not overspend
  const userB = await register(emails[1]);
  const one = totalFor(1);
  const deposit = Math.ceil(one * 1.5);
  await call(userB, "POST", "/api/account/wallet/deposit", { amount: deposit, method: "nagad", account: "01812345678" });
  const burst = await Promise.all([1, 2, 3].map(() => order(userB, product, 1, "wallet")));
  const ok = burst.filter((b) => b.status === 201).length;
  r = await call(userB, "GET", "/api/account/wallet");
  const left = Math.round((deposit - one) * 100) / 100;
  check("3 simultaneous wallet orders: only 1 paid", ok === 1 && r.data?.balance === left, `paid ${ok}, balance ${r.data?.balance}`);

  // ---- cancellation refunds
  const admin = await register(emails[2]);
  await db.run("UPDATE users SET role = 'admin' WHERE email = ?", [emails[2]]);

  r = await call(admin, "PATCH", `/api/admin/orders/${paid.id}`, { status: "confirmed" });
  check("confirming does not refund", r.status === 200 && !r.data.refunded);
  r = await call(admin, "PATCH", `/api/admin/orders/${paid.id}`, { status: "cancelled", note: "Item unavailable" });
  check("cancel refunds the full amount", r.status === 200 && Math.abs(r.data.refunded - expected) < 0.01, `refunded ${r.data?.refunded}`);
  r = await call(user, "GET", "/api/account/wallet");
  check("balance restored", r.data?.balance === 1000, `balance ${r.data?.balance}`);
  check("refund row recorded", r.data?.transactions?.[0]?.type === "refund" && r.data.transactions[0].account === paid.id);
  const cancelNote = await stream.waitFor((e) => e.event === "notification" && e.data.title === "Order cancelled");
  check("customer told about refund", /refunded to your wallet/.test(cancelNote?.data?.body ?? ""), cancelNote?.data?.body);
  check("refund pushed to wallet screen", !!(await stream.waitFor((e) => e.event === "wallet" && e.data.txn?.type === "refund")));

  r = await call(admin, "PATCH", `/api/admin/orders/${paid.id}`, { status: "confirmed" });
  check("refunded order cannot be reopened", r.status === 409, `status ${r.status}`);
  r = await call(user, "GET", `/api/account/orders/${paid.id}`);
  check("customer order shows refunded", r.data?.order?.walletRefunded === true);

  const bOrder = burst.find((b) => b.status === 201).data.order;
  await db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [bOrder.id]);
  r = await call(admin, "PATCH", `/api/admin/orders/${bOrder.id}`, { status: "confirmed" });
  check("unrefunded cancelled order can be reopened", r.status === 200);

  // ---- admin views
  r = await call(admin, "GET", `/api/admin/wallet?view=purchases&q=${encodeURIComponent(emails[0])}`);
  const types = (r.data?.transactions ?? []).map((t) => t.type).sort().join(",");
  check("admin purchases tab", types === "payment,refund", types);
  check("admin summary has spent", typeof r.data?.summary?.spent === "number");
  r = await call(admin, "GET", `/api/admin/customers/${userId}`);
  check("admin customer balance", r.data?.wallet?.balance === 1000, JSON.stringify(r.data?.wallet));

  // ---- other payment methods are no longer silently turned into COD
  for (const m of ["nagad", "rocket"]) {
    r = await order(user, product, 1, m);
    check(`${m} order keeps its method`, r.data?.order?.paymentMethod === m, r.data?.order?.paymentMethod);
  }
  r = await call(user, "GET", "/api/account/wallet");
  check("non-wallet orders don't touch the balance", r.data?.balance === 1000);
};

try {
  await main();
} catch (err) {
  fails++;
  console.error("ERROR", err);
} finally {
  stream?.close();
  if (orderIds.length) await db.run("DELETE FROM orders WHERE id IN (?)", [orderIds]);
  const info = await db.run("DELETE FROM users WHERE email IN (?)", [emails]);
  console.log(`cleanup: removed ${orderIds.length} orders, ${info.affectedRows} test users`);
  await db.pool.end();
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall wallet checkout checks passed");
  process.exitCode = fails ? 1 : 0;
}
