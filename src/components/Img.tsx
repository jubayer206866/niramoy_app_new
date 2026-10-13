import { useEffect, useRef, useState } from "react";
import { imgUrl } from "../lib";

/** Inline "N" placeholder shown while an image loads or when it is missing. */
export const imagePlaceholder =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%23f3f2ff'/%3E%3Ctext x='50' y='62' font-size='38' text-anchor='middle' fill='%236a3df0' font-family='Arial' font-weight='bold'%3EN%3C/text%3E%3C/svg%3E";

type ImgProps = {
  src?: string | null;
  alt: string;
  /** classes applied to the `<img>` element */
  className?: string;
  /** classes applied to the wrapping `<span>` (must be positioned for the shimmer) */
  wrapClassName?: string;
  /** true for above-the-fold images: skips lazy loading and raises priority */
  eager?: boolean;
  fallback?: string;
  showShimmer?: boolean;
};

/**
 * Product/banner image with the performance basics baked in:
 * native lazy loading off-screen, async decoding, a shimmer placeholder so
 * layout never jumps, and a graceful fallback if the file is missing.
 */
export function Img({
  src,
  alt,
  className = "h-full w-full object-contain",
  wrapClassName = "relative block h-full w-full",
  eager = false,
  fallback = imagePlaceholder,
  showShimmer = true,
}: ImgProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "err">(src ? "loading" : "err");
  // last load/error event, tagged with the src it belongs to
  const outcome = useRef<{ key: string; phase: "ok" | "err" } | null>(null);
  const key = src ?? "";

  useEffect(() => {
    if (!key) {
      outcome.current = null;
      setState("err");
      return;
    }
    const recorded = outcome.current;
    if (recorded?.key === key) {
      setState(recorded.phase);
      return;
    }
    const el = imgRef.current;
    // Cached images can finish before React's handler sees the event, so an
    // element that is already complete is not "loading" any more.
    setState(el && el.complete ? "ok" : "loading");
  }, [key]);

  const resolved = state === "err" || !src ? fallback : imgUrl(src);
  const target = src ? imgUrl(src) : "";
  const loading = state === "loading";
  // the shimmer is absolutely positioned: make sure its containing block is
  // this wrapper, never an ancestor further up (a bare "block" wrapper would
  // let one slide's placeholder blanket a whole carousel)
  const positioned = /(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(wrapClassName);

  return (
    <span className={positioned ? wrapClassName : `relative ${wrapClassName}`}>
      {showShimmer && loading && (
        <span aria-hidden="true" className="skeleton absolute inset-0 rounded-none" />
      )}
      <img
        ref={imgRef}
        src={resolved}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        draggable={false}
        // only react to events for the real image: a load of the fallback must
        // not flip an errored card back to the broken URL (and back again)
        onLoad={(e) => {
          if (!src || e.currentTarget.getAttribute("src") !== target) return;
          outcome.current = { key, phase: "ok" };
          setState("ok");
        }}
        onError={(e) => {
          if (!src || e.currentTarget.getAttribute("src") !== target) return;
          outcome.current = { key, phase: "err" };
          setState("err");
        }}
        className={`${className} transition-opacity duration-300 ${loading ? "opacity-0" : "opacity-100"}`}
      />
    </span>
  );
}
