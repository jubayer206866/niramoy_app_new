import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useFetch, taka } from "../../lib";
import { Img } from "../../components/Img";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { Breadcrumbs, EmptyState, SectionHeading } from "../../components/ui";
import { PageLoading } from "../../components/Errors";
import { StatusPill } from "./AccountOrders";
import { Check, Clock, MapPin, Package, Truck } from "../../components/Icons";

const STEPS = [
  { key: "placed", label: "Order placed", icon: <Check className="h-4 w-4" /> },
  { key: "confirmed", label: "Confirmed", icon: <Package className="h-4 w-4" /> },
  { key: "shipped", label: "Out for delivery", icon: <Truck className="h-4 w-4" /> },
  { key: "delivered", label: "Delivered", icon: <MapPin className="h-4 w-4" /> },
];

export default function AccountOrderDetail() {
  const { id = "" } = useParams();
  const { data, loading } = useFetch(() => api.order(id), [id]);
  const { add } = useCart();
  const { success } = useToast();

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
  const stepIndex = Math.max(
    STEPS.findIndex((s) => s.key === order.status),
    0,
  );

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
            {order.paymentMethod.toUpperCase()}
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
        <ol className="grid gap-3 sm:grid-cols-4">
          {STEPS.map((step, i) => {
            const done = i <= stepIndex;
            return (
              <li key={step.key} className="flex items-center gap-2 sm:flex-col sm:text-center">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step.icon}
                </span>
                <span
                  className={`text-xs font-semibold ${done ? "text-ink-800" : "text-slate-400"}`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" /> Estimated delivery 24–48 hours inside Dhaka. The rider
          will call {order.phone} before arriving.
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
