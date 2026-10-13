#!/usr/bin/env node
/**
 * Merge the full-catalog harvest into .scrape/out/products.json
 * (the file that scripts/build-db.mjs consumes).
 *
 * Sources:
 *   .scrape/out/products-full.jsonl  full records (own product pages) - preferred
 *   .scrape/out/cards.jsonl          slim records (related-product cards) - gap fill
 *   .scrape/out/images.json          optional { "<id>": ["img/products/<id>-<i>.<ext>"] }
 *
 * Rules:
 *  - dedupe by product id, full records always win over cards
 *  - unique slugs (append -<id> on collision), so build-db's UNIQUE index holds
 *  - categories derived from the product `type` via TYPE_TO_CATEGORY
 *  - `images` (local paths) come from the images manifest; `image_s3keys` is kept
 *    so the image downloader can run afterwards and be merged in on a re-run
 *
 * Usage: node scripts/merge-full.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".scrape", "out");

const FULL_IN = path.join(OUT, "products-full.jsonl");
const CARDS_IN = path.join(OUT, "cards.jsonl");
const MANIFEST_IN = path.join(OUT, "images.json");
const DEST = path.join(OUT, "products.json");

/** Arogga product type -> local category slug (see .scrape/out/tiles.json). */
export const TYPE_TO_CATEGORY = {
  medicine: "medicines",
  medicines: "medicines",
  beauty: "beauty",
  healthcare: "healthcare",
  "baby_&_mom_care": "baby-mom-care",
  baby_mom_care: "baby-mom-care",
  food: "food",
  supplement: "supplement",
  veterinary: "veterinary",
  home_care: "homecare",
  homecare: "homecare",
  herbal: "herbal",
  ayurvedic: "herbal",
  "pet_&_vet": "pet-care",
  pet_care: "pet-care",
  sexual_wellness: "sexual-wellness",
  homeopathy: "homeopathy",
  fragrance: "fragrance",
};

const slugify = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

function loadManifest() {
  if (!fs.existsSync(MANIFEST_IN)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_IN, "utf8"));
  } catch {
    console.warn("images.json unreadable - continuing without local images");
    return {};
  }
}

const manifest = loadManifest();
const manifestHits = Object.keys(manifest).length;

function categoriesFor(type) {
  const slug = TYPE_TO_CATEGORY[type];
  return slug ? [slug] : [];
}

/* --------------------------------------------------------------- descriptions */

/** Category slugs whose products are dispensed medicines (pharmacy phrasing). */
const MEDICINE_CATS = new Set([
  "medicines",
  "homeopathy",
  "herbal",
  "supplement",
  "veterinary",
]);

const CATEGORY_LABELS = {
  medicines: "pharmacy",
  beauty: "beauty and personal care",
  healthcare: "health and medical devices",
  "baby-mom-care": "baby and mother care",
  food: "food and nutrition",
  supplement: "nutritional supplement",
  veterinary: "veterinary",
  homecare: "home care",
  herbal: "herbal",
  "pet-care": "pet care",
  "sexual-wellness": "sexual wellness",
  homeopathy: "homeopathy",
  fragrance: "fragrance",
};

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Some early RSC text rows over-ran their declared byte length, so a slice of
 * React-flight protocol (`45:["$","$7",null,{"fallback"...`) ended up glued
 * onto the harvested HTML for ~12k products. Cut the payload at the first
 * protocol marker and tidy up the stray quote/comma left behind.
 */
const FLIGHT_MARKERS = [
  /\d{1,8}:\s*[\[{"$]/,
  /\d{1,8}:T\d+,/,
  /"\$[A-Za-z]?\d*"(?=[,\]}])/,
  /"fallback":/,
  /\$L[a-f0-9]{4,}/,
];

function sanitizeHtml(html) {
  if (!html) return html;
  let out = String(html);
  for (const re of FLIGHT_MARKERS) {
    const i = out.search(re);
    if (i > -1) out = out.slice(0, i);
  }
  return out
    .replace(/\s*\d{1,8}:\s*[\[{"$]?\s*$/, "")
    .replace(/[\s,"'\\]+$/, "")
    .replace(/([^\s<>])[,\s]*"\s*(?=<\/(?:p|div|li|ul|ol|h[1-6])>)/gi, "$1")
    .trim();
}

/** Clean the harvested copy, then fall back to generated copy when too short. */
function sanitizeDescription(r, cat) {
  const cleaned = sanitizeHtml(r.description_html || "");
  return cleaned.length >= 20 ? cleaned : buildDescription(r, cat);
}

const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");

/**
 * Roughly a third of the source catalogue ships without any product copy
 * (arogga.com itself only renders its meta boilerplate). Rather than leave
 * those pages blank we build an honest, attribute-driven description from the
 * structured fields we did harvest - no invented medical claims.
 */
function buildDescription(r, cat) {
  const name = esc(r.name);
  const generic = esc(r.generic);
  const form = esc(r.form);
  const strength = esc(r.strength);
  const brand = esc(r.brand);
  const unit = esc(r.unit_label);

  const rows = [
    ["Generic name", generic],
    ["Dosage form", form],
    ["Strength", strength],
    ["Manufacturer", brand],
    ["Pack size", unit],
  ].filter(([, v]) => v);

  const isMedicine = MEDICINE_CATS.has(cat) || (!!generic && cat === "medicines");
  const label = CATEGORY_LABELS[cat] || "healthcare";

  const opening = isMedicine
    ? `<p><strong>${name}</strong> is ${article(form || "medicine")} ${
        form ? form.toLowerCase() : "medicine"
      }${generic ? ` containing <strong>${generic}</strong>` : ""}${
        strength ? ` ${strength}` : ""
      }${brand ? `, manufactured by <strong>${brand}</strong>` : ""}.</p>`
    : `<p><strong>${name}</strong>${brand ? ` by <strong>${brand}</strong>` : ""} is part of our ${label} range${
        unit ? `, supplied as ${unit}` : ""
      }.</p>`;

  const list = rows.length
    ? `<ul>${rows.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join("")}${
        isMedicine ? `<li><strong>Prescription:</strong> ${r.rx ? "Required" : "Not required"}</li>` : ""
      }</ul>`
    : "";

  const body = isMedicine
    ? `<p>${
        r.rx
          ? "A valid prescription from a registered physician is required before this medicine can be dispensed."
          : "This item can be ordered without a prescription."
      } ${unit ? `Each pack is listed as ${unit}.` : ""} Take it exactly as directed by your doctor or pharmacist.</p>
<p><strong>Storage:</strong> keep in a cool, dry place away from direct sunlight and out of reach of children${r.cold ? ". This product needs cold-chain storage and is shipped in temperature-controlled packaging" : ""}.</p>`
    : `<p>Genuine stock sourced from licensed distributors and dispatched from our own warehouse${unit ? `, with each unit listed as ${unit}` : ""}. Please follow the instructions printed on the pack.</p>`;

  const disclaimer = `<p><em>This information is provided for general reference and is not a substitute for professional medical advice. This is a demo storefront built for learning purposes.</em></p>`;

  return `${opening}${list}${body}${disclaimer}`;
}

function buildShortDescription(r) {
  const bits = [r.name];
  if (r.generic) bits.push(r.generic);
  const detail = [r.form, r.strength].filter(Boolean).join(" ");
  if (detail) bits.push(detail);
  if (r.brand) bits.push(r.brand);
  return `${bits.join(" \u00b7 ")} \u2014 order online with cash on delivery from Niramoy Pharmacy.`.slice(0, 200);
}

function normalize(r, isFull, images) {
  const price = r.price ?? 0;
  return {
    id: r.id,
    slug: "", // assigned later (uniqueness)
    name: r.name || `Product ${r.id}`,
    type: r.type || "",
    form: r.form || "",
    strength: r.strength || "",
    generic: r.generic || "",
    brand: r.brand || "",
    rx: !!r.rx,
    short_desc: r.short_desc?.trim() ? r.short_desc : buildShortDescription(r),
    description_html: sanitizeDescription(r, TYPE_TO_CATEGORY[r.type] || ""),
    note: r.note || "",
    meta_title: r.meta_title || "",
    unit_label: r.unit_label || "",
    price,
    mrp: r.mrp ?? price,
    discount_percent: r.discount_percent ?? 0,
    stock_status: r.stock_status ?? 0,
    rating: r.rating ?? 0,
    rating_count: r.rating_count ?? 0,
    cold: !!r.cold,
    view_count: r.view_count ?? 0,
    trending_score: r.trending_score ?? 0,
    categories: categoriesFor(r.type),
    images,
    image_s3keys: r.image_s3keys || [],
    faq: isFull ? r.faq || [] : [],
    source: isFull ? "full" : "card",
  };
}

function* readLines(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) if (line) yield line;
}

function main() {
  if (!fs.existsSync(FULL_IN) && !fs.existsSync(CARDS_IN)) {
    console.error("nothing to merge: run scripts/scrape-full.mjs first");
    process.exit(1);
  }

  const seen = new Set();
  const slugs = new Set();
  let full = 0;
  let cards = 0;
  let dupes = 0;
  const byType = {};
  const byCat = {};

  const tmp = DEST + ".tmp";
  const ws = fs.createWriteStream(tmp, { encoding: "utf8" });
  ws.write("[\n");
  let first = true;

  const emit = (rec) => {
    const base = slugify(rec.name) || `product-${rec.id}`;
    let slug = base;
    if (slugs.has(slug)) slug = `${base}-${rec.id}`;
    let n = 1;
    while (slugs.has(slug)) slug = `${base}-${rec.id}-${n++}`;
    slugs.add(slug);
    rec.slug = slug;

    byType[rec.type] = (byType[rec.type] || 0) + 1;
    for (const c of rec.categories) byCat[c] = (byCat[c] || 0) + 1;

    ws.write((first ? "" : ",\n") + JSON.stringify(rec));
    first = false;
  };

  const push = (raw, isFull) => {
    let r;
    try {
      r = JSON.parse(raw);
    } catch {
      return;
    }
    if (!r || !r.id) return;
    if (seen.has(r.id)) {
      dupes++;
      return;
    }
    seen.add(r.id);
    const images = manifest[r.id] || [];
    emit(normalize(r, isFull, images));
    if (isFull) full++;
    else cards++;
  };

  if (fs.existsSync(FULL_IN)) {
    for (const line of readLines(FULL_IN)) push(line, true);
  }
  console.log(`full records: ${full}`);
  if (fs.existsSync(CARDS_IN)) {
    for (const line of readLines(CARDS_IN)) push(line, false);
  }
  console.log(`card-only records: ${cards}`);
  console.log(`duplicate ids skipped: ${dupes}`);

  ws.write("\n]\n");
  ws.end();

  ws.on("finish", () => {
    fs.renameSync(tmp, DEST);
    const bytes = fs.statSync(DEST).size;
    console.log(`wrote ${DEST} (${(bytes / 1048576).toFixed(1)} MB)`);
    console.log(`products: ${seen.size} | unique slugs: ${slugs.size}`);
    console.log(`images manifest: ${manifestHits} products with local images`);
    console.log("\nby type:");
    for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k || "(none)"}: ${v}`);
    }
    console.log("\nby category:");
    for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${v}`);
    }
  });
}

main();
