/**
 * End-to-end smoke test for the wallet (customer + admin flows).
 *
 * Creates a throwaway customer and a throwaway admin, exercises the API,
 * then deletes both. Needs the server's MySQL env to promote/clean up:
 *   set -a; . /etc/niramoy-web.env; set +a
 *   BASE_URL=http://127.0.0.1:4000 node scripts/_wallet-smoke.mjs
 */
import db from "../server/db.mjs";

const BASE = process.env.BASE_URL || "http://localhost:4000";
const stamp = Date.now();
const customerEmail = `wallet-smoke-${stamp}@example.com`;
const adminEmail = `wallet-smoke-admin-${stamp}@example.com`;
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

async function register(email) {
  const r = await call(null, "POST", "/api/auth/register", {
    name: "Wallet Smoke",
    email,
    password: "wallet-smoke-123",
  });
  return r.data?.token;
}

const main = async () => {
  const user = await register(customerEmail);
  check("customer registered", !!user);

  let r = await call(null, "GET", "/api/account/wallet");
  check("wallet requires sign-in", r.status === 401, `status ${r.status}`);

  r = await call(user, "GET", "/api/account/wallet");
  check("empty wallet", r.status === 200 && r.data.balance === 0 && r.data.transactions.length === 0);

  r = await call(user, "POST", "/api/account/wallet/deposit", { amount: 5, method: "bkash", account: "01712345678" });
  check("deposit below minimum rejected", r.status === 400 && !!r.data?.errors?.amount);
  r = await call(user, "POST", "/api/account/wallet/deposit", { amount: 100, method: "bkash", account: "123" });
  check("bad bKash number rejected", r.status === 400 && !!r.data?.errors?.account);
  r = await call(user, "POST", "/api/account/wallet/deposit", { amount: 100.5, method: "nagad", account: "01812345678" });
  check("fractional amount rejected", r.status === 400 && !!r.data?.errors?.amount);

  r = await call(user, "POST", "/api/account/wallet/deposit", { amount: 1000, method: "bkash", account: "+8801712345678" });
  check("deposit 1000 via bKash", r.status === 201 && r.data.balance === 1000, `balance ${r.data?.balance}`);
  check("bKash number normalised", r.data?.transactions?.[0]?.account === "01712345678", r.data?.transactions?.[0]?.account);
  r = await call(user, "POST", "/api/account/wallet/deposit", { amount: 500, method: "card", account: "4242" });
  check("deposit 500 via card", r.status === 201 && r.data.balance === 1500, `balance ${r.data?.balance}`);
  check("card stored masked", r.data?.transactions?.[0]?.account === "•••• 4242", r.data?.transactions?.[0]?.account);

  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: 2000, method: "nagad", account: "01812345678" });
  check("withdraw over balance rejected", r.status === 400 && /Insufficient/.test(r.data?.error ?? ""), r.data?.error);

  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: 400, method: "nagad", account: "01812345678" });
  check("withdraw 400 held", r.status === 201 && r.data.balance === 1100 && r.data.held === 400, `balance ${r.data?.balance} held ${r.data?.held}`);
  const w1 = r.data?.transactions?.[0];
  check("withdrawal pending", w1?.type === "withdrawal" && w1?.status === "pending");

  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: 300, method: "bank", account: "BRAC Bank, Gulshan, A/C 1501000000001" });
  check("withdraw 300 to bank", r.status === 201 && r.data.balance === 800, `balance ${r.data?.balance}`);
  const w2 = r.data?.transactions?.[0];

  r = await call(user, "POST", "/api/account/wallet/withdraw", { amount: 100, method: "bkash", account: "01712345678" });
  const w3 = r.data?.transactions?.[0];
  r = await call(user, "POST", `/api/account/wallet/withdrawals/${w3.id}/cancel`);
  check("customer cancels withdrawal", r.status === 200 && r.data.balance === 800, `balance ${r.data?.balance}`);
  r = await call(user, "POST", `/api/account/wallet/withdrawals/${w3.id}/cancel`);
  check("double cancel refused", r.status === 409);

  // concurrent withdrawals must not overdraw
  const burst = await Promise.all(
    Array.from({ length: 5 }, () =>
      call(user, "POST", "/api/account/wallet/withdraw", { amount: 300, method: "bkash", account: "01712345678" }),
    ),
  );
  const accepted = burst.filter((b) => b.status === 201).length;
  r = await call(user, "GET", "/api/account/wallet");
  check("concurrent withdrawals cannot overdraw", accepted === 2 && r.data.balance === 200, `accepted ${accepted}, balance ${r.data?.balance}`);

  r = await call(user, "GET", "/api/admin/wallet");
  check("customer blocked from admin wallet", r.status === 403, `status ${r.status}`);

  const admin = await register(adminEmail);
  await db.run("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);

  r = await call(admin, "GET", `/api/admin/wallet?q=${encodeURIComponent(customerEmail)}`);
  check("admin sees pending queue", r.status === 200 && r.data.transactions.length === 4, `rows ${r.data?.transactions?.length}`);

  r = await call(admin, "PATCH", `/api/admin/wallet/${w1.id}`, { status: "completed", note: "bKash TrxID TEST123" });
  check("admin marks withdrawal paid", r.status === 200 && r.data.transaction.status === "completed");
  r = await call(admin, "PATCH", `/api/admin/wallet/${w2.id}`, { status: "rejected", note: "Account name mismatch" });
  check("admin rejects withdrawal", r.status === 200 && r.data.transaction.status === "rejected");
  r = await call(admin, "PATCH", `/api/admin/wallet/${w2.id}`, { status: "completed" });
  check("processed withdrawal is locked", r.status === 409);
  r = await call(user, "POST", `/api/account/wallet/withdrawals/${w1.id}/cancel`);
  check("customer cannot cancel paid withdrawal", r.status === 409);

  r = await call(user, "GET", "/api/account/wallet");
  check("rejected amount returned", r.data.balance === 500 && r.data.held === 600, `balance ${r.data?.balance} held ${r.data?.held}`);
  check("rejection note visible", r.data.transactions.some((t) => t.status === "rejected" && t.note === "Account name mismatch"));

  r = await call(user, "GET", "/api/account/overview");
  check("dashboard shows wallet", r.data?.wallet === 500, `wallet ${r.data?.wallet}`);

  const customerId = (await db.get("SELECT id FROM users WHERE email = ?", [customerEmail])).id;
  r = await call(admin, "GET", `/api/admin/customers/${customerId}`);
  check("admin customer page shows wallet", r.data?.wallet?.balance === 500, JSON.stringify(r.data?.wallet));
};

try {
  await main();
} catch (err) {
  fails++;
  console.error("ERROR", err);
} finally {
  const info = await db.run("DELETE FROM users WHERE email IN (?, ?)", [customerEmail, adminEmail]);
  console.log(`cleanup: removed ${info.affectedRows} test users (their wallet rows cascade)`);
  await db.pool.end();
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall wallet checks passed");
  process.exitCode = fails ? 1 : 0;
}
