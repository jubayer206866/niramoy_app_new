import { Link } from "react-router-dom";
import { api, type Order } from "../../api";
import { useFetch, taka } from "../../lib";
import { Img } from "../../components/Img";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { EmptyState, SectionHeading } from "../../components/ui";
import { PageLoading } from "../../components/Errors";
import { ChevronRight, Package, Truck } from "../../components/Icons";

const STATUS_TONES: Record<string, string> = {
  placed: "badge-warn",
  confirmed: "badge bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  shipped: "badge bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  delivered: "badge-success",
  cancelled: "badge-danger",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`${STATUS_TONES[status] ?? "badge bg-slate-100 text-slate-600"} capitalize`}>
      {status}
    </span>
  );
}

export default function AccountOrders() {
  const { data, loading } = useFetch(() => api.orders(), []);
  const { add } = useCart();
  const { success } = useToast();

  const orders: Order[] = data?.orders ?? [];

  const reorder = (order: Order) => {
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
    success(`${n} items from ${order.id} added to your cart`);
  };

  return (
    <div>
      <SectionHeading
        title="My orders"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} placed from this account`}
      />

      {loading && <PageLoading rows={3} />}

      {!loading && orders.length === 0 && (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="No orders yet"
          message="Once you place an order you will be able to track it and re-order in one tap."
          action={
            <Link to="/products" className="btn-primary">
              Browse products
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <article key={o.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <div>
                <p className="font-display text-sm font-extrabold">{o.id}</p>
                <p className="text-xs text-slate-500">
                  Placed {new Date(o.placedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={o.status} />
                <span className="font-display text-base font-extrabold">{taka(o.total)}</span>
              </div>
            </header>

            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {(o.items ?? []).slice(0, 5).map((it) => (
                  <Link
                    key={`${o.id}-${it.id}`}
                    to={`/product/${it.id}/${it.slug}`}
                    className="group flex items-center gap-2 rounded-xl border border-slate-100 p-2 transition hover:border-brand-200"
                  >
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-50 p-0.5">
                      <Img src={it.image} alt="" className="h-full w-full object-contain" />
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[12rem] truncate text-xs font-semibold">
                        {it.name}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {it.qty} × {taka(it.price)}
                      </span>
                    </span>
                  </Link>
                ))}
                {(o.items?.length ?? 0) > 5 && (
                  <span className="chip">
                    +{(o.items?.length ?? 0) - 5} more items
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-brand-500" />
                  {o.address}, {o.city}
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  <button onClick={() => reorder(o)} className="btn-outline btn-sm">
                    Re-order
                  </button>
                  <Link to={`/account/orders/${o.id}`} className="btn-primary btn-sm">
                    Details <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
