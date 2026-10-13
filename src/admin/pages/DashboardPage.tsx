import { Link } from "react-router-dom";
import { adminApi } from "../api";
import { Empty, OrderStatusPill, PageHeader, Panel } from "../components";
import { ErrorBox, PageLoading } from "../../components/Errors";
import { Img } from "../../components/Img";
import { StatCard } from "../../components/ui";
import { Chart, Package, Receipt, Users } from "../../components/Icons";
import { taka, useFetch } from "../../lib";

function shortDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const { data, loading, error } = useFetch(() => adminApi.overview(), []);

  if (loading) return <PageLoading rows={4} />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const { kpis, statuses, revenue14d, recentOrders, topProducts, outOfStock } = data;
  const maxRevenue = Math.max(...revenue14d.map((d) => d.revenue), 1);
  const statusCount = (s: string) => statuses.find((x) => x.status === s)?.count ?? 0;
  const totalOrders = statuses.reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Live numbers from your store - refreshes on every visit."
        actions={
          <Link to="/admin/orders" className="btn-primary">
            <Receipt className="h-4 w-4" /> {kpis.pending} pending orders
          </Link>
        }
      />

      {/* headline KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={taka(Math.round(kpis.revenue))}
          hint="All orders except cancelled"
          icon={<Chart className="h-5 w-5" />}
        />
        <StatCard
          label="Orders"
          value={kpis.orders.toLocaleString()}
          hint={`${kpis.ordersToday} placed today`}
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          label="Customers"
          value={kpis.customers.toLocaleString()}
          hint={`+${kpis.newCustomers7d} in the last 7 days`}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Catalogue"
          value={kpis.products.toLocaleString()}
          hint={`${kpis.outOfStock.toLocaleString()} out of stock`}
          icon={<Package className="h-5 w-5" />}
        />
      </div>

      {/* revenue chart */}
      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="section-title">Revenue - last 14 days</h2>
            <p className="text-xs text-slate-500">Cancelled orders excluded</p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-extrabold text-ink-900">
              {taka(Math.round(revenue14d.reduce((n, d) => n + d.revenue, 0)))}
            </p>
            <p className="text-xs text-slate-400">
              {revenue14d.reduce((n, d) => n + d.orders, 0)} orders
            </p>
          </div>
        </div>

        <div className="flex h-44 items-end gap-1.5 sm:gap-2">
          {revenue14d.map((d) => {
            const h = Math.max((d.revenue / maxRevenue) * 100, 2);
            return (
              <div key={d.day} className="group flex h-full flex-1 flex-col justify-end">
                <div className="relative w-full rounded-t-md bg-brand-gradient transition-all group-hover:brightness-110"
                  style={{ height: `${h}%` }}
                  title={`${shortDay(d.day)}: ${taka(Math.round(d.revenue))} · ${d.orders} orders`}
                >
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[10px] font-bold text-white group-hover:block">
                    {taka(Math.round(d.revenue))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5 sm:gap-2">
          {revenue14d.map((d) => (
            <span key={d.day} className="flex-1 text-center text-[9px] text-slate-400 sm:text-[10px]">
              {shortDay(d.day)}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* recent orders */}
        <Panel className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Recent orders</h2>
            <Link to="/admin/orders" className="link text-xs">
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/admin/orders/${o.id}`}
                    className="flex min-w-0 items-center gap-3 py-2.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink-900">{o.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {o.id} · {o.itemsCount} items ·{" "}
                        {new Date(o.placedAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <OrderStatusPill status={o.status} />
                    <span className="w-20 shrink-0 text-right font-display text-sm font-extrabold">
                      {taka(Math.round(o.total))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* status + top products */}
        <div className="min-w-0 space-y-5">
          <Panel>
            <h2 className="section-title mb-3">Order status</h2>
            <div className="flex flex-wrap gap-2">
              {["placed", "confirmed", "shipped", "delivered", "cancelled"].map((s) => (
                <Link
                  key={s}
                  to={`/admin/orders?status=${s}`}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm transition hover:border-brand-300 hover:bg-brand-50"
                >
                  <OrderStatusPill status={s} />
                  <span className="font-display font-extrabold">{statusCount(s)}</span>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">{totalOrders} orders in total</p>
          </Panel>

          <Panel>
            <h2 className="section-title mb-3">Best sellers</h2>
            {topProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Sales data appears once orders come in.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {topProducts.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="w-4 text-center text-xs font-bold text-slate-400">
                      {i + 1}
                    </span>
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-50 p-0.5">
                      <Img src={p.image} alt="" className="h-full w-full object-contain" />
                    </span>
                    <Link
                      to={`/admin/products/${p.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-brand-700"
                    >
                      {p.name}
                    </Link>
                    <span className="text-right">
                      <span className="block text-xs font-bold">{p.units} sold</span>
                      <span className="block text-[11px] text-slate-400">
                        {taka(Math.round(p.revenue))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* out of stock */}
      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="section-title">Out of stock</h2>
            <p className="text-xs text-slate-500">
              {kpis.outOfStock.toLocaleString()} products cannot be ordered right now
            </p>
          </div>
          <Link
            to="/admin/products?stock=out"
            className="btn-outline btn-sm"
          >
            Manage stock
          </Link>
        </div>
        {outOfStock.length === 0 ? (
          <p className="py-6 text-center text-sm text-emerald-600">Everything is in stock.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {outOfStock.map((p) => (
              <li
                key={p.id}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 p-2.5"
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-50 p-0.5">
                  <Img src={p.image} alt="" className="h-full w-full object-contain" />
                </span>
                <Link
                  to={`/admin/products/${p.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-brand-700"
                >
                  {p.name}
                </Link>
                <span className="shrink-0 font-display text-sm font-extrabold">
                  {taka(p.price)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {kpis.hidden > 0 && (
        <Empty
          title={`${kpis.hidden} unpublished product${kpis.hidden === 1 ? "" : "s"}`}
          message="Hidden products do not appear anywhere on the storefront."
          action={
            <Link to="/admin/products?status=hidden" className="btn-primary">
              Review hidden products
            </Link>
          }
        />
      )}
    </div>
  );
}
