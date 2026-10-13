#!/usr/bin/env node
/** One-off: extract category tile icons from saved home flight + download them. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_ROOT = path.join(ROOT, "public", "img");
const flight = fs.readFileSync(
  path.join(ROOT, ".scrape", "out", "home-flight.txt"),
  "utf8",
);

function decodeCdnSrc(src) {
  try {
    const payload = src.split("/")[3];
    const meta = JSON.parse(Buffer.from(payload, "base64").toString());
    return meta.key || null;
  } catch {
    return null;
  }
}

// Grid tile pattern in flight: href="/category-home/SLUG" ... src="CDN" ... alt="LABEL"
const tiles = new Map();
const re =
  /"href":"(?:https:\/\/www\.arogga\.com)?(\/category-home\/([a-z0-9-]+))"[\s\S]{0,6000}?"src":"(https:\/\/cdn2\.arogga\.com\/[^"]+)"[\s\S]{0,200}?"alt":"([^"]+)"/g;
let m;
while ((m = re.exec(flight))) {
  const slug = m[2];
  if (!tiles.has(slug)) {
    tiles.set(slug, { slug, label: m[4], src: m[3] });
  }
}
console.log("tiles found:", tiles.size);
for (const t of tiles.values()) console.log("-", t.slug, "|", t.label);

// download icons
for (const t of tiles.values()) {
  const key = decodeCdnSrc(t.src);
  if (!key) {
    console.log("no key for", t.slug);
    continue;
  }
  const name = key.split("/").pop().replace(/[?#].*$/, "");
  const b64 = Buffer.from(
    JSON.stringify({
      bucket: "arogga",
      key,
      edits: { resize: { width: 300, height: 300, fit: "inside" } },
    }),
  ).toString("base64");
  const dest = path.join(IMG_ROOT, "categories", name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) {
    const res = await fetch("https://cdn2.arogga.com/" + b64);
    if (res.ok) {
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log("ok", name);
    } else console.log("fail", res.status, name);
  } else console.log("cached", name);
  t.local = `img/categories/${name}`;
  await new Promise((r) => setTimeout(r, 150));
}

fs.writeFileSync(
  path.join(ROOT, ".scrape", "out", "tiles.json"),
  JSON.stringify([...tiles.values()], null, 2),
);
console.log("tiles.json updated with local icons");
