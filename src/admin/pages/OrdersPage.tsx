import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import { OrderStatusPill, PageHeader, RowsSkeleton, SearchInput, Tabs, Toolbar } from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { ChevronRight, Receipt } from "../../components/Icons";
import { taka, useDebounced, useFetch } from "../../lib";

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "all";
  const page = Math.max(Number(params.get("page") || 1), 1);
  const [search, setSearch] = useState(params.get("q") || "");
  const q = useDebounced(search, 300);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    setParams(next);
  };

  const { data, loading, error } = useFetch(
    () => adminApi.orders({ status, q, page, limit: 20 }),
    [status, q, page],
  );

  const count = (key: string) =>
    key === "all"
      ? (data?.counts ?? []).reduce((n, c) => n + c.count, 0)
      : (data?.counts ?? []).find((c) => c.status === key)?.count ?? 0;

  const orders = data?.orders ?? [];
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / (data?.limit || 20)), 1);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Track, confirm and fulfil customer orders"
      />

      <Tabs
        value={status}
        onChange={(v) => update({ status: v === "all" ? null : v })}
        tabs={[
          { key: "all", label: "All", count: count("all") },
          { key: "placed", label: "Placed", count: count("placed") },
          { key: "confirmed", label: "Confirmed", count: count("confirmed") },
          { key: "shipped", label: "Shipped", count: count("shipped") },
          { key: "delivered", label: "Delivered", count: count("delivered") },
          { key: "cancelled", label: "Cancelled", count: count("cancelled") },
        ]}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            update({ q: v });
          }}
          placeholder="Search order id, name, phone…"
        />
        <span className="px-1 text-xs font-semibold text-slate-400">
          {data?.total ?? 0} orders
        </span>
      </Toolbar>

      {loading && <RowsSkeleton rows={8} />}
      {error && <ErrorBox message={error} />}

      {!loading && !error && orders.length === 0 && (
        <EmptyBox
          icon={<Receipt className="h-6 w-6" />}
          title="No orders here"
          message="Orders matching this filter will show up here."
        />
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="panel scroll-native overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-bold">Order</th>
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Delivery</th>
                <th className="px-4 py-3 font-bold">Items</th>
                <th className="px-4 py-3 font-bold">Total</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="transition hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-display text-sm font-extrabold">{o.id}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(o.placedAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{o.name}</p>
                    <p className="text-xs text-slate-500">{o.phone}</p>
                  </td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <p className="truncate text-xs text-slate-500">
                      {o.address}, {o.city}
                    </p>
                    <p className="text-[11px] uppercase text-slate-400">{o.paymentMethod}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.itemsCount}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-display font-extrabold">
                    {taka(Math.round(o.total))}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="btn-outline btn-sm"
                      aria-label={`Open order ${o.id}`}
                    >
                      Open <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
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
    </div>
  );
}
