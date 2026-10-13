import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { taka } from "../lib";
import { Star, ChevronLeft, ChevronRight, Sparkles } from "./Icons";

/* ------------------------------------------------------------------ skeleton */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-3">
          <Skeleton className="mb-3 aspect-square w-full rounded-xl" />
          <Skeleton className="mb-2 h-3.5 w-4/5" />
          <Skeleton className="mb-3 h-3 w-1/3" />
          <Skeleton className="h-8 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ headings */
export function SectionHeading({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="section-title flex items-center gap-2">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------- breadcrumbs */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">/</span>}
          {item.to ? (
            <Link to={item.to} className="transition hover:text-brand-600">
              {item.label}
            </Link>
          ) : (
            <span className="max-w-[18rem] truncate font-semibold text-ink-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------- rating */
export function Stars({
  rating,
  count,
  size = "sm",
  className = "",
}: {
  rating: number;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!rating) return null;
  const dim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            filled={n <= Math.round(rating)}
            className={`${dim} ${n <= Math.round(rating) ? "text-amber-400" : "text-slate-300"}`}
          />
        ))}
      </span>
      <span className="text-[11px] font-semibold text-slate-500">
        {rating.toFixed(1)}
        {typeof count === "number" && count > 0 && (
          <span className="font-normal text-slate-400"> ({count})</span>
        )}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ stepper */
export function QuantityStepper({
  value,
  onChange,
  max = 99,
  min = 1,
  className = "",
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  min?: number;
  className?: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className={`inline-flex items-center rounded-xl border border-slate-200 bg-white ${className}`}>
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(clamp(value - 1))}
        className="grid h-10 w-9 place-items-center rounded-l-xl text-lg font-semibold text-slate-500 transition hover:bg-brand-50 hover:text-brand-700"
      >
        −
      </button>
      <input
        aria-label="Quantity"
        value={value}
        inputMode="numeric"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          onChange(Number.isFinite(n) && n > 0 ? clamp(n) : min);
        }}
        className="h-10 w-11 border-x border-slate-200 text-center text-sm font-bold outline-none"
      />
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(clamp(value + 1))}
        className="grid h-10 w-9 place-items-center rounded-r-xl text-lg font-semibold text-slate-500 transition hover:bg-brand-50 hover:text-brand-700"
      >
        +
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- price block */
export function PriceBlock({
  price,
  mrp,
  discountPercent,
  size = "md",
}: {
  price: number;
  mrp?: number;
  discountPercent?: number;
  size?: "sm" | "md" | "lg";
}) {
  const showMrp = !!mrp && mrp > price;
  const sizeCls =
    size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-base";
  // a handful of catalogue items are listed without a public price
  if (!price || price <= 0) {
    return (
      <span className={`font-display font-extrabold text-brand-700 ${sizeCls}`}>
        Price on request
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={`font-display font-extrabold text-ink-900 ${sizeCls}`}>{taka(price)}</span>
      {showMrp && (
        <span className={size === "lg" ? "text-sm text-slate-400 line-through" : "price-mrp"}>
          {taka(mrp!)}
        </span>
      )}
      {showMrp && discountPercent ? (
        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-600">
          {Math.round(discountPercent)}% off
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- states */
export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        {icon ?? <Sparkles className="h-6 w-6" />}
      </div>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{message}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "border-sky-100 bg-sky-50 text-sky-800",
    success: "border-emerald-100 bg-emerald-50 text-emerald-800",
    error: "border-rose-100 bg-rose-50 text-rose-700",
    warn: "border-amber-100 bg-amber-50 text-amber-800",
  } as const;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${tones[tone]}`}>{children}</div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/* ----------------------------------------------------------------- pagination */
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  const window = 2;
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= window) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        className="btn-outline btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1.5 text-sm text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={
              p === page
                ? "btn btn-sm bg-brand-600 text-white shadow-soft"
                : "btn-outline btn-sm"
            }
          >
            {p}
          </button>
        ),
      )}
      <button
        className="btn-outline btn-sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

/* -------------------------------------------------------------------- blocks */
export function StatCard({
  label,
  value,
  hint,
  icon,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {icon && <span className="text-brand-500">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold text-ink-900">{value}</p>
      {hint && (
        <p className="mt-0.5 flex items-center gap-0.5 text-xs text-slate-400">
          {hint}
          {to && <ChevronRight className="h-3.5 w-3.5" />}
        </p>
      )}
    </>
  );
  return to ? (
    <Link to={to} className="stats-card block transition hover:ring-brand-200 active:scale-[.98]">
      {body}
    </Link>
  ) : (
    <div className="stats-card">{body}</div>
  );
}

export function Avatar({ initials, className = "h-9 w-9" }: { initials: string; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-soft ${className}`}
    >
      {initials || "A"}
    </span>
  );
}
