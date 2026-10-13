/**
 * Customer wallet: add money, withdraw, and the admin review queue.
 *
 * Every movement is a row in wallet_transactions; there is no stored balance.
 *   balance = completed deposits + refunds
 *           - (pending + completed withdrawals) - order payments
 * so a withdrawal request holds its amount immediately, and rejecting or
 * cancelling it releases the money again. Paying for an order at checkout is
 * a `payment` row; cancelling that order adds a matching `refund` row.
 *
 * Payments are simulated like the rest of the store: deposits complete
 * instantly, withdrawals wait for an administrator to mark them paid.
 */
import express from "express";
import crypto from "node:crypto";
import db, { now } from "./db.mjs";
import { ah, requireUser } from "./auth.mjs";
import { publish } from "./live.mjs";
import { notifyUser } from "./notifications.mjs";

export const DEPOSIT_METHODS = ["bkash", "nagad", "card"];
export const WITHDRAW_METHODS = ["bkash", "nagad", "bank"];
export const LIMITS = { depositMin: 10, depositMax: 50000, withdrawMin: 50, withdrawMax: 50000 };

const MOBILE_RE = /^01[3-9]\d{8}$/;
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const money = (v) => Math.round(Number(v) * 100) / 100;

const TXN_SELECT = `SELECT id, type, method, account, amount, status, reference, note,
  created_at AS createdAt, processed_at AS processedAt FROM wallet_transactions`;

const METHOD_LABELS = { bkash: "bKash", nagad: "Nagad", card: "card", bank: "bank account" };
const taka = (n) => `৳${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/** Live-refresh every open wallet screen of `userId` (see live.mjs). */
export async function notifyTxn(userId, txnId, source) {
  const txn = await db.get(`${TXN_SELECT} WHERE id = ?`, [txnId]);
  const { balance, held } = await walletBalance(userId);
  publish(userId, "wallet", { source, txn, balance, held });
  return txn;
}

function withdrawalMessage(txn) {
  const to = `${METHOD_LABELS[txn.method] ?? txn.method} ${txn.account}`;
  if (txn.status === "completed") {
    return {
      title: "Withdrawal paid",
      body: `${taka(txn.amount)} has been sent to your ${to}.${txn.note ? ` Ref: ${txn.note}` : ""}`,
    };
  }
  return {
    title: "Withdrawal rejected",
    body: `Your ${taka(txn.amount)} withdrawal was not approved and the money is back in your wallet.${
      txn.note ? ` Reason: ${txn.note}` : ""
    }`,
  };
}

const REF_PREFIX = { deposit: "WD", withdrawal: "WW", payment: "WP", refund: "WR" };
const newReference = (type) =>
  `${REF_PREFIX[type]}-${Date.now().toString(36).toUpperCase()}${crypto
    .randomBytes(2)
    .toString("hex")
    .toUpperCase()}`;

/** SQL for the balance; also used by the admin summary over all wallets. */
const CREDITS_SQL = `COALESCE(SUM(CASE WHEN type IN ('deposit','refund') AND status = 'completed' THEN amount END), 0)`;
const DEBITS_SQL = `COALESCE(SUM(CASE WHEN (type = 'withdrawal' AND status IN ('pending','completed'))
  OR (type = 'payment' AND status = 'completed') THEN amount END), 0)`;

/** Balance and held (pending withdrawal) amount for one user. Pass `q` inside a transaction. */
export async function walletBalance(userId, q = db) {
  const row = await q.get(
    `SELECT ${CREDITS_SQL} AS credits, ${DEBITS_SQL} AS debits,
       COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'pending' THEN amount END), 0) AS held
     FROM wallet_transactions WHERE user_id = ?`,
    [userId],
  );
  return { balance: money(row.credits - row.debits), held: money(row.held) };
}

export class InsufficientBalanceError extends Error {
  constructor(balance) {
    super(`Your wallet balance (৳${balance.toLocaleString("en-US")}) is not enough for this order.`);
    this.balance = balance;
  }
}

/**
 * Charge an order to the customer's wallet. Call inside the order's
 * transaction (`q`); throws InsufficientBalanceError so the order rolls back.
 */
export async function payOrderFromWallet(q, userId, orderId, amount) {
  // Same per-user lock as withdrawals, so a payment and a withdrawal can't both spend the balance.
  await q.get("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
  const { balance } = await walletBalance(userId, q);
  if (amount > balance) throw new InsufficientBalanceError(balance);
  const info = await q.run(
    `INSERT INTO wallet_transactions
       (user_id, type, method, account, amount, status, reference, created_at, processed_at)
     VALUES (?, 'payment', 'order', ?, ?, 'completed', ?, ?, ?)`,
    [userId, orderId, money(amount), newReference("payment"), now(), now()],
  );
  return Number(info.insertId);
}

/**
 * Return a cancelled order's wallet payment. Idempotent: does nothing if the
 * order was not paid from the wallet or is already refunded. Returns
 * { txnId, userId, amount } of the refund, or null.
 */
export async function refundOrderToWallet(q, orderId, note = "") {
  const paid = await q.get(
    `SELECT user_id AS userId, amount FROM wallet_transactions
     WHERE type = 'payment' AND status = 'completed' AND account = ? FOR UPDATE`,
    [orderId],
  );
  if (!paid) return null;
  const refunded = await q.get(
    "SELECT id FROM wallet_transactions WHERE type = 'refund' AND account = ?",
    [orderId],
  );
  if (refunded) return null;
  const info = await q.run(
    `INSERT INTO wallet_transactions
       (user_id, type, method, account, amount, status, reference, note, created_at, processed_at)
     VALUES (?, 'refund', 'order', ?, ?, 'completed', ?, ?, ?, ?)`,
    [paid.userId, orderId, paid.amount, newReference("refund"), str(note, 300), now(), now()],
  );
  return { txnId: Number(info.insertId), userId: paid.userId, amount: money(paid.amount) };
}

/** True if this order's wallet payment has been refunded. */
export async function orderRefunded(orderId) {
  return !!(await db.get("SELECT id FROM wallet_transactions WHERE type = 'refund' AND account = ?", [orderId]));
}

async function readWallet(userId) {
  const { balance, held } = await walletBalance(userId);
  const transactions = await db.all(
    `${TXN_SELECT} WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    [userId],
  );
  return { balance, held, limits: LIMITS, transactions };
}

/** Validates amount/method/account; returns { error } or the cleaned values. */
function parseRequest(body, kind) {
  const methods = kind === "deposit" ? DEPOSIT_METHODS : WITHDRAW_METHODS;
  const min = kind === "deposit" ? LIMITS.depositMin : LIMITS.withdrawMin;
  const max = kind === "deposit" ? LIMITS.depositMax : LIMITS.withdrawMax;
  const errors = {};

  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    errors.amount = `Enter a whole amount between ৳${min.toLocaleString()} and ৳${max.toLocaleString()}.`;
  }

  const method = str(body?.method, 20);
  if (!methods.includes(method)) errors.method = "Choose a payment method.";

  let account = str(body?.account, 120);
  if (method === "bkash" || method === "nagad") {
    account = account.replace(/[\s-]/g, "").replace(/^\+?88/, "");
    if (!MOBILE_RE.test(account)) errors.account = "Enter a valid 11-digit mobile number (01XXXXXXXXX).";
  } else if (method === "card") {
    // The client sends only the last four digits; full card numbers never reach the server.
    if (!/^\d{4}$/.test(account)) errors.account = "Enter a valid card number.";
    else account = `•••• ${account}`;
  } else if (method === "bank") {
    if (account.length < 8) errors.account = "Enter the bank name, branch and account number.";
  }

  if (Object.keys(errors).length) return { errors };
  return { amount, method, account };
}

/** /api/account/wallet/* - the signed-in customer's own wallet. */
export function createWalletRouter() {
  const router = express.Router();
  router.use("/api/account/wallet", requireUser);

  router.get("/api/account/wallet", ah(async (req, res) => {
    res.json(await readWallet(req.user.id));
  }));

  router.post("/api/account/wallet/deposit", ah(async (req, res) => {
    const parsed = parseRequest(req.body, "deposit");
    if (parsed.errors) return res.status(400).json({ error: Object.values(parsed.errors)[0], errors: parsed.errors });
    const info = await db.run(
      `INSERT INTO wallet_transactions
         (user_id, type, method, account, amount, status, reference, created_at, processed_at)
       VALUES (?, 'deposit', ?, ?, ?, 'completed', ?, ?, ?)`,
      [req.user.id, parsed.method, parsed.account, parsed.amount, newReference("deposit"), now(), now()],
    );
    res.status(201).json(await readWallet(req.user.id));
    void notifyTxn(req.user.id, Number(info.insertId), "customer").catch(() => {});
  }));

  router.post("/api/account/wallet/withdraw", ah(async (req, res) => {
    const parsed = parseRequest(req.body, "withdrawal");
    if (parsed.errors) return res.status(400).json({ error: Object.values(parsed.errors)[0], errors: parsed.errors });

    const outcome = await db.tx(async (q) => {
      // Serialises concurrent withdrawals for the same user so the balance check holds.
      await q.get("SELECT id FROM users WHERE id = ? FOR UPDATE", [req.user.id]);
      const { balance } = await walletBalance(req.user.id, q);
      if (parsed.amount > balance) return { balance };
      const info = await q.run(
        `INSERT INTO wallet_transactions
           (user_id, type, method, account, amount, status, reference, created_at)
         VALUES (?, 'withdrawal', ?, ?, ?, 'pending', ?, ?)`,
        [req.user.id, parsed.method, parsed.account, parsed.amount, newReference("withdrawal"), now()],
      );
      return { id: Number(info.insertId) };
    });
    if (outcome.balance !== undefined) {
      const error = `Insufficient balance. You can withdraw up to ৳${outcome.balance.toLocaleString()}.`;
      return res.status(400).json({ error, errors: { amount: error } });
    }
    res.status(201).json(await readWallet(req.user.id));
    void notifyTxn(req.user.id, outcome.id, "customer").catch(() => {});
  }));

  router.post("/api/account/wallet/withdrawals/:id/cancel", ah(async (req, res) => {
    const info = await db.run(
      `UPDATE wallet_transactions SET status = 'cancelled', processed_at = ?
       WHERE id = ? AND user_id = ? AND type = 'withdrawal' AND status = 'pending'`,
      [now(), Number(req.params.id), req.user.id],
    );
    if (!info.affectedRows) {
      return res.status(409).json({ error: "This withdrawal has already been processed." });
    }
    res.json(await readWallet(req.user.id));
    void notifyTxn(req.user.id, Number(req.params.id), "customer").catch(() => {});
  }));

  return router;
}

/** Admin wallet endpoints, mounted on the (already admin-guarded) /api/admin router. */
export function mountAdminWallet(router) {
  router.get("/wallet", ah(async (req, res) => {
    const view = str(req.query.view, 20) || "pending";
    const q = str(req.query.q, 120);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const where = [];
    const params = {};
    if (view === "pending") where.push("t.type = 'withdrawal' AND t.status = 'pending'");
    else if (view === "deposits") where.push("t.type = 'deposit'");
    else if (view === "withdrawals") where.push("t.type = 'withdrawal'");
    else if (view === "purchases") where.push("t.type IN ('payment','refund')");
    if (q) {
      where.push("(t.reference LIKE :q OR t.account LIKE :q OR u.name LIKE :q OR u.email LIKE :q OR u.phone LIKE :q)");
      params.q = `%${q}%`;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const from = "FROM wallet_transactions t JOIN users u ON u.id = t.user_id";

    const total = (await db.get(`SELECT COUNT(*) n ${from} ${whereSql}`, params)).n;
    const transactions = await db.all(
      `SELECT t.id, t.type, t.method, t.account, t.amount, t.status, t.reference, t.note,
              t.created_at AS createdAt, t.processed_at AS processedAt,
              u.id AS userId, u.name AS userName, u.email AS userEmail, u.phone AS userPhone
       ${from} ${whereSql}
       ORDER BY t.created_at DESC, t.id DESC LIMIT ${(page - 1) * limit}, ${limit}`,
      params,
    );
    const summary = await db.get(
      `SELECT
         ${CREDITS_SQL} - ${DEBITS_SQL} AS outstanding,
         COALESCE(SUM(CASE WHEN type = 'payment' AND status = 'completed' THEN amount END), 0)
           - COALESCE(SUM(CASE WHEN type = 'refund' AND status = 'completed' THEN amount END), 0) AS spent,
         COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'pending' THEN amount END), 0) AS pendingAmount,
         SUM(type = 'withdrawal' AND status = 'pending') AS pendingCount,
         COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'completed' THEN amount END), 0) AS deposited,
         COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'completed' THEN amount END), 0) AS paidOut
       FROM wallet_transactions`,
    );
    res.json({
      total,
      page,
      limit,
      transactions,
      summary: {
        outstanding: money(summary.outstanding),
        pendingAmount: money(summary.pendingAmount),
        pendingCount: Number(summary.pendingCount || 0),
        deposited: money(summary.deposited),
        paidOut: money(summary.paidOut),
        spent: money(summary.spent),
      },
    });
  }));

  router.patch("/wallet/:id", ah(async (req, res) => {
    const id = Number(req.params.id);
    const status = str(req.body?.status, 20);
    if (!["completed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be completed or rejected." });
    }
    const note = str(req.body?.note, 300);
    const info = await db.run(
      `UPDATE wallet_transactions SET status = ?, note = ?, processed_at = ?, processed_by = ?
       WHERE id = ? AND type = 'withdrawal' AND status = 'pending'`,
      [status, note, now(), req.user.id, id],
    );
    if (!info.affectedRows) {
      return res.status(409).json({ error: "This withdrawal is no longer pending." });
    }
    res.json({ transaction: await db.get(`${TXN_SELECT} WHERE id = ?`, [id]) });
    const owner = await db.get("SELECT user_id AS userId FROM wallet_transactions WHERE id = ?", [id]);
    if (owner) {
      void (async () => {
        const txn = await notifyTxn(owner.userId, id, "admin");
        await notifyUser(owner.userId, { kind: "wallet", ...withdrawalMessage(txn), link: "/account/wallet" });
      })().catch((err) => console.warn(`wallet: notify failed (${err.message})`));
    }
  }));
}
