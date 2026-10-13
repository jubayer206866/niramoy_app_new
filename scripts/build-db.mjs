#!/usr/bin/env node
/**
 * Build the local SQLite database (data/arogga.db) from harvested JSON
 * in .scrape/out/. Creates tables: categories, banners, products,
 * product_categories, faqs, site_text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".scrape", "out");
const DATA_DIR = path.join(ROOT, "data");

const read = (f) =>
  fs.existsSync(path.join(OUT, f))
    ? JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"))
    : [];

const products = read("products.json");
const banners = read("banners.json");
const tiles = read("tiles.json");
const seo = read("seo.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "arogga.db");
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  has_page INTEGER DEFAULT 1
);
CREATE TABLE banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  subtitle TEXT,
  link TEXT,
  image TEXT,
  machine TEXT
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  form TEXT,
  strength TEXT,
  generic TEXT,
  brand TEXT,
  rx INTEGER DEFAULT 0,
  short_desc TEXT,
  description_html TEXT,
  note TEXT,
  meta_title TEXT,
  unit_label TEXT,
  price REAL NOT NULL,
  mrp REAL,
  discount_percent REAL DEFAULT 0,
  stock_status INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  cold INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  trending_score REAL DEFAULT 0,
  image TEXT,
  images TEXT
);
CREATE TABLE product_categories (
  product_id INTEGER NOT NULL,
  category_slug TEXT NOT NULL,
  PRIMARY KEY (product_id, category_slug)
);
CREATE TABLE faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL
);
CREATE TABLE site_text (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX idx_pc_cat ON product_categories(category_slug);
CREATE INDEX idx_prod_type ON products(type);
CREATE INDEX idx_prod_name ON products(name);
CREATE INDEX idx_prod_price ON products(price);
CREATE INDEX idx_prod_trending ON products(trending_score);
CREATE INDEX idx_faqs_product ON faqs(product_id);
`);

const insCat = db.prepare(
  "INSERT INTO categories (slug,name,icon,has_page) VALUES (?,?,?,?)",
);
const insBanner = db.prepare(
  "INSERT INTO banners (title,subtitle,link,image,machine) VALUES (?,?,?,?,?)",
);
const insProd = db.prepare(`INSERT INTO products (
  id,slug,name,type,form,strength,generic,brand,rx,short_desc,description_html,
  note,meta_title,unit_label,price,mrp,discount_percent,stock_status,rating,
  rating_count,cold,view_count,trending_score,image,images
) VALUES (
  @id,@slug,@name,@type,@form,@strength,@generic,@brand,@rx,@short_desc,@description_html,
  @note,@meta_title,@unit_label,@price,@mrp,@discount_percent,@stock_status,@rating,
  @rating_count,@cold,@view_count,@trending_score,@image,@images
)`);
const insPC = db.prepare(
  "INSERT OR IGNORE INTO product_categories (product_id,category_slug) VALUES (?,?)",
);
const insFaq = db.prepare(
  "INSERT INTO faqs (product_id,question,answer) VALUES (?,?,?)",
);
const insText = db.prepare(
  "INSERT INTO site_text (key,value) VALUES (?,?)",
);

db.transaction(() => {
  for (const t of tiles) {
    insCat.run(t.slug, t.label, t.icon, t.has_page === false ? 0 : 1);
  }
  for (const b of banners) {
    insBanner.run(
      b.title || "",
      b.subtitle || "",
      b.link || "",
      b.local || b.src || "",
      b.machine || "",
    );
  }
  // type -> category slug normalization for mapping products to tiles.
  // Keys mirror the `p_type` values used by arogga.com (see scripts/merge-full.mjs).
  const typeToSlug = {
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
  for (const p of products) {
    const images = Array.isArray(p.images) ? p.images : [];
    const firstCat =
      Array.isArray(p.categories) && p.categories.length
        ? p.categories[0]
        : null;
    const cats = new Set(p.categories || []);
    if (p.category_slug) cats.add(p.category_slug);
    const mapped = typeToSlug[p.type];
    if (mapped) cats.add(mapped);
    if (cats.size === 0 && firstCat) cats.add(firstCat);
    insProd.run({
      id: p.id,
      slug: p.slug,
      name: p.name,
      type: p.type || "",
      form: p.form || "",
      strength: p.strength || "",
      generic: p.generic || "",
      brand: p.brand || "",
      rx: p.rx ? 1 : 0,
      short_desc: p.short_desc || "",
      description_html: p.description_html || "",
      note: p.note || "",
      meta_title: p.meta_title || "",
      unit_label: p.unit_label || "",
      price: p.price ?? 0,
      mrp: p.mrp ?? p.price ?? 0,
      discount_percent: p.discount_percent ?? 0,
      stock_status: p.stock_status ?? 0,
      rating: p.rating ?? 0,
      rating_count: p.rating_count ?? 0,
      cold: p.cold ? 1 : 0,
      view_count: p.view_count ?? 0,
      trending_score: p.trending_score ?? 0,
      image: images[0] || "",
      images: JSON.stringify(images),
    });
    for (const c of cats) {
      if (c) insPC.run(p.id, c);
    }
    for (const f of p.faq || []) {
      // harvest emits {question, answer}; older dumps emitted JSON-LD {name, acceptedAnswer}
      const q = f?.question ?? f?.name;
      const a = f?.answer ?? f?.acceptedAnswer?.text;
      if (q && a) insFaq.run(p.id, q, a);
    }
  }
  // Any category that actually holds products gets a working local listing page.
  db.prepare(
    `UPDATE categories SET has_page = 1
     WHERE slug IN (SELECT DISTINCT category_slug FROM product_categories)`,
  ).run();

  for (const [k, v] of Object.entries({
    seo_text: seo.text || "",
    phone: "16778",
    whatsapp: "01810117100",
    tagline:
      "Buy Medicine, Beauty & Healthcare Products Online in Bangladesh",
  })) {
    insText.run(k, v);
  }
})();

const counts = {
  categories: db.prepare("SELECT COUNT(*) n FROM categories").get().n,
  banners: db.prepare("SELECT COUNT(*) n FROM banners").get().n,
  products: db.prepare("SELECT COUNT(*) n FROM products").get().n,
  product_categories: db.prepare("SELECT COUNT(*) n FROM product_categories").get().n,
  faqs: db.prepare("SELECT COUNT(*) n FROM faqs").get().n,
  site_text: db.prepare("SELECT COUNT(*) n FROM site_text").get().n,
};
console.log("DB built at", DB_PATH);
console.table(counts);
db.close();
