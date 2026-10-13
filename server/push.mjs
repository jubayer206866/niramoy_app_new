/**
 * Closed-app push notifications through Firebase Cloud Messaging (HTTP v1).
 *
 * Dormant until FIREBASE_SERVICE_ACCOUNT points at (or contains) the service
 * account JSON downloaded from the Firebase console. Without it, live
 * notifications still reach open apps over /api/events.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import db from "./db.mjs";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ANDROID_CHANNEL = "general";

/** Offer colour themes; keys match src/offerThemes.ts, values tint the Android notification. */
export const THEME_ACCENTS = {
  violet: "#6A3DF0",
  sunset: "#F43F5E",
  emerald: "#059669",
  ocean: "#0284C7",
  gold: "#D97706",
  midnight: "#4F46E5",
};

let account;
function serviceAccount() {
  if (account !== undefined) return account;
  account = null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return account;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : fs.readFileSync(raw, "utf8"));
    if (json.project_id && json.client_email && json.private_key) account = json;
    else console.warn("push: FIREBASE_SERVICE_ACCOUNT is missing project_id/client_email/private_key");
  } catch (err) {
    console.warn(`push: could not read FIREBASE_SERVICE_ACCOUNT (${err.message})`);
  }
  return account;
}

export const pushConfigured = () => !!serviceAccount();

const b64url = (v) => Buffer.from(v).toString("base64url");

let cachedToken = null;
async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const sa = serviceAccount();
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  )}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`token exchange failed (${res.status} ${body.error_description || body.error || ""})`);
  }
  cachedToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

/** FCM only accepts absolute image URLs. */
function absoluteImage(image) {
  if (!image) return undefined;
  if (/^https?:\/\//.test(image)) return image;
  const base = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  return base ? `${base}${image.startsWith("/") ? "" : "/"}${image}` : undefined;
}

const endsLabel = (iso) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

/**
 * The tray copy. Android shows `image` as a big picture when expanded and as
 * a thumbnail when collapsed; coupon and deadline are appended to the text.
 */
export function pushMessage(n) {
  const extras = [n.coupon && `Use code ${n.coupon}`, n.expiresAt && `Ends ${endsLabel(n.expiresAt)}`].filter(Boolean);
  return {
    title: n.badge ? `${n.title} · ${n.badge}` : n.title,
    body: extras.length ? `${n.body}\n${extras.join(" · ")}` : n.body,
    image: absoluteImage(n.image),
    color: THEME_ACCENTS[n.theme] || THEME_ACCENTS.violet,
  };
}

async function sendOne(token, n, bearer) {
  const sa = serviceAccount();
  const { title, body, image, color } = pushMessage(n);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body, ...(image ? { image } : {}) },
        // data values must be strings
        data: { id: String(n.id), kind: n.kind, link: n.link || "", popup: n.popup ? "1" : "0" },
        android: {
          priority: "high",
          notification: {
            channel_id: ANDROID_CHANNEL,
            sound: "default",
            tag: `n${n.id}`,
            color,
            notification_priority: "PRIORITY_HIGH",
            visibility: "PUBLIC",
            ...(image ? { image } : {}),
          },
        },
      },
    }),
  });
  if (res.ok) return "sent";
  const failure = await res.json().catch(() => ({}));
  const code = failure?.error?.details?.find((d) => d.errorCode)?.errorCode || failure?.error?.status;
  if (res.status === 404 || code === "UNREGISTERED" || code === "INVALID_ARGUMENT") return "invalid";
  throw new Error(`FCM ${res.status} ${code || ""}`);
}

/**
 * Push one notification to a set of device tokens. Tokens FCM reports as
 * uninstalled/invalid are deleted. Never throws.
 */
export async function pushToTokens(tokens, notification) {
  if (!tokens.length || !pushConfigured()) return { sent: 0, failed: 0 };
  let bearer;
  try {
    bearer = await accessToken();
  } catch (err) {
    console.warn(`push: ${err.message}`);
    return { sent: 0, failed: tokens.length };
  }
  let sent = 0;
  let failed = 0;
  const invalid = [];
  const queue = [...tokens];
  const worker = async () => {
    for (let token = queue.shift(); token; token = queue.shift()) {
      try {
        const r = await sendOne(token, notification, bearer);
        if (r === "sent") sent++;
        else {
          failed++;
          invalid.push(token);
        }
      } catch (err) {
        failed++;
        console.warn(`push: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
  if (invalid.length) await db.run("DELETE FROM push_tokens WHERE token IN (?)", [invalid]).catch(() => {});
  return { sent, failed };
}
