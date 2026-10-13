import { useEffect, useState } from "react";

/**
 * Origin the API and its images live on.
 * "" (web build) = same origin; the Capacitor build bakes in the LAN address
 * of the machine running `npm run server`, because the app shell is served
 * from capacitor://localhost and cannot resolve relative URLs.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

/** Prefix an API path ("/api/products") with the API origin. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Root-absolute URL for scraped image paths.
 * DB stores "img/products/x.jpeg" (relative) — resolve against the API origin
 * so images work from any route depth (/category/..., /product/...).
 */
export function imgUrl(path?: string | null): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (API_BASE) return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  return path.startsWith("/") ? path : `/${path}`;
}

/** Small fetch hook with loading/error state and a manual refresh trigger. */
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

/** Format a number as Bangladeshi Taka. */
export function taka(n: number): string {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

/** Debounce a changing value (for search inputs). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
