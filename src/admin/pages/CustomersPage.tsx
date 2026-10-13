import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import { PageHeader, RowsSkeleton, SearchInput, Tabs, Toolbar } from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { Avatar, Pagination } from "../../components/ui";
import { ChevronRight, Shield, Users } from "../../components/Icons";
import { taka, useDebounced, useFetch } from "../../lib";

export default function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const role = params.get("role") || "all";
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
    () => adminApi.customers({ q, role, page, limit: 20 }),
    [q, role, page],
  );

  const customers = data?.customers ?? [];
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / 20), 1);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Everyone who has an account, plus guest order history"
      />

      <Tabs
        value={role}
        onChange={(v) => update({ role: v === "all" ? null : v })}
        tabs={[
          { key: "all", label: "Everyone" },
          { key: "customer", label: "Customers" },
          { key: "admin", label: "Team" },
        ]}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            update({ q: v });
          }}
          placeholder="Search name, email, phone…"
        />
        <span className="px-1 text-xs font-semibold text-slate-400">{data?.total ?? 0} people</span>
      </Toolbar>

      {loading && <RowsSkeleton rows={8} />}
      {error && <ErrorBox message={error} />}

      {!loading && !error && customers.length === 0 && (
        <EmptyBox
          icon={<Users className="h-6 w-6" />}
          title="No customers found"
          message="Try a different search term."
        />
      )}

      {!loading && !error && customers.length > 0 && (
        <div className="panel scroll-native overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Phone</th>
                <th className="px-4 py-3 font-bold">Orders</th>
                <th className="px-4 py-3 font-bold">Lifetime spend</th>
                <th className="px-4 py-3 font-bold">Joined</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="transition hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        initials={
                          c.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((s) => s[0]?.toUpperCase())
                            .join("") || "?"
                        }
                        className="h-9 w-9 text-[11px]"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{c.name}</p>
                        <p className="truncate text-xs text-slate-400">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="font-display font-extrabold">{c.orders}</span>
                  </td>
                  <td className="px-4 py-3 font-display font-extrabold">
                    {taka(Math.round(c.spend))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {c.role === "admin" ? (
                      <span className="badge-accent flex w-fit items-center gap-1">
                        <Shield className="h-3 w-3" /> Admin
                      </span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-500">Customer</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/customers/${c.id}`}
                      className="btn-outline btn-sm"
                      aria-label={`Open ${c.name}`}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(next) => update({ page: String(next) }, false)}
      />
    </div>
  );
}
