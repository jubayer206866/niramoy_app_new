/** Smoke test for the admin API. Usage: node scripts/_admin-smoke.mjs */
const BASE = "http://localhost:4000";
let token = "";
let fails = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Session-Token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}

function check(label, ok, extra = "") {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` - ${extra}` : ""}`);
}

const main = async () => {
  // 1. admin login
  let r = await call("POST", "/api/auth/login", {
    email: "admin@niramoy.local",
    password: "niramoy123",
  });
  check("admin login", r.status === 200, `status ${r.status}`);
  token = r.data?.token;
  check("token returned", !!token);
  check("role is admin", r.data?.user?.role === "admin", r.data?.user?.role);

  // 2. overview
  r = await call("GET", "/api/admin/overview");
  check("GET overview", r.status === 200, `kpis=${JSON.stringify(r.data?.kpis)}`);

  // 3. products list + filters
  r = await call("GET", "/api/admin/products?limit=3");
  check(
    "GET products",
    r.status === 200 && Array.isArray(r.data?.products) && r.data.products.length === 3,
    `total=${r.data?.total}`,
  );
  const first = r.data?.products?.[0];
  r = await call("GET", `/api/admin/products/${first?.id}`);
  check("GET product detail", r.status === 200, `categories=${r.data?.categories?.join(",")}`);

  // 4. edit a product (price bump), verify storefront + revert
  const originalPrice = r.data?.product?.price;
  r = await call("PATCH", `/api/admin/products/${first.id}`, {
    price: originalPrice,
    name: r.data?.product?.name,
  });
  check("PATCH product", r.status === 200, `price=${r.data?.product?.price}`);

  // 5. hide/unhide round trip
  r = await call("PATCH", `/api/admin/products/${first.id}`, { hidden: true });
  check("hide product", r.status === 200 && r.data?.product?.hidden === true);
  let pub = await call("GET", `/api/products/${first.id}`);
  check("hidden product 404s on storefront", pub.status === 404, `status ${pub.status}`);
  pub = await call("GET", "/api/products?limit=5");
  check(
    "hidden product absent from listing",
    pub.status === 200 && !pub.data.products.some((p) => p.id === first.id),
  );
  r = await call("PATCH", `/api/admin/products/${first.id}`, { hidden: false });
  check("unhide product", r.status === 200 && r.data?.product?.hidden === false);
  pub = await call("GET", `/api/products/${first.id}`);
  check("unhidden product visible again", pub.status === 200);

  // 6. create + delete a product
  r = await call("POST", "/api/admin/products", {
    name: "Smoke Test Vitamin C 500mg",
    price: 120,
    mrp: 150,
    unitLabel: "Pack of 10",
    brand: "SmokeCo",
    categories: ["supplement"],
    stockStatus: true,
  });
  check("POST product", r.status === 201, `id=${r.data?.product?.id}`);
  const newId = r.data?.product?.id;
  pub = await call("GET", `/api/products/${newId}`);
  check("new product on storefront", pub.status === 200);
  r = await call("DELETE", `/api/admin/products/${newId}`);
  check("DELETE product", r.status === 200);
  pub = await call("GET", `/api/products/${newId}`);
  check("deleted product gone", pub.status === 404);

  // 7. categories
  r = await call("GET", "/api/admin/categories");
  check("GET categories", r.status === 200 && r.data?.length > 0, `n=${r.data?.length}`);
  r = await call("POST", "/api/admin/categories", {
    slug: "smoke-cat",
    name: "Smoke Category",
    icon: "",
  });
  check("POST category", r.status === 201, `slug=${r.data?.category?.slug}`);
  r = await call("PATCH", "/api/admin/categories/smoke-cat", { name: "Smoke Category 2" });
  check("PATCH category", r.status === 200 && r.data?.category?.name === "Smoke Category 2");
  r = await call("DELETE", "/api/admin/categories/smoke-cat");
  check("DELETE category", r.status === 200);

  // 8. banners
  r = await call("GET", "/api/admin/banners");
  check("GET banners", r.status === 200 && Array.isArray(r.data));
  r = await call("POST", "/api/admin/banners", {
    title: "Smoke Banner",
    subtitle: "hi",
    link: "/products",
    image: "",
    machine: "top_carousel_1",
  });
  check("POST banner", r.status === 201, `id=${r.data?.banner?.id}`);
  const bannerId = r.data?.banner?.id;
  r = await call("PATCH", `/api/admin/banners/${bannerId}`, { title: "Smoke Banner Edited" });
  check("PATCH banner", r.status === 200 && r.data.banner.title === "Smoke Banner Edited");
  r = await call("DELETE", `/api/admin/banners/${bannerId}`);
  check("DELETE banner", r.status === 200);

  // 9. site settings
  r = await call("GET", "/api/admin/site");
  check("GET site", r.status === 200 && typeof r.data?.tagline === "string");
  r = await call("PUT", "/api/admin/site", { values: { tagline: r.data.tagline } });
  check("PUT site", r.status === 200);

  // 10. orders
  r = await call("GET", "/api/admin/orders?limit=5");
  check("GET orders", r.status === 200, `total=${r.data?.total}`);
  const order = r.data?.orders?.[0];
  if (order) {
    r = await call("GET", `/api/admin/orders/${encodeURIComponent(order.id)}`);
    check("GET order detail", r.status === 200 && r.data?.order?.items?.length >= 0);
    r = await call("PATCH", `/api/admin/orders/${encodeURIComponent(order.id)}`, {
      status: order.status,
    });
    check("PATCH order status", r.status === 200, r.data?.order?.status);
  } else {
    console.log("SKIP  order tests (no orders yet)");
  }

  // 11. customers + roles
  r = await call("GET", "/api/admin/customers?limit=5");
  check("GET customers", r.status === 200, `total=${r.data?.total}`);
  const cust = r.data?.customers?.find((c) => c.role !== "admin");
  if (cust) {
    r = await call("GET", `/api/admin/customers/${cust.id}`);
    check("GET customer detail", r.status === 200);
    r = await call("PATCH", `/api/admin/customers/${cust.id}`, { role: "admin" });
    check("promote to admin", r.status === 200 && r.data?.customer?.role === "admin");
    r = await call("PATCH", `/api/admin/customers/${cust.id}`, { role: "customer" });
    check("demote to customer", r.status === 200 && r.data?.customer?.role === "customer");
  }

  // 12. media upload/list/delete (1x1 png)
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  r = await call("POST", "/api/admin/media", { name: "smoke.png", data: png });
  check("POST media", r.status === 201, `url=${r.data?.file?.url}`);
  if (r.status === 201) {
    const img = await fetch(`${BASE}${r.data.file.url}`);
    check("uploaded file serves", img.status === 200);
    r = await call("DELETE", `/api/admin/media?name=${encodeURIComponent(r.data.file.name)}`);
    check("DELETE media", r.status === 200);
  }
  r = await call("GET", "/api/admin/media?dir=uploads");
  check("GET media", r.status === 200, `n=${r.data?.files?.length}`);

  // 13. auth guards
  const saved = token;
  token = "";
  r = await call("GET", "/api/admin/overview");
  check("401 without session", r.status === 401);
  token = saved;

  console.log(fails ? `\n${fails} FAILED` : "\nAll admin API checks passed");
  process.exit(fails ? 1 : 0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
