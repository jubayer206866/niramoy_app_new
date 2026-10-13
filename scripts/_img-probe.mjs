#!/usr/bin/env node
/**
 * Image health probe: renders the storefront in headless Chrome and reports
 * product <img> elements that are technically loaded but invisible (the
 * "opacity-0 forever" state produced by the Img component's loading race),
 * plus broken/fallback images.
 *
 * Usage: node scripts/_img-probe.mjs [--base http://localhost:4000] [--rounds 3]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? parseInt(process.argv[i + 1], 10) : def;
};
const strArg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};
const BASE = strArg("--base", "http://localhost:4000");
const ROUNDS = arg("--rounds", 3);
const PORT = Number(strArg("--port", String(9700 + Math.floor(Math.random() * 200))));

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.log("Chrome not found - skipping image probe");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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

const PROBE = `(() => {
  const imgs = [...document.querySelectorAll('img')];
  const report = imgs.map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const isPlaceholder = (el.currentSrc || el.src || '').startsWith('data:image/svg');
    return {
      src: (el.currentSrc || el.src || '').slice(0, 120),
      complete: el.complete,
      nw: el.naturalWidth,
      opacity: cs.opacity,
      visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
      placeholder: isPlaceholder, alt: el.alt,
      via: el.closest('a')?.getAttribute('href') || '',
      loading: el.getAttribute('loading'),
    };
  });
  const stuck = report.filter((i) => i.complete && i.nw > 0 && i.opacity === '0');
  const broken = report.filter((i) => i.complete && i.nw === 0 && !i.placeholder);
  const fallback = report.filter((i) => i.placeholder);
  const pending = report.filter((i) => !i.complete);
  return {
    total: report.length,
    stuck: stuck.length,
    stuckSamples: stuck.slice(0, 5).map((i) => i.src),
    broken: broken.length,
    brokenSamples: broken.slice(0, 5).map((i) => i.src),
    fallback: fallback.length,
    fallbackSamples: fallback.slice(0, 8).map((i) => i.via + " | " + i.alt),
    pending: pending.length,
    pendingVisible: pending.filter((i) => i.visible).length,
  };
})()`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ag-imgprobe-"));
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
  const wsUrl = await connect(PORT);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("websocket failed")), { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");

  const routes = ["/products", "/category/medicines", "/", "/products?q=a", "/cart"];

  for (let round = 1; round <= ROUNDS; round++) {
    for (const route of routes) {
      await cdp.send("Page.navigate", { url: BASE + route });
      await sleep(2200);
      // scroll to pull in lazy images, then settle
      await cdp.send("Runtime.evaluate", {
        expression: `(async () => {
          for (let y = 0; y < 3000; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
          window.scrollTo(0, 0);
        })()`,
        awaitPromise: true,
      });
      await sleep(1500);
      const res = await cdp.send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
      const r = res?.result?.value || {};
      const bad = (r.stuck || 0) + (r.broken || 0);
      if (bad > 0) failures++;
      console.log(
        `round ${round} ${route.padEnd(24)} total=${r.total} stuck=${r.stuck} broken=${r.broken} fallback=${r.fallback} pending=${r.pending}` +
          (r.stuck ? ` stuck:${JSON.stringify(r.stuckSamples)}` : "") +
          (r.broken ? ` broken:${JSON.stringify(r.brokenSamples)}` : "") +
          (r.fallbackSamples && route === "/" ? ` fallback:${JSON.stringify(r.fallbackSamples)}` : ""),
      );
    }
  }
  ws.close();
} catch (e) {
  console.error("probe error:", e.message);
  failures++;
} finally {
  chrome.kill();
  await sleep(1500);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* ignore */
  }
}

console.log(failures === 0 ? "\nno invisible/broken images detected" : `\n${failures} route scan(s) with bad images`);
process.exit(failures === 0 ? 0 : 1);

