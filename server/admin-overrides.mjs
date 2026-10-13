/**
 * Admin override layer.
 *
 * The catalogue tables are reloaded from scratch whenever the scraper
 * harvests (scripts/sqlite-to-mysql.mjs --catalogue), so every admin edit is
 * also snapshotted into admin_overrides - the durable copy. On boot (and
 * after a catalogue import) `syncOverrides()` replays those snapshots, so
 * prices, banners, categories and content the team entered by hand survive.
 */
import defaultDb, { now } from "./db.mjs";
import { hashPassword } from "./auth.mjs";

const PRODUCT_COLS = [
  "id", "slug", "name", "type", "form", "strength", "generic", "brand", "rx",
  "short_desc", "description_html", "note", "meta_title", "unit_label", "price",
  "mrp", "discount_percent", "stock_status", "rating", "rating_count", "cold",
  "view_count", "trending_score", "image", "images", "hidden",
];

// --------------------------------------------------------------- overrides
export async function saveOverride(entity, key, row, meta = {}, userId = null, q = defaultDb) {
  await q.run(
    `INSERT INTO admin_overrides (entity,\`key\`,\`row\`,meta,updated_at,updated_by)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       \`row\` = VALUES(\`row\`), meta = VALUES(meta),
       updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    [entity, String(key), JSON.stringify(row), JSON.stringify(meta), now(), userId],
  );
}

export async function dropOverride(entity, key) {
  await defaultDb.run("DELETE FROM admin_overrides WHERE entity = ? AND `key` = ?", [
    entity,
    String(key),
  ]);
}

export async function readOverride(entity, key) {
  const r = await defaultDb.get(
    "SELECT `row`, meta FROM admin_overrides WHERE entity = ? AND `key` = ?",
    [entity, String(key)],
  );
  if (!r) return null;
  return { row: JSON.parse(r.row), meta: JSON.parse(r.meta || "{}") };
}

async function applyOne(q, entity, key, row, meta) {
  if (entity === "product") {
    if (meta.deleted) {
      await q.run("DELETE FROM product_categories WHERE product_id = ?", [Number(key)]);
      await q.run("DELETE FROM products WHERE id = ?", [Number(key)]);
      return;
    }
    const withHidden = { hidden: 0, ...row };
    await q.run(
      `REPLACE INTO products (${PRODUCT_COLS.join(",")})
       VALUES (${PRODUCT_COLS.map((c) => `:${c}`).join(",")})`,
      Object.fromEntries(PRODUCT_COLS.map((c) => [c, withHidden[c] ?? null])),
    );
    if (Array.isArray(meta.categories)) {
      await q.run("DELETE FROM product_categories WHERE product_id = ?", [Number(key)]);
      for (const slug of meta.categories) {
        if (slug) {
          await q.run(
            "INSERT IGNORE INTO product_categories (product_id,category_slug) VALUES (?,?)",
            [Number(key), String(slug)],
          );
        }
      }
    }
    return;
  }
  if (entity === "category") {
    if (meta.deleted) await q.run("DELETE FROM categories WHERE slug = ?", [key]);
    else
      await q.run(
        `REPLACE INTO categories (id,slug,name,icon,has_page)
         VALUES (:id,:slug,:name,:icon,:has_page)`,
        row,
      );
    return;
  }
  if (entity === "banner") {
    if (meta.deleted) await q.run("DELETE FROM banners WHERE id = ?", [Number(key)]);
    else
      await q.run(
        `REPLACE INTO banners (id,title,subtitle,link,image,machine)
         VALUES (:id,:title,:subtitle,:link,:image,:machine)`,
        row,
      );
    return;
  }
  if (entity === "site") {
    await q.run("REPLACE INTO site_text (`key`,value) VALUES (?,?)", [key, row.value]);
  }
}

/** Replay every admin edit onto the (possibly reloaded) catalogue tables. */
export async function syncOverrides() {
  const rows = await defaultDb.all(
    "SELECT entity,`key`,`row`,meta FROM admin_overrides ORDER BY updated_at ASC",
  );
  if (!rows.length) return 0;
  return defaultDb.tx(async (q) => {
    let applied = 0;
    for (const r of rows) {
      try {
        await applyOne(q, r.entity, r.key, JSON.parse(r.row), JSON.parse(r.meta || "{}"));
        applied++;
      } catch (err) {
        console.warn(`override sync failed (${r.entity}:${r.key}): ${err.message}`);
      }
    }
    return applied;
  });
}

// ------------------------------------------------------------------- seed
/**
 * Make sure at least one administrator exists. Called once at boot; returns
 * the seeded credentials so the server can print them (override with
 * ADMIN_EMAIL / ADMIN_PASSWORD).
 */
export async function ensureAdminAccount() {
  const hasAdmin = await defaultDb.get("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (hasAdmin) return null;

  const email = String(process.env.ADMIN_EMAIL || "admin@niramoy.local").toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "niramoy123");
  const existing = await defaultDb.get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    await defaultDb.run("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?", [
      now(),
      existing.id,
    ]);
  } else {
    await defaultDb.run(
      `INSERT INTO users (name,email,phone,password_hash,role,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ["Store Admin", email, "", hashPassword(password), "admin", now(), now()],
    );
  }
  return { email, password };
}
