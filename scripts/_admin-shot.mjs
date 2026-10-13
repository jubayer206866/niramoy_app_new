/**
 * Admin panel smoke test + screenshots.
 *
 * Signs in as the seeded admin, opens every /admin route in headless Chrome,
 * checks the expected heading rendered, reports console errors and writes a
 * screenshot per route into .scrape/admin/.
 *
 * Usage: node scripts/_admin-shot.mjs
 *        BASE_URL=http://host:4000 ADMIN_PASSWORD=... node scripts/_admin-shot.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = (process.env.BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const OUT = path.join(".scrape", "admin");
const PORT = 9400 + Math.floor(Math.random() * 400);

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error("Chrome not found");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

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
      const page = targets.find((t) => t.type === "page" && t.url.startsWith("about:blank"));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("could not reach Chrome devtools endpoint");
}

async function adminLogin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || "admin@niramoy.local",
      password: process.env.ADMIN_PASSWORD || "niramoy123",
    }),
  });
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
  const json = await res.json();
  return json.token;
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ag-admin-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=1440,1000",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failures = 0;

try {
  const token = await adminLogin();
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
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await cdp.send("Page.navigate", { url: BASE + "/" });
  await sleep(1500);
  await cdp.send("Network.setCookie", {
    name: "ag_session",
    value: token,
    domain: new URL(BASE).hostname,
    path: "/",
  });

  // first order id, so the order detail route can be opened too
  let firstOrder = "";
  try {
    const res = await fetch(`${BASE}/api/admin/orders?limit=1`, {
      headers: { "X-Session-Token": token },
    });
    const json = await res.json();
    firstOrder = json.orders?.[0]?.id || "";
  } catch {
    /* no orders */
  }

  const routes = [
    { url: "/admin", marker: "Dashboard", shot: "01-dashboard" },
    { url: "/admin/products", marker: "Products", shot: "02-products" },
    { url: "/admin/products/new", marker: "Add product", shot: "03-product-new" },
    { url: "/admin/orders", marker: "Orders", shot: "04-orders" },
    firstOrder && {
      url: `/admin/orders/${encodeURIComponent(firstOrder)}`,
      marker: "Payment summary",
      shot: "05-order-detail",
    },
    { url: "/admin/customers", marker: "Customers", shot: "06-customers" },
    { url: "/admin/categories", marker: "Categories", shot: "07-categories" },
    { url: "/admin/banners", marker: "Banners", shot: "08-banners" },
    { url: "/admin/media", marker: "Media library", shot: "09-media" },
    { url: "/admin/settings", marker: "Settings", shot: "10-settings" },
    { url: "/admin/products/44665", marker: "Publishing", shot: "11-product-edit" },
  ].filter(Boolean);

  for (const route of routes) {
    cdp.clear();
    await cdp.send("Page.navigate", { url: BASE + route.url });
    await sleep(2000);
    let text = "";
    for (let attempt = 0; attempt < 6 && !text; attempt++) {
      const res = await cdp.send("Runtime.evaluate", {
        expression: "document.body ? document.body.innerText : ''",
        returnByValue: true,
      });
      text = String(res?.result?.value ?? "");
      if (!text) await sleep(500);
    }
    const ok = text.toLowerCase().includes(route.marker.toLowerCase());
    const errs = cdp.errors();
    if (!ok || errs.length) failures++;
    try {
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
      fs.writeFileSync(path.join(OUT, `${route.shot}.jpg`), Buffer.from(shot.data, "base64"));
    } catch {
      /* screenshot is best effort */
    }
    console.log(
      `${ok ? "PASS" : "FAIL"} ${route.url.padEnd(40)} ${text.length} chars` +
        (ok ? "" : ` | no "${route.marker}"`) +
        (errs.length ? ` | console: ${errs.slice(0, 2).join(" | ")}` : ""),
    );
  }

  ws.close();
} catch (e) {
  console.error("admin shot error:", e.message);
  failures++;
} finally {
  chrome.kill();
  await sleep(1200);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* ignore */
  }
}

console.log(
  failures === 0 ? `\nAll admin routes rendered. Screenshots in ${OUT}` : `\n${failures} route(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
