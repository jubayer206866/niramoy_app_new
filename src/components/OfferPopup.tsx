import { useEffect, useMemo, type CSSProperties } from "react";
import type { AppNotification } from "../api";
import { offerTheme } from "../offerThemes";
import { OfferCard } from "./OfferCard";
import { X } from "./Icons";

const PIECES = 42;

function Confetti({ colors }: { colors: string[] }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${(i % 12) * 0.07}s`,
        duration: `${2.2 + ((i * 37) % 10) / 10}s`,
        dx: `${((i * 53) % 40) - 20}vw`,
        spin: `${360 + ((i * 71) % 4) * 180}deg`,
        color: colors[i % colors.length],
        w: 6 + (i % 3) * 3,
        h: i % 4 === 0 ? 6 + (i % 3) * 3 : 12 + (i % 3) * 2,
        round: i % 4 === 0,
      })),
    [colors],
  );
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 animate-confetti"
          style={
            {
              left: p.left,
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: p.round ? "9999px" : "2px",
              animationDelay: p.delay,
              animationDuration: p.duration,
              "--dx": p.dx,
              "--spin": p.spin,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Full-screen marketing pop-up. Rendered by NotificationProvider. */
export function OfferPopup({
  offer,
  onClose,
  onAction,
}: {
  offer: AppNotification;
  onClose: () => void;
  onAction: () => void;
}) {
  const theme = offerTheme(offer.theme);
  const colors = useMemo(() => [theme.via, theme.to, "#fbbf24", "#ffffff", theme.from], [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={offer.title}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 animate-fadeIn bg-ink-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {offer.kind === "offer" && <Confetti colors={colors} />}
      <div className="relative w-full max-w-md motion-safe:animate-offerIn">
        <span
          aria-hidden
          className="absolute -inset-3 -z-10 rounded-[2.25rem] opacity-60 blur-2xl motion-safe:animate-glow"
          style={{ background: theme.via }}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/50"
        >
          <X className="h-4 w-4" />
        </button>
        <OfferCard
          offer={offer}
          variant="popup"
          onAction={onAction}
          footer={
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              Maybe later
            </button>
          }
        />
      </div>
    </div>
  );
}
