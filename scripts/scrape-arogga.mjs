#!/usr/bin/env node
/**
 * Arogga content harvester
 * - Reads /sitemap/*.xml for category-home URLs
 * - Fetches each category page, extracts embedded product objects from the
 *   Next.js flight stream (self.__next_f chunks)
 * - Fetches homepage for banners, category tiles and SEO copy
 * - Downloads product images + banner images to public/img/...
 * - Emits JSON files under .scrape/out/ used to build the SQLite DB
 *
 * Usage:
 *   node scripts/scrape-arogga.mjs [--quick] [--max-pages N]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".scrape", "out");
const IMG_ROOT = path.join(ROOT, "public", "img");
const QUICK = process.argv.includes("--quick");
const NO_IMAGES = process.argv.includes("--no-images");
const IMAGES_ONLY = process.argv.includes("--images-only");
const maxPagesArg = process.argv.indexOf("--max-pages");
const MAX_CAT_PAGES =
  maxPagesArg > -1 ? parseInt(process.argv[maxPagesArg + 1], 10) : Infinity;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BASE = "https://www.arogga.com";
const CDN = "https://cdn2.arogga.com";

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const agents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
];
let agentIdx = 0;

async function fetchText(url, tries = 3) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": agents[agentIdx % agents.length],
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.text();
      if (res.status === 403 || res.status === 429) {
        agentIdx++;
        await sleep(1500 * (a + 1));
        continue;
      }
    } catch {
      await sleep(1500 * (a + 1));
    }
  }
  return null;
}

/** Join and de-escape Next.js flight chunks from an HTML page. */
function extractFlight(html) {
  const chunks = [
    ...html.matchAll(/self\.__next_f\.push\((\[1,"[\s\S]*?\])\)<\/script>/g),
  ];
  let joined = "";
  for (const c of chunks) {
    try {
      const parsed = JSON.parse(c[1]);
      if (parsed[0] === 1 && typeof parsed[1] === "string") joined += parsed[1];
    } catch {
      /* skip malformed chunk */
    }
  }
  return joined;
}

/** Pull the balanced JSON object starting at position start. */
function extractObject(flight, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < flight.length; i++) {
    const ch = flight[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return flight.slice(start, i + 1);
    }
  }
  return null;
}

/** Pull the balanced array [ ... ] starting at position start. */
function extractArray(flight, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < flight.length; i++) {
    const ch = flight[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return flight.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Resolve React Server Component flight references like "$58" or "$L5d".
 * The flight stream defines them as "58:<json>" rows; we map ref id -> row
 * content so fields like p_description.html can be read.
 */
function buildRefMap(flight) {
  const map = new Map();
  // rows look like: 58:["$",... or 5d:["$","$Lc1",... or 58:"$Lxx"
  const re = /(?:^|\n)([0-9a-zA-Z]+):(?=\[|"|\{|T[0-9a-fA-F]+,)/g;
  let m;
  while ((m = re.exec(flight))) {
    const id = m[1];
    const start = m.index + m[0].length;
    if (flight[start] === "[") {
      const raw = extractArray(flight, start);
      if (raw) map.set(id, raw);
    } else if (flight[start] === '"') {
      const end = flight.indexOf("\n", start);
      map.set(id, flight.slice(start, end > start ? end : undefined));
    } else if (flight[start] === "T") {
      // text chunk row: T<hexlen>,<text...>
      const tMatch = /^T([0-9a-fA-F]+),/.exec(flight.slice(start, start + 24));
      if (tMatch) {
        const len = parseInt(tMatch[1], 16);
        const textStart = start + tMatch[0].length;
        const text = flight.slice(textStart, textStart + len);
        map.set(id, JSON.stringify(text));
      }
    }
  }
  return map;
}

/** If s is a "$N" style ref, return the referenced row's parsed JSON (best effort). */
function resolveRef(s, refMap, depth = 0) {
  if (typeof s !== "string" || !s.startsWith("$") || depth > 3) return s;
  const id = s.slice(1);
  const raw = refMap.get(id);
  if (!raw) return s;
  try {
    const parsed = JSON.parse(raw);
    // recursively resolve nested refs
    return deepResolve(parsed, refMap, depth + 1);
  } catch {
    return s;
  }
}

/** Reduce a resolved flight value (string | array | object) to displayable text. */
function flattenText(v, depth = 0) {
  if (v == null || depth > 8) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => flattenText(x, depth + 1)).join("");
  if (typeof v === "object") {
    if (typeof v.children !== "undefined") return flattenText(v.children, depth + 1);
    if (typeof v.props !== "undefined") return flattenText(v.props, depth + 1);
    return Object.values(v)
      .map((x) => flattenText(x, depth + 1))
      .join("");
  }
  return "";
}

/**
 * Make a flight-stream fragment JSON-parseable by stripping "$ref" values
 * and trailing commas. Concrete data fields survive; refs become null/removed.
 */
function sanitizeFlightJson(s) {
  return s
    .replace(/("(?:[^"\\]|\\.)*")\s*:\s*"\$[A-Za-z0-9_]+"/g, "$1:null")
    .replace(/,?\s*"\$[A-Za-z0-9_]+"/g, "")
    .replace(/,\s*([\]}])/g, "$1");
}

function deepResolve(obj, refMap, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (typeof obj === "string") return resolveRef(obj, refMap, depth);
  if (Array.isArray(obj)) return obj.map((v) => deepResolve(v, refMap, depth + 1));
  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepResolve(v, refMap, depth + 1);
    return out;
  }
  return obj;
}

function parseProducts(flight) {
  const products = [];
  const re = /"product":\{"pv_id":/g;
  let m;
  while ((m = re.exec(flight))) {
    const objStart = m.index + `"product":`.length;
    const raw = extractObject(flight, objStart);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      if (p && p.pv_id && p.p_name) products.push(p);
    } catch {
      /* skip */
    }
  }
  return products;
}function decodeCdnSrc(src) {
  if (!src || !src.includes("cdn2.arogga.com")) return null;
  try {
    const payload = src.split("/")[3];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64").toString("utf8");
    const meta = JSON.parse(json);
    return meta.key || null;
  } catch {
    return null;
  }
}

// CDN only accepts fixed square sizes
function cdnUrl(s3key, size = 300) {
  const allowed = [200, 216, 300, 1000];
  const s = allowed.includes(size) ? size : 300;
  const b64 = Buffer.from(
    JSON.stringify({
      bucket: "arogga",
      key: s3key,
      edits: { resize: { width: s, height: s, fit: "inside" } },
    }),
  ).toString("base64");
  return `${CDN}/${b64}`;
}

async function downloadImage(s3key, destAbs, width = 400) {
  const dest = path.join(IMG_ROOT, destAbs);
  if (fs.existsSync(dest)) return "cached";
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = cdnUrl(s3key, width);
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500) return "too-small";
        fs.writeFileSync(dest, buf);
        return "ok";
      }
    } catch {
      await sleep(800 * (a + 1));
    }
  }
  return "failed";
}

const seenUrls = new Set();
async function harvestCategory(slug) {
  const url = `${BASE}/category-home/${slug}`;
  const html = await fetchText(url);
  if (!html) return [];
  const flight = extractFlight(html);
  return parseProducts(flight);
}

/** ---------------- main ---------------- */
async function main() {
  console.log("== Arogga harvester ==");
  if (IMAGES_ONLY) return imagesOnly();

  async function imagesOnly() {
    const products = JSON.parse(
      fs.readFileSync(path.join(OUT_DIR, "products.json"), "utf8"),
    );
    // Reconstruct s3keys from stored detail data is not possible; images are
    // downloaded during the main run. This mode only retries failures.
    console.log("images-only mode: nothing to retry (keys not persisted)");
  }
  // 1. Sitemap -> category slugs
  const sm = await fetchText(`${BASE}/sitemap.xml`);
  const indexUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const catUrls = new Set();
  const prodUrls = new Set();
  for (const u of indexUrls) {
    await sleep(200);
    const xml = await fetchText(u);
    if (!xml) continue;
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1];
      if (loc.includes("/category-home/")) catUrls.add(loc);
      if (loc.includes("/product/")) prodUrls.add(loc);
    }
  }
  console.log(`Found ${catUrls.size} category urls, ${prodUrls.size} product urls`);

  const products = new Map();
  const categories = new Map();

  // 2. Harvest category pages (carries product objects in flight stream)
  const slugs = [...catUrls]
    .map((u) => u.split("/category-home/")[1].replace(/\/$/, ""))
    .filter(Boolean);
  let done = 0;
  for (const slug of slugs) {
    if (done >= MAX_CAT_PAGES) break;
    done++;
    process.stdout.write(`[${done}/${slugs.length}] ${slug} `);
    const prods = await harvestCategory(slug);
    let fresh = 0;
    for (const p of prods) {
      if (!products.has(p.p_id)) {
        products.set(p.p_id, { ...p, _cat: slug });
        fresh++;
      }
      categories.set(slug, (categories.get(slug) || 0) + 1);
      // remember first-seen category per product
      const rec = products.get(p.p_id);
      if (!rec._cats) rec._cats = new Set();
      rec._cats.add(slug);
      if (!rec._cat) rec._cat = slug;
    }
    console.log(`-> ${prods.length} products (${fresh} new)`);
    await sleep(400);
  }

  // 3. Homepage data: banners, tiles, SEO copy
  console.log("Fetching homepage...");
  const homeHtml = await fetchText(BASE + "/");
  if (homeHtml) {
    const flight = extractFlight(homeHtml);
    fs.writeFileSync(path.join(OUT_DIR, "home-flight.txt"), flight);

    // -- banners from initialBlocks --
    const blocksMatch = flight.match(/"initialBlocks":\[/);
    if (blocksMatch) {
      const arrStart = blocksMatch.index + "initialBlocks:".length;
      const rawArr = extractArray(flight, arrStart);
      let blocks = null;
      try {
        blocks = JSON.parse(sanitizeFlightJson(rawArr));
      } catch {
        // fallback: parse each top-level block object individually
        blocks = [];
        for (let i = 0; i < rawArr.length; i++) {
          if (rawArr[i] === "{") {
            const objRaw = extractObject(rawArr, i);
            if (!objRaw) break;
            i += objRaw.length - 1;
            try {
              blocks.push(JSON.parse(sanitizeFlightJson(objRaw)));
            } catch {
              /* skip block */
            }
          }
        }
      }
      if (blocks && blocks.length) {
        const banners = [];
        for (const b of blocks) {
          const mn = b.block_machine_name || "";
          if (!mn.includes("carousel")) continue;
          for (const d of b.block_data || []) {
            const f0 = (d.file && d.file[0]) || null;
            if (!f0 || !f0.src) continue;
            banners.push({
              title: d.title || d.alt || "",
              subtitle: d.subtitle || "",
              link: d.link || "",
              src: f0.src,
              machine: mn,
            });
            // download banner image
            const key = decodeCdnSrc(f0.src);
            if (key) {
              const name = key.split("/").pop().replace(/[?#].*$/, "");
              await downloadImage(key, path.join("banners", name), 1000);
              banners[banners.length - 1].local = `img/banners/${name}`;
            }
            await sleep(150);
          }
        }
        fs.writeFileSync(path.join(OUT_DIR, "banners.json"), JSON.stringify(banners, null, 2));
        console.log(`Banners: ${banners.length}`);
      }
    }

    // -- SEO copy from rendered HTML --
    const bodyMatch = homeHtml.match(/<body[\s\S]*<\/body>/);
    if (bodyMatch) {
      const text = bodyMatch[0]
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#x27;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const seoIdx = text.indexOf("Most Trusted Online Pharmacy");
      if (seoIdx > -1) {
        const seo = text.slice(Math.max(0, seoIdx - 60), seoIdx + 6000);
        fs.writeFileSync(path.join(OUT_DIR, "seo.json"), JSON.stringify({ text: seo }, null, 2));
        console.log(`SEO text: ${seo.length} chars`);
      }
    }

    // -- category tiles: "All You Need" grid --
    const tiles = [];
    const tileRe =
      /href="(https:\/\/www\.arogga\.com)?(\/category-home\/[a-z0-9-]+)"[\s\S]{0,600}?alt="([^"]+)"/g;
    for (const m of homeHtml.matchAll(tileRe)) {
      tiles.push({ slug: m[2].split("/category-home/")[1], label: m[3] });
    }
    // dedupe
    const tmap = new Map();
    for (const t of tiles) if (!tmap.has(t.slug)) tmap.set(t.slug, t);
    fs.writeFileSync(
      path.join(OUT_DIR, "tiles.json"),
      JSON.stringify([...tmap.values()], null, 2),
    );
    console.log(`Category tiles: ${tmap.size}`);
  }

  // 4. Product detail pages for the first N products (descriptions, images)
  const detailLimit = QUICK ? 40 : 120;
  const productIds = [...products.keys()].slice(0, detailLimit);
  console.log(`Fetching ${productIds.length} product detail pages...`);
  for (let i = 0; i < productIds.length; i++) {
    const id = productIds[i];
    const p = products.get(id);
    const url = `${BASE}/product/${id}/${p.p_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    process.stdout.write(`  [${i + 1}/${productIds.length}] ${id} `);
    const html = await fetchText(url);
    if (!html) {
      console.log("fetch fail");
      continue;
    }
    try {
      const blocks = [
        ...html.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ];
      const ld = blocks.map((b) => JSON.parse(b[1]));
      const ldProd = ld.find((x) => x["@type"] === "Product");
      if (ldProd) {
        const faq = ld.find((x) => x["@type"] === "FAQPage");
        p._detail = {
          description: ldProd.description || "",
          image1000: ldProd.image || "",
          faq: faq ? faq.mainEntity : [],
        };
      }
      const flight = extractFlight(html);
      const dm = flight.match(/"product":\{"id":(\d+),"p_id":/);
      if (dm) {
        const obj = extractObject(flight, dm.index + `"product":`.length);
        const full = JSON.parse(obj);
        const refMap = buildRefMap(flight);
        p.p_short_description = full.p_short_description || "";
        const descRaw =
          full.p_description && typeof full.p_description.html === "string"
            ? resolveRef(full.p_description.html, refMap)
            : "";
        const descHtml = flattenText(descRaw);
        p.p_description_html =
          descHtml && !descHtml.startsWith("$") ? descHtml : "";
        p.p_note1 = full.p_note1 || "";
        p.p_meta_title = full.p_meta_title || "";
        p.p_generic_name = full.p_generic_name || "";
        p.p_rx_req = full.p_rx_req ?? p.p_rx_req ?? 0;
        p.p_manufacturer = full.p_manufacturer || "";
        p.p_cold = full.p_cold ?? 0;
        p.p_view_count = full.p_view_count ?? 0;
        p.p_trending_score = full.p_trending_score ?? 0;
        // all gallery images
        p._gallery = (full.attachedFiles_p_images || []).map(
          (im) => im.s3key,
        );
      }
      console.log("ok");
    } catch (e) {
      console.log("parse fail: " + e.message);
    }
    await sleep(400);
  }

  // 5. Download product images
  if (NO_IMAGES) {
    console.log("Skipping images (--no-images)");
  } else {
  console.log("Downloading images...");
  let imgOk = 0,
    imgFail = 0;
  const imgTasks = [];
  for (const p of products.values()) {
    const keys = (p._gallery && p._gallery.length ? p._gallery : (p.attachedFiles_p_images || []).map(i=>i.s3key)).filter(Boolean);
    p._imgfiles = [];
    keys.slice(0, 3).forEach((k, idx) => {
      const ext = (k.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const name = `${p.p_id}-${idx}.${ext}`;
      imgTasks.push({ key: k, name, p });
      p._imgfiles.push(`img/products/${name}`);
    });
  }
  // concurrent downloads (batches of 8)
  for (let i = 0; i < imgTasks.length; i += 8) {
    const batch = imgTasks.slice(i, i + 8);
    const results = await Promise.all(
      batch.map(async (t) => {
        const r = await downloadImage(t.key, path.join("products", t.name), 300);
        return r === "ok" || r === "cached" ? 1 : 0;
      }),
    );
    imgOk += results.filter(Boolean).length;
    imgFail += results.length - results.filter(Boolean).length;
    if ((i / 8) % 10 === 0)
      console.log(`  images: ${Math.min(i + 8, imgTasks.length)}/${imgTasks.length}`);
  }
  console.log(`Images ok=${imgOk} fail=${imgFail}`);
  }

  // 6. Serialize
  const serializable = [...products.values()].map((p) => ({
    id: p.p_id,
    name: p.p_name,
    slug: p.p_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    type: p.p_type || "",
    form: p.p_form || "",
    strength: p.p_strength || "",
    generic: p.p_generic_name || "",
    brand: p.p_brand_name || p.p_brand || "",
    rx: !!(p.p_rx_req && Number(p.p_rx_req)),
    short_desc: p.p_short_description || "",
    description_html: p.p_description_html || "",
    note: p.p_note1 || "",
    meta_title: p.p_meta_title || "",
    unit_label:
      (p.pv && p.pv[0] && p.pv[0].pu_base_unit_label) || "",
    price: p.pv?.[0]?.pv_b2c_discounted_price ?? 0,
    mrp: p.pv?.[0]?.pv_b2c_mrp ?? 0,
    discount_percent: p.pv?.[0]?.pv_b2c_discount_percent ?? 0,
    stock_status: p.pv?.[0]?.pv_stock_status ?? p.p_stock_status ?? 0,
    rating: p.pv?.[0]?.pv_average_rating ?? 0,
    rating_count: p.pv?.[0]?.pv_total_rating ?? 0,
    cold: !!p.p_cold,
    view_count: p.p_view_count ?? 0,
    trending_score: p.p_trending_score ?? 0,
    category_slug: p._cat || "",
    categories: [...(p._cats || [])],
    images: p._imgfiles || [],
    faq: p._detail?.faq || [],
  }));

  fs.writeFileSync(
    path.join(OUT_DIR, "products.json"),
    JSON.stringify(serializable, null, 1),
  );
  const catStats = [...categories.entries()]
    .map(([slug, n]) => ({ slug, n }))
    .sort((a, b) => b.n - a.n);
  fs.writeFileSync(
    path.join(OUT_DIR, "categories.json"),
    JSON.stringify(catStats, null, 2),
  );
  console.log(`Products saved: ${serializable.length}`);
  console.log("Done. Output in .scrape/out/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
