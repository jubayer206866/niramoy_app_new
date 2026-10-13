import { useEffect, useState, type ReactNode } from "react";
import type { AppNotification } from "../api";
import { imgUrl } from "../lib";
import { offerTheme, themeGradient, type OfferTheme } from "../offerThemes";
import { Check, ChevronRight, Clock, Copy, Megaphone, Sparkles, Tag } from "./Icons";

type OfferContent = Pick<
  AppNotification,
  "kind" | "title" | "body" | "link" | "image" | "cta" | "coupon" | "badge" | "theme" | "expiresAt"
>;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Copy without the async clipboard API, which needs a secure context. */
function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

function Shine() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent motion-safe:animate-shine" />
    </span>
  );
}

export function OfferBadge({ text, theme, className = "" }: { text: string; theme: OfferTheme; className?: string }) {
  return (
    <span
      className={`relative inline-flex items-center gap-1 overflow-hidden rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wide shadow-lg ${className}`}
      style={{ color: theme.accent, boxShadow: `0 8px 20px -8px ${theme.from}` }}
    >
      <Sparkles className="h-3 w-3" />
      {text}
      <Shine />
    </span>
  );
}

function CouponTicket({ code, theme, compact }: { code: string; theme: OfferTheme; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border-2 border-dashed ${compact ? "mt-3 px-3 py-2" : "mt-4 px-4 py-3"}`}
      style={{ borderColor: `${theme.accent}66`, background: theme.soft }}
    >
      {/* ticket notches */}
      <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
      <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Use code at checkout</p>
        <p className="truncate font-mono text-base font-black tracking-[.18em]" style={{ color: theme.accent }}>
          {code}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void copyText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          });
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold shadow-sm ring-1 ring-slate-200 transition active:scale-95"
        style={{ color: theme.accent }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function Countdown({ expiresAt, theme, compact }: { expiresAt: string; theme: OfferTheme; compact?: boolean }) {
  const now = useNow(true);
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) {
    return (
      <p className={`${compact ? "mt-2" : "mt-3"} inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500`}>
        <Clock className="h-3.5 w-3.5" /> Offer ended
      </p>
    );
  }
  const s = Math.floor(left / 1000);
  const units = [
    { v: Math.floor(s / 86400), l: "days" },
    { v: Math.floor((s % 86400) / 3600), l: "hrs" },
    { v: Math.floor((s % 3600) / 60), l: "min" },
    { v: s % 60, l: "sec" },
  ].filter((u, i) => i > 0 || u.v > 0);
  return (
    <div className={`${compact ? "mt-2" : "mt-4"} flex items-center gap-2`}>
      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <span style={{ color: theme.accent }}>
          <Clock className="h-3.5 w-3.5" />
        </span>
        Ends in
      </span>
      <div className="flex gap-1">
        {units.map((u) => (
          <span
            key={u.l}
            className={`grid min-w-[2.4rem] place-items-center rounded-lg text-white ${compact ? "px-1 py-0.5" : "px-1.5 py-1"}`}
            style={{ background: themeGradient(theme, 160) }}
          >
            <span className="font-mono text-sm font-black leading-none tabular-nums">{pad(u.v)}</span>
            <span className="text-[8px] font-semibold uppercase leading-tight opacity-80">{u.l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Hero art: the admin's image (slow zoom) or, without one, a theme gradient with the badge writ large. */
function Hero({ offer, theme, animated }: { offer: OfferContent; theme: OfferTheme; animated: boolean }) {
  const KindIcon = offer.kind === "offer" ? Tag : Megaphone;
  return (
    <div className="relative aspect-[2/1] overflow-hidden" style={{ background: themeGradient(theme) }}>
      {offer.image ? (
        <img
          src={imgUrl(offer.image)}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${animated ? "motion-safe:animate-kenburns" : ""}`}
        />
      ) : (
        <>
          <span
            className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/20 blur-2xl motion-safe:animate-glow"
            aria-hidden
          />
          <span
            className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full blur-2xl motion-safe:animate-glow"
            style={{ background: theme.to, animationDelay: "1.2s" }}
            aria-hidden
          />
          <div className="absolute inset-0 grid place-items-center text-white">
            {offer.badge ? (
              <span className="px-6 text-center font-display text-4xl font-black leading-none tracking-tight drop-shadow-lg sm:text-5xl">
                {offer.badge}
              </span>
            ) : (
              <KindIcon className="h-16 w-16 opacity-90 drop-shadow-lg motion-safe:animate-wiggle" />
            )}
          </div>
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" aria-hidden />
      {offer.badge && offer.image && <OfferBadge text={offer.badge} theme={theme} className="absolute left-3 top-3" />}
    </div>
  );
}

/**
 * The rich marketing layout shared by the pop-up, the inbox and the admin
 * preview. `onAction` runs when the call-to-action is pressed.
 */
export function OfferCard({
  offer,
  variant = "popup",
  onAction,
  footer,
  meta,
}: {
  offer: OfferContent;
  variant?: "popup" | "inbox";
  onAction?: () => void;
  footer?: ReactNode;
  meta?: ReactNode;
}) {
  const theme = offerTheme(offer.theme);
  const popup = variant === "popup";
  const ctaLabel = offer.cta || (offer.link ? (offer.kind === "offer" ? "Shop now" : "View details") : "Got it");
  const showCta = popup || !!offer.link;

  return (
    <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5">
      <Hero offer={offer} theme={theme} animated={popup} />
      <div className={popup ? "p-5" : "p-4"}>
        <p
          className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[.14em]"
          style={{ color: theme.accent }}
        >
          {offer.kind === "offer" ? <Tag className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}
          {offer.kind === "offer" ? "Special offer" : "Announcement"}
        </p>
        <h3
          className={`font-display font-extrabold leading-tight text-ink-900 ${popup ? "text-xl sm:text-2xl" : "text-base"}`}
        >
          {offer.title || "Your headline"}
        </h3>
        <p
          className={`mt-1.5 whitespace-pre-line text-slate-600 ${popup ? "text-sm leading-relaxed" : "line-clamp-3 text-xs leading-relaxed"}`}
        >
          {offer.body || "Your message appears here."}
        </p>

        {offer.coupon && <CouponTicket code={offer.coupon} theme={theme} compact={!popup} />}
        {offer.expiresAt && <Countdown expiresAt={offer.expiresAt} theme={theme} compact={!popup} />}

        {showCta && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction?.();
            }}
            className={`relative mt-4 flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-2xl font-bold text-white shadow-lg transition active:scale-[.98] ${
              popup ? "py-3.5 text-base motion-safe:animate-heartbeat" : "py-2.5 text-sm"
            }`}
            style={{ background: themeGradient(theme, 100), boxShadow: `0 14px 28px -12px ${theme.via}` }}
          >
            {ctaLabel}
            <ChevronRight className="h-4 w-4" />
            <Shine />
          </button>
        )}
        {footer}
        {meta && <div className="mt-3">{meta}</div>}
      </div>
    </div>
  );
}
