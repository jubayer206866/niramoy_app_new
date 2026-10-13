import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../lib";
import ProductCard from "../components/ProductCard";
import { EmptyState, Pagination, ProductGridSkeleton } from "../components/ui";
import { ErrorBox } from "../components/Errors";
import { Grid, Search, Sliders, Sparkles, X } from "../components/Icons";

const SORTS = [
  { value: "popular", label: "Popularity" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "discount", label: "Biggest discount" },
  { value: "newest", label: "Newest arrivals" },
] as const;

const LIMIT = 24;

export default function ListingPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "popular";
  const page = Math.max(Number(params.get("page") ?? "1") || 1, 1);
  const brand = params.get("brand") ?? "";
  const rx = (params.get("rx") as "0" | "1" | null) ?? null;
  const minPriceParam = params.get("minPrice") ?? "";
  const maxPriceParam = params.get("maxPrice") ?? "";

  const [qInput, setQInput] = useState(q);
  const [minPrice, setMinPrice] = useState(minPriceParam);
  const [maxPrice, setMaxPrice] = useState(maxPriceParam);
  const [brandQuery, setBrandQuery] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useMemo(
    () => ({
      cat: slug,
      q,
      sort,
      page,
      limit: LIMIT,
      brand: brand || undefined,
      rx: rx ?? undefined,
      minPrice: minPriceParam ? Number(minPriceParam) : undefined,
      maxPrice: maxPriceParam ? Number(maxPriceParam) : undefined,
    }),
    [slug, q, sort, page, brand, rx, minPriceParam, maxPriceParam],
  );

  const { data, loading, error } = useFetch(() => api.products(query), [
    slug,
    q,
    sort,
    page,
    brand,
    rx,
    minPriceParam,
    maxPriceParam,
  ]);
  const { data: facets } = useFetch(() => api.facets(slug ?? "all"), [slug]);
  const { data: categories } = useFetch(() => api.categories(), []);

  const totalPages = data ? Math.max(Math.ceil(data.total / LIMIT), 1) : 1;
  const activeCat = categories?.find((c) => c.slug === slug);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  const clearAll = () => {
    setMinPrice("");
    setMaxPrice("");
    setBrandQuery("");
    setParams(new URLSearchParams(q ? { q } : {}));
  };

  const brands = (facets?.brands ?? []).filter((b) =>
    b.name.toLowerCase().includes(brandQuery.trim().toLowerCase()),
  );
  const visibleBrands = showAllBrands ? brands : brands.slice(0, 12);

  const hasFilters = !!(brand || rx !== null || q || minPriceParam || maxPriceParam);

  const title = activeCat?.name
    ? activeCat.name
    : slug
      ? slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
      : q
        ? `Results for “${q}”`
        : "All products";

  const filters = (
    <div className="space-y-4">
      <div className="panel">
        <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
          <Grid className="h-4 w-4 text-brand-500" /> Categories
        </h3>
        <div className="scroll-native max-h-72 space-y-0.5 overflow-y-auto pr-1">
          <Link
            to="/products"
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
              !slug ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-slate-50"
            }`}
          >
            All products
          </Link>
          {(categories ?? [])
            .filter((c) => c.hasPage)
            .map((c) => (
              <Link
                key={c.slug}
                to={`/category/${c.slug}`}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  slug === c.slug ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{c.productCount}</span>
              </Link>
            ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="mb-3 font-display text-sm font-bold">Price range (৳)</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ minPrice, maxPrice });
            setSheetOpen(false);
          }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Min"
              className="input py-2 text-center"
            />
            <span className="text-slate-300">–</span>
            <input
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Max"
              className="input py-2 text-center"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { l: "Under ৳100", min: "", max: "100" },
              { l: "৳100–500", min: "100", max: "500" },
              { l: "৳500–1000", min: "500", max: "1000" },
              { l: "৳1000+", min: "1000", max: "" },
            ].map((p) => (
              <button
                key={p.l}
                type="button"
                className="chip"
                onClick={() => {
                  setMinPrice(p.min);
                  setMaxPrice(p.max);
                  update({ minPrice: p.min || null, maxPrice: p.max || null });
                }}
              >
                {p.l}
              </button>
            ))}
          </div>
          <button className="btn-primary btn-sm w-full">Apply price</button>
        </form>
      </div>

      <div className="panel">
        <h3 className="mb-3 font-display text-sm font-bold">Prescription</h3>
        <div className="flex flex-wrap gap-1.5">
          {[
            { v: null, label: "All products" },
            { v: "0" as const, label: "No prescription" },
            { v: "1" as const, label: "Rx required" },
          ].map((o) => (
            <button
              key={o.label}
              className={`chip ${rx === o.v ? "chip-active" : ""}`}
              onClick={() => update({ rx: o.v })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="mb-3 font-display text-sm font-bold">Brands</h3>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
            placeholder="Find a brand…"
            className="input py-2 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleBrands.map((b) => (
            <button
              key={b.name}
              className={`chip ${brand === b.name ? "chip-active" : ""}`}
              onClick={() => update({ brand: brand === b.name ? null : b.name })}
            >
              <span className="max-w-[10rem] truncate">{b.name}</span>
              <span className="text-[10px] opacity-60">{b.count}</span>
            </button>
          ))}
          {!brands.length && (
            <span className="text-xs text-slate-400">No brands found for this selection.</span>
          )}
        </div>
        {brands.length > 12 && (
          <button
            onClick={() => setShowAllBrands((v) => !v)}
            className="mt-2 text-xs font-bold text-brand-600 hover:underline"
          >
            {showAllBrands ? "Show fewer" : `Show all ${brands.length} brands`}
          </button>
        )}
      </div>

      {hasFilters && (
        <button onClick={clearAll} className="btn-outline btn-sm w-full">
          <X className="h-4 w-4" /> Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-[7.5rem]">{filters}</div>
      </aside>

      <div className="min-w-0">
        {/* toolbar */}
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
          <button className="btn-outline btn-sm lg:hidden" onClick={() => setSheetOpen(true)}>
            <Sliders className="h-4 w-4" /> Filters
            {hasFilters && <span className="ml-1 h-2 w-2 rounded-full bg-coral-500" />}
          </button>

          <div className="order-first w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
            <h1 className="line-clamp-2 font-display text-base font-extrabold leading-snug sm:text-xl">
              {title}
            </h1>
            <p className="text-xs text-slate-500">
              {loading
                ? "Loading products…"
                : data
                  ? `${data.total.toLocaleString()} products${
                      totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""
                    }`
                  : ""}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: qInput });
            }}
            className="relative order-last w-full sm:order-none sm:w-56"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search in results…"
              className="input py-2 pl-9"
            />
          </form>

          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            aria-label="Sort products"
            className="input w-auto min-w-0 flex-1 py-2 pr-8 text-sm font-semibold sm:flex-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* active chips */}
        {hasFilters && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {brand && (
              <button className="chip chip-active" onClick={() => update({ brand: null })}>
                {brand} <X className="h-3 w-3" />
              </button>
            )}
            {rx !== null && (
              <button className="chip chip-active" onClick={() => update({ rx: null })}>
                {rx === "1" ? "Rx required" : "No prescription"} <X className="h-3 w-3" />
              </button>
            )}
            {q && (
              <button className="chip chip-active" onClick={() => update({ q: null })}>
                “{q}” <X className="h-3 w-3" />
              </button>
            )}
            {(minPriceParam || maxPriceParam) && (
              <button
                className="chip chip-active"
                onClick={() => {
                  setMinPrice("");
                  setMaxPrice("");
                  update({ minPrice: null, maxPrice: null });
                }}
              >
                ৳{minPriceParam || 0} – ৳{maxPriceParam || "∞"} <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {error && <ErrorBox message={error} />}
        {loading && <ProductGridSkeleton count={12} />}

        {data && !loading && data.products.length === 0 && (
          <EmptyState
            title="No products matched"
            message="Try a different keyword, widen the price range or clear the filters."
            action={
              <button className="btn-primary" onClick={clearAll}>
                Clear filters
              </button>
            }
          />
        )}

        {data && !loading && data.products.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {data.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(next) => {
                update({ page: String(next) });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </>
        )}
      </div>

      {/* mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="scroll-native absolute inset-x-0 bottom-0 max-h-[86vh] animate-rise overflow-y-auto rounded-t-3xl bg-mint p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold">Filters</h2>
              <button className="btn-icon" onClick={() => setSheetOpen(false)} aria-label="Close filters">
                <X />
              </button>
            </div>
            {filters}
            <button className="btn-primary mt-4 w-full" onClick={() => setSheetOpen(false)}>
              Show {data ? data.total.toLocaleString() : ""} products
            </button>
          </div>
        </div>
      )}

      {activeCat && (
        <p className="col-span-full mt-2 flex items-center gap-2 text-xs text-slate-400">
          <Sparkles className="h-3.5 w-3.5" /> Prices, stock and ratings are harvested from the
          original site and may change.
        </p>
      )}

    </div>
  );
}
