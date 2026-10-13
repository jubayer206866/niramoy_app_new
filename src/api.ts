import { API_BASE, apiUrl } from "./lib";

export interface Product {
  id: number;
  slug: string;
  name: string;
  type: string;
  form: string;
  strength: string;
  generic: string;
  brand: string;
  rx: boolean;
  shortDesc: string;
  descriptionHtml: string;
  note: string;
  metaTitle: string;
  unitLabel: string;
  price: number;
  mrp: number;
  discountPercent: number;
  stockStatus: boolean;
  rating: number;
  ratingCount: number;
  cold: boolean;
  viewCount: number;
  trendingScore: number;
  image: string;
  images: string[];
  faqs?: { question: string; answer: string }[];
}

export interface Category {
  slug: string;
  name: string;
  icon: string;
  hasPage: boolean;
  productCount: number;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string;
  link: string;
  image: string;
  machine: string;
}

export interface Brand {
  name: string;
  count: number;
}

export interface ProductsResponse {
  total: number;
  page: number;
  limit: number;
  products: Product[];
}

export interface HomeData {
  banners: Banner[];
  sections: { title: string; cat: string; products: Product[] }[];
}

export interface SiteText {
  seo_text: string;
  phone: string;
  whatsapp: string;
  tagline: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role?: string;
  createdAt?: string;
  initials: string;
}

export interface Address {
  id: number;
  label: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  isDefault: boolean;
}

export interface AccountSummary {
  orders: number;
  spend: number;
  wishlist: number;
  addresses: number;
  reviews: number;
  saved: number;
}

export interface Me {
  user: User | null;
  addresses: Address[];
  defaultAddress: Address | null;
  wishlistCount: number;
  orderCount: number;
}

export interface OrderLine {
  id: number;
  name: string;
  slug: string;
  unitLabel: string;
  image: string;
  price: number;
  mrp: number;
  qty: number;
}

export interface Order {
  id: string;
  userId?: number | null;
  name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  note?: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  itemsCount: number;
  status: string;
  placedAt: string;
  items?: OrderLine[];
}

export interface Review {
  id: number;
  rating: number;
  body: string;
  createdAt: string;
  name: string;
}

export interface ReviewsResponse {
  reviews: Review[];
  count: number;
  average: number;
  mine: { rating: number; body: string } | null;
}

/** Error carrying the HTTP status plus any field-level errors from the API. */
export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

/**
 * Session token storage.
 *
 * The web build rides the httpOnly cookie (same origin). The packaged app is
 * cross-origin, where cookies are neither sent nor accepted over plain HTTP,
 * so login/register hand back the same token in the body and every request
 * carries it in the X-Session-Token header instead.
 */
const SESSION_KEY = "niramoy.session";

function readToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveToken(token?: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage disabled - sessions simply do not persist */
  }
}

/** Exported for the admin API client (src/admin/api.ts). */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string> | undefined) || {}),
  };
  if (API_BASE && token) headers["X-Session-Token"] = token;

  const res = await fetch(apiUrl(path), {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (res.ok) {
    const b = body as { token?: unknown } | null;
    if (b && typeof b.token === "string") saveToken(b.token);
  } else if (res.status === 401) {
    saveToken(null); // session expired or revoked
  }

  if (!res.ok) {
    const b = (body ?? {}) as { error?: string; errors?: Record<string, string> };
    throw new ApiError(
      b.error || "Something went wrong. Please try again.",
      res.status,
      b.errors || {},
    );
  }
  return body as T;
}

const get = <T,>(url: string) => request<T>(url);

export interface ProductQuery {
  cat?: string;
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
  rx?: "0" | "1";
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
}

export function qs(query: ProductQuery | Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const api = {
  // catalogue
  categories: () => get<Category[]>("/api/categories"),
  banners: () => get<Banner[]>("/api/banners"),
  site: () => get<SiteText>("/api/site"),
  home: () => get<HomeData>("/api/home"),
  products: (query: ProductQuery) => get<ProductsResponse>(`/api/products${qs(query)}`),
  product: (id: string | number) =>
    get<{ product: Product; related: Product[] }>(`/api/products/${id}`),
  brands: () => get<Brand[]>("/api/brands"),
  facets: (cat: string) => get<{ brands: Brand[] }>(`/api/facets/${encodeURIComponent(cat)}`),

  // auth
  me: () => get<Me>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (payload: { name: string; email: string; phone?: string; password: string }) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<{ ok: true }>("/api/auth/logout", { method: "POST" }).then((r) => {
      saveToken(null);
      return r;
    }),

  // account
  overview: () => get<AccountSummary>("/api/account/overview"),
  updateProfile: (payload: { name: string; phone: string }) =>
    request<{ user: User }>("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/api/account/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  addresses: () => get<{ addresses: Address[] }>("/api/account/addresses"),
  createAddress: (payload: Partial<Address>) =>
    request<{ addresses: Address[] }>("/api/account/addresses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAddress: (id: number, payload: Partial<Address>) =>
    request<{ addresses: Address[] }>(`/api/account/addresses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAddress: (id: number) =>
    request<{ addresses: Address[] }>(`/api/account/addresses/${id}`, { method: "DELETE" }),

  // wishlist
  wishlist: () => get<{ ids: number[]; products: Product[] }>("/api/account/wishlist"),
  wishlistIds: () => get<{ ids: number[] }>("/api/account/wishlist/ids"),
  wishlistAdd: (productId: number) =>
    request<{ ids: number[] }>("/api/account/wishlist", {
      method: "POST",
      body: JSON.stringify({ productId }),
    }),
  wishlistRemove: (productId: number) =>
    request<{ ids: number[] }>(`/api/account/wishlist/${productId}`, { method: "DELETE" }),

  // orders
  placeOrder: (payload: {
    items: { id: number; qty: number }[];
    name: string;
    phone: string;
    address: string;
    city?: string;
    email?: string;
    note?: string;
    paymentMethod?: string;
    saveAddress?: boolean;
  }) =>
    request<{ order: Order }>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  orders: () => get<{ orders: Order[] }>("/api/account/orders"),
  order: (id: string) => get<{ order: Order }>(`/api/account/orders/${encodeURIComponent(id)}`),

  // reviews
  reviews: (productId: number | string) => get<ReviewsResponse>(`/api/reviews/${productId}`),
  addReview: (payload: { productId: number; rating: number; body: string }) =>
    request<{ ok: true }>("/api/account/reviews", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
