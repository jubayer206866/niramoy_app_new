/**
 * Read-only visual check of the "Shop by category" tiles.
 *
 * Loads the storefront in headless Chrome at desktop width, measures each tile's
 * image area and its inner <img>, and captures a screenshot of the section into
 * .scrape/category-tiles.png for eyeballing.
 *
 * Usage: node scripts/_category-shot.mjs [--base http://localhost:4000]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:4000";
const OUT = path.join(".scrape", "category-tiles.png");
const PORT = 9600 + Math.floor(Math.random() * 300);

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
  throw new Error("chrome devtools endpoint not reachable");
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ag-cat-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=1440,1100",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  const wsUrl = await connect(PORT);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("ws failed")), { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: BASE + "/" });

  // wait for the category grid to render (skeleton state has no card links)
  let tileCount = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    tileCount = (
      await cdp.send("Runtime.evaluate", {
        expression: "document.querySelectorAll('a.card-hover[href^=\"/category/\"]').length",
        returnByValue: true,
      })
    ).result.value;
    if (tileCount > 0) break;
  }

  const probe = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const tiles = [...document.querySelectorAll('a.card-hover[href^="/category/"]')];
      return tiles.map(a => {
        const box = a.querySelector('div.relative');
        const img = a.querySelector('img');
        if (!box || !img) return null;
        const b = box.getBoundingClientRect();
        const i = img.getBoundingClientRect();
        return {
          name: (a.textContent.trim().slice(0, 20)),
          src: (img.getAttribute('src') || '').split('/').pop().slice(0, 28),
          boxW: Math.round(b.width), boxH: Math.round(b.height),
          imgW: Math.round(i.width), imgH: Math.round(i.height),
          fills: i.width >= b.width - 1 && i.height >= b.height - 1,
        };
      }).filter(Boolean);
    })()`,
    returnByValue: true,
  });
  if (probe.exceptionDetails) {
    console.error("probe error:", probe.exceptionDetails.text, probe.exceptionDetails.exception?.description || "");
  }
  const stats = probe.result.value || [];

  console.log(`tile image fill check (${tileCount} tiles found):`);
  let allFill = stats.length > 0;
  if (!stats.length) console.log("  (no tiles found — page did not render the category grid)");
  for (const t of stats) {
    if (!t.fills) allFill = false;
    console.log(
      `${t.fills ? "ok " : "BAD"} ${t.name.padEnd(20)} box=${t.boxW}x${t.boxH} img=${t.imgW}x${t.imgH} ${t.src}`,
    );
  }
  console.log(allFill ? "\nAll tiles' images fill the card area." : "\nSome tiles do not fill.");

  try {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
    console.log(`screenshot -> ${OUT}`);
  } catch {
    /* best effort */
  }

  ws.close();
  process.exit(allFill ? 0 : 1);
} catch (e) {
  console.error("error:", e.message);
  chrome.kill();
  process.exit(1);
}
