#!/usr/bin/env node
/**
 * Full-catalog harvester for arogga.com via the Next.js RSC (?_rsc) route.
 *
 * Each fetched page yields:
 *  - the page's OWN product (full: description html, short_desc, note, rx,
 *    cold, views, trending, FAQ, gallery s3keys)
 *  - ~130 related-product CARDS (slim: name, brand, type, form, strength,
 *    prices, stock, rating, unit, image s3keys)
 *
 * When the RSC response is only a shell (no product payload) the page HTML is
 * fetched instead and the flight chunks embedded in it are parsed - see
 * scripts/rsc-parse.mjs for the row format (text rows are length-delimited in
 * UTF-8 BYTES, which newline-based splitting gets wrong).
 *
 * Outputs (all resumable, JSONL append):
 *  - .scrape/out/sitemap-urls.json  : [{id, slug}] full sitemap product list
 *  - .scrape/out/products-full.jsonl: full records (own pages)
 *  - .scrape/out/cards.jsonl        : slim records (cards)
 *  - .scrape/out/failed.jsonl       : fetch failures
 *
 * Usage:
 *   node scripts/scrape-full.mjs [--max-pages N] [--time-budget SEC] [--concurrency N]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePage, flightFromHtml } from "./rsc-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".scrape", "out");

const BASE = "https://www.arogga.com";
const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
];
let uaIdx = 0;

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? parseInt(process.argv[i + 1], 10) : def;
};
const MAX_PAGES = arg("--max-pages", 4000);
const TIME_BUDGET = arg("--time-budget", 480); // seconds
const CONCURRENCY = arg("--concurrency", 5);

const startedAt = Date.now();
const deadline = startedAt + TIME_BUDGET * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => sleep(ms * (0.75 + Math.random() * 0.5));

// ---------- fetching ----------
const SITEMAP_CACHE = path.join(OUT, "sitemap-urls.json");

async function fetchText(url, extraHeaders = {}, tries = 3) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UAS[uaIdx % UAS.length],
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          ...extraHeaders,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.text();
      if (res.status === 403 || res.status === 429) {
        uaIdx++;
        await sleep(2000 * (a + 1));
        continue;
      }
      if (res.status === 404) return null;
    } catch {
      await sleep(1200 * (a + 1));
    }
  }
  return null;
}

async function loadSitemapUrls() {
  if (fs.existsSync(SITEMAP_CACHE)) {
    console.log("sitemap cache hit");
    return JSON.parse(fs.readFileSync(SITEMAP_CACHE, "utf8"));
  }
  console.log("fetching sitemap index...");
  const indexXml = await fetchText(`${BASE}/sitemap.xml`);
  const children = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  const seen = new Set();
  for (const child of children) {
    const xml = await fetchText(child);
    if (!xml) continue;
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1];
      const pm = loc.match(/\/product\/(\d+)\/([a-z0-9-]+)/);
      if (pm && !seen.has(pm[1])) {
        seen.add(pm[1]);
        urls.push({ id: Number(pm[1]), slug: pm[2] });
      }
    }
    console.log(`  ${child.split("/").pop()}: total ${urls.length}`);
    await jitter(250);
  }
  fs.writeFileSync(SITEMAP_CACHE, JSON.stringify(urls));
  console.log(`sitemap urls: ${urls.length}`);
  return urls;
}

// ---------- record mapping ----------
const slugify = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function mapOwn(p, resolveRef) {
  const pv = p.pv?.[0] || {};
  const descRaw = p.p_description && typeof p.p_description.html === "string" ? p.p_description.html : "";
  const descHtml = descRaw.startsWith("$") ? resolveRef(descRaw) : descRaw;
  return {
    id: p.p_id,
    name: p.p_name || "",
    slug: slugify(p.p_name),
    type: p.p_type || "",
    form: p.p_form || "",
    strength: p.p_strength || "",
    generic: p.p_generic_name || "",
    brand: p.p_brand_name || p.p_brand || "",
    rx: !!(p.p_rx_req && Number(p.p_rx_req)),
    short_desc: p.p_short_description || "",
    description_html: descHtml.includes("<") ? descHtml : "",
    note: p.p_note1 || "",
    meta_title: p.p_meta_title || "",
    unit_label: pv.pu_base_unit_label || "",
    price: pv.pv_b2c_discounted_price ?? 0,
    mrp: pv.pv_b2c_mrp ?? 0,
    discount_percent: pv.pv_b2c_discount_percent ?? 0,
    stock_status: pv.pv_stock_status ?? 0,
    rating: pv.pv_average_rating ?? 0,
    rating_count: pv.pv_total_rating ?? 0,
    cold: !!p.p_cold,
    view_count: p.p_view_count ?? 0,
    trending_score: p.p_trending_score ?? 0,
    image_s3keys: (p.attachedFiles_p_images || []).map((x) => x.s3key).filter(Boolean),
    _src: "own",
  };
}

function mapCard(p) {
  const pv = p.pv?.[0] || {};
  return {
    id: p.p_id,
    name: p.p_name || "",
    slug: slugify(p.p_name),
    type: p.p_type || "",
    form: p.p_form || "",
    strength: p.p_strength || "",
    brand: p.p_brand_name || p.p_brand || "",
    meta_title: p.p_meta_title || "",
    unit_label: pv.pu_base_unit_label || "",
    price: pv.pv_b2c_discounted_price ?? 0,
    mrp: pv.pv_b2c_mrp ?? 0,
    discount_percent: pv.pv_b2c_discount_percent ?? 0,
    stock_status: pv.pv_stock_status ?? 0,
    rating: pv.pv_average_rating ?? 0,
    rating_count: pv.pv_total_rating ?? 0,
    image_s3keys: (p.attachedFiles_p_images || []).map((x) => x.s3key).filter(Boolean),
    _src: "card",
  };
}

// ---------- resume state ----------
const FULL_OUT = path.join(OUT, "products-full.jsonl");
const CARDS_OUT = path.join(OUT, "cards.jsonl");
const FAILED_OUT = path.join(OUT, "failed.jsonl");

function loadDoneIds() {
  const done = new Set();
  for (const file of [FULL_OUT, FAILED_OUT]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      try {
        done.add(JSON.parse(line).id);
      } catch {
        /* skip */
      }
    }
  }
  return done;
}

function appendLine(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

/** Fetch one product page: RSC first, HTML as fallback when the RSC body has no payload. */
async function fetchProduct(item) {
  const pageUrl = `${BASE}/product/${item.id}/${item.slug}`;
  const rsc = await fetchText(`${pageUrl}?_rsc=hv${item.id}`, { RSC: "1" });

  let own = null;
  let faq = [];
  let cards = [];
  let resolveRef = () => "";
  let via = "rsc";

  if (rsc) {
    const p = parsePage(rsc, item.id);
    own = p.own;
    faq = p.faq;
    cards = p.cards;
    resolveRef = p.resolveRef;
  }

  if (!own) {
    const html = await fetchText(pageUrl);
    if (html) {
      const p = parsePage(flightFromHtml(html), item.id);
      if (p.own) {
        own = p.own;
        faq = p.faq;
        resolveRef = p.resolveRef;
        if (cards.length === 0) cards = p.cards;
        via = "html";
      }
    }
  }

  return { own, faq, cards, resolveRef, via };
}

// ---------- worker pool ----------
async function main() {
  console.log(`== Full harvest == max ${MAX_PAGES} pages, budget ${TIME_BUDGET}s, ${CONCURRENCY} workers`);

  const urls = await loadSitemapUrls();
  const done = loadDoneIds();
  const queue = urls.filter((u) => !done.has(u.id));
  console.log(`already done: ${done.size}; remaining queue: ${queue.length}`);

  let cursor = 0;
  let pagesFetched = 0;
  let cardInserts = 0;
  let htmlFallbacks = 0;
  const seenCardIds = new Set();

  const cardFd = fs.openSync(CARDS_OUT, "a");

  async function worker(wid) {
    while (cursor < queue.length && Date.now() < deadline && pagesFetched < MAX_PAGES) {
      const item = queue[cursor++];
      try {
        const { own, faq, cards, resolveRef, via } = await fetchProduct(item);
        if (via === "html") htmlFallbacks++;

        if (own && own.p_id) {
          const rec = mapOwn(own, resolveRef);
          rec.faq = faq;
          appendLine(FULL_OUT, rec);
        } else {
          appendLine(FAILED_OUT, { id: item.id, slug: item.slug, why: "no-own-object" });
        }

        for (const c of cards) {
          if (seenCardIds.has(c.p_id)) continue;
          seenCardIds.add(c.p_id);
          fs.writeSync(cardFd, JSON.stringify(mapCard(c)) + "\n");
          cardInserts++;
        }
      } catch (e) {
        appendLine(FAILED_OUT, { id: item.id, slug: item.slug, why: "parse:" + e.message.slice(0, 80) });
      }

      pagesFetched++;
      if (pagesFetched % 50 === 0) {
        const rate = pagesFetched / ((Date.now() - startedAt) / 1000);
        const remain = Math.min(queue.length - cursor, MAX_PAGES - pagesFetched);
        console.log(
          `[w${wid}] ${pagesFetched} pages | +${seenCardIds.size} cards | cursor ${cursor}/${queue.length} | ${rate.toFixed(2)} p/s | html-fallback ${htmlFallbacks} | eta ${Math.round(remain / Math.max(rate, 0.01))}s`,
        );
      }
      await jitter(220);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  fs.closeSync(cardFd);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\ndone: ${pagesFetched} pages in ${elapsed}s (${(pagesFetched / Math.max(+elapsed, 1)).toFixed(2)} p/s)`);
  console.log(`new cards written: ${cardInserts} | html fallbacks used: ${htmlFallbacks}`);
  console.log(`resume: rerun the same command to continue from where it stopped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
