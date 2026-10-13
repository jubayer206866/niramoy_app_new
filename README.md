# Niramoy Pharmacy — full-stack local storefront

A complete, locally-runnable storefront rebuilt from [arogga.com](https://www.arogga.com/)
(Bangladeshi online pharmacy): the whole catalogue is harvested into SQLite, images are mirrored to
disk, and a redesigned React storefront with accounts, orders and a wishlist is served from one
Express process. The product is branded **Niramoy Pharmacy**.

> Educational demo. Not affiliated with Arogga. Orders and payments are simulated — nothing is
dispensed and no real payment is taken.

---

## Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS, react-router-dom 6 |
| Backend  | Express 4, MySQL 8 via mysql2 (catalogue + accounts + orders in one database), node:crypto (scrypt sessions) |
| Data     | `.scrape/out/*.json(l)` → `data/arogga.db` (SQLite build step) → MySQL via `npm run db:mysql-import`. Images stay on disk in `public/img`; MySQL stores only their paths |

## Quick start

```bash
npm install
# point the server at a MySQL database (tables are created on first boot)
export MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_USER=niramoy MYSQL_PASSWORD=... MYSQL_DATABASE=niramoy_web
npm run db:mysql-import   # load data/arogga.db (+ data/users.db if present) into MySQL
npm run build             # typecheck + bundle
npm run server            # http://localhost:4000  (serves API + the built SPA)
```

Development with hot reload:

```bash
npm run dev:all        # API on :4000, Vite dev server on :3000 (proxies /api and /img)
```

## Catalogue coverage

| Metric | Value |
| ------ | ----- |
| Products (sitemap ids) | **57,584 / 57,584 (100%)** |
| Categories | 16 tiles (11 with products) |
| Banners | 18 |
| FAQs | ~288,000 |
| Product images | **75,423 files / 46,313 products** mirrored to `public/img/products/<id>-<index>.<ext>` (the 11,271 products without a local image only expose a `no-image` placeholder on the source) |
| Descriptions | **57,584 / 57,584** products have copy. ~29.7k have none on the source, so `merge-full.mjs` generates an attribute-driven description (generic, form, strength, manufacturer, pack) instead of leaving the page blank |

## How the data is harvested

`www.arogga.com` is a Next.js App Router site, so every product page can be fetched as an
**RSC flight payload** (`? _rsc=...` with an `RSC: 1` header) which is far smaller than the HTML.
Category pagination is disabled on the source site, so each product page is fetched individually —
the side benefit is that every response also carries ~130 related-product cards, which fill in
products that are no longer reachable directly.

```
scripts/scrape-full.mjs   resumable RSC harvester  -> products-full.jsonl, cards.jsonl, failed.jsonl
scripts/rsc-parse.mjs     flight-body parser (length-aware, ref-aware) + HTML chunk fallback
scripts/merge-full.mjs    dedupe + slug safety + type->category mapping -> products.json
scripts/download-images.mjs  mirror product images from the CDN (resumable)
scripts/build-db.mjs      products.json + tiles.json + banners.json -> data/arogga.db
```

Flight rows come in two shapes and both are handled:

```
<hexid>:<json value>                  normal row
<hexid>:T<hexlen>,<literal text>      text row - length is in UTF-8 BYTES, text may contain raw newlines
```

Splitting those rows on newlines silently corrupts ~3% of pages (which is exactly what the first
harvest pass did); `rsc-parse.mjs` bounds text rows by their declared byte length and falls back to
parsing the flight chunks embedded in the page HTML when the RSC response is only a shell.

### Re-running the pipeline

```bash
npm run scrape:full -- --max-pages 3000 --time-budget 500   # resume harvesting
npm run db:merge                                            # rebuild products.json
npm run db:images -- --concurrency 12                       # mirror missing images
npm run db:build                                            # rebuild data/arogga.db
npm run db:mysql-import -- --catalogue                      # replace the MySQL catalogue tables
```

## Accounts, wishlist and orders

Accounts, orders, wishlists, reviews and admin edits live in their own MySQL tables, so reloading
the catalogue (`db:mysql-import -- --catalogue`) never touches them; admin catalogue edits are
replayed on top after every reload.

* **Auth** — email + password, scrypt hashes, httpOnly session cookies (30 days), login throttling.
* **Account** — dashboard stats, profile editing, password change (invalidates other sessions).
* **Addresses** — full CRUD with a default address used to prefill checkout.
* **Wishlist** — per-user, with a heart on every product card and a `/wishlist` page.
* **Orders** — placed through `POST /api/orders`; **prices and delivery fees are recomputed
  server-side** from the catalogue (free delivery over ৳1,000, otherwise ৳60), then stored with
  their line items. Guests can order too; signed-in users get order history and re-order.
* **Reviews** — one review per product per user, merged into the product page.

## Storefront UI

* **Theme** — violet/indigo primary with a golden-amber accent, Sora display + Inter body type,
  violet-tinted shadows, ring-based surfaces and gradient buttons (see `tailwind.config.js`).
* **Branding** — the app is **Niramoy Pharmacy**; the mark, favicon, SEO tags and footer follow it.
* **Payments** — inline-SVG marks for bKash, Nagad, Rocket, Visa, Mastercard, American Express and
  cash on delivery, shown in the footer, cart and checkout (`src/components/PaymentLogos.tsx`).
* **Navigation** — a sticky header whose announcement bar collapses on scroll, a pill-shaped search
  with category suggestions, icon category chips and a mobile drawer + bottom nav.
* **Images** — every product/banner image goes through `src/components/Img.tsx`, which adds native
  lazy loading, `decoding="async"`, high fetch priority for above-the-fold art, a shimmer
  placeholder (no layout shift) and a fallback for missing files.
* **Routing** — detail pages always open scrolled to the top (`ScrollToTop` in `Layout.tsx`).

## API overview

```
GET    /api/products?cat=&q=&sort=&page=&limit=&brand=&rx=&minPrice=&maxPrice=
GET    /api/products/:id                product + faqs + related
GET    /api/categories|banners|site|home|brands|facets/:cat
POST   /api/auth/register|login|logout   GET /api/auth/me
PATCH  /api/account/profile              POST /api/account/password
GET    /api/account/overview|orders|orders/:id|addresses|wishlist|wishlist/ids
POST   /api/account/addresses|wishlist|reviews      PATCH|DELETE as appropriate
POST   /api/orders                       place an order (guest or signed in)
```

## Verification

```bash
npm run build            # tsc --noEmit + vite build
npm run smoke:ui         # drives headless Chrome: signs in, visits every route, checks for console errors
```

`smoke:ui` registers a throwaway account, seeds an address/wishlist/order, then renders home,
listing, search, product, cart, wishlist, login, register, the four account pages, an order detail
page and the 404 — failing on any missing content or console error. It also asserts the branding
and payment marks render, that grid images are lazy + async decoded, and that clicking a product
from a scrolled listing lands on the detail page at the top.

## Project layout

```
src/
  api.ts                 typed API client
  components/            Header (+Footer, MobileNav), ProductCard, ui kit, icons, carousel
  context/               Auth, Cart, Wishlist, Toast providers
  pages/                 Home, Listing, Product, Cart, Checkout, Login, Register, Wishlist, 404
  pages/account/         Dashboard, Orders, Order detail, Addresses, Profile
server/
  index.mjs              catalogue API + static /img + SPA fallback
  account-routes.mjs     auth/account/order/wishlist/review endpoints
  db.mjs                 MySQL pool, query helpers and schema
  auth.mjs               sessions & hashing
scripts/                 harvesting + DB tooling (see above)
```

## Notes and limitations

* Product data is a point-in-time snapshot of the source site; prices/stock do not update.
* Payment methods (bKash, card) are simulated — nothing is charged.
* All runtime data is in MySQL; `data/*.db` are only the SQLite build artefacts used for imports.
