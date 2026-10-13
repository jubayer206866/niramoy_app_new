#!/usr/bin/env node
/**
 * End-to-end UI smoke test.
 *
 * Launches headless Chrome with remote debugging, signs in through the real API
 * to obtain a session cookie, then visits every route and reports:
 *   - whether the expected marker text rendered
 *   - any uncaught exceptions / console errors
 *
 * Usage: node scripts/smoke-ui.mjs [--port 9222] [--base http://localhost:4000]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};
const BASE = arg("--base", "http://localhost:4000");
// random port: a previous run's socket can linger in TIME_WAIT
const PORT = Number(arg("--port", String(9300 + Math.floor(Math.random() * 400))));

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error("Chrome not found — skipping UI smoke test");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- test account
const email = `smoke${Date.now()}@example.com`;
const password = "smoke-test-123";
let token = null;

async function api(pathname, init = {}, cookie = null) {
  const res = await fetch(BASE + pathname, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = setCookie.length ? setCookie : [res.headers.get("set-cookie") || ""];
  return { res, setCookie: raw.filter(Boolean) };
}

async function signIn() {
  const reg = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Tester", email, phone: "01700000000", password }),
  });
  const cookieLine = reg.setCookie.map((c) => c.split(";")[0]).join("; ");
  const match = /ag_session=([^;]+)/.exec(cookieLine);
  token = match ? match[1] : null;
  if (!token) throw new Error("could not create a session for the smoke test");
  // give the account an address + wishlist item so those pages have content
  await api(
    "/api/account/addresses",
    {
      method: "POST",
      body: JSON.stringify({
        label: "Home",
        name: "Smoke Tester",
        phone: "01700000000",
        address: "House 1, Road 2, Dhanmondi",
        city: "Dhaka",
        isDefault: true,
      }),
    },
    cookieLine,
  );
  await api(
    "/api/account/wishlist",
    { method: "POST", body: JSON.stringify({ productId: 44665 }) },
    cookieLine,
  );
  const order = await api(
    "/api/orders",
    {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: 44665, qty: 2 }],
        name: "Smoke Tester",
        phone: "01700000000",
        address: "House 1, Road 2, Dhanmondi",
        city: "Dhaka",
        paymentMethod: "cod",
      }),
    },
    cookieLine,
  );
  const orderJson = await order.res.json();
  return { cookieLine, orderId: orderJson.order?.id };
}

// ---------------------------------------------------------------- CDP client
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 30000);
    });
  }

  errors() {
    return this.events
      .filter(
        (e) =>
          e.method === "Runtime.exceptionThrown" ||
          (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") ||
          (e.method === "Log.entryAdded" && e.params.entry.level === "error"),
      )
      .map((e) =>
        e.method === "Runtime.exceptionThrown"
          ? e.params.exceptionDetails.exception?.description ||
            e.params.exceptionDetails.text
          : e.method === "Log.entryAdded"
            ? `${e.params.entry.text} ${e.params.entry.url || ""}`
            : (e.params.args || []).map((a) => a.value ?? a.description).join(" "),
      );
  }

  clear() {
    this.events = [];
  }
}

async function connect(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      // extensions (WhatsApp etc.) also expose "page" targets - only take ours
      const page = targets.find(
        (t) =>
          t.type === "page" &&
          (t.url === "about:blank" || t.url.startsWith("about:blank#") || t.url.startsWith(BASE)),
      );
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("could not reach Chrome devtools endpoint");
}

// ------------------------------------------------------------------- run test
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ag-smoke-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failures = 0;

try {
  const { cookieLine, orderId } = await signIn();
  console.log(`smoke account: ${email} | order ${orderId}`);

  const wsUrl = await connect(PORT);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("websocket failed")), { once: true });
  });
  const cdp = new Cdp(ws);

  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Page.navigate", { url: BASE + "/" });
  await sleep(2500);
  const { result: started } = await cdp.send("Runtime.evaluate", {
    expression: "location.href",
    returnByValue: true,
  });
  if (!String(started?.value || "").startsWith(BASE)) {
    throw new Error(`attached to the wrong tab (${started?.value}); not running checks`);
  }
  await cdp.send("Network.setCookie", {
    name: "ag_session",
    value: token,
    domain: "localhost",
    path: "/",
  });

  const routes = [
    { url: "/", marker: "delivered in hours" },
    { url: "/products", marker: "products" },
    { url: "/category/medicines", marker: "products" },
    { url: "/products?q=condom", marker: "products" },
    { url: "/product/44665/u-me-long-love-condom-3-s-pack", marker: "Add to cart" },
    { url: "/login", marker: "Welcome back" },
    { url: "/register", marker: "Create your account" },
    { url: "/cart", marker: "cart" },
    { url: "/wishlist", marker: "wishlist" },
    { url: "/account", marker: "Welcome back" },
    { url: "/account/orders", marker: "My orders" },
    { url: `/account/orders/${orderId}`, marker: "Delivery progress" },
    { url: "/account/addresses", marker: "Delivery addresses" },
    { url: "/account/profile", marker: "Profile & security" },
    { url: "/nope-does-not-exist", marker: "couldn't find that page" },
  ];

  for (const route of routes) {
    cdp.clear();
    await cdp.send("Page.navigate", { url: BASE + route.url });
    await sleep(1800);
    let text = "";
    for (let attempt = 0; attempt < 8 && !text; attempt++) {
      const res = await cdp.send("Runtime.evaluate", {
        expression: "document.body ? document.body.innerText : ''",
        returnByValue: true,
      });
      text = String(res?.result?.value ?? "");
      if (!text) await sleep(600);
    }
    const ok = text.toLowerCase().includes(route.marker.toLowerCase());
    const errs = cdp.errors();
    if (!ok || errs.length) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${route.url.padEnd(46)} ${text.length.toString().padStart(6)} chars` +
        (ok ? "" : ` (no "${route.marker}" in: ${JSON.stringify(text.slice(0, 120))})`) +
        (errs.length ? ` | console errors: ${errs.slice(0, 2).join(" | ")}` : ""),
    );
  }

  // branding + payment logos are rendered (footer "We accept" strip)
  cdp.clear();
  await cdp.send("Page.navigate", { url: BASE + "/" });
  await sleep(1800);
  const probes = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      name: /Niramoy Pharmacy/i.test(document.body.innerText),
      pay: document.querySelectorAll('svg[role="img"]').length,
      marks: [...document.querySelectorAll('svg[role="img"]')].map(s => s.getAttribute('aria-label')),
    })`,
    returnByValue: true,
  });
  const info = JSON.parse(probes?.result?.value || "{}");
  const brandOk = !!info.name && (info.pay || 0) >= 7;
  if (!brandOk) failures++;
  console.log(
    `${brandOk ? "PASS" : "FAIL"} branding + payment marks -> ${JSON.stringify(info)}`,
  );

  // images are lazy-loaded + decoded async, and detail pages open at the top
  await cdp.send("Page.navigate", { url: `${BASE}/products` });
  await sleep(2000);
  const imgProbe = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      total: document.querySelectorAll('img').length,
      lazy: document.querySelectorAll('img[loading="lazy"]').length,
      async: document.querySelectorAll('img[decoding="async"]').length,
    })`,
    returnByValue: true,
  });
  const imgInfo = JSON.parse(imgProbe?.result?.value || "{}");
  const imgOk = (imgInfo.total || 0) > 0 && imgInfo.lazy === imgInfo.total && imgInfo.async === imgInfo.total;
  if (!imgOk) failures++;
  console.log(`${imgOk ? "PASS" : "FAIL"} images lazy+async -> ${JSON.stringify(imgInfo)}`);

  // real client-side navigation: scroll the listing, click a product, expect the top
  const navProbe = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      window.scrollTo(0, 1400);
      await new Promise(r => setTimeout(r, 300));
      const before = window.scrollY;
      const link = document.querySelector('a[href^="/product/"]');
      if (!link) return JSON.stringify({ before, error: 'no product link' });
      link.click();
      await new Promise(r => setTimeout(r, 1500));
      return JSON.stringify({
        before,
        path: location.pathname,
        after: window.scrollY,
        heading: document.querySelector('h1')?.innerText?.slice(0, 40) ?? '',
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const nav = JSON.parse(navProbe?.result?.value || "{}");
  const scrollOk = nav.before > 0 && nav.after === 0 && nav.path.startsWith("/product/");
  if (!scrollOk) failures++;
  console.log(`${scrollOk ? "PASS" : "FAIL"} product page opens at top -> ${JSON.stringify(nav)}`);

  // signed-in only: add a product to the wishlist from the UI
  cdp.clear();
  await cdp.send("Page.navigate", { url: `${BASE}/product/4/3-geocef` });
  await sleep(1800);
  await cdp.send("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('button')].find(b => /wishlist/i.test(b.getAttribute('aria-label')||''))?.click()`,
  });
  await sleep(1200);
  const wishCheck = await api("/api/account/wishlist/ids", {}, cookieLine);
  const wishJson = await wishCheck.res.json();
  const wishOk = (wishJson.ids || []).includes(4);
  if (!wishOk) failures++;
  console.log(
    `${wishOk ? "PASS" : "FAIL"} wishlist heart in the UI saved product 4 -> ${JSON.stringify(wishJson.ids)}`,
  );

  ws.close();
} catch (e) {
  console.error("smoke test error:", e.message);
  failures++;
} finally {
  chrome.kill();
  await sleep(1500);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* Windows may still hold the profile briefly - harmless */
  }
}

console.log(failures === 0 ? "\nAll UI smoke checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
