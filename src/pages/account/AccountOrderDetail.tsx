import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useFetch, taka } from "../../lib";
import { Img } from "../../components/Img";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { Breadcrumbs, EmptyState, SectionHeading } from "../../components/ui";
import { PageLoading } from "../../components/Errors";
import { StatusPill } from "./AccountOrders";
import { Clock, Home, MapPin, Package, Receipt, Shield, Truck, X } from "../../components/Icons";
import { useLiveEvents } from "../../live";
import { ORDER_STEPS } from "../../orderStatus";

const STEP_INFO: Record<(typeof ORDER_STEPS)[number], { label: string; hint: string; icon: ReactNode }> = {
  placed: { label: "Order placed", hint: "We received your order", icon: <Receipt className="h-4 w-4" /> },
  confirmed: { label: "Confirmed", hint: "Verified by our pharmacist", icon: <Shield className="h-4 w-4" /> },
  packed: { label: "Packed", hint: "Sealed and ready to ship", icon: <Package className="h-4 w-4" /> },
  shipped: { label: "Shipped", hint: "Left the pharmacy", icon: <Truck className="h-4 w-4" /> },
  out_for_delivery: { label: "Out for delivery", hint: "Rider is on the way", icon: <MapPin className="h-4 w-4" /> },
  delivered: { label: "Delivered", hint: "Handed over to you", icon: <Home className="h-4 w-4" /> },
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AccountOrderDetail() {
  const { id = "" } = useParams();
  const { data, loading, reload } = useFetch(() => api.order(id), [id]);
  const { add } = useCart();
  const { success } = useToast();
  useLiveEvents(["order", "ready"], reload);

  if (loading) return <PageLoading rows={2} />;
  if (!data?.order) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" />}
        title="Order not found"
        message="This order does not exist or belongs to another account."
        action={
          <Link to="/account/orders" className="btn-primary">
            Back to orders
          </Link>
        }
      />
    );
  }

  const order = data.order;
  const events = order.events ?? [];
  const reachedAt = new Map<string, string>([["placed", order.placedAt]]);
  for (const e of events) reachedAt.set(e.status, e.at);
  const cancelled = order.status === "cancelled";
  const cancelEvent = cancelled ? [...events].reverse().find((e) => e.status === "cancelled") : undefined;
  // For a cancelled order, show how far it got before the cancellation.
  const stepIndex = cancelled
    ? Math.max(0, ...events.map((e) => ORDER_STEPS.indexOf(e.status as (typeof ORDER_STEPS)[number])))
    : Math.max(ORDER_STEPS.indexOf(order.status as (typeof ORDER_STEPS)[number]), 0);
  const latestNote = [...events].reverse().find((e) => e.note)?.note;

  const reorder = () => {
    let n = 0;
    for (const item of order.items ?? []) {
      add(
        {
          id: item.id,
          slug: item.slug,
          name: item.name,
          image: item.image,
          unitLabel: item.unitLabel,
          price: item.price,
          mrp: item.mrp,
          rx: false,
        } as never,
        item.qty,
      );
      n += item.qty;
    }
    success(`${n} items added to your cart`);
  };

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Account", to: "/account" },
          { label: "Orders", to: "/account/orders" },
          { label: order.id },
        ]}
      />

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="font-display text-xl font-extrabold">{order.id}</h1>
          <p className="text-xs text-slate-500">
            Placed {new Date(order.placedAt).toLocaleString()} · {order.itemsCount} items ·{" "}
            {order.paymentMethod === "wallet" ? "Paid from wallet" : order.paymentMethod.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={order.status} />
          <span className="font-display text-xl font-extrabold text-brand-700">
            {taka(order.total)}
          </span>
        </div>
      </div>

      {/* timeline */}
      <section className="panel">
        <h2 className="mb-4 font-display text-sm font-bold">Delivery progress</h2>
        {cancelled && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This order was cancelled
              {cancelEvent ? ` on ${stamp(cancelEvent.at)}` : ""}.
              {cancelEvent?.note ? ` Reason: ${cancelEvent.note}` : ""}
              {order.walletRefunded && (
                <>
                  {" "}
                  {taka(order.total)} was refunded to your{" "}
                  <Link to="/account/wallet" className="font-bold underline">
                    wallet
                  </Link>
                  .
                </>
              )}
            </span>
          </p>
        )}
        <ol className="grid gap-0 sm:grid-cols-6 sm:gap-2">
          {ORDER_STEPS.map((key, i) => {
            const step = STEP_INFO[key];
            const done = i <= stepIndex;
            const current = !cancelled && i === stepIndex && key !== "delivered";
            const at = done ? reachedAt.get(key) : undefined;
            return (
              <li
                key={key}
                className="relative flex gap-3 pb-4 last:pb-0 sm:flex-col sm:items-center sm:pb-0 sm:text-center"
              >
                {i < ORDER_STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 sm:left-[calc(50%+1.25rem)] sm:top-[17px] sm:h-0.5 sm:w-[calc(100%-2rem)] ${
                      i < stepIndex && !cancelled ? "bg-brand-500" : "bg-slate-200"
                    }`}
                  />
                )}
                <span
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    done
                      ? cancelled
                        ? "bg-slate-400 text-white"
                        : "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-400"
                  } ${current ? "ring-4 ring-brand-100" : ""}`}
                >
                  {step.icon}
                </span>
                <span className="min-w-0 pt-1 sm:pt-0">
                  <span className={`block text-xs font-bold ${done ? "text-ink-800" : "text-slate-400"}`}>
                    {step.label}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {at ? stamp(at) : step.hint}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        {latestNote && !cancelled && (
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
            <span className="font-bold">Update:</span> {latestNote}
          </p>
        )}
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" /> Estimated delivery 24–48 hours inside Dhaka. The rider
          will call {order.phone} before arriving. You&apos;ll get a notification at every step.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <SectionHeading title="Items" />
          <div className="space-y-2">
            {(order.items ?? []).map((item) => (
              <div key={`${order.id}-${item.id}`} className="card flex items-center gap-3 p-3">
                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-50 p-1">
                  <Img src={item.image} alt="" className="h-full w-full object-contain" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/product/${item.id}/${item.slug}`}
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
                  {taka(item.price * item.qty)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={reorder} className="btn-primary">
              <Package className="h-4 w-4" /> Re-order these items
            </button>
            <Link to="/account/orders" className="btn-outline">
              Back to orders
            </Link>
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel">
            <h2 className="mb-3 font-display text-sm font-bold">Payment summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="font-semibold">{taka(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Delivery</dt>
                <dd className="font-semibold">
                  {order.deliveryFee === 0 ? (
                    <span className="text-emerald-600">FREE</span>
                  ) : (
                    taka(order.deliveryFee)
                  )}
                </dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt>Discount</dt>
                  <dd className="font-semibold">−{taka(order.discount)}</dd>
                </div>
              )}
              <div className="divider my-2" />
              <div className="flex items-baseline justify-between">
                <dt className="font-display text-base font-bold">Total</dt>
                <dd className="font-display text-lg font-extrabold">{taka(order.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Method:{" "}
              <span className="font-semibold capitalize">
                {order.paymentMethod === "cod"
                  ? "Cash on delivery"
                  : order.paymentMethod === "bkash"
                    ? "bKash"
                    : "Card"}
              </span>
            </p>
          </section>

          <section className="panel">
            <h2 className="mb-2 font-display text-sm font-bold">Delivery address</h2>
            <p className="text-sm font-semibold">{order.name}</p>
            <p className="text-xs text-slate-500">{order.phone}</p>
            <p className="mt-1 text-sm text-slate-600">
              {order.address}, {order.city}
            </p>
            {order.note && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <span className="font-semibold">Note:</span> {order.note}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
