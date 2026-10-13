/**
 * Authentication helpers: password hashing, session tokens, cookies.
 * Uses only node:crypto - no extra dependencies.
 */
import crypto from "node:crypto";
import db, { now } from "./db.mjs";

export const SESSION_COOKIE = "ag_session";
const SESSION_DAYS = 30;

// ---------- passwords ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [, saltHex, keyHex] = String(stored).split("$");
    if (!saltHex || !keyHex) return false;
    const key = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(keyHex, "hex");
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// ---------- sessions ----------
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId, userAgent = "") {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.run(
    "INSERT INTO sessions (token_hash,user_id,created_at,expires_at,user_agent) VALUES (?,?,?,?,?)",
    [sha256(token), userId, now(), expires, String(userAgent ?? "").slice(0, 200)],
  );
  return { token, expires: expires.toISOString() };
}

export async function destroySession(token) {
  if (token) await db.run("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
}

export async function userForToken(token) {
  if (!token) return null;
  const row = await db.get(
    `SELECT s.expires_at AS expiresAt, u.id,u.name,u.email,u.phone,u.role,u.created_at AS createdAt
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [sha256(token)],
  );
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  const { expiresAt: _e, ...user } = row;
  return user;
}

// ---------- cookies ----------
export function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token, expires) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Reads the session (cookie for the web app, X-Session-Token header for the
 * packaged mobile app, which is cross-origin and cannot use cookies) and
 * attaches req.user.
 */
export function attachUser(req, _res, next) {
  const token =
    req.headers["x-session-token"] || parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
  req.sessionToken = token;
  userForToken(token).then((user) => {
    req.user = user;
    next();
  }, next);
}

/** Wrap an async route handler so rejections reach Express's error handler. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}

/** Admin panel guard - applied to every /api/admin/* route. */
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "You need administrator access for that." });
  }
  next();
}

// ---------- validation ----------
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateRegistration({ name, email, password }) {
  const errors = {};
  if (!name || String(name).trim().length < 2) errors.name = "Please enter your full name.";
  if (!EMAIL_RE.test(String(email || "").trim())) errors.email = "Enter a valid email address.";
  if (!password || String(password).length < 6)
    errors.password = "Password must be at least 6 characters.";
  return errors;
}

/** Very small in-memory throttle for auth endpoints. */
const attempts = new Map();
export function throttle(key, limit = 12, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.at > windowMs) {
    attempts.set(key, { at: now, n: 1 });
    return true;
  }
  entry.n++;
  return entry.n <= limit;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role || "customer",
    createdAt: user.createdAt,
    initials: String(user.name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join(""),
  };
}
