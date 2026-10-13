/**
 * MySQL data layer. One database holds the catalogue (products, categories,
 * banners, FAQs, site text) and the store data (users, sessions, orders,
 * wishlists, reviews, admin overrides). Images are NOT stored here - only
 * their /img/... paths; the files live in public/img.
 *
 * Connection comes from MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD /
 * MYSQL_DATABASE.
 */
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "niramoy",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "niramoy_web",
  connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
  charset: "utf8mb4",
  timezone: "Z",
  namedPlaceholders: true,
  decimalNumbers: true,
});

/**
 * Small query API shared by the pool and transaction connections.
 * Params are either an array (for `?`) or an object (for `:name`).
 */
function bind(conn) {
  return {
    all: async (sql, params) => (await conn.query(sql, params))[0],
    get: async (sql, params) => (await conn.query(sql, params))[0][0],
    /** Resolves to { insertId, affectedRows }. */
    run: async (sql, params) => (await conn.query(sql, params))[0],
  };
}

const db = {
  ...bind(pool),
  pool,
  /** Run `fn(q)` inside a transaction; `q` has the same all/get/run API. */
  async tx(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(bind(conn));
      await conn.commit();
      return out;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

export const now = () => new Date();

const TABLE_OPTS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci";

const SCHEMA = [
  // ------------------------------------------------------------ catalogue
  `CREATE TABLE IF NOT EXISTS categories (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(191) NOT NULL,
    icon VARCHAR(500) NULL,
    has_page TINYINT NOT NULL DEFAULT 1
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS banners (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL,
    subtitle VARCHAR(255) NULL,
    link VARCHAR(500) NULL,
    image VARCHAR(500) NULL,
    machine VARCHAR(100) NULL
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS products (
    id INT NOT NULL PRIMARY KEY,
    slug VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(60) NULL,
    form VARCHAR(60) NULL,
    strength VARCHAR(120) NULL,
    generic VARCHAR(255) NULL,
    brand VARCHAR(191) NULL,
    rx TINYINT NOT NULL DEFAULT 0,
    short_desc TEXT NULL,
    description_html MEDIUMTEXT NULL,
    note VARCHAR(500) NULL,
    meta_title VARCHAR(255) NULL,
    unit_label VARCHAR(120) NULL,
    price DOUBLE NOT NULL DEFAULT 0,
    mrp DOUBLE NULL,
    discount_percent DOUBLE NOT NULL DEFAULT 0,
    stock_status TINYINT NOT NULL DEFAULT 0,
    rating DOUBLE NOT NULL DEFAULT 0,
    rating_count INT NOT NULL DEFAULT 0,
    cold TINYINT NOT NULL DEFAULT 0,
    view_count INT NOT NULL DEFAULT 0,
    trending_score DOUBLE NOT NULL DEFAULT 0,
    image VARCHAR(500) NULL,
    images TEXT NULL,
    hidden TINYINT NOT NULL DEFAULT 0,
    KEY idx_prod_type (type),
    KEY idx_prod_name (name),
    KEY idx_prod_brand (brand),
    KEY idx_prod_price (price),
    KEY idx_prod_trending (trending_score),
    KEY idx_prod_hidden (hidden)
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS product_categories (
    product_id INT NOT NULL,
    category_slug VARCHAR(100) NOT NULL,
    PRIMARY KEY (product_id, category_slug),
    KEY idx_pc_cat (category_slug)
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS faqs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    KEY idx_faqs_product (product_id)
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS site_text (
    \`key\` VARCHAR(60) NOT NULL PRIMARY KEY,
    value TEXT NULL
  ) ${TABLE_OPTS}`,

  // -------------------------------------------------------- store / users
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    phone VARCHAR(32) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer',
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    KEY idx_users_role (role),
    KEY idx_users_created (created_at)
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    user_agent VARCHAR(255) NOT NULL DEFAULT '',
    KEY idx_sessions_user (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS addresses (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    label VARCHAR(40) NOT NULL DEFAULT 'Home',
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    address VARCHAR(400) NOT NULL,
    city VARCHAR(60) NOT NULL DEFAULT 'Dhaka',
    area VARCHAR(80) NOT NULL DEFAULT '',
    is_default TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    KEY idx_addresses_user (user_id),
    CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    user_id INT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(191) NOT NULL DEFAULT '',
    address VARCHAR(400) NOT NULL,
    city VARCHAR(60) NOT NULL DEFAULT 'Dhaka',
    note VARCHAR(400) NOT NULL DEFAULT '',
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cod',
    subtotal DOUBLE NOT NULL,
    delivery_fee DOUBLE NOT NULL DEFAULT 0,
    discount DOUBLE NOT NULL DEFAULT 0,
    total DOUBLE NOT NULL,
    items_count INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'placed',
    created_at DATETIME(3) NOT NULL,
    KEY idx_orders_user (user_id, created_at),
    KEY idx_orders_status (status),
    KEY idx_orders_created (created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(40) NOT NULL,
    product_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(191) NOT NULL DEFAULT '',
    unit_label VARCHAR(120) NOT NULL DEFAULT '',
    image VARCHAR(500) NOT NULL DEFAULT '',
    price DOUBLE NOT NULL,
    mrp DOUBLE NOT NULL DEFAULT 0,
    qty INT NOT NULL,
    KEY idx_order_items_order (order_id),
    KEY idx_order_items_product (product_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS wishlist (
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (user_id, product_id),
    CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    UNIQUE KEY uq_reviews_product_user (product_id, user_id),
    KEY idx_reviews_user (user_id),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  // Wallet ledger: the balance is always derived from these rows (see wallet.mjs).
  `CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(20) NOT NULL,
    method VARCHAR(20) NOT NULL,
    account VARCHAR(120) NOT NULL DEFAULT '',
    amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    reference VARCHAR(40) NOT NULL,
    note VARCHAR(300) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL,
    processed_at DATETIME(3) NULL,
    processed_by INT NULL,
    UNIQUE KEY uq_wallet_reference (reference),
    KEY idx_wallet_user (user_id, created_at),
    KEY idx_wallet_status (type, status),
    CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  // One row per status change, so customers see when each delivery step happened.
  `CREATE TABLE IF NOT EXISTS order_events (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(300) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL,
    created_by INT NULL,
    KEY idx_order_events_order (order_id, created_at),
    CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  // user_id NULL = sent to every customer (admin notices and offers).
  `CREATE TABLE IF NOT EXISTS notifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    kind VARCHAR(20) NOT NULL,
    title VARCHAR(140) NOT NULL,
    body VARCHAR(600) NOT NULL DEFAULT '',
    link VARCHAR(300) NOT NULL DEFAULT '',
    image VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL,
    created_by INT NULL,
    push_sent INT NOT NULL DEFAULT 0,
    KEY idx_notifications_user (user_id, created_at),
    KEY idx_notifications_created (created_at),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS notification_reads (
    user_id INT NOT NULL PRIMARY KEY,
    seen_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ${TABLE_OPTS}`,
  // FCM device tokens. user_id NULL = app installed but signed out (still gets offers).
  `CREATE TABLE IF NOT EXISTS push_tokens (
    token VARCHAR(512) NOT NULL PRIMARY KEY,
    user_id INT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'android',
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    KEY idx_push_tokens_user (user_id),
    CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ${TABLE_OPTS}`,
  `CREATE TABLE IF NOT EXISTS admin_overrides (
    entity VARCHAR(20) NOT NULL,
    \`key\` VARCHAR(191) NOT NULL,
    \`row\` MEDIUMTEXT NOT NULL,
    meta TEXT NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    updated_by INT NULL,
    PRIMARY KEY (entity, \`key\`)
  ) ${TABLE_OPTS}`,
];

/** Create any missing tables. Safe to run on every boot. */
export async function ensureSchema() {
  for (const sql of SCHEMA) await pool.query(sql);
}

export default db;
