import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type AppNotification } from "../api";
import { connectLive, onLive } from "../live";
import {
  initDeviceNotifications,
  onNotificationTap,
  showDeviceNotification,
  syncPushToken,
  type NotificationTap,
} from "../notify";
import { useAuth } from "./AuthContext";
import { imgUrl } from "../lib";
import { offerTheme, themeGradient } from "../offerThemes";
import { NotificationIcon, notificationLabel } from "../components/NotificationIcon";
import { OfferPopup } from "../components/OfferPopup";
import { X } from "../components/Icons";

interface NotificationValue {
  /** Unseen notifications of the signed-in customer. */
  unread: number;
  markAllSeen: () => Promise<void>;
  /** Open an offer in the full-screen pop-up (e.g. from the inbox). */
  showOffer: (n: AppNotification) => void;
}

const NotificationContext = createContext<NotificationValue | null>(null);

const BANNER_MS = 6000;
/** Wait for the home screen to settle before a launch pop-up. */
const FEATURED_DELAY_MS = 1500;
/** Don't ask the server again on every quick app switch. */
const FEATURED_RECHECK_MS = 30_000;
const SHOWN_KEY = "niramoy.offersShown";

const KIND_THEME: Record<string, string> = { order: "violet", wallet: "emerald" };

function shownOffers(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) || "[]");
  } catch {
    return [];
  }
}

function rememberShown(id: number) {
  const ids = [id, ...shownOffers().filter((x) => x !== id)].slice(0, 30);
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(ids));
  } catch {
    /* storage full or blocked */
  }
}

const offerEnded = (n: AppNotification) => !!n.expiresAt && new Date(n.expiresAt).getTime() <= Date.now();

/**
 * Keeps the live event stream open (signed in or not), counts unread
 * notifications, and surfaces each new one: a pop-up for featured offers, an
 * in-app banner for everything else, and a system notification while the app
 * is in the background.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState<AppNotification | null>(null);
  const [popup, setPopup] = useState<AppNotification | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>();
  const touchY = useRef<number | null>(null);
  const lastFeaturedCheck = useRef(0);
  const inAdmin = pathname.startsWith("/admin");

  const open = useCallback(
    (link: string) => {
      if (/^https?:\/\//.test(link)) window.location.href = link;
      else navigate(link || "/account/notifications");
    },
    [navigate],
  );

  const showOffer = useCallback((n: AppNotification) => {
    clearTimeout(bannerTimer.current);
    setBanner(null);
    setPopup(n);
  }, []);

  /** Only a dismissed or tapped pop-up counts as seen: one opened in a backgrounded WebView must show again. */
  const closePopup = useCallback((n: AppNotification) => {
    rememberShown(n.id);
    setPopup(null);
  }, []);

  const showBanner = useCallback((n: AppNotification) => {
    setBanner(n);
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }, []);

  useEffect(() => {
    void initDeviceNotifications();
    return onNotificationTap((tap: NotificationTap) => {
      if (!tap.popup || !tap.id) return open(tap.link);
      api
        .broadcast(tap.id)
        .then(({ notification }) => showOffer(notification))
        .catch(() => open(tap.link));
    });
  }, [open, showOffer]);

  const refreshUnread = useCallback(async () => {
    if (!userId) return setUnread(0);
    try {
      setUnread((await api.unreadNotifications()).unread);
    } catch {
      /* offline - keep the last count */
    }
  }, [userId]);

  // One stream per signed-in user (or guest); reconnects when the user changes.
  useEffect(() => {
    if (!ready) return;
    void syncPushToken();
    void refreshUnread();
    return connectLive();
  }, [ready, userId, refreshUnread]);

  useEffect(() => {
    const offs = [
      onLive("ready", () => void refreshUnread()),
      onLive("notifications-seen", () => setUnread(0)),
      onLive("notification", (n) => {
        if (userId) setUnread((c) => c + 1);
        if (document.visibilityState !== "visible") return void showDeviceNotification(n);
        if (inAdmin) return;
        if (n.popup && !offerEnded(n)) showOffer(n);
        else showBanner(n);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [userId, refreshUnread, inAdmin, showOffer, showBanner]);

  // On launch and whenever the app comes back to the foreground: pop up the
  // newest live offer this device hasn't dismissed yet.
  useEffect(() => {
    if (!ready || inAdmin) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (Date.now() - lastFeaturedCheck.current < FEATURED_RECHECK_MS) return;
      lastFeaturedCheck.current = Date.now();
      api
        .featuredOffer()
        .then(({ offer }) => {
          if (offer && !offerEnded(offer) && !shownOffers().includes(offer.id)) {
            setPopup((current) => current ?? offer);
          }
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(check, FEATURED_DELAY_MS);
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, inAdmin]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const value = useMemo<NotificationValue>(
    () => ({
      unread,
      markAllSeen: async () => {
        setUnread(0);
        await api.markNotificationsSeen().catch(() => {});
      },
      showOffer,
    }),
    [unread, showOffer],
  );

  const bannerTheme = banner ? offerTheme(banner.theme || KIND_THEME[banner.kind]) : null;

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {banner && bannerTheme && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div
            key={banner.id}
            role="status"
            className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl bg-white/95 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 backdrop-blur-xl motion-safe:animate-bannerIn"
            onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
            onTouchEnd={(e) => {
              if (touchY.current !== null && e.changedTouches[0].clientY - touchY.current < -30) setBanner(null);
              touchY.current = null;
            }}
          >
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: themeGradient(bannerTheme, 180) }} />
            <div className="flex items-start gap-3 p-3 pl-4">
              <button
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                onClick={() => {
                  setBanner(null);
                  open(banner.link);
                }}
              >
                {banner.image ? (
                  <img
                    src={imgUrl(banner.image)}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-slate-900/5"
                  />
                ) : (
                  <NotificationIcon kind={banner.kind} className="h-12 w-12" />
                )}
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span style={{ color: bannerTheme.accent }}>{notificationLabel(banner.kind)}</span>
                    · now
                    {banner.badge && (
                      <span
                        className="rounded-full px-1.5 py-px text-[9px] font-black text-white"
                        style={{ background: themeGradient(bannerTheme) }}
                      >
                        {banner.badge}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-sm font-bold text-ink-800">{banner.title}</span>
                  <span className="line-clamp-2 text-xs text-slate-600">{banner.body}</span>
                  {banner.coupon && (
                    <span
                      className="mt-1 inline-block rounded-md border border-dashed px-1.5 py-px font-mono text-[10px] font-black tracking-widest"
                      style={{ color: bannerTheme.accent, borderColor: bannerTheme.accent }}
                    >
                      {banner.coupon}
                    </span>
                  )}
                </span>
              </button>
              <button
                className="-m-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Dismiss"
                onClick={() => setBanner(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <span
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-drain"
              style={{ background: themeGradient(bannerTheme, 90), animationDuration: `${BANNER_MS}ms` }}
            />
          </div>
        </div>
      )}
      {popup && !inAdmin && (
        <OfferPopup
          offer={popup}
          onClose={() => closePopup(popup)}
          onAction={() => {
            closePopup(popup);
            if (popup.link) open(popup.link);
          }}
        />
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
