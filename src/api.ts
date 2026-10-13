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
  /** Up to three popular product photos, used when the icon is a placeholder. */
  thumbs?: string[];
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

export type SuggestHit = Pick<Product, "id" | "slug" | "name" | "brand" | "unitLabel" | "price" | "image">;

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
  wallet: number;
}

/** `payment` = order paid at checkout (account holds the order id); `refund` = that order cancelled. */
export type WalletTxnType = "deposit" | "withdrawal" | "payment" | "refund";
export type WalletTxnStatus = "completed" | "pending" | "rejected" | "cancelled";

export interface WalletTxn {
  id: number;
  type: WalletTxnType;
  method: string;
  account: string;
  amount: number;
  status: WalletTxnStatus;
  reference: string;
  note: string;
  createdAt: string;
  processedAt: string | null;
}

export interface Wallet {
  balance: number;
  held: number;
  limits: { depositMin: number; depositMax: number; withdrawMin: number; withdrawMax: number };
  transactions: WalletTxn[];
}

export interface WalletRequest {
  amount: number;
  method: string;
  account: string;
}

export interface Me {
  user: User | null;
  addresses: Address[];
  defaultAddress: Address | null;
  wishlistCount: number;
  orderCount: number;
  unreadNotifications?: number;
}

export type NotificationKind = "notice" | "offer" | "order" | "wallet";

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  image: string;
  /** Button label on offer cards ("Shop now"). */
  cta?: string;
  coupon?: string;
  /** Short ribbon such as "30% OFF". */
  badge?: string;
  /** Key of OFFER_THEMES. */
  theme?: string;
  expiresAt?: string | null;
  /** Show as a full-screen pop-up when it arrives while the app is open. */
  popup?: boolean;
  createdAt: string;
  read: boolean;
}

export interface OrderEvent {
  status: string;
  note: string;
  at: string;
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
  events?: OrderEvent[];
  /** Wallet-paid order whose payment went back to the wallet on cancellation. */
  walletRefunded?: boolean;
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

/** Session header for the packaged app; empty on the web, which uses the cookie. */
export function sessionHeaders(): Record<string, string> {
  const token = readToken();
  return API_BASE && token ? { "X-Session-Token": token } : {};
}

/** Exported for the admin API client (src/admin/api.ts). */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string> | undefined) || {}),
    ...sessionHeaders(),
  };

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
  suggest: (q: string) => get<{ products: SuggestHit[] }>(`/api/search/suggest${qs({ q, limit: 6 })}`),
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

  // wallet
  wallet: () => get<Wallet>("/api/account/wallet"),
  walletDeposit: (payload: WalletRequest) =>
    request<Wallet>("/api/account/wallet/deposit", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  walletWithdraw: (payload: WalletRequest) =>
    request<Wallet>("/api/account/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  walletCancelWithdrawal: (id: number) =>
    request<Wallet>(`/api/account/wallet/withdrawals/${id}/cancel`, { method: "POST" }),

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

  // notifications
  notifications: () =>
    get<{ notifications: AppNotification[]; unread: number }>("/api/account/notifications"),
  unreadNotifications: () => get<{ unread: number }>("/api/account/notifications/unread"),
  featuredOffer: () => get<{ offer: AppNotification | null }>("/api/broadcasts/featured"),
  broadcast: (id: number) => get<{ notification: AppNotification }>(`/api/broadcasts/${id}`),
  markNotificationsSeen: () =>
    request<{ unread: number }>("/api/account/notifications/seen", { method: "POST" }),
  registerPush: (token: string, platform: string) =>
    request<{ ok: true }>("/api/push/register", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }),

  // reviews
  reviews: (productId: number | string) => get<ReviewsResponse>(`/api/reviews/${productId}`),
  addReview: (payload: { productId: number; rating: number; body: string }) =>
    request<{ ok: true }>("/api/account/reviews", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
