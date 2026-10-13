import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../api";
import { Confirm, OrderStatusPill, PageHeader, Panel, RowsSkeleton } from "../components";
import { ErrorBox } from "../../components/Errors";
import { Avatar, Stars } from "../../components/ui";
import { MapPin, Shield, User } from "../../components/Icons";
import { taka, useFetch } from "../../lib";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const { user: me } = useAuth();
  const { data, loading, error, refresh } = useFetch(() => adminApi.customer(id), [id]);
  const [busy, setBusy] = useState(false);
  const [confirmRole, setConfirmRole] = useState(false);

  if (loading) return <RowsSkeleton rows={5} />;
  if (error) return <ErrorBox message={error} />;
  if (!data?.customer) return <ErrorBox message="Customer not found." />;

  const c = data.customer;
  const isAdmin = c.role === "admin";
  const isSelf = me?.id === c.id;

  const toggleRole = async () => {
    setBusy(true);
    try {
      await adminApi.updateCustomerRole(c.id, isAdmin ? "customer" : "admin");
      toast.success(isAdmin ? `${c.name} is now a customer` : `${c.name} is now an administrator`);
      setConfirmRole(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/admin/customers" className="btn-ghost btn-sm -ml-2">
        ← Back to customers
      </Link>

      <PageHeader
        title={c.name}
        subtitle={c.email + (c.phone ? ` · ${c.phone}` : "")}
        actions={
          <button
            className={isAdmin ? "btn-outline" : "btn-primary"}
            disabled={busy || (isAdmin && isSelf)}
            onClick={() => setConfirmRole(true)}
            title={isSelf ? "You cannot remove your own admin access" : undefined}
          >
            <Shield className="h-4 w-4" />
            {busy ? "Saving…" : isAdmin ? "Remove admin access" : "Make administrator"}
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to={`/admin/wallet?view=all&q=${encodeURIComponent(c.email)}`} className="stats-card no-underline">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wallet balance</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{taka(data.wallet?.balance ?? 0)}</p>
          {(data.wallet?.held ?? 0) > 0 && (
            <p className="text-xs text-amber-600">{taka(data.wallet.held)} pending withdrawal</p>
          )}
        </Link>
        <div className="stats-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders</p>
          <p className="mt-1 font-display text-2xl font-extrabold">{c.orders}</p>
        </div>
        <div className="stats-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Lifetime spend
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">{taka(Math.round(c.spend))}</p>
        </div>
        <div className="stats-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</p>
          <p className="mt-1 font-display text-2xl font-extrabold">
            {new Date(c.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Panel>
            <h2 className="section-title mb-3">Orders ({data.orders.length})</h2>
            {data.orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                This customer has not ordered yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="flex items-center gap-3 py-2.5 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-extrabold">{o.id}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(o.placedAt).toLocaleString("en-GB")} · {o.itemsCount} items ·{" "}
                          {o.city}
                        </p>
                      </div>
                      <OrderStatusPill status={o.status} />
                      <span className="w-20 text-right font-display text-sm font-extrabold">
                        {taka(Math.round(o.total))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <h2 className="section-title mb-3">Addresses</h2>
            {data.addresses.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No saved addresses.</p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {data.addresses.map((a) => (
                  <li key={a.id} className="rounded-xl border border-slate-100 p-3">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <MapPin className="h-4 w-4 text-brand-500" />
                      {a.label}
                      {a.isDefault && (
                        <span className="badge-success">Default</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {a.name} · {a.phone}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {a.address}, {a.city}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.reviews.length > 0 && (
            <Panel>
              <h2 className="section-title mb-3">Recent reviews</h2>
              <ul className="space-y-3">
                {data.reviews.map((r, i) => (
                  <li key={i} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/admin/products/${r.productId}`} className="link text-sm">
                        Product #{r.productId}
                      </Link>
                      <Stars rating={r.rating} />
                    </div>
                    {r.body && <p className="mt-1 text-sm text-slate-600">{r.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(r.createdAt).toLocaleString("en-GB")}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center gap-3">
            <Avatar
              initials={
                c.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("") || "?"
              }
              className="h-12 w-12"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold">{c.name}</p>
              <p className="truncate text-xs text-slate-500">{c.email}</p>
            </div>
          </div>

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Role</dt>
              <dd>
                {isAdmin ? (
                  <span className="badge-accent">Administrator</span>
                ) : (
                  <span className="badge bg-slate-100 text-slate-600">Customer</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-semibold">{c.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Customer id</dt>
              <dd className="font-mono text-xs font-semibold">#{c.id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Average order</dt>
              <dd className="font-semibold">
                {c.orders ? taka(Math.round(c.spend / c.orders)) : "—"}
              </dd>
            </div>
          </dl>

          <div className="divider my-4" />
          <p className="flex items-start gap-2 text-xs text-slate-400">
            <User className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Administrators can open this panel and manage the whole store. Customers only see their
            own account.
          </p>
        </Panel>
      </div>

      <Confirm
        open={confirmRole}
        title={isAdmin ? "Remove admin access?" : "Make this user an administrator?"}
        message={
          isAdmin ? (
            <>
              <strong>{c.name}</strong> will no longer be able to open the admin panel. Their orders
              and data stay untouched.
            </>
          ) : (
            <>
              <strong>{c.name}</strong> will get full access to products, orders, customers and
              settings. You can revoke it at any time.
            </>
          )
        }
        tone={isAdmin ? "danger" : "primary"}
        confirmLabel={isAdmin ? "Remove access" : "Grant access"}
        busy={busy}
        onConfirm={() => void toggleRole()}
        onClose={() => setConfirmRole(false)}
      />
    </div>
  );
}
