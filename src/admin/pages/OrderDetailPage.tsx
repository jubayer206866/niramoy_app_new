import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminApi } from "../api";
import {
  OrderStatusPill,
  ORDER_STATUSES,
  orderStatusLabel,
  PageHeader,
  Panel,
  RowsSkeleton,
  Select,
} from "../components";
import { ORDER_STEPS } from "../../orderStatus";
import { ErrorBox } from "../../components/Errors";
import { Img } from "../../components/Img";
import { Avatar } from "../../components/ui";
import { Clock, MapPin, Phone, Truck, User, Check } from "../../components/Icons";
import { taka, useFetch } from "../../lib";
import { useToast } from "../../context/ToastContext";

export default function OrderDetailPage() {
  const { id = "" } = useParams();
  const toast = useToast();
  const { data, loading, error, refresh } = useFetch(() => adminApi.order(id), [id]);
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <RowsSkeleton rows={5} />;
  if (error) return <ErrorBox message={error} />;
  if (!data?.order) return <ErrorBox message="Order not found." />;

  const order = data.order;
  const customer = data.customer;
  const stepIndex = ORDER_STEPS.indexOf(order.status as (typeof ORDER_STEPS)[number]);
  const nextStep = stepIndex >= 0 && stepIndex < ORDER_STEPS.length - 1 ? ORDER_STEPS[stepIndex + 1] : null;

  const applyStatus = async (status: string) => {
    if (!status || status === order.status) return;
    setBusy(true);
    try {
      const res = await adminApi.updateOrderStatus(order.id, status, note.trim());
      toast.success(
        res.refunded
          ? `Cancelled - ${taka(res.refunded)} refunded to the customer's wallet`
          : order.userId
            ? `Marked "${orderStatusLabel(status)}" - customer notified`
            : `Marked "${orderStatusLabel(status)}" (guest order, no app notification)`,
      );
      setNextStatus("");
      setNote("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/orders" className="btn-ghost btn-sm -ml-2">
          ← Back to orders
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {nextStep && !nextStatus && (
            <button className="btn-primary" disabled={busy} onClick={() => void applyStatus(nextStep)}>
              <Truck className="h-4 w-4" /> Mark {orderStatusLabel(nextStep).toLowerCase()}
            </button>
          )}
          <Select
            value={nextStatus || order.status}
            onChange={(v) => setNextStatus(v === order.status ? "" : v)}
            options={ORDER_STATUSES.map((s) => ({ value: s, label: orderStatusLabel(s) }))}
          />
          {nextStatus && (
            <button className="btn-primary" disabled={busy} onClick={() => void applyStatus(nextStatus)}>
              <Check className="h-4 w-4" /> {busy ? "Updating…" : "Update status"}
            </button>
          )}
        </div>
      </div>
      <input
        className="input mb-4"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          (nextStatus || nextStep) === "cancelled"
            ? "Reason for cancelling (sent to the customer)"
            : "Optional note for the customer with this update, e.g. rider name and phone"
        }
      />

      <PageHeader
        title={order.id}
        subtitle={`Placed ${new Date(order.placedAt).toLocaleString("en-GB")} · ${order.itemsCount} items · ${order.paymentMethod.toUpperCase()}`}
        actions={<OrderStatusPill status={order.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Panel>
            <h2 className="section-title mb-3">Items</h2>
            <ul className="divide-y divide-slate-100">
              {(order.items ?? []).map((item) => (
                <li key={`${order.id}-${item.id}`} className="flex items-center gap-3 py-3">
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-50 p-1">
                    <Img src={item.image} alt="" className="h-full w-full object-contain" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/products/${item.id}`}
                      className="line-clamp-2 text-sm font-semibold hover:text-brand-700"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {item.unitLabel && `${item.unitLabel} · `}
                      {item.qty} × {taka(item.price)}
                    </p>
                  </div>
                  <p className="font-display text-sm font-extrabold">
                    {taka(Math.round(item.price * item.qty))}
                  </p>
                </li>
              ))}
            </ul>
            {order.note && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <span className="font-bold">Customer note:</span> {order.note}
              </p>
            )}
          </Panel>

          <Panel>
            <h2 className="section-title mb-3">Delivery address</h2>
            <p className="text-sm font-semibold">{order.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="h-3.5 w-3.5 text-brand-500" /> {order.phone}
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              {order.address}, {order.city}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
              <Truck className="h-3.5 w-3.5" /> Estimated delivery 24–48 hours inside Dhaka
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <h2 className="section-title mb-3">Payment summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="font-semibold">{taka(Math.round(order.subtotal))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Delivery</dt>
                <dd className="font-semibold">
                  {order.deliveryFee === 0 ? (
                    <span className="text-emerald-600">FREE</span>
                  ) : (
                    taka(Math.round(order.deliveryFee))
                  )}
                </dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt>Discount</dt>
                  <dd className="font-semibold">−{taka(Math.round(order.discount))}</dd>
                </div>
              )}
              <div className="divider my-2" />
              <div className="flex items-baseline justify-between">
                <dt className="font-display text-base font-bold">Total</dt>
                <dd className="font-display text-xl font-extrabold text-brand-700">
                  {taka(Math.round(order.total))}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Method:{" "}
              <span className="font-semibold capitalize">
                {order.paymentMethod === "cod"
                  ? "Cash on delivery"
                  : order.paymentMethod === "bkash"
                    ? "bKash"
                    : order.paymentMethod === "wallet"
                      ? "Customer wallet (prepaid)"
                      : order.paymentMethod}
              </span>
            </p>
            {order.paymentMethod === "wallet" && (
              <p className="mt-1 text-xs text-slate-500">
                {order.walletRefunded
                  ? "Refunded to the customer's wallet when the order was cancelled."
                  : "Already paid - do not collect cash. Cancelling refunds it to the wallet automatically."}
              </p>
            )}
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Customer</h2>
              {customer && (
                <Link to={`/admin/customers/${customer.id}`} className="link text-xs">
                  Profile
                </Link>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Avatar
                initials={
                  (customer?.name || order.name)
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase())
                    .join("") || "?"
                }
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{customer?.name || order.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {customer?.email || order.email || "Guest checkout"}
                </p>
              </div>
            </div>
            {customer && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="font-display text-lg font-extrabold">{customer.orders}</p>
                  <p className="text-[11px] text-slate-500">Orders</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <p className="font-display text-lg font-extrabold">
                    {taka(Math.round(customer.spend))}
                  </p>
                  <p className="text-[11px] text-slate-500">Lifetime</p>
                </div>
              </div>
            )}
            {!customer && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <User className="h-3.5 w-3.5" /> Ordered without an account
              </p>
            )}
          </Panel>

          {data.customerOrders.length > 1 && (
            <Panel>
              <h2 className="section-title mb-3">Recent orders</h2>
              <ul className="space-y-2">
                {data.customerOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="truncate font-semibold hover:text-brand-700"
                    >
                      {o.id}
                    </Link>
                    <span className="flex items-center gap-2">
                      <OrderStatusPill status={o.status} />
                      <span className="font-display font-extrabold">{taka(Math.round(o.total))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel>
            <h2 className="section-title mb-3">Status history</h2>
            <ol className="space-y-3">
              {[...(order.events?.length ? order.events : [{ status: "placed", note: "", at: order.placedAt }])]
                .reverse()
                .map((e, i) => (
                  <li key={`${e.status}-${e.at}`} className="flex gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-brand-600" : "bg-slate-300"}`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{orderStatusLabel(e.status)}</p>
                      <p className="text-xs text-slate-400">{new Date(e.at).toLocaleString("en-GB")}</p>
                      {e.note && <p className="mt-0.5 text-xs text-slate-600">{e.note}</p>}
                    </div>
                  </li>
                ))}
            </ol>
          </Panel>

          <p className="flex items-center gap-1.5 px-1 text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {order.userId
              ? "Every status change is pushed to the customer's app instantly."
              : "Guest checkout: the customer sees updates only on the order page."}
          </p>
        </div>
      </div>
    </div>
  );
}
