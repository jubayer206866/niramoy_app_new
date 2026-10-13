#!/usr/bin/env node
/**
 * One-off recovery: files in public/img/products are named
 * "<productId>-<idx>.<ext>" (written during scrape) but products.json lost the
 * image lists. Re-match them by id and persist back to products.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "public", "img", "products");
const OUT = path.join(ROOT, ".scrape", "out", "products.json");

const products = JSON.parse(fs.readFileSync(OUT, "utf8"));

const byId = new Map(products.map((p) => [String(p.id), p]));
const groups = new Map();
for (const f of fs.readdirSync(IMG_DIR)) {
  const m = /^(\d+)-(\d+)\.(jpe?g|png|webp|gif|avif)$/i.exec(f);
  if (!m) continue;
  const id = m[1];
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push({ idx: Number(m[2]), file: f });
}

let matched = 0;
let images = 0;
for (const [id, files] of groups) {
  const p = byId.get(id);
  if (!p) continue;
  files.sort((a, b) => a.idx - b.idx);
  p.images = files.map((f) => `img/products/${f.file}`);
  matched++;
  images += p.images.length;
}

fs.writeFileSync(OUT, JSON.stringify(products, null, 1));
console.log(
  `matched ${matched}/${products.length} products, ${images} images linked`,
);
