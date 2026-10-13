import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../lib";
import { Search } from "../components/Icons";

export default function NotFoundPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { data: categories } = useFetch(() => api.categories(), []);

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="font-display text-6xl font-extrabold text-brand-200">404</p>
      <h1 className="mt-2 font-display text-2xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-sm text-slate-500">
        The link may be broken or the product may have been removed from the catalogue.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          nav(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
        }}
        className="mx-auto mt-6 flex max-w-md items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for a medicine or brand…"
            className="input pl-9"
          />
        </div>
        <button className="btn-primary">Search</button>
      </form>

      {(categories ?? []).filter((c) => c.hasPage).length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Popular categories
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {(categories ?? [])
              .filter((c) => c.hasPage)
              .slice(0, 8)
              .map((c) => (
                <Link key={c.slug} to={`/category/${c.slug}`} className="chip">
                  {c.name}
                </Link>
              ))}
          </div>
        </div>
      )}

      <Link to="/" className="btn-outline mt-8">
        ← Back to home
      </Link>
    </div>
  );
}
