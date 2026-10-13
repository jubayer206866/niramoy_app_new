import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AppNotification } from "../../api";
import { imgUrl, useFetch } from "../../lib";
import { onLive } from "../../live";
import { useNotifications } from "../../context/NotificationContext";
import { EmptyState, SectionHeading } from "../../components/ui";
import { ErrorBox, PageLoading } from "../../components/Errors";
import { NotificationIcon, notificationLabel } from "../../components/NotificationIcon";
import { Bell, ChevronRight } from "../../components/Icons";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "order", label: "Orders" },
  { key: "wallet", label: "Wallet" },
  { key: "promo", label: "Offers & notices" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AccountNotifications() {
  const { data, loading, error } = useFetch(() => api.notifications(), []);
  const { markAllSeen } = useNotifications();
  const [live, setLive] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  // Opening the inbox marks everything seen; unread items stay highlighted until the next visit.
  useEffect(() => {
    if (data) void markAllSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(
    () =>
      onLive("notification", (n) => {
        setLive((prev) => [n, ...prev]);
        void markAllSeen();
      }),
    [markAllSeen],
  );

  if (loading) return <PageLoading rows={4} />;
  if (error) return <ErrorBox message={error} />;

  const seen = new Set<number>();
  const all = [...live, ...(data?.notifications ?? [])].filter((n) => !seen.has(n.id) && seen.add(n.id));
  const items = all.filter((n) =>
    filter === "all" ? true : filter === "promo" ? n.kind === "offer" || n.kind === "notice" : n.kind === filter,
  );

  return (
    <div>
      <SectionHeading
        title="Notifications"
        subtitle="Order updates, wallet activity and offers"
        icon={<Bell className="h-5 w-5 text-brand-600" />}
      />

      <div className="scrollbar-none -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`chip shrink-0 ${filter === f.key ? "chip-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="Nothing here yet"
          message="We'll let you know when your order moves, your wallet changes or there's a new offer."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const body = (
              <>
                <NotificationIcon kind={n.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-ink-800">{n.title}</p>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-coral-500" aria-label="New" />}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{n.body}</p>
                  {n.image && (
                    <img
                      src={imgUrl(n.image)}
                      alt=""
                      loading="lazy"
                      className="mt-2 max-h-40 w-full rounded-xl bg-slate-50 object-cover"
                    />
                  )}
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {notificationLabel(n.kind)} · {timeAgo(n.createdAt)}
                  </p>
                </div>
                {n.link && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />}
              </>
            );
            const cls = `card flex items-start gap-3 p-3.5 transition ${
              n.read ? "" : "border-brand-200 bg-brand-50/40"
            } ${n.link ? "hover:border-brand-200 hover:shadow-sm" : ""}`;
            return (
              <li key={n.id}>
                {n.link && n.link.startsWith("/") ? (
                  <Link to={n.link} className={cls}>
                    {body}
                  </Link>
                ) : n.link ? (
                  <a href={n.link} className={cls} target="_blank" rel="noreferrer">
                    {body}
                  </a>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
