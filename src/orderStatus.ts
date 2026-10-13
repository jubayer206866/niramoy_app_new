/** Delivery steps in order. Mirrors ORDER_STATUSES in server/notifications.mjs. */
export const ORDER_STEPS = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

export const ORDER_STATUSES = [...ORDER_STEPS, "cancelled"] as const;

const LABELS: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const TONES: Record<string, string> = {
  placed: "badge-warn",
  confirmed: "badge bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  packed: "badge bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  shipped: "badge bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  out_for_delivery: "badge bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  delivered: "badge-success",
  cancelled: "badge-danger",
};

export const orderStatusLabel = (status: string) => LABELS[status] ?? status;
export const orderStatusTone = (status: string) => TONES[status] ?? "badge bg-slate-100 text-slate-600";
