#!/usr/bin/env node
/**
 * Merge tile slugs (from rendered home HTML) with flight-extracted icons.
 * Generates simple SVG fallback icons for tiles whose icon is unavailable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const homeHtml = fs.readFileSync(
  path.join(ROOT, ".scrape", "out", "home-flight.txt"),
  "utf8",
);

// All category-home slugs + labels found in rendered home HTML
const slugRe =
  /href="(?:https:\/\/www\.arogga\.com)?(\/category-home\/([a-z0-9-]+))"/g;
const htmlSlugs = new Map();
let m;
while ((m = slugRe.exec(homeHtml))) {
  if (!htmlSlugs.has(m[2])) htmlSlugs.set(m[2], null);
}

// Flight-derived tiles (slug -> label + local icon)
const flightTiles = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".scrape", "out", "tiles.json"), "utf8"),
);
const iconMap = new Map(
  flightTiles.map((t) => [t.slug, { label: t.label, icon: t.local }]),
);

// Fallback icon generator: rounded square with emoji-style letter
function svgFor(label) {
  const letter = (label || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#e6f4f1"/><text x="50" y="66" font-size="44" text-anchor="middle" fill="#0e7c6b" font-family="Arial" font-weight="bold">${letter}</text></svg>`;
  return svg;
}

const categories = [
  { slug: "medicines", label: "Medicine" },
  { slug: "beauty", label: "Beauty" },
  { slug: "doctor-consultation", label: "Doctor Consultation", nolink: true },
  { slug: "home-lab", label: "Home Lab", nolink: true },
  { slug: "food", label: "Food & Nutrition" },
  { slug: "baby-mom-care", label: "Baby & Mom Care" },
  { slug: "homecare", label: "Homecare" },
  { slug: "pet-care", label: "Pet Care" },
  { slug: "healthcare", label: "Healthcare" },
  { slug: "herbal", label: "Herbal" },
  { slug: "sexual-wellness", label: "Sexual Wellness" },
  { slug: "homeopathy", label: "Homeopathy" },
  { slug: "supplement", label: "Supplement" },
  { slug: "fragrance", label: "Fragrance" },
  { slug: "veterinary", label: "Veterinary" },
  { slug: "medical-devices", label: "Medical Devices" },
];

const out = [];
for (const c of categories) {
  const flight = iconMap.get(c.slug);
  let icon = flight?.icon || null;
  if (!icon) {
    const name = `${c.slug}.svg`;
    const dest = path.join(ROOT, "public", "img", "categories", name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, svgFor(c.label));
    icon = `img/categories/${name}`;
  }
  out.push({
    slug: c.slug,
    label: flight?.label || c.label,
    icon,
    has_page: !c.nolink && htmlSlugs.has(c.slug),
  });
}

fs.writeFileSync(
  path.join(ROOT, ".scrape", "out", "tiles.json"),
  JSON.stringify(out, null, 2),
);
console.log("tiles merged:", out.length);
out.forEach((t) => console.log("-", t.slug, "|", t.label, "|", t.icon));
