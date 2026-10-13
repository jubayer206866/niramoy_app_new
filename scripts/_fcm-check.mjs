/**
 * Verify the Firebase service account can reach FCM without sending anything.
 *
 *   FIREBASE_SERVICE_ACCOUNT=secrets/firebase-service-account.json node scripts/_fcm-check.mjs [deviceToken]
 *
 * Uses validate_only, so even a real device token receives nothing.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT is not set");
  process.exit(1);
}
const sa = JSON.parse(raw.startsWith("{") ? raw : fs.readFileSync(raw, "utf8"));
const b64url = (v) => Buffer.from(v).toString("base64url");
const iat = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 600,
  }),
)}`;
const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${unsigned}.${signature}`,
  }),
});
const tokenBody = await tokenRes.json();
if (!tokenRes.ok) {
  console.error(`FAIL  token exchange: ${tokenRes.status} ${tokenBody.error_description || tokenBody.error}`);
  process.exit(1);
}
console.log(`PASS  service account ${sa.client_email} signed in`);

const deviceToken = process.argv[2] || "not-a-real-device-token";
const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
  method: "POST",
  headers: { Authorization: `Bearer ${tokenBody.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ validate_only: true, message: { token: deviceToken, notification: { title: "check" } } }),
});
const body = await res.json().catch(() => ({}));
if (res.ok) console.log("PASS  FCM accepted the message (dry run)");
else if (res.status === 400 && !process.argv[2]) console.log("PASS  FCM API reachable (rejected the fake token as expected)");
else {
  console.error(`FAIL  FCM ${res.status} ${body?.error?.status}: ${body?.error?.message}`);
  process.exit(1);
}
