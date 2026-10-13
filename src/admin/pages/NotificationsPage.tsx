import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, type AdminNotification, type BroadcastPayload } from "../api";
import { ApiError } from "../../api";
import { Confirm, ImageField, PageHeader, Panel, RowsSkeleton } from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { Alert, Field, StatCard } from "../../components/ui";
import { NotificationIcon } from "../../components/NotificationIcon";
import { Bell, Megaphone, Send, Tag, Trash, Users } from "../../components/Icons";
import { useToast } from "../../context/ToastContext";
import { imgUrl, useFetch } from "../../lib";

const EMPTY: BroadcastPayload = { kind: "offer", title: "", body: "", link: "", image: "" };

const LINK_SUGGESTIONS = [
  { value: "/", label: "Home page" },
  { value: "/products", label: "All products" },
  { value: "/category/medicines", label: "Medicines" },
  { value: "/category/beauty", label: "Beauty" },
  { value: "/category/baby-mom-care", label: "Baby & mom care" },
  { value: "/account/wallet", label: "Wallet" },
  { value: "/account/orders", label: "My orders" },
];

const TEMPLATES: { label: string; value: Omit<BroadcastPayload, "image"> }[] = [
  {
    label: "Discount offer",
    value: {
      kind: "offer",
      title: "Flat 10% off this weekend",
      body: "Save 10% on medicines and healthcare essentials until Sunday. Free delivery over ৳1,000.",
      link: "/products",
    },
  },
  {
    label: "Delivery notice",
    value: {
      kind: "notice",
      title: "Delivery schedule update",
      body: "Due to the holiday, orders placed today will be delivered tomorrow. Thank you for your patience.",
      link: "",
    },
  },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function NotificationsPage() {
  const { success, error: toastError } = useToast();
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number(params.get("page") || 1), 1);
  const { data, loading, error, refresh } = useFetch(() => adminApi.notifications({ page, limit: 15 }), [page]);
  const stats = data?.stats;
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / (data?.limit || 15)), 1);

  const [form, setForm] = useState<BroadcastPayload>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<AdminNotification | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const set = <K extends keyof BroadcastPayload>(key: K, value: BroadcastPayload[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 3) next.title = "Write a title of at least 3 characters.";
    if (form.body.trim().length < 3) next.body = "Write a message.";
    if (form.link && !/^(\/|https?:\/\/)/.test(form.link.trim())) next.link = "Links must start with / or http(s)://";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const sendNow = async () => {
    setSending(true);
    try {
      await adminApi.sendNotification({
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        link: form.link.trim(),
      });
      success(`${form.kind === "offer" ? "Offer" : "Notice"} sent to all customers`);
      setForm(EMPTY);
      setConfirming(false);
      if (page !== 1) setParams({});
      else refresh();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toastError(err instanceof Error ? err.message : "Could not send the notification.");
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await adminApi.deleteNotification(deleting.id);
      success("Removed from customers' inboxes");
      setDeleting(null);
      refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not delete it.");
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Push notifications"
        subtitle="Send notices and offers to every customer's app. Order and wallet updates are sent automatically."
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Customers"
          value={stats ? stats.customers.toLocaleString() : "—"}
          hint="Every inbox receives broadcasts"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Online now"
          value={stats ? stats.liveNow.toLocaleString() : "—"}
          hint="Apps and browsers open right now"
          icon={<Bell className="h-4 w-4" />}
        />
        <StatCard
          label="Push devices"
          value={stats ? stats.devices.toLocaleString() : "—"}
          hint={stats ? `${stats.signedInDevices} signed in` : undefined}
          icon={<Send className="h-4 w-4" />}
        />
        <StatCard
          label="Closed-app push"
          value={stats ? (stats.pushConfigured ? "Enabled" : "Off") : "—"}
          hint={stats?.pushConfigured ? "Firebase Cloud Messaging" : "Firebase not configured"}
          icon={<Megaphone className="h-4 w-4" />}
        />
      </section>

      {stats && !stats.pushConfigured && (
        <div className="mb-5">
          <Alert tone="warn">
            Notifications reach apps that are open or running in the background. To also reach phones where the
            app is fully closed, connect Firebase Cloud Messaging (set FIREBASE_SERVICE_ACCOUNT on the server and
            rebuild the app with google-services.json).
          </Alert>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">New notification</h2>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setForm((f) => ({ ...f, ...t.value }));
                    setErrors({});
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (validate()) setConfirming(true);
            }}
          >
            <div>
              <span className="label">Type</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "offer", label: "Marketing offer", icon: <Tag className="h-4 w-4" /> },
                    { key: "notice", label: "Notice", icon: <Megaphone className="h-4 w-4" /> },
                  ] as const
                ).map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => set("kind", k.key)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      form.kind === k.key
                        ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                        : "border-slate-200 text-slate-600 hover:border-brand-200"
                    }`}
                  >
                    {k.icon} {k.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Title" error={errors.title}>
              <input
                className="input"
                maxLength={140}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Flat 10% off this weekend"
              />
            </Field>

            <Field label="Message" error={errors.body} hint={`${form.body.length}/600`}>
              <textarea
                className="input resize-none"
                rows={3}
                maxLength={600}
                value={form.body}
                onChange={(e) => set("body", e.target.value)}
                placeholder="What should customers know?"
              />
            </Field>

            <Field
              label="Opens when tapped (optional)"
              error={errors.link}
              hint="A page in the app such as /products, or a full https:// link"
            >
              <input
                className="input"
                list="notification-links"
                maxLength={300}
                value={form.link}
                onChange={(e) => set("link", e.target.value)}
                placeholder="/products"
              />
              <datalist id="notification-links">
                {LINK_SUGGESTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </datalist>
            </Field>

            <ImageField
              label="Image (optional)"
              value={form.image}
              onChange={(url) => set("image", url)}
              aspect="aspect-[2/1]"
              hint="Shown in the inbox, and in the push notification when Firebase is enabled"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setForm(EMPTY)} disabled={sending}>
                Clear
              </button>
              <button type="submit" className="btn-primary" disabled={sending}>
                <Send className="h-4 w-4" /> Send to all customers
              </button>
            </div>
          </form>
        </Panel>

        <Panel className="xl:self-start">
          <h2 className="section-title mb-3">Preview</h2>
          <div className="rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-4">
            <p className="mb-3 text-center text-[11px] font-semibold text-slate-400">Lock screen</p>
            <div className="rounded-2xl bg-white/95 p-3 shadow-lg">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <span className="grid h-4 w-4 place-items-center rounded bg-brand-600 text-[9px] font-black text-white">
                  +
                </span>
                Niramoy Pharmacy · now
              </div>
              <p className="text-sm font-bold text-ink-800">{form.title || "Notification title"}</p>
              <p className="line-clamp-3 text-xs text-slate-600">
                {form.body || "Your message appears here."}
              </p>
              {form.image && (
                <img src={imgUrl(form.image)} alt="" className="mt-2 max-h-32 w-full rounded-lg object-cover" />
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Customers also find it in <b>Account → Notifications</b>, and see a banner if the app is open.
          </p>
        </Panel>
      </div>

      <h2 className="section-title mb-3 mt-8">Sent notices & offers</h2>
      {loading && <RowsSkeleton rows={4} />}
      {error && <ErrorBox message={error} />}
      {!loading && !error && (data?.notifications.length ?? 0) === 0 && (
        <EmptyBox
          icon={<Bell className="h-6 w-6" />}
          title="Nothing sent yet"
          message="Notices and offers you send will be listed here."
        />
      )}
      {!loading && !error && (data?.notifications.length ?? 0) > 0 && (
        <ul className="panel divide-y divide-slate-100 p-0">
          {data!.notifications.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-4 py-3">
              <NotificationIcon kind={n.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{n.title}</p>
                <p className="text-xs text-slate-600">{n.body}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {fmt(n.createdAt)}
                  {n.createdByName ? ` · by ${n.createdByName}` : ""}
                  {n.link ? ` · opens ${n.link}` : ""}
                  {n.pushSent ? ` · pushed to ${n.pushSent} device${n.pushSent === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              {n.image && (
                <img
                  src={imgUrl(n.image)}
                  alt=""
                  className="hidden h-12 w-20 shrink-0 rounded-lg bg-slate-50 object-cover sm:block"
                />
              )}
              <button
                className="btn-icon text-slate-400 hover:text-rose-600"
                aria-label="Delete"
                onClick={() => setDeleting(n)}
              >
                <Trash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2">
          <button
            className="btn-outline btn-sm"
            disabled={page <= 1}
            onClick={() => setParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn-outline btn-sm"
            disabled={page >= totalPages}
            onClick={() => setParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </nav>
      )}

      <Confirm
        open={confirming}
        title={`Send this ${form.kind === "offer" ? "offer" : "notice"}?`}
        message={
          <>
            <b>{form.title}</b> will be delivered right away to every customer
            {stats ? ` (${stats.customers.toLocaleString()} accounts)` : ""}. It can&apos;t be unsent from phones that
            already received it.
          </>
        }
        confirmLabel="Send now"
        tone="primary"
        busy={sending}
        onConfirm={() => void sendNow()}
        onClose={() => !sending && setConfirming(false)}
      />

      <Confirm
        open={!!deleting}
        title="Delete this notification?"
        message="It will be removed from customers' inboxes. Push notifications already shown on phones stay there."
        confirmLabel="Delete"
        busy={busyDelete}
        onConfirm={() => void remove()}
        onClose={() => !busyDelete && setDeleting(null)}
      />
    </div>
  );
}
