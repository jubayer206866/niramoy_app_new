import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi, type AdminProduct } from "../api";
import {
  Confirm,
  PageHeader,
  RowsSkeleton,
  SearchInput,
  Select,
  Toolbar,
} from "../components";
import { ErrorBox, EmptyBox } from "../../components/Errors";
import { Img } from "../../components/Img";
import { Pagination } from "../../components/ui";
import { Eye, EyeOff, Package, Pencil, Plus, Trash, External } from "../../components/Icons";
import { taka, useDebounced, useFetch } from "../../lib";
import { useToast } from "../../context/ToastContext";

const STATUS_OPTIONS = [
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "all", label: "All products" },
];
const STOCK_OPTIONS = [
  { value: "all", label: "Any stock" },
  { value: "in", label: "In stock" },
  { value: "out", label: "Out of stock" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name A–Z" },
  { value: "price-desc", label: "Price high → low" },
  { value: "price-asc", label: "Price low → high" },
  { value: "popular", label: "Most popular" },
];

export default function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const status = params.get("status") || "visible";
  const stock = params.get("stock") || "all";
  const cat = params.get("cat") || "";
  const sort = params.get("sort") || "newest";
  const page = Math.max(Number(params.get("page") || 1), 1);
  const [search, setSearch] = useState(params.get("q") || "");
  const q = useDebounced(search, 300);

  const [pending, setPending] = useState<AdminProduct | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !("page" in patch)) next.delete("page");
    setParams(next);
  };

  const { data, loading, error, refresh } = useFetch(
    () => adminApi.products({ q, cat, status, stock, sort, page, limit: 20 }),
    [q, cat, status, stock, sort, page],
  );
  const { data: categories } = useFetch(() => adminApi.categories(), []);

  const toggleHidden = async (p: AdminProduct) => {
    setBusyId(p.id);
    try {
      await adminApi.updateProduct(p.id, { hidden: !p.hidden });
      toast.success(p.hidden ? "Product published" : "Product unpublished");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update product.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!pending) return;
    setBusyId(pending.id);
    try {
      await adminApi.deleteProduct(pending.id);
      toast.success(`"${pending.name}" deleted`);
      setPending(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete product.");
    } finally {
      setBusyId(null);
    }
  };

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / (data?.limit || 20)), 1);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${total.toLocaleString()} product${total === 1 ? "" : "s"} in the catalogue`}
        actions={
          <Link to="/admin/products/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Add product
          </Link>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            update({ q: v });
          }}
          placeholder="Search name, brand, slug…"
        />
        <Select
          value={cat}
          onChange={(v) => update({ cat: v })}
          options={[
            { value: "", label: "All categories" },
            ...(categories ?? []).map((c) => ({ value: c.slug, label: `${c.name} (${c.productCount})` })),
          ]}
        />
        <Select value={status} onChange={(v) => update({ status: v })} options={STATUS_OPTIONS} />
        <Select value={stock} onChange={(v) => update({ stock: v })} options={STOCK_OPTIONS} />
        <Select value={sort} onChange={(v) => update({ sort: v })} options={SORT_OPTIONS} />
      </Toolbar>

      {loading && <RowsSkeleton rows={10} />}
      {error && <ErrorBox message={error} />}

      {!loading && !error && products.length === 0 && (
        <EmptyBox
          icon={<Package className="h-6 w-6" />}
          title="No products match"
          message="Try a different search term or clear the filters."
        />
      )}

      {!loading && !error && products.length > 0 && (
        <div className="panel scroll-native overflow-x-auto p-0">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">Category</th>
                <th className="px-4 py-3 font-bold">Price</th>
                <th className="px-4 py-3 font-bold">Stock</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className="group transition hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-50 p-0.5">
                        <Img src={p.image} alt="" className="h-full w-full object-contain" />
                      </span>
                      <div className="min-w-0 max-w-[22rem]">
                        <Link
                          to={`/admin/products/${p.id}`}
                          className="block truncate font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {p.name}
                        </Link>
                        <p className="truncate text-xs text-slate-400">
                          #{p.id} · {p.slug}
                          {p.brand && ` · ${p.brand}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.categories.slice(0, 2).map((c) => (
                        <span key={c} className="badge-rx">
                          {c}
                        </span>
                      ))}
                      {p.categories.length > 2 && (
                        <span className="badge bg-slate-100 text-slate-500">
                          +{p.categories.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-display font-extrabold">{taka(p.price)}</span>
                    {p.mrp > p.price && (
                      <span className="ml-1 text-xs text-slate-400 line-through">
                        {taka(p.mrp)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.stockStatus ? (
                      <span className="badge-success">In stock</span>
                    ) : (
                      <span className="badge-danger">Out</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.hidden ? (
                      <span className="badge bg-slate-100 text-slate-500">Hidden</span>
                    ) : (
                      <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                        Live
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/product/${p.id}/${p.slug}`}
                        target="_blank"
                        title="View in store"
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-brand-600 hover:shadow-soft"
                      >
                        <External className="h-4 w-4" />
                      </Link>
                      <button
                        title={p.hidden ? "Publish" : "Unpublish"}
                        disabled={busyId === p.id}
                        onClick={() => void toggleHidden(p)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-brand-600 hover:shadow-soft disabled:opacity-50"
                      >
                        {p.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <Link
                        to={`/admin/products/${p.id}`}
                        title="Edit"
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-brand-600 hover:shadow-soft"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        title="Delete"
                        disabled={busyId === p.id}
                        onClick={() => setPending(p)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-rose-600 hover:shadow-soft disabled:opacity-50"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
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

      <Confirm
        open={!!pending}
        title="Delete this product?"
        message={
          <>
            <strong>{pending?.name}</strong> will be removed from the storefront and the catalogue.
            This cannot be undone from the panel.
          </>
        }
        confirmLabel="Delete product"
        busy={busyId === pending?.id}
        onConfirm={() => void remove()}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
