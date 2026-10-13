#!/usr/bin/env node
/**
 * Download every product image from the arogga CDN into public/img/products/.
 *
 * Naming follows the existing local convention: <productId>-<index>.<ext>
 * e.g. public/img/products/44665-0.jpeg
 *
 * Resumable: files already on disk (any known extension) are skipped, and the
 * manifest .scrape/out/images.json is rewritten periodically so an interrupted
 * run can just be restarted. merge-full.mjs reads that manifest to fill `images`.
 *
 * Usage:
 *   node scripts/download-images.mjs [--size 300] [--concurrency 8]
 *                                    [--limit N] [--time-budget SEC]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".scrape", "out");
const IMG_ROOT = path.join(ROOT, "public");
const DEST_DIR = path.join(IMG_ROOT, "img", "products");
const PRODUCTS = path.join(OUT, "products.json");
const MANIFEST = path.join(OUT, "images.json");

const CDN = "https://cdn2.arogga.com";
const EXTS = ["jpeg", "jpg", "png", "webp", "avif", "gif"];

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? parseInt(process.argv[i + 1], 10) : def;
};
const SIZE = [200, 216, 300, 1000].includes(arg("--size", 300)) ? arg("--size", 300) : 300;
const CONCURRENCY = arg("--concurrency", 8);
const LIMIT = arg("--limit", 0);
const TIME_BUDGET = arg("--time-budget", 3600);

const startedAt = Date.now();
const deadline = startedAt + TIME_BUDGET * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdnUrl(s3key, size = SIZE) {
  const b64 = Buffer.from(
    JSON.stringify({
      bucket: "arogga",
      key: s3key,
      edits: { resize: { width: size, height: size, fit: "inside" } },
    }),
  ).toString("base64");
  return `${CDN}/${b64}`;
}

const extOf = (s3key) => {
  const m = /\.([a-z0-9]+)$/i.exec(s3key || "");
  const e = m ? m[1].toLowerCase() : "";
  return EXTS.includes(e) ? (e === "jpg" ? "jpeg" : e) : "";
};

function loadProducts() {
  if (!fs.existsSync(PRODUCTS)) {
    console.error(`${PRODUCTS} not found - run: node scripts/merge-full.mjs`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PRODUCTS, "utf8"));
}

/** Existing files on disk: Set of "44665-0.jpeg" style names + index lookup. */
function scanExisting() {
  const byName = new Set();
  if (fs.existsSync(DEST_DIR)) {
    for (const f of fs.readdirSync(DEST_DIR)) {
      // 0-byte leftovers from an interrupted write never render - re-fetch them
      try {
        if (fs.statSync(path.join(DEST_DIR, f)).size === 0) continue;
      } catch {
        continue;
      }
      byName.add(f);
    }
  }
  return byName;
}

function findExisting(onDisk, id, idx) {
  for (const e of EXTS) {
    const name = `${id}-${idx}.${e}`;
    if (onDisk.has(name)) return `img/products/${name}`;
  }
  return null;
}

async function download(s3key, destAbs) {
  const url = cdnUrl(s3key, SIZE);
  const dest = path.join(IMG_ROOT, destAbs);
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 500) return "too-small";
        fs.writeFileSync(dest, buf);
        return "ok";
      }
      if (res.status === 404) return "404";
    } catch {
      await sleep(600 * (a + 1));
    }
  }
  return "failed";
}

async function main() {
  const products = loadProducts();
  fs.mkdirSync(DEST_DIR, { recursive: true });

  // build the job list: one job per (product, image index)
  const jobs = [];
  for (const p of products) {
    const keys = p.image_s3keys || [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key || key.includes("no-image")) continue;
      jobs.push({ id: p.id, idx: i, key });
    }
  }
  const todo = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;

  const onDisk = scanExisting();
  const results = {}; // id -> array (by index) of local paths
  let cursor = 0;
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  const record = (id, idx, localPath) => {
    if (!localPath) return;
    if (!results[id]) results[id] = [];
    results[id][idx] = localPath;
  };

  const saveManifest = () => {
    const clean = {};
    for (const [id, arr] of Object.entries(results)) {
      const list = arr.filter(Boolean);
      if (list.length) clean[id] = list;
    }
    fs.writeFileSync(MANIFEST, JSON.stringify(clean));
    return clean;
  };

  // seed the manifest from what is already on disk, so a resumed run keeps it
  for (const p of products) {
    const keys = p.image_s3keys || [];
    for (let i = 0; i < keys.length; i++) {
      const found = findExisting(onDisk, p.id, i);
      if (found) record(p.id, i, found);
    }
  }
  console.log(`images already on disk: ${Object.keys(results).length} products`);

  async function worker() {
    while (cursor < todo.length && Date.now() < deadline) {
      const job = todo[cursor++];
      // resumable: anything already on disk is left alone
      const cached = findExisting(onDisk, job.id, job.idx);
      if (cached) {
        record(job.id, job.idx, cached);
        skipped++;
        continue;
      }
      const ext = extOf(job.key) || "jpeg";
      const rel = `img/products/${job.id}-${job.idx}.${ext}`;
      const status = await download(job.key, rel);
      if (status === "ok") {
        onDisk.add(`${job.id}-${job.idx}.${ext}`);
        record(job.id, job.idx, rel);
        ok++;
      } else if (status === "too-small") {
        skipped++;
      } else {
        failed++;
        if (status !== "404" && failed <= 20) console.log(`  failed ${job.id}-${job.idx} (${status})`);
      }
      const done = ok + skipped + failed;
      if (done % 200 === 0) {
        const clean = saveManifest();
        const rate = done / ((Date.now() - startedAt) / 1000);
        console.log(
          `downloaded ${ok} | skipped ${skipped} | failed ${failed} | ${cursor}/${todo.length} | ${rate.toFixed(1)} img/s | products w/ images ${Object.keys(clean).length}`,
        );
      }
      if (cursor % 10 === 0) await sleep(20);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const clean = saveManifest();

  const bytes = fs
    .readdirSync(DEST_DIR)
    .reduce((a, f) => a + fs.statSync(path.join(DEST_DIR, f)).size, 0);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\ndone in ${elapsed}s`);
  console.log(`downloaded ${ok} | cached/skipped ${skipped} | failed ${failed} | attempted ${cursor}/${todo.length}`);
  console.log(`files on disk: ${onDisk.size} (${(bytes / 1048576).toFixed(1)} MB)`);
  console.log(`manifest: ${MANIFEST} -> ${Object.keys(clean).length} products`);
  console.log("re-run: node scripts/merge-full.mjs && node scripts/build-db.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
