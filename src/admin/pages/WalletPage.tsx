import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi, type AdminWalletTxn } from "../api";
import { ApiError } from "../../api";
import { Modal, PageHeader, RowsSkeleton, SearchInput, Tabs, Toolbar } from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { StatCard } from "../../components/ui";
import { ArrowDown, ArrowUp, Cart, Check, Clock, Wallet, X } from "../../components/Icons";
import { useToast } from "../../context/ToastContext";
import { taka, useDebounced, useFetch } from "../../lib";

const METHOD_LABELS: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  bank: "Bank transfer",
  order: "Wallet checkout",
};

const TYPE_LABELS: Record<string, string> = {
  deposit: "Top-up",
  withdrawal: "Withdrawal",
  payment: "Order payment",
  refund: "Order refund",
};

const isCredit = (t: AdminWalletTxn) => t.type === "deposit" || t.type === "refund";

const STATUS_TONES: Record<string, string> = {
  completed: "badge-success",
  pending: "badge-warn",
  rejected: "badge-danger",
  cancelled: "badge bg-slate-100 text-slate-600",
};

type Action = { txn: AdminWalletTxn; status: "completed" | "rejected" };

export default function WalletPage() {
  const { success, error: toastError } = useToast();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "pending";
  const page = Math.max(Number(params.get("page") || 1), 1);
  const [search, setSearch] = useState(params.get("q") || "");
  const q = useDebounced(search, 300);

  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    setParams(next);
  };

  const { data, loading, error, refresh } = useFetch(
    () => adminApi.wallet({ view, q, page, limit: 20 }),
    [view, q, page],
  );
  const rows = data?.transactions ?? [];
  const summary = data?.summary;
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / (data?.limit || 20)), 1);

  const openAction = (txn: AdminWalletTxn, status: Action["status"]) => {
    setAction({ txn, status });
    setNote("");
  };

  const process = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await adminApi.processWithdrawal(action.txn.id, action.status, note.trim());
      success(
        action.status === "completed"
          ? `Marked ${taka(action.txn.amount)} to ${action.txn.userName} as paid`
          : `Withdrawal rejected - ${taka(action.txn.amount)} returned to ${action.txn.userName}'s wallet`,
      );
      setAction(null);
      refresh();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Could not update this withdrawal.");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Wallet" subtitle="Customer top-ups and withdrawal requests" />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          label="Pending withdrawals"
          value={summary ? taka(summary.pendingAmount) : "—"}
          hint={summary ? `${summary.pendingCount} request${summary.pendingCount === 1 ? "" : "s"} to review` : undefined}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Customer balances"
          value={summary ? taka(summary.outstanding) : "—"}
          hint="Held across all wallets"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Total added"
          value={summary ? taka(summary.deposited) : "—"}
          hint="Completed top-ups"
          icon={<ArrowDown className="h-4 w-4" />}
        />
        <StatCard
          label="Total paid out"
          value={summary ? taka(summary.paidOut) : "—"}
          hint="Approved withdrawals"
          icon={<ArrowUp className="h-4 w-4" />}
        />
        <StatCard
          label="Spent on orders"
          value={summary ? taka(summary.spent) : "—"}
          hint="Wallet checkout, after refunds"
          icon={<Cart className="h-4 w-4" />}
        />
      </section>

      <Tabs
        value={view}
        onChange={(v) => update({ view: v === "pending" ? null : v })}
        tabs={[
          { key: "pending", label: "Pending withdrawals", count: summary?.pendingCount },
          { key: "withdrawals", label: "Withdrawals" },
          { key: "deposits", label: "Top-ups" },
          { key: "purchases", label: "Purchases & refunds" },
          { key: "all", label: "All" },
        ]}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            update({ q: v });
          }}
          placeholder="Search reference, customer, account…"
        />
        <span className="px-1 text-xs font-semibold text-slate-400">{data?.total ?? 0} transactions</span>
      </Toolbar>

      {loading && <RowsSkeleton rows={6} />}
      {error && <ErrorBox message={error} />}

      {!loading && !error && rows.length === 0 && (
        <EmptyBox
          icon={<Wallet className="h-6 w-6" />}
          title={view === "pending" ? "No withdrawals waiting" : "No transactions here"}
          message={
            view === "pending"
              ? "New withdrawal requests from customers will show up here."
              : "Wallet activity matching this filter will show up here."
          }
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="panel scroll-native overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-bold">Reference</th>
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Type</th>
                <th className="px-4 py-3 font-bold">Account</th>
                <th className="px-4 py-3 font-bold">Amount</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="align-top transition hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-display text-sm font-extrabold">{t.reference}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(t.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/customers/${t.userId}`} className="font-semibold hover:text-brand-700">
                      {t.userName}
                    </Link>
                    <p className="text-xs text-slate-500">{t.userPhone || t.userEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{TYPE_LABELS[t.type] ?? t.type}</p>
                    <p className="text-xs text-slate-500">{METHOD_LABELS[t.method] ?? t.method}</p>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    {t.method === "order" ? (
                      <Link to={`/admin/orders/${t.account}`} className="text-xs font-semibold text-brand-700 hover:underline">
                        {t.account}
                      </Link>
                    ) : (
                      <p className="break-words text-xs text-slate-600">{t.account}</p>
                    )}
                    {t.note && <p className="mt-1 text-[11px] text-slate-400">Note: {t.note}</p>}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-display font-extrabold ${
                      isCredit(t) ? "text-emerald-600" : ""
                    }`}
                  >
                    {isCredit(t) ? "+" : "−"}
                    {taka(t.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`${STATUS_TONES[t.status] ?? "badge"} capitalize`}>
                      {t.status !== "completed"
                        ? t.status
                        : t.type === "withdrawal" || t.type === "payment"
                          ? "paid"
                          : t.type === "refund"
                            ? "refunded"
                            : t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {t.type === "withdrawal" && t.status === "pending" && (
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-primary btn-sm" onClick={() => openAction(t, "completed")}>
                          <Check className="h-3.5 w-3.5" /> Mark paid
                        </button>
                        <button
                          className="btn-outline btn-sm text-rose-600"
                          onClick={() => openAction(t, "rejected")}
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2">
          <button
            className="btn-outline btn-sm"
            disabled={page <= 1}
            onClick={() => update({ page: String(page - 1) }, false)}
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn-outline btn-sm"
            disabled={page >= totalPages}
            onClick={() => update({ page: String(page + 1) }, false)}
          >
            Next
          </button>
        </nav>
      )}

      <Modal
        open={!!action}
        onClose={() => !busy && setAction(null)}
        title={action?.status === "completed" ? "Mark withdrawal as paid" : "Reject withdrawal"}
        footer={
          <>
            <button className="btn-outline" onClick={() => setAction(null)} disabled={busy}>
              Cancel
            </button>
            <button
              className={
                action?.status === "completed" ? "btn-primary" : "btn bg-rose-600 text-white hover:bg-rose-700"
              }
              onClick={() => void process()}
              disabled={busy}
            >
              {busy ? "Saving…" : action?.status === "completed" ? "Mark as paid" : "Reject request"}
            </button>
          </>
        }
      >
        {action && (
          <div className="space-y-3 text-sm">
            <p>
              {action.status === "completed" ? (
                <>
                  Confirm you have sent <b>{taka(action.txn.amount)}</b> to {action.txn.userName} via{" "}
                  {METHOD_LABELS[action.txn.method] ?? action.txn.method}.
                </>
              ) : (
                <>
                  <b>{taka(action.txn.amount)}</b> will be returned to {action.txn.userName}&apos;s wallet
                  balance.
                </>
              )}
            </p>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                <span className="font-semibold">Account:</span> {action.txn.account}
              </p>
              <p>
                <span className="font-semibold">Reference:</span> {action.txn.reference}
              </p>
            </div>
            <label className="block">
              <span className="label">
                {action.status === "completed" ? "Payout transaction ID / note" : "Reason (shown to customer)"}
              </span>
              <textarea
                className="input resize-none"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={action.status === "completed" ? "e.g. bKash TrxID 9A7B6C5D" : "e.g. Account name does not match"}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
