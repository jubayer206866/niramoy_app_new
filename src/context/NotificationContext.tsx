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
import { useNavigate } from "react-router-dom";
import { api, type AppNotification } from "../api";
import { connectLive, onLive } from "../live";
import {
  initDeviceNotifications,
  onNotificationTap,
  showDeviceNotification,
  syncPushToken,
} from "../notify";
import { useAuth } from "./AuthContext";
import { NotificationIcon } from "../components/NotificationIcon";
import { X } from "../components/Icons";

interface NotificationValue {
  /** Unseen notifications of the signed-in customer. */
  unread: number;
  markAllSeen: () => Promise<void>;
}

const NotificationContext = createContext<NotificationValue | null>(null);

const BANNER_MS = 6000;

/**
 * Keeps the live event stream open (signed in or not), counts unread
 * notifications, and surfaces each new one: an in-app banner while the app is
 * on screen, a system notification while it is in the background.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState<AppNotification | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>();

  const open = useCallback(
    (link: string) => {
      if (/^https?:\/\//.test(link)) window.location.href = link;
      else navigate(link || "/account/notifications");
    },
    [navigate],
  );

  useEffect(() => {
    void initDeviceNotifications();
    return onNotificationTap(open);
  }, [open]);

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
        if (document.visibilityState === "visible") {
          setBanner(n);
          clearTimeout(bannerTimer.current);
          bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
        } else {
          void showDeviceNotification(n);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [userId, refreshUnread]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const value = useMemo<NotificationValue>(
    () => ({
      unread,
      markAllSeen: async () => {
        setUnread(0);
        await api.markNotificationsSeen().catch(() => {});
      },
    }),
    [unread],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {banner && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div
            role="status"
            className="animate-rise pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur"
          >
            <button
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              onClick={() => {
                setBanner(null);
                open(banner.link);
              }}
            >
              <NotificationIcon kind={banner.kind} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-800">{banner.title}</span>
                <span className="line-clamp-2 text-xs text-slate-600">{banner.body}</span>
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
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
