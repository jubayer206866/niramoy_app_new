/**
 * Mobile-viewport home carousel probe: full-width check, dot indicators,
 * autoplay advance, covering-element check, and a screenshot to
 * .scrape/mobile-carousel.png.
 *
 * Usage: node scripts/_mob-probe.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = "http://localhost:4000";
const OUT = path.join(".scrape", "mobile-carousel.png");
const PORT = 19876;

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
          ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text
          : e.method === "Log.entryAdded"
            ? `${e.params.entry.text} ${e.params.entry.url || ""}`
            : (e.params.args || []).map((a) => a.value ?? a.description).join(" "),
      );
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ag-mob-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=390,844",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const evalJs = async (cdp, expression) => {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return res?.result?.value;
};

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
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });

  await cdp.send("Page.navigate", { url: BASE + "/" });
  await sleep(3000);

  const before = await evalJs(
    cdp,
    `(() => {
      const sec = document.querySelector('section[aria-label="Promotions"]');
      if (!sec) return JSON.stringify({ error: "no carousel" });
      const sc = sec.querySelector(".snap-x");
      const imgs = [...sec.querySelectorAll("img")];
      const dots = [...sec.querySelectorAll('[role="tab"]')];
      const r0 = imgs[0] && imgs[0].getBoundingClientRect();
      const top = r0 && document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
      return JSON.stringify({
        vw: innerWidth,
        slideWidth: r0 && Math.round(r0.width),
        slideHeight: r0 && Math.round(r0.height),
        imgCount: imgs.length,
        firstLoaded: imgs[0] && imgs[0].complete && imgs[0].naturalWidth > 0,
        topElement: top && top.tagName,
        dots: dots.length,
        activeDot: dots.findIndex((d) => d.getAttribute("aria-selected") === "true"),
        scrollLeft: sc && Math.round(sc.scrollLeft),
      });
    })()`,
  );
  console.log("t=3s :", before);

  // wait past one autoplay tick (4.5s)
  await sleep(3000);
  const after = await evalJs(
    cdp,
    `(() => {
      const sc = document.querySelector('section[aria-label="Promotions"] .snap-x');
      const dots = [...document.querySelectorAll('section[aria-label="Promotions"] [role="tab"]')];
      return JSON.stringify({
        scrollLeft: sc && Math.round(sc.scrollLeft),
        activeDot: dots.findIndex((d) => d.getAttribute("aria-selected") === "true"),
      });
    })()`,
  );
  console.log("t=6s (after autoplay):", after);

  const errs = cdp.errors();
  if (errs.length) console.log("console errors:", errs.slice(0, 5));

  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("screenshot ->", OUT);

  ws.close();
} catch (e) {
  console.error("probe error:", e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(1200);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* ignore */
  }
}
