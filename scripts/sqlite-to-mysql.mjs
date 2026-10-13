#!/usr/bin/env node
/**
 * Copy SQLite data into the MySQL database used by the server.
 *
 *   node scripts/sqlite-to-mysql.mjs                 # catalogue + store data
 *   node scripts/sqlite-to-mysql.mjs --catalogue     # only reload the catalogue
 *   node scripts/sqlite-to-mysql.mjs --users         # only copy store data
 *   options: --catalogue-db <file> (default data/arogga.db)
 *            --users-db <file>     (default data/users.db)
 *            --force               (store data: wipe existing MySQL rows first)
 *            --if-empty            (catalogue: skip if MySQL already has products)
 *
 * Catalogue: products, categories, banners, FAQs and site text are replaced
 * wholesale (this is also how a fresh harvest from `npm run db:build` gets
 * loaded), then admin overrides are replayed on top.
 * Store data: users, sessions, addresses, orders, wishlist, reviews and admin
 * overrides are copied with their ids. Refuses to run over existing rows
 * unless --force is given.
 *
 * Images are not touched - they stay in public/img and only paths are copied.
 * Uses the same MYSQL_* environment variables as the server.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import db, { ensureSchema } from "../server/db.mjs";
import { syncOverrides } from "../server/admin-overrides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const onlyCatalogue = args.includes("--catalogue");
const onlyUsers = args.includes("--users");
const doCatalogue = onlyCatalogue || !onlyUsers;
const doUsers = onlyUsers || !onlyCatalogue;
const force = args.includes("--force");
const ifEmpty = args.includes("--if-empty");
const catalogueDb = path.resolve(ROOT, opt("--catalogue-db", "data/arogga.db"));
const usersDb = path.resolve(ROOT, opt("--users-db", "data/users.db"));

const BATCH_ROWS = 1000;
const BATCH_BYTES = 4 * 1024 * 1024;

/** SQLite stored ISO strings ("...Z") and a few `datetime('now')` UTC strings. */
function toDate(v) {
  if (v == null || v === "") return null;
  const s = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(" ", "T")}Z` : s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function copyTable(conn, sqlite, table, cols, { dates = [], orderBy = "rowid" } = {}) {
  const present = new Set(sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  if (!present.size) {
    console.log(`  ${table}: not in source, skipped`);
    return 0;
  }
  const use = cols.filter((c) => present.has(c));
  const dateSet = new Set(dates);
  const colSql = use.map((c) => `\`${c}\``).join(",");
  const insert = `INSERT INTO \`${table}\` (${colSql}) VALUES ?`;

  let batch = [];
  let bytes = 0;
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    await conn.query(insert, [batch]);
    total += batch.length;
    batch = [];
    bytes = 0;
  };

  const select = sqlite.prepare(`SELECT ${use.map((c) => `"${c}"`).join(",")} FROM ${table} ORDER BY ${orderBy}`);
  for (const row of select.iterate()) {
    const values = use.map((c) => (dateSet.has(c) ? toDate(row[c]) : row[c]));
    for (const v of values) if (typeof v === "string") bytes += v.length * 2;
    batch.push(values);
    if (batch.length >= BATCH_ROWS || bytes >= BATCH_BYTES) await flush();
  }
  await flush();
  console.log(`  ${table}: ${total} rows`);
  return total;
}

async function importUsers(conn) {
  if (!fs.existsSync(usersDb)) {
    console.log(`store data: ${usersDb} not found, skipped`);
    return;
  }
  const tables = ["admin_overrides", "reviews", "wishlist", "order_items", "orders", "addresses", "sessions", "users"];
  const existing = (await conn.query("SELECT COUNT(*) n FROM users"))[0][0].n;
  if (existing && !force) {
    console.log(`store data: MySQL already has ${existing} user(s); skipped (use --force to replace)`);
    return;
  }
  console.log(`store data <- ${usersDb}`);
  const sqlite = new Database(usersDb, { readonly: true });
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const t of tables) await conn.query(`DELETE FROM \`${t}\``);
    await copyTable(conn, sqlite, "users",
      ["id", "name", "email", "phone", "password_hash", "role", "created_at", "updated_at"],
      { dates: ["created_at", "updated_at"] });
    await copyTable(conn, sqlite, "sessions",
      ["token_hash", "user_id", "created_at", "expires_at", "user_agent"],
      { dates: ["created_at", "expires_at"] });
    await copyTable(conn, sqlite, "addresses",
      ["id", "user_id", "label", "name", "phone", "address", "city", "area", "is_default", "created_at"],
      { dates: ["created_at"] });
    await copyTable(conn, sqlite, "orders",
      ["id", "user_id", "name", "phone", "email", "address", "city", "note", "payment_method",
        "subtotal", "delivery_fee", "discount", "total", "items_count", "status", "created_at"],
      { dates: ["created_at"] });
    await copyTable(conn, sqlite, "order_items",
      ["id", "order_id", "product_id", "name", "slug", "unit_label", "image", "price", "mrp", "qty"]);
    await copyTable(conn, sqlite, "wishlist", ["user_id", "product_id", "created_at"], { dates: ["created_at"] });
    await copyTable(conn, sqlite, "reviews",
      ["id", "product_id", "user_id", "rating", "body", "created_at"],
      { dates: ["created_at"] });
    await copyTable(conn, sqlite, "admin_overrides",
      ["entity", "key", "row", "meta", "updated_at", "updated_by"],
      { dates: ["updated_at"] });
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    sqlite.close();
  }
}

async function importCatalogue(conn) {
  if (ifEmpty) {
    const existing = (await conn.query("SELECT COUNT(*) n FROM products"))[0][0].n;
    if (existing) {
      console.log(`catalogue: MySQL already has ${existing} product(s); skipped (--if-empty)`);
      return false;
    }
  }
  if (!fs.existsSync(catalogueDb)) throw new Error(`catalogue database not found: ${catalogueDb}`);
  console.log(`catalogue <- ${catalogueDb}`);
  const sqlite = new Database(catalogueDb, { readonly: true });
  try {
    for (const t of ["faqs", "product_categories", "products", "banners", "categories", "site_text"]) {
      await conn.query(`TRUNCATE TABLE \`${t}\``);
    }
    await copyTable(conn, sqlite, "categories", ["id", "slug", "name", "icon", "has_page"]);
    await copyTable(conn, sqlite, "banners", ["id", "title", "subtitle", "link", "image", "machine"]);
    await copyTable(conn, sqlite, "products", [
      "id", "slug", "name", "type", "form", "strength", "generic", "brand", "rx",
      "short_desc", "description_html", "note", "meta_title", "unit_label", "price",
      "mrp", "discount_percent", "stock_status", "rating", "rating_count", "cold",
      "view_count", "trending_score", "image", "images", "hidden",
    ]);
    await copyTable(conn, sqlite, "product_categories", ["product_id", "category_slug"]);
    await copyTable(conn, sqlite, "faqs", ["id", "product_id", "question", "answer"], { orderBy: "id" });
    await copyTable(conn, sqlite, "site_text", ["key", "value"]);
  } finally {
    sqlite.close();
  }
  return true;
}

const started = Date.now();
await ensureSchema();
const conn = await db.pool.getConnection();
try {
  if (doUsers) await importUsers(conn);
  if (doCatalogue && (await importCatalogue(conn))) {
    const applied = await syncOverrides();
    console.log(`admin overrides replayed: ${applied}`);
  }
} finally {
  conn.release();
}

const counts = {};
for (const t of ["products", "product_categories", "faqs", "categories", "banners", "site_text",
  "users", "orders", "order_items", "addresses", "wishlist", "reviews", "admin_overrides"]) {
  counts[t] = (await db.get(`SELECT COUNT(*) n FROM \`${t}\``)).n;
}
console.table(counts);
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
await db.pool.end();
