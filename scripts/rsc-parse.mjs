#!/usr/bin/env node
/**
 * RSC (React Server Component) flight-body parser for arogga product pages.
 *
 * Flight rows look like:
 *   <hexid>:<json value>                  normal row
 *   <hexid>:T<hexlen>,<literal text>      text row - the text is literal, NOT json
 *
 * Text rows carry raw text that may contain newlines, so a row can only be
 * delimited by its declared length. Splitting on newlines mis-detects row
 * starts inside such text and produces corrupt payloads (that is why ~3% of
 * product pages failed to parse before).
 *
 * Also exported: unit-testable helpers + a CLI self-test:
 *   node scripts/rsc-parse.mjs <id> <slug>
 */
import { pathToFileURL } from "node:url";

export const BASE = "https://www.arogga.com";

export function splitRows(rsc) {
  const rows = [];
  const len = rsc.length;
  let i = 0;
  while (i < len) {
    if (rsc[i] === "\n") {
      i++;
      continue;
    }
    const m = /^([0-9a-f]{1,6}):/.exec(rsc.slice(i, i + 8));
    if (!m) {
      const nl = rsc.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }
    const id = m[1];
    const p = i + m[0].length;
    const tm = /^T([0-9a-f]+),/.exec(rsc.slice(p, p + 12));
    if (tm) {
      // the declared length is in UTF-8 BYTES (React flight), not characters -
      // slicing by characters eats into the following rows for non-ASCII text
      const size = parseInt(tm[1], 16);
      const start = p + tm[0].length;
      const text = sliceBytes(rsc, start, size);
      rows.push({ id, kind: "text", text });
      i = start + text.length;
    } else {
      const re = /\n([0-9a-f]{1,6}):/g;
      re.lastIndex = p;
      const mm = re.exec(rsc);
      const end = mm ? mm.index : len;
      rows.push({ id, kind: "json", text: decodeRowBody(rsc.slice(p, end)) });
      i = end;
    }
  }
  return rows;
}

/** Take `bytes` UTF-8 bytes from `s` starting at `start`, returned as characters. */
export function sliceBytes(s, start, bytes) {
  let end = start;
  let acc = 0;
  while (end < s.length && acc < bytes) {
    const cp = s.codePointAt(end);
    acc += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    end += cp > 0xffff ? 2 : 1;
  }
  return s.slice(start, end);
}

/** One non-text row body -> the string its content represents. */
export function decodeRowBody(body) {
  try {
    const val = JSON.parse(body);
    return typeof val === "string" ? val : JSON.stringify(val);
  } catch {
    return body.startsWith('"') ? decodeJsonString(body) : body;
  }
}

/** JSON string decode that tolerates raw control characters. */
export function decodeJsonString(lit) {
  let s = lit;
  if (s.startsWith('"')) s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s[++i];
    if (n === undefined) break;
    if (n === "n") out += "\n";
    else if (n === "t") out += "\t";
    else if (n === "r") out += "\r";
    else if (n === "b") out += "\b";
    else if (n === "f") out += "\f";
    else if (n === "u") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
      i += 4;
    } else out += n;
  }
  return out;
}

/** Join rows back into one blob, keeping the "T<len>," prefix on text rows. */
export function unescapeRows(rows) {
  return rows
    .map((r) =>
      r.kind === "text"
        ? `${r.id}:T${Buffer.byteLength(r.text, "utf8").toString(16)},${r.text}`
        : `${r.id}:${r.text}`,
    )
    .join("\n");
}

export function extractBalanced(text, start, open, close) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
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
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const escapeQuotes = (s) => s.replace(/"/g, '\\"');
/** Drop one escaping level: \" -> ", \\ -> \, \/ -> / (other escapes are left intact). */
const unescapeOneLevel = (s) => s.replace(/\\(["\\/])/g, "$1");

/**
 * Join the Next.js flight chunks embedded in a server-rendered HTML page.
 * Used when the ?_rsc= payload is only a shell and the product data is in the
 * HTML instead.
 */
export function flightFromHtml(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\((\[1,"[\s\S]*?\])\)<\/script>/g)];
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

/**
 * Collect balanced objects that follow `marker` in the joined body.
 *
 * The payload shows up in two shapes:
 *   1. inline JSON      ..."product":{"id":395,...}
 *   2. inside a literal text row with one extra escaping level
 *                       ...\"product\":{\"id\":395,...}
 * Both are tried; `validate` filters out unrelated objects.
 */
export function collectObjects(blob, marker, validate, maxLen = 300000, max = 400) {
  const results = [];
  for (const [m, decode] of [
    [marker, (raw) => raw],
    [escapeQuotes(marker), unescapeOneLevel],
  ]) {
    const braceAt = m.indexOf("{");
    let at = -1;
    while ((at = blob.indexOf(m, at + 1)) !== -1 && results.length < max) {
      const raw = extractBalanced(blob, at + braceAt, "{", "}");
      if (!raw || raw.length > maxLen) continue;
      let obj;
      try {
        obj = JSON.parse(decode(raw));
      } catch {
        continue;
      }
      if (obj && validate(obj)) results.push(obj);
    }
    if (results.length) break;
  }
  return results;
}

/** ``"$54"`` -> the text row with id 54. */
export function makeRefResolver(rows) {
  const byId = new Map();
  for (const r of rows) if (r.kind === "text") byId.set(r.id, r.text);
  return (ref) => (typeof ref === "string" && ref.startsWith("$") ? byId.get(ref.slice(1)) || "" : "");
}

export function extractFaq(rows, resolveRef) {
  const blobs = [unescapeRows(rows), ...rows.map((r) => r.text)];
  for (const [needle, decode] of [
    ['"mainEntity"', (raw) => raw],
    [escapeQuotes('"mainEntity"'), unescapeOneLevel],
  ]) {
    for (const blob of blobs) {
      const key = blob.indexOf(needle);
      if (key === -1) continue;
      const arrAt = blob.indexOf("[", key);
      if (arrAt === -1) continue;
      const raw = extractBalanced(blob, arrAt, "[", "]");
      if (!raw || raw.length > 120000) continue;
      let arr;
      try {
        arr = JSON.parse(decode(raw));
      } catch {
        continue;
      }
      return normalizeFaq(arr, resolveRef);
    }
  }
  return [];
}

function normalizeFaq(arr, resolveRef) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((q) => ({
      question: typeof q?.name === "string" ? q.name : "",
      answer: typeof q?.acceptedAnswer?.text === "string" ? q.acceptedAnswer.text : "",
    }))
    .map((q) => ({
      question: q.question.startsWith("$") ? resolveRef(q.question) : q.question,
      answer: q.answer.startsWith("$") ? resolveRef(q.answer) : q.answer,
    }))
    .filter((q) => q.question && q.answer);
}

export function parsePage(rsc, expectedId = null) {
  const rows = splitRows(rsc);
  const blob = unescapeRows(rows);
  const resolveRef = makeRefResolver(rows);

  // own product page object
  const owns = collectObjects(blob, '"product":{"id":', (o) => !!(o.p_id && o.p_name));
  const own = (expectedId && owns.find((o) => Number(o.p_id) === Number(expectedId))) || owns[0] || null;

  // related-product cards
  const cards = collectObjects(blob, '"product":{"pv_id":', (c) => !!(c.p_id && c.p_name), 200000);
  const faq = extractFaq(rows, resolveRef);

  return { own, cards, faq, blob, rows, resolveRef };
}

// ---------------------------------------------------------------- self test
async function main() {
  const id = process.argv[2] || "395";
  const slug = process.argv[3] || "advast-tablet-5mg-10mg";
  const res = await fetch(`${BASE}/product/${id}/${slug}?_rsc=hv${id}`, {
    headers: { RSC: "1", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" },
    signal: AbortSignal.timeout(30000),
  });
  const rsc = await res.text();
  let { own, cards, faq, rows, resolveRef } = parsePage(rsc, id);
  console.log(`id ${id}: status ${res.status} rows ${rows.length} cards ${cards.length} faqs ${faq.length}`);
  if (!own) {
    console.log("  rsc payload had no product - trying the html fallback");
    const html = await (
      await fetch(`${BASE}/product/${id}/${slug}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" },
        signal: AbortSignal.timeout(30000),
      })
    ).text();
    const alt = parsePage(flightFromHtml(html), id);
    own = alt.own;
    cards = alt.cards;
    faq = alt.faq;
    resolveRef = alt.resolveRef;
    console.log(`  html: ${html.length} chars -> own ${own ? "FOUND" : "missing"} cards ${cards.length} faqs ${faq.length}`);
    if (!own) return;
  }
  const pv = own.pv?.[0] || {};
  console.log("  p_id:", own.p_id, "| name:", JSON.stringify(own.p_name));
  console.log("  type:", own.p_type, "| brand:", JSON.stringify(own.p_brand_name), "| generic:", JSON.stringify(own.p_generic_name));
  console.log("  price:", pv.pv_b2c_discounted_price, "mrp:", pv.pv_b2c_mrp, "unit:", pv.pu_base_unit_label);
  console.log("  images:", (own.attachedFiles_p_images || []).length, "| rx:", own.p_rx_req);
  const descRaw = own.p_description?.html;
  const desc = typeof descRaw === "string" && descRaw.startsWith("$") ? resolveRef(descRaw) : descRaw;
  console.log("  desc:", typeof desc === "string" ? JSON.stringify(desc.slice(0, 100)) : String(desc).slice(0, 80));
  console.log("  faq sample:", JSON.stringify(faq[0]?.question || "-"));
  console.log("  keys:", Object.keys(own).length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
