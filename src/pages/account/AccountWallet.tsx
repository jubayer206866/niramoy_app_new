import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type Wallet, type WalletTxn } from "../../api";
import { taka, useFetch } from "../../lib";
import { useLiveEvents } from "../../live";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Alert, EmptyState, Field, SectionHeading } from "../../components/ui";
import { ErrorBox, PageLoading } from "../../components/Errors";
import { ArrowDown, ArrowUp, Bank, Cart, Clock, Shield, Wallet as WalletIcon, X } from "../../components/Icons";
import { BkashLogo, MastercardLogo, NagadLogo, VisaLogo } from "../../components/PaymentLogos";

type Mode = "deposit" | "withdraw";

const METHOD_LABELS: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  bank: "Bank transfer",
};

const METHODS: Record<Mode, string[]> = {
  deposit: ["bkash", "nagad", "card"],
  withdraw: ["bkash", "nagad", "bank"],
};

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

function MethodMark({ method }: { method: string }) {
  if (method === "bkash") return <BkashLogo className="h-6 w-auto max-w-full sm:h-7" />;
  if (method === "nagad") return <NagadLogo className="h-6 w-auto max-w-full sm:h-7" />;
  if (method === "card")
    return (
      <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1">
        <VisaLogo className="h-[18px] w-auto sm:h-7" />
        <MastercardLogo className="h-[18px] w-auto sm:h-7" />
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-sm font-bold text-ink-700">
      <Bank className="h-5 w-5 text-brand-600" /> Bank
    </span>
  );
}

const STATUS: Record<WalletTxn["status"], { label: (t: WalletTxn) => string; className: string }> = {
  completed: { label: (t) => (t.type === "deposit" ? "Completed" : "Paid"), className: "badge-success" },
  pending: { label: () => "Processing", className: "badge-warn" },
  rejected: { label: () => "Rejected", className: "badge-danger" },
  cancelled: { label: () => "Cancelled", className: "badge bg-slate-100 text-slate-600" },
};

/** Luhn check, so obviously mistyped card numbers are caught before submitting. */
function validCard(digits: string) {
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function TxnRow({ t, onCancel, busy }: { t: WalletTxn; onCancel: (t: WalletTxn) => void; busy: boolean }) {
  const credit = t.type === "deposit" || t.type === "refund";
  const order = t.type === "payment" || t.type === "refund";
  const counted = t.status === "completed" || t.status === "pending";
  const status = order
    ? { label: () => (t.type === "payment" ? "Paid" : "Refunded"), className: STATUS.completed.className }
    : STATUS[t.status] ?? STATUS.cancelled;
  const title =
    t.type === "payment"
      ? "Order payment"
      : t.type === "refund"
        ? "Refund for cancelled order"
        : `${credit ? "Added via" : "Withdrawal to"} ${METHOD_LABELS[t.method] ?? t.method}`;
  return (
    <li className="flex items-start gap-3 p-4">
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
          credit ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600"
        }`}
      >
        {t.type === "payment" ? (
          <Cart className="h-5 w-5" />
        ) : credit ? (
          <ArrowDown className="h-5 w-5" />
        ) : (
          <ArrowUp className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="truncate text-xs text-slate-500">
          {order ? (
            <Link to={`/account/orders/${t.account}`} className="font-semibold text-brand-700 hover:underline">
              {t.account}
            </Link>
          ) : (
            t.account
          )}{" "}
          · {new Date(t.createdAt).toLocaleString()}
        </p>
        <p className="text-[11px] text-slate-400">Ref {t.reference}</p>
        {t.note && <p className="mt-1 text-xs text-slate-600">Note: {t.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p
          className={`font-display text-base font-extrabold ${
            !counted ? "text-slate-400 line-through" : credit ? "text-emerald-600" : "text-ink-900"
          }`}
        >
          {credit ? "+" : "−"}
          {taka(t.amount)}
        </p>
        <span className={status.className}>{status.label(t)}</span>
        {t.type === "withdrawal" && t.status === "pending" && (
          <button
            className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => onCancel(t)}
          >
            Cancel request
          </button>
        )}
      </div>
    </li>
  );
}

export default function AccountWallet() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { data, loading, error } = useFetch(() => api.wallet(), []);
  const [latest, setLatest] = useState<Wallet | null>(null);
  const wallet = latest ?? data;

  // Withdrawal approvals/rejections land here without a manual refresh.
  useLiveEvents(["wallet", "ready"], () => {
    api.wallet().then(setLatest, () => {});
  });

  const [mode, setMode] = useState<Mode | null>(null);
  const [method, setMethod] = useState("bkash");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const open = (next: Mode) => {
    setMode(next);
    setMethod("bkash");
    setAmount("");
    setAccount(user?.phone ?? "");
    setCard({ number: "", expiry: "", cvc: "" });
    setErrors({});
  };

  // Checkout sends customers here as /account/wallet?add=<shortfall>&next=/checkout
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next")?.startsWith("/") ? params.get("next") : null;
  useEffect(() => {
    const add = Number(params.get("add"));
    if (add > 0) {
      open("deposit");
      setAmount(String(Math.max(Math.ceil(add), 10)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMethod = (m: string) => {
    setMethod(m);
    setAccount(m === "bkash" || m === "nagad" ? user?.phone ?? "" : "");
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || !wallet) return;
    const next: Record<string, string> = {};
    const value = Number(amount);
    let accountValue = account.trim();

    if (method === "card") {
      const digits = card.number.replace(/\D/g, "");
      if (!validCard(digits)) next.account = "Enter a valid card number.";
      if (!/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(card.expiry.trim())) next.expiry = "Use MM/YY.";
      if (!/^\d{3,4}$/.test(card.cvc.trim())) next.cvc = "3 or 4 digits.";
      accountValue = digits.slice(-4);
    }
    if (mode === "withdraw" && value > wallet.balance) {
      next.amount = `You can withdraw up to ${taka(wallet.balance)}.`;
    }
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const payload = { amount: value, method, account: accountValue };
      const res = mode === "deposit" ? await api.walletDeposit(payload) : await api.walletWithdraw(payload);
      setLatest(res);
      success(
        mode === "deposit"
          ? `${taka(value)} added to your wallet`
          : `Withdrawal of ${taka(value)} requested`,
      );
      setMode(null);
      if (mode === "deposit" && next) navigate(next);
    } catch (err) {
      if (err instanceof ApiError) {
        const shown = err.fields.amount || err.fields.account;
        setErrors(shown ? err.fields : { form: err.message });
        toastError(err.message);
      } else {
        toastError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelWithdrawal = async (t: WalletTxn) => {
    if (!confirm(`Cancel the ${taka(t.amount)} withdrawal request?`)) return;
    setBusy(true);
    try {
      setLatest(await api.walletCancelWithdrawal(t.id));
      success("Withdrawal cancelled - the money is back in your wallet");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Could not cancel that request.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !wallet) return <PageLoading rows={3} />;
  if (error && !wallet) return <ErrorBox message={error} />;
  if (!wallet) return null;

  const limits = wallet.limits;
  const min = mode === "withdraw" ? limits.withdrawMin : limits.depositMin;
  const max = mode === "withdraw" ? Math.min(limits.withdrawMax, wallet.balance) : limits.depositMax;
  const accountField: Record<string, { label: string; placeholder: string; hint?: string }> = {
    bkash: { label: "bKash number *", placeholder: "01XXXXXXXXX" },
    nagad: { label: "Nagad number *", placeholder: "01XXXXXXXXX" },
    bank: {
      label: "Bank account *",
      placeholder: "e.g. BRAC Bank, Gulshan branch, A/C 1501xxxxxxxx",
      hint: "Bank name, branch and account number",
    },
  };

  let form: ReactNode = null;
  if (mode) {
    form = (
      <form onSubmit={submit} className="panel">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">
            {mode === "deposit" ? "Add money" : "Withdraw money"}
          </h2>
          <button type="button" className="btn-icon" onClick={() => setMode(null)} aria-label="Close">
            <X />
          </button>
        </header>

        {errors.form && (
          <div className="mb-3">
            <Alert tone="error">{errors.form}</Alert>
          </div>
        )}

        <span className="label">{mode === "deposit" ? "Pay with" : "Send to"}</span>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {METHODS[mode].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => pickMethod(m)}
              aria-pressed={method === m}
              aria-label={METHOD_LABELS[m]}
              className={`flex h-14 min-w-0 items-center justify-center rounded-xl border-2 bg-white px-1.5 transition sm:px-3 ${
                method === m ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-300"
              }`}
            >
              <MethodMark method={m} />
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Amount (৳) *"
            error={errors.amount}
            hint={
              mode === "withdraw"
                ? `Available ${taka(wallet.balance)} · minimum ${taka(limits.withdrawMin)}`
                : `${taka(limits.depositMin)} – ${taka(limits.depositMax)}`
            }
          >
            <input
              className="input"
              required
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </Field>

          {method === "card" ? (
            <Field label="Card number *" error={errors.account}>
              <input
                className="input"
                required
                inputMode="numeric"
                autoComplete="cc-number"
                value={card.number}
                onChange={(e) =>
                  setCard({
                    ...card,
                    number: e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 19)
                      .replace(/(\d{4})(?=\d)/g, "$1 "),
                  })
                }
                placeholder="1234 5678 9012 3456"
              />
            </Field>
          ) : (
            <Field
              label={accountField[method].label}
              error={errors.account}
              hint={accountField[method].hint}
            >
              <input
                className="input"
                required
                inputMode={method === "bank" ? "text" : "tel"}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={accountField[method].placeholder}
              />
            </Field>
          )}

          {method === "card" && (
            <>
              <Field label="Expiry *" error={errors.expiry}>
                <input
                  className="input"
                  required
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={card.expiry}
                  onChange={(e) => setCard({ ...card, expiry: e.target.value.slice(0, 7) })}
                  placeholder="MM/YY"
                />
              </Field>
              <Field label="CVC *" error={errors.cvc}>
                <input
                  className="input"
                  required
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  value={card.cvc}
                  onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  placeholder="123"
                />
              </Field>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.filter((a) => a <= max).map((a) => (
            <button
              key={a}
              type="button"
              className={`chip ${Number(amount) === a ? "chip-active" : ""}`}
              onClick={() => setAmount(String(a))}
            >
              {taka(a)}
            </button>
          ))}
          {mode === "withdraw" && wallet.balance >= limits.withdrawMin && (
            <button
              type="button"
              className={`chip ${Number(amount) === Math.floor(max) ? "chip-active" : ""}`}
              onClick={() => setAmount(String(Math.floor(max)))}
            >
              Max {taka(Math.floor(max))}
            </button>
          )}
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
          {mode === "deposit"
            ? method === "card"
              ? "Demo payment - card details are not stored; only the last 4 digits are kept for your records."
              : "Demo payment - the money is added to your wallet instantly."
            : "The amount is held from your balance now and sent after our team approves the request (usually within 24 hours)."}
        </p>

        <div className="mt-4 flex gap-2">
          <button className="btn-primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "deposit"
                ? `Add ${amount ? taka(Number(amount)) : "money"}`
                : `Withdraw ${amount ? taka(Number(amount)) : ""}`.trim()}
          </button>
          <button type="button" className="btn-outline" onClick={() => setMode(null)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-brand-gradient p-5 text-white shadow-lift sm:p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/75">
            <WalletIcon className="h-4 w-4" /> Wallet balance
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold">{taka(wallet.balance)}</p>
          {wallet.held > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
              <Clock className="h-4 w-4" /> {taka(wallet.held)} on hold for pending withdrawals
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn bg-white text-brand-700 hover:bg-white/90" onClick={() => open("deposit")}>
              <ArrowDown className="h-4 w-4" /> Add money
            </button>
            <button
              className="btn bg-white/15 text-white hover:bg-white/25 disabled:opacity-60"
              onClick={() => open("withdraw")}
              disabled={wallet.balance < limits.withdrawMin}
              title={
                wallet.balance < limits.withdrawMin
                  ? `You need at least ${taka(limits.withdrawMin)} to withdraw`
                  : undefined
              }
            >
              <ArrowUp className="h-4 w-4" /> Withdraw
            </button>
          </div>
        </div>
      </section>

      {form}

      <section>
        <SectionHeading title="Transactions" subtitle="Your latest wallet activity" />
        {wallet.transactions.length === 0 ? (
          <EmptyState
            icon={<WalletIcon className="h-6 w-6" />}
            title="No transactions yet"
            message="Add money with bKash, Nagad or a card to get started."
            action={
              <button className="btn-primary" onClick={() => open("deposit")}>
                Add money
              </button>
            }
          />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {wallet.transactions.map((t) => (
              <TxnRow key={t.id} t={t} onCancel={(x) => void cancelWithdrawal(x)} busy={busy} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
