import type { NotificationKind } from "../api";
import { Megaphone, Tag, Truck, Wallet } from "./Icons";

const KINDS: Record<NotificationKind, { icon: typeof Truck; tone: string; label: string }> = {
  order: { icon: Truck, tone: "bg-brand-50 text-brand-600", label: "Order update" },
  wallet: { icon: Wallet, tone: "bg-emerald-50 text-emerald-600", label: "Wallet" },
  offer: { icon: Tag, tone: "bg-coral-50 text-coral-600", label: "Offer" },
  notice: { icon: Megaphone, tone: "bg-sky-50 text-sky-600", label: "Notice" },
};

export const notificationLabel = (kind: string) => KINDS[kind as NotificationKind]?.label ?? "Notice";

export function NotificationIcon({ kind, className = "h-10 w-10" }: { kind: string; className?: string }) {
  const meta = KINDS[kind as NotificationKind] ?? KINDS.notice;
  const Icon = meta.icon;
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${meta.tone} ${className}`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}
