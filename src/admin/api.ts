/** Admin CMS API client - all /api/admin/* endpoints. */
import { qs, request, type Banner, type Order, type Product } from "../api";

const get = <T,>(url: string) => request<T>(url);
const send = <T,>(method: string, path: string, payload?: unknown) =>
  request<T>(path, {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

export interface AdminProduct extends Product {
  hidden: boolean;
  categories: string[];
}

export interface AdminProductsResponse {
  total: number;
  page: number;
  limit: number;
  products: AdminProduct[];
}

export interface OverviewKpis {
  orders: number;
  ordersToday: number;
  pending: number;
  revenue: number;
  customers: number;
  newCustomers7d: number;
  products: number;
  outOfStock: number;
  hidden: number;
}

export interface AdminOverview {
  kpis: OverviewKpis;
  statuses: { status: string; count: number }[];
  revenue14d: { day: string; revenue: number; orders: number }[];
  recentOrders: Pick<
    Order,
    "id" | "name" | "phone" | "total" | "status" | "itemsCount" | "placedAt"
  >[];
  topProducts: { id: number; name: string; image: string; units: number; revenue: number }[];
  outOfStock: { id: number; name: string; image: string; price: number; unitLabel: string }[];
}

export interface AdminCategory {
  id: number;
  slug: string;
  name: string;
  icon: string;
  hasPage: boolean;
  productCount: number;
}

export interface AdminOrdersResponse {
  total: number;
  page: number;
  limit: number;
  orders: Order[];
  counts: { status: string; count: number }[];
}

export interface AdminCustomer {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt: string;
  orders: number;
  spend: number;
}

export interface MediaFile {
  name: string;
  url: string;
  size: number;
  mtime: number;
  dir: string;
}

export interface ProductPayload {
  name?: string;
  slug?: string;
  price?: number;
  mrp?: number;
  discountPercent?: number;
  stockStatus?: boolean;
  rx?: boolean;
  cold?: boolean;
  hidden?: boolean;
  type?: string;
  form?: string;
  strength?: string;
  generic?: string;
  brand?: string;
  shortDesc?: string;
  descriptionHtml?: string;
  note?: string;
  metaTitle?: string;
  unitLabel?: string;
  image?: string;
  images?: string[];
  categories?: string[];
}

export const adminApi = {
  overview: () => get<AdminOverview>("/api/admin/overview"),

  products: (query: Record<string, unknown>) =>
    get<AdminProductsResponse>(`/api/admin/products${qs(query)}`),
  product: (id: number | string) =>
    get<{ product: AdminProduct; categories: string[] }>(`/api/admin/products/${id}`),
  createProduct: (payload: ProductPayload) =>
    send<{ product: AdminProduct; categories: string[] }>("POST", "/api/admin/products", payload),
  updateProduct: (id: number | string, payload: ProductPayload) =>
    send<{ product: AdminProduct; categories: string[] }>(
      "PATCH",
      `/api/admin/products/${id}`,
      payload,
    ),
  deleteProduct: (id: number | string) =>
    send<{ ok: true }>("DELETE", `/api/admin/products/${id}`),

  categories: () => get<AdminCategory[]>("/api/admin/categories"),
  createCategory: (payload: { slug?: string; name: string; icon?: string; hasPage?: boolean }) =>
    send<{ category: AdminCategory }>("POST", "/api/admin/categories", payload),
  updateCategory: (slug: string, payload: { name?: string; icon?: string; hasPage?: boolean }) =>
    send<{ category: AdminCategory }>("PATCH", `/api/admin/categories/${slug}`, payload),
  deleteCategory: (slug: string) =>
    send<{ ok: true }>("DELETE", `/api/admin/categories/${slug}`),

  banners: () => get<Banner[]>("/api/admin/banners"),
  createBanner: (payload: Partial<Banner>) =>
    send<{ banner: Banner }>("POST", "/api/admin/banners", payload),
  updateBanner: (id: number, payload: Partial<Banner>) =>
    send<{ banner: Banner }>("PATCH", `/api/admin/banners/${id}`, payload),
  deleteBanner: (id: number) => send<{ ok: true }>("DELETE", `/api/admin/banners/${id}`),

  site: () => get<Record<string, string>>("/api/admin/site"),
  saveSite: (values: Record<string, string>) =>
    send<Record<string, string>>("PUT", "/api/admin/site", { values }),

  orders: (query: Record<string, unknown>) =>
    get<AdminOrdersResponse>(`/api/admin/orders${qs(query)}`),
  order: (id: string) =>
    get<{
      order: Order;
      customer: AdminCustomer | null;
      customerOrders: { id: string; status: string; total: number; placedAt: string }[];
    }>(`/api/admin/orders/${encodeURIComponent(id)}`),
  updateOrderStatus: (id: string, status: string) =>
    send<{ order: Order }>("PATCH", `/api/admin/orders/${encodeURIComponent(id)}`, { status }),

  customers: (query: Record<string, unknown>) =>
    get<{ total: number; page: number; limit: number; customers: AdminCustomer[] }>(
      `/api/admin/customers${qs(query)}`,
    ),
  customer: (id: number | string) =>
    get<{
      customer: AdminCustomer;
      addresses: {
        id: number;
        label: string;
        name: string;
        phone: string;
        address: string;
        city: string;
        area: string;
        isDefault: boolean;
      }[];
      orders: {
        id: string;
        status: string;
        total: number;
        itemsCount: number;
        paymentMethod: string;
        address: string;
        city: string;
        placedAt: string;
      }[];
      reviews: { productId: number; rating: number; body: string; createdAt: string }[];
    }>(`/api/admin/customers/${id}`),
  updateCustomerRole: (id: number | string, role: "admin" | "customer") =>
    send<{ customer: AdminCustomer }>("PATCH", `/api/admin/customers/${id}`, { role }),

  media: (query: Record<string, unknown>) =>
    get<{ dir: string; files: MediaFile[]; writable: boolean }>(`/api/admin/media${qs(query)}`),
  uploadMedia: (name: string, data: string) =>
    send<{ file: MediaFile }>("POST", "/api/admin/media", { name, data }),
  deleteMedia: (name: string, dir = "uploads") =>
    request<{ ok: true }>(`/api/admin/media?dir=${dir}&name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
};
