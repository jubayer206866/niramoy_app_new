/**
 * System notifications for the packaged app. A no-op in the browser; plugin
 * code is only downloaded inside the native shell.
 *
 * Two delivery paths:
 *  - Local notifications: shown by the app itself for live events that arrive
 *    while it is in the background but still running.
 *  - Firebase push (only in builds made with google-services.json): delivered
 *    by Android even when the app is closed. When active, local copies are
 *    skipped so nothing is shown twice.
 */
import { api, type AppNotification } from "./api";
import { offerTheme } from "./offerThemes";

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };
const capacitor = () => (window as { Capacitor?: CapacitorGlobal }).Capacitor;
const isNative = () => !!capacitor()?.isNativePlatform?.();

const PUSH_ENABLED = import.meta.env.VITE_PUSH_ENABLED === "1";
/** Must match ANDROID_CHANNEL in server/push.mjs and res/values/notifications.xml. */
export const NOTIFICATION_CHANNEL = "general";

let localGranted = false;
let pushToken: string | null = null;
let started: Promise<void> | null = null;
/** What a tapped system notification carries (FCM data or local `extra`; values arrive as strings). */
export interface NotificationTap {
  id: number;
  kind: string;
  link: string;
  /** An offer that should open as the in-app pop-up rather than navigate straight away. */
  popup: boolean;
}

type TapData = Record<string, unknown> | undefined;

let tapHandler: ((tap: NotificationTap) => void) | null = null;
let pendingTap: NotificationTap | null = null;

function handleTap(data: TapData) {
  const tap: NotificationTap = {
    id: Number(data?.id) || 0,
    kind: String(data?.kind ?? ""),
    link: typeof data?.link === "string" && data.link ? data.link : "/account/notifications",
    popup: data?.popup === "1" || data?.popup === true,
  };
  if (tapHandler) tapHandler(tap);
  else pendingTap = tap;
}

/** What to do when a notification is tapped. A tap that launched the app is replayed here. */
export function onNotificationTap(handler: (tap: NotificationTap) => void) {
  tapHandler = handler;
  if (pendingTap) {
    const tap = pendingTap;
    pendingTap = null;
    handler(tap);
  }
  return () => {
    if (tapHandler === handler) tapHandler = null;
  };
}

async function startLocal() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.createChannel({
    id: NOTIFICATION_CHANNEL,
    name: "Orders, wallet & offers",
    description: "Delivery updates, wallet activity and offers from Niramoy Pharmacy",
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#6A3DF0",
  });
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted" && perm.display !== "denied") {
    perm = await LocalNotifications.requestPermissions();
  }
  localGranted = perm.display === "granted";
  await LocalNotifications.addListener("localNotificationActionPerformed", (e) =>
    handleTap(e.notification.extra as TapData),
  );
}

/** Play services can transiently refuse a token (SERVICE_NOT_AVAILABLE); Firebase won't retry by itself. */
const REGISTER_RETRY_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000];

async function startPush() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const register = () => {
    clearTimeout(retryTimer);
    void PushNotifications.register().catch(() => {});
  };

  await PushNotifications.addListener("registration", (t) => {
    clearTimeout(retryTimer);
    attempt = 0;
    pushToken = t.value;
    void syncPushToken();
  });
  await PushNotifications.addListener("registrationError", (e) => {
    const delay = REGISTER_RETRY_MS[Math.min(attempt++, REGISTER_RETRY_MS.length - 1)];
    console.warn(`push registration failed (${e.error}); retrying in ${delay / 1000}s`);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(register, delay);
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", (a) =>
    handleTap(a.notification.data as TapData),
  );
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== "granted" && perm.receive !== "denied") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") return;
  register();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !pushToken) register();
  });
}

/** Ask for permission, create the channel and wire up taps. Safe to call repeatedly. */
export function initDeviceNotifications(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  started ??= (async () => {
    try {
      await startLocal();
      if (PUSH_ENABLED) await startPush();
    } catch (err) {
      console.warn("notifications unavailable", err);
    }
  })();
  return started;
}

/** Tie this phone's push token to whoever is signed in now (or to nobody after sign-out). */
export async function syncPushToken() {
  if (!pushToken) return;
  await api.registerPush(pushToken, capacitor()?.getPlatform?.() ?? "android").catch(() => {});
}

/** Show a live event as a system notification while the app is in the background. */
export async function showDeviceNotification(n: AppNotification) {
  if (!isNative() || pushToken) return;
  await initDeviceNotifications();
  if (!localGranted) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const extras = [
    n.coupon && `Use code ${n.coupon}`,
    n.expiresAt &&
      `Ends ${new Date(n.expiresAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`,
  ].filter(Boolean);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: n.id,
        title: n.badge ? `${n.title} · ${n.badge}` : n.title,
        body: n.body,
        largeBody: extras.length ? `${n.body}\n${extras.join(" · ")}` : n.body,
        summaryText: n.kind === "offer" ? "Special offer" : undefined,
        channelId: NOTIFICATION_CHANNEL,
        smallIcon: "ic_stat_notify",
        iconColor: offerTheme(n.theme).accent,
        autoCancel: true,
        extra: { id: String(n.id), kind: n.kind, link: n.link, popup: n.popup ? "1" : "0" },
      },
    ],
  });
}
