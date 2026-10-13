/**
 * Read-only mobile layout audit.
 *
 * Renders key storefront routes at several phone widths in headless Chrome and
 * reports any element that overflows the viewport horizontally (the usual cause
 * of a page that does not fit a phone screen). Starts its own Chrome, touches
 * nothing but localhost, and writes no screenshots.
 *
 * Usage: node scripts/_mobile-audit.mjs [--base http://localhost:4000]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:4000";
const PORT = 9500 + Math.floor(Math.random() * 300);

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) {
  console.error("Chrome not found — skipping");
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
  throw new Error("chrome devtools endpoint not reachable");
}

// only report elements that stick out of the viewport AND are not inside a
// scroll / clip / hidden ancestor (those are intentional carousels & clipped art)
const OVERFLOW_PROBE = `(() => {
  const vw = window.innerWidth;
  const contained = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
      p = p.parentElement;
    }
    return false;
  };
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // only right-edge overflow scrolls the page; off-screen-left draws (closed
    // drawers, clipped art) are expected
    if (r.right > vw + 1) {
      if (contained(el)) continue;
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 70);
      bad.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  const input = document.querySelector('input[aria-label="Search products"]');
  const formEl = document.querySelector('header form');
  const brandEl = document.querySelector('header a[aria-label$="home"]');
  const headerInfo = formEl && brandEl
    ? {
        brandTop: Math.round(brandEl.getBoundingClientRect().top),
        searchTop: Math.round(formEl.getBoundingClientRect().top),
        stacked: formEl.getBoundingClientRect().top > brandEl.getBoundingClientRect().top + 8,
      }
    : null;
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
  };
  return {
    vw,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    searchWidth: input ? Math.round(input.getBoundingClientRect().width) : null,
    headerInfo,
    container: rect('.container-ag'),
    hero: rect('section.relative'),
    overflow: bad.slice(0, 8),
    overflowCount: bad.length,
  };
})()`;

// ancestor-chain debugger for the worst right-edge offender
const CHAIN_PROBE = `(() => {
  const vw = window.innerWidth;
  const contained = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (['auto','scroll','hidden','clip'].includes(ox)) return true;
      p = p.parentElement;
    }
    return false;
  };
  let worst = null;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !contained(el) && (!worst || r.right > worst.r.right)) worst = { el, r };
  }
  if (!worst) return [];
  const chain = [];
  let n = worst.el;
  while (n && n !== document.body && chain.length < 7) {
    const r = n.getBoundingClientRect();
    chain.push({
      tag: n.tagName.toLowerCase(),
      cls: (typeof n.className === 'string' ? n.className : '').slice(0, 60),
      w: Math.round(r.width),
      scrollW: n.scrollWidth,
    });
    n = n.parentElement;
  }
  return chain;
})()`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ag-mobile-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const WIDTHS = [320, 360, 390, 414, 640, 768, 1024];
const ROUTES = [
  "/",
  "/products",
  "/product/12474/napa-500",
  "/cart",
  "/wishlist",
  "/login",
  "/register",
  "/this-page-does-not-exist",
];
let problems = 0;

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

  for (const width of WIDTHS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    for (const route of ROUTES) {
      await cdp.send("Page.navigate", { url: BASE + route });
      await sleep(1800);
      const res = await cdp.send("Runtime.evaluate", {
        expression: OVERFLOW_PROBE,
        returnByValue: true,
      });
      const v = res.result.value;
      const docOverflow = v.scrollW > v.vw + 1 || v.bodyScrollW > v.vw + 1;
      const bad = docOverflow || v.overflowCount > 0;
      if (bad) problems++;
      console.log(
        `${bad ? "OVERFLOW" : "ok      "} ${String(width).padStart(3)}px ${route.padEnd(26)} ` +
          `scrollW=${v.scrollW} searchInput=${v.searchWidth}px` +
          (v.container ? ` container=[${v.container.left},${v.container.right}]` : "") +
          (v.hero ? ` hero=[${v.hero.left},${v.hero.right}]/w${v.hero.w}` : "") +
          (v.headerInfo ? ` header=${v.headerInfo.stacked ? "stacked" : "inline"}` : "") +
          (v.overflowCount ? ` offenders=${v.overflowCount}` : ""),
      );
      if (v.overflowCount) {
        for (const o of v.overflow) {
          console.log(`            ↳ <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right}`);
        }
        const chain = (
          await cdp.send("Runtime.evaluate", { expression: CHAIN_PROBE, returnByValue: true })
        ).result.value;
        for (const c of chain) {
          console.log(
            `            ↳ <${c.tag} class="${c.cls}"> w=${c.w} scrollW=${c.scrollW} minW=${c.minW}`,
          );
        }
      }
    }
  }
  // ---- type-to-search smoke check (does the suggestion panel show products?) ----
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Page.bringToFront");
  await cdp.send("Page.navigate", { url: BASE + "/" });
  await sleep(1800);
  const typed = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('input[aria-label="Search products"]');
      if (!input) return { error: 'no search input' };
      input.focus();
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'napa');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return { value: input.value };
    })()`,
    returnByValue: true,
  });
  await sleep(1500);
  const panel = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector('input[aria-label="Search products"]');
      const wrap = input?.closest('div.relative');
      const box = wrap?.querySelector('div.absolute');
      const products = box ? box.querySelectorAll('a[href^="/product/"]').length : 0;
      return { value: input?.value, panel: !!box, productLinks: products };
    })()`,
    returnByValue: true,
  });
  const p = panel.result.value;
  if (!p.panel) console.log(`            (typed=${JSON.stringify(typed.result.value)}, state=${JSON.stringify(p)})`);
  const searchOk = p.panel && p.productLinks > 0;
  if (!searchOk) problems++;
  console.log(
    `\n${searchOk ? "ok      " : "FAIL    "} type-to-search @390px panel=${p.panel} productSuggestions=${p.productLinks}`,
  );

  // ---- mobile-native home variant check ----
  const homeProbe = `(() => {
    try {
      const mob = document.querySelector('div[class~="lg:hidden"]');
      const desk = document.querySelector('div[class~="lg:block"]');
      return {
        error: null,
        mobilePresent: !!mob,
        greeting: !!(mob && mob.querySelector('h1')),
        pills: mob ? [...mob.querySelectorAll('a')].filter(a => /deals|no rx|top rated/i.test(a.textContent)).length : 0,
        bubbles: mob ? mob.querySelectorAll('a[href^="/category/"] span.rounded-full').length : 0,
        trust: mob ? [...mob.querySelectorAll('p')].some(p => /free delivery over/i.test(p.textContent)) : false,
        desktopPresent: !!desk,
        desktopHidden: desk ? getComputedStyle(desk).display === 'none' : null,
      };
    } catch (e) {
      return { error: String(e) };
    }
  })()`;

  for (const width of [390, 1024]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: width < 800 ? 2 : 1,
      mobile: width < 800,
    });
    await cdp.send("Page.navigate", { url: BASE + "/" });
    await sleep(2200);
    const res = await cdp.send("Runtime.evaluate", { expression: homeProbe, returnByValue: true });
    if (res.result.exceptionDetails || res.exceptionDetails) {
      console.log("home probe error:", JSON.stringify(res.result.value ?? res.exceptionDetails));
    }
    const hv = res.result.value || {};
    if (hv.error) {
      problems++;
      console.log(`FAIL    home variant @${width}px probe error: ${hv.error}`);
      continue;
    }
    const isMobile = width < 800;
    const okMobile =
      !isMobile || (hv.mobilePresent && hv.greeting && hv.pills >= 3 && hv.bubbles >= 6 && hv.trust && hv.desktopHidden);
    const okDesktop =
      isMobile || (hv.mobilePresent && hv.desktopPresent && hv.desktopHidden === false);
    if (!(okMobile && okDesktop)) problems++;
    console.log(
      `\n${okMobile && okDesktop ? "ok      " : "FAIL    "} home variant @${width}px ` +
        `mobilePresent=${hv.mobilePresent} greeting=${hv.greeting} pills=${hv.pills} bubbles=${hv.bubbles} ` +
        `trust=${hv.trust} desktopPresent=${hv.desktopPresent} desktopHidden=${hv.desktopHidden}`,
    );
  }

  // ---- screenshots of both home variants ----
  for (const [w, name] of [
    [390, ".scrape/home-mobile.png"],
    [1280, ".scrape/home-desktop.png"],
  ]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: 900,
      deviceScaleFactor: 2,
      mobile: w < 800,
    });
    await cdp.send("Page.navigate", { url: BASE + "/" });
    await sleep(2200);
    try {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(name, Buffer.from(shot.data, "base64"));
      console.log(`screenshot -> ${name}`);
    } catch {
      /* best effort */
    }
  }

  // ---- product page sticky buy bar ----
  const barProbe = `(() => {
    const bar = document.querySelector('[data-testid="mobile-buy-bar"]');
    if (!bar) return { present: false };
    const r = bar.getBoundingClientRect();
    const nav = document.querySelector('nav.fixed');
    const nr = nav ? nav.getBoundingClientRect() : null;
    const vis = getComputedStyle(bar);
    return {
      present: true,
      display: vis.display,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vh: window.innerHeight,
      navTop: nr ? Math.round(nr.top) : null,
      label: bar.innerText.replace(/\\s+/g, ' ').trim(),
    };
  })()`;

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: BASE + "/product/12474/napa-500" });
  await sleep(1800);
  const mobileBar = (
    await cdp.send("Runtime.evaluate", { expression: barProbe, returnByValue: true })
  ).result.value;
  const barOk =
    mobileBar.present &&
    mobileBar.display !== "none" &&
    mobileBar.navTop != null &&
    mobileBar.bottom <= mobileBar.navTop + 1 &&
    /add to cart/i.test(mobileBar.label);
  if (!barOk) problems++;
  console.log(
    `\n${barOk ? "ok      " : "FAIL    "} buy-bar @390px present=${mobileBar.present} label="${mobileBar.label}" ` +
      `bar=[${mobileBar.top},${mobileBar.bottom}] navTop=${mobileBar.navTop} vh=${mobileBar.vh}`,
  );

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1024,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(600);
  const deskBar = (
    await cdp.send("Runtime.evaluate", { expression: barProbe, returnByValue: true })
  ).result.value;
  const deskOk = deskBar.present && deskBar.display === "none";
  if (!deskOk) problems++;
  console.log(
    `${deskOk ? "ok      " : "FAIL    "} buy-bar @1024px hidden=${deskBar.display === "none"}`,
  );

  // ---- listing filters bottom sheet should cover the viewport (same root cause) ----
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: BASE + "/products" });
  await sleep(1800);
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /filters/i.test(b.textContent));
      if (btn) btn.click();
      return !!btn;
    })()`,
    returnByValue: true,
  });
  await sleep(500);
  const sheet = (
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const s = document.querySelector('main div.fixed.inset-0');
        if (!s) return { present: false };
        const r = s.getBoundingClientRect();
        return {
          present: true,
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          left: Math.round(r.left), right: Math.round(r.right),
          vw: window.innerWidth, vh: window.innerHeight,
        };
      })()`,
      returnByValue: true,
    })
  ).result.value;
  const sheetOk =
    sheet.present &&
    sheet.top <= 1 &&
    sheet.bottom >= sheet.vh - 1 &&
    sheet.left <= 1 &&
    sheet.right >= sheet.vw - 1;
  if (!sheetOk) problems++;
  console.log(
    `\n${sheetOk ? "ok      " : "FAIL    "} filter-sheet @390px ` +
      (sheet.present
        ? `rect=[${sheet.top},${sheet.left} → ${sheet.right},${sheet.bottom}] vw=${sheet.vw} vh=${sheet.vh}`
        : "not rendered"),
  );

  // ---- admin panel @390px ----
  const adminEmail = process.env.ADMIN_EMAIL || "admin@niramoy.local";
  const adminPass = process.env.ADMIN_PASSWORD || "niramoy123";
  let adminToken = "";
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPass }),
    });
    if (res.ok) adminToken = (await res.json()).token || "";
  } catch {
    /* ignore */
  }

  if (!adminToken) {
    console.log("\n(skipping admin audit: admin login unavailable)");
  } else {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCookie", {
      name: "ag_session",
      value: adminToken,
      domain: "localhost",
      path: "/",
    });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    const LOCAL_CHAIN_PROBE = `(() => {
      const vw = window.innerWidth;
      const contained = (el) => {
        let p = el.parentElement;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (['auto','scroll','hidden','clip'].includes(ox)) return true;
          p = p.parentElement;
        }
        return false;
      };
      let worst = null;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && !contained(el) && (!worst || r.right > worst.r.right)) worst = { el, r };
      }
      if (!worst) return [];
      const chain = [];
      let n = worst.el;
      while (n && n !== document.body && chain.length < 7) {
        const r = n.getBoundingClientRect();
        chain.push({
          tag: n.tagName.toLowerCase(),
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 60),
          w: Math.round(r.width),
          scrollW: n.scrollWidth,
          minW: getComputedStyle(n).minWidth,
        });
        n = n.parentElement;
      }
      return chain;
    })()`;

    console.log("\n-- admin panel @390px --");
    for (const route of [
      "/admin",
      "/admin/products",
      "/admin/orders",
      "/admin/customers",
      "/admin/settings",
    ]) {
      try {
        await cdp.send("Page.navigate", { url: BASE + route });
        await sleep(2000);
        const v = (
          await cdp.send("Runtime.evaluate", { expression: OVERFLOW_PROBE, returnByValue: true })
        ).result.value;
        const bad = v.scrollW > v.vw + 1 || v.overflowCount > 0;
        if (bad) problems++;
        const panes = (
          await cdp.send("Runtime.evaluate", {
            expression: "document.querySelectorAll('.scroll-native').length",
            returnByValue: true,
          })
        ).result.value;
        const t = (
          await cdp.send("Runtime.evaluate", {
            expression: "document.querySelector('header')?.getBoundingClientRect().top ?? null",
            returnByValue: true,
          })
        ).result.value;
        console.log(
          `${bad ? "OVERFLOW" : "ok      "} ${route.padEnd(18)} scrollW=${v.scrollW} offenders=${v.overflowCount} ` +
            `scrollPanes=${panes} headerTop=${t === null ? "-" : Math.round(t)}`,
        );
        if (v.overflowCount) {
          const chain = (
            await cdp.send("Runtime.evaluate", { expression: CHAIN_PROBE, returnByValue: true })
          ).result.value;
          for (const c of chain) {
            console.log(
              `            ↳ <${c.tag} class="${c.cls}"> w=${c.w} scrollW=${c.scrollW} minW=${c.minW}`,
            );
          }
        }
      } catch (e) {
        console.log(`ERROR    ${route.padEnd(18)} ${e.message}`);
        problems++;
      }
    }

    // sidebar drawer should cover the viewport when opened
    await cdp.send("Page.navigate", { url: BASE + "/admin" });
    await sleep(1500);
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /open menu/i.test(x.getAttribute('aria-label') || ''));
        if (b) b.click();
        return !!b;
      })()`,
      returnByValue: true,
    });
    await sleep(400);
    const drawer = (
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const a = document.querySelector('aside.fixed');
          if (!a) return { present: false };
          const r = a.getBoundingClientRect();
          return { present: true, left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
        })()`,
        returnByValue: true,
      })
    ).result.value;
    const drawerOk =
      drawer.present && drawer.left <= 1 && drawer.top <= 1 && drawer.bottom >= drawer.vh - 1;
    if (!drawerOk) problems++;
    console.log(
      `\n${drawerOk ? "ok      " : "FAIL    "} admin sidebar @390px ` +
        (drawer.present
          ? `left=${drawer.left} top=${drawer.top} bottom=${drawer.bottom} vh=${drawer.vh}`
          : "not found"),
    );
  }

  // ---- signed-in storefront pages (account / checkout) @390 & 360 ----
  let userToken = "";
  try {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Mobile Audit",
        email: `mobile${Date.now()}@example.com`,
        phone: "01700000000",
        password: "mobile-audit-123",
      }),
    });
    const cookie = res.headers.get("set-cookie") || "";
    const m = /ag_session=([^;]+)/.exec(cookie);
    if (m) userToken = m[1];
    try {
      const j = await res.clone().json();
      if (j?.token) userToken = j.token;
    } catch {
      /* body may not be json */
    }
  } catch {
    /* ignore */
  }

  if (!userToken) {
    console.log("\n(skipping signed-in audit: could not create a session)");
  } else {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCookie", {
      name: "ag_session",
      value: userToken,
      domain: "localhost",
      path: "/",
    });
    console.log("\n-- signed-in storefront @390px --");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    for (const route of [
      "/account",
      "/account/orders",
      "/account/addresses",
      "/account/profile",
      "/wishlist",
      "/checkout",
      "/login",
      "/register",
    ]) {
      try {
        await cdp.send("Page.navigate", { url: BASE + route });
        await sleep(1800);
        const v = (
          await cdp.send("Runtime.evaluate", { expression: OVERFLOW_PROBE, returnByValue: true })
        ).result.value;
        const panes = (
          await cdp.send("Runtime.evaluate", {
            expression: "document.querySelectorAll('.scroll-native').length",
            returnByValue: true,
          })
        ).result.value;
        const bad = v.scrollW > v.vw + 1 || v.overflowCount > 0;
        if (bad) problems++;
        console.log(
          `${bad ? "OVERFLOW" : "ok      "} ${route.padEnd(20)} scrollW=${v.scrollW} offenders=${v.overflowCount} scrollPanes=${panes}`,
        );
        if (v.overflowCount) {
          const chain = (
            await cdp.send("Runtime.evaluate", { expression: CHAIN_PROBE, returnByValue: true })
          ).result.value;
          for (const c of chain) {
            console.log(`            ↳ <${c.tag} class="${c.cls}"> w=${c.w} scrollW=${c.scrollW}`);
          }
        }
      } catch (e) {
        console.log(`ERROR    ${route.padEnd(20)} ${e.message}`);
        problems++;
      }
    }
  }

  ws.close();
} catch (e) {
  console.error("audit error:", e.message);
  problems++;
} finally {
  chrome.kill();
  await sleep(1000);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* ignore */
  }
}

console.log(problems === 0 ? "\nNo horizontal overflow at phone widths." : `\n${problems} route/width combo(s) overflowed.`);
process.exit(problems === 0 ? 0 : 1);
