import { useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, type AdminNotification, type BroadcastPayload } from "../api";
import { ApiError } from "../../api";
import { Confirm, ImageField, PageHeader, Panel, RowsSkeleton } from "../components";
import { preparePushImage } from "../pushImage";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { Alert, Field, StatCard } from "../../components/ui";
import { NotificationIcon } from "../../components/NotificationIcon";
import { OfferCard } from "../../components/OfferCard";
import { Bell, Clock, Copy, Megaphone, Send, Sparkles, Tag, Trash, Users } from "../../components/Icons";
import { useToast } from "../../context/ToastContext";
import { imgUrl, useFetch } from "../../lib";
import { OFFER_THEMES, offerTheme, themeGradient, type OfferThemeKey } from "../../offerThemes";

const EMPTY: BroadcastPayload = {
  kind: "offer",
  title: "",
  body: "",
  link: "",
  image: "",
  cta: "",
  coupon: "",
  badge: "",
  theme: "violet",
  expiresAt: "",
  popup: true,
};

const LINK_SUGGESTIONS = [
  { value: "/", label: "Home page" },
  { value: "/products", label: "All products" },
  { value: "/category/medicines", label: "Medicines" },
  { value: "/category/beauty", label: "Beauty" },
  { value: "/category/baby-mom-care", label: "Baby & mom care" },
  { value: "/account/wallet", label: "Wallet" },
  { value: "/account/orders", label: "My orders" },
];

const EMOJIS = ["🎉", "🔥", "⚡", "🎁", "💊", "💜", "🛒", "⏰", "🌙", "✨"];

const HOUR = 3600e3;

/** `datetime-local` value for a moment `ms` from now. */
const localIn = (ms: number) => {
  const d = new Date(Date.now() + ms);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const localFromIso = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const isoFromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

const DEADLINES = [
  { label: "No end", ms: 0 },
  { label: "6 hours", ms: 6 * HOUR },
  { label: "24 hours", ms: 24 * HOUR },
  { label: "3 days", ms: 72 * HOUR },
  { label: "7 days", ms: 168 * HOUR },
];

const TEMPLATES: { label: string; endsIn?: number; value: Partial<BroadcastPayload> }[] = [
  {
    label: "⚡ Flash sale",
    endsIn: 6 * HOUR,
    value: {
      kind: "offer",
      theme: "sunset",
      badge: "Up to 30% off",
      title: "⚡ Flash sale on vitamins",
      body: "Stock up on vitamins and supplements at our lowest prices of the month. Today only!",
      cta: "Grab the deal",
      coupon: "",
      link: "/products",
      popup: true,
    },
  },
  {
    label: "🎉 Weekend coupon",
    endsIn: 72 * HOUR,
    value: {
      kind: "offer",
      theme: "violet",
      badge: "10% off",
      title: "🎉 Weekend special: 10% off everything",
      body: "Save 10% on medicines and healthcare essentials. Free delivery on orders over ৳1,000.",
      cta: "Shop now",
      coupon: "WEEKEND10",
      link: "/products",
      popup: true,
    },
  },
  {
    label: "🌙 Festival",
    endsIn: 168 * HOUR,
    value: {
      kind: "offer",
      theme: "gold",
      badge: "Festive offer",
      title: "🌙 Festive savings for your family",
      body: "Celebrate with care: special prices on baby care, beauty and wellness all week.",
      cta: "Explore offers",
      coupon: "FESTIVE15",
      link: "/category/baby-mom-care",
      popup: true,
    },
  },
  {
    label: "Delivery notice",
    value: {
      kind: "notice",
      theme: "ocean",
      badge: "",
      title: "Delivery schedule update",
      body: "Due to the holiday, orders placed today will be delivered tomorrow. Thank you for your patience.",
      cta: "",
      coupon: "",
      link: "",
      popup: false,
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

type PreviewTab = "push" | "popup" | "inbox";

/** What the server sends to the tray (mirrors pushMessage in server/push.mjs). */
function trayText(form: BroadcastPayload) {
  const extras = [
    form.coupon && `Use code ${form.coupon}`,
    form.expiresAt &&
      `Ends ${new Date(form.expiresAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`,
  ].filter(Boolean);
  return {
    title: (form.badge ? `${form.title} · ${form.badge}` : form.title) || "Notification title",
    body: form.body || "Your message appears here.",
    extra: extras.join(" · "),
  };
}

function PhoneFrame({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.6rem] bg-slate-900 p-2.5 shadow-2xl shadow-slate-900/30">
      <div
        className="relative min-h-[520px] overflow-hidden rounded-[2.1rem] p-3 pt-9"
        style={{
          background: dim
            ? "linear-gradient(160deg,#1e1b4b,#312e81 45%,#0f172a)"
            : "linear-gradient(160deg,#c4b5fd,#818cf8 40%,#1e293b)",
        }}
      >
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
        <div className="absolute inset-x-4 top-2.5 flex justify-between text-[10px] font-semibold text-white/80">
          <span>9:41</span>
          <span>5G ▮▮▮</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function TrayPreview({ form }: { form: BroadcastPayload }) {
  const theme = offerTheme(form.theme);
  const t = trayText(form);
  const header = (
    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
      <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-black text-white" style={{ background: theme.accent }}>
        +
      </span>
      <span style={{ color: theme.accent }}>Niramoy Pharmacy</span> · now
    </div>
  );
  return (
    <div className="space-y-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-white/70">Collapsed</p>
      <div className="flex gap-3 rounded-2xl bg-white/95 p-3 shadow-lg">
        <div className="min-w-0 flex-1">
          {header}
          <p className="truncate text-[13px] font-bold text-ink-900">{t.title}</p>
          <p className="truncate text-xs text-slate-600">{t.body}</p>
        </div>
        {form.image && <img src={imgUrl(form.image)} alt="" className="h-10 w-10 shrink-0 self-center rounded-lg object-cover" />}
      </div>
      <p className="pt-1 text-center text-[10px] font-semibold uppercase tracking-widest text-white/70">Expanded</p>
      <div className="rounded-2xl bg-white/95 p-3 shadow-lg">
        {header}
        <p className="text-[13px] font-bold text-ink-900">{t.title}</p>
        <p className="whitespace-pre-line text-xs text-slate-600">{t.body}</p>
        {t.extra && <p className="mt-0.5 text-xs font-semibold" style={{ color: theme.accent }}>{t.extra}</p>}
        {form.image ? (
          <img src={imgUrl(form.image)} alt="" className="mt-2 aspect-[2/1] w-full rounded-xl object-cover" />
        ) : (
          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-400">
            Add an image to show a big picture here.
          </p>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { success, error: toastError } = useToast();
  const [params, setParams] = useSearchParams();
  const page = Math.max(Number(params.get("page") || 1), 1);
  const { data, loading, error, refresh } = useFetch(() => adminApi.notifications({ page, limit: 15 }), [page]);
  const stats = data?.stats;
  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / (data?.limit || 15)), 1);
  const formTop = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BroadcastPayload>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState<"" | "image" | "send">("");
  const [deleting, setDeleting] = useState<AdminNotification | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("push");
  const [replay, setReplay] = useState(0);

  const set = <K extends keyof BroadcastPayload>(key: K, value: BroadcastPayload[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const preview = { ...form, expiresAt: isoFromLocal(form.expiresAt) || null };
  const previewForm = { ...form, expiresAt: isoFromLocal(form.expiresAt) };

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 3) next.title = "Write a title of at least 3 characters.";
    if (form.body.trim().length < 3) next.body = "Write a message.";
    if (form.link && !/^(\/|https?:\/\/)/.test(form.link.trim())) next.link = "Links must start with / or http(s)://";
    if (form.coupon && !/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(form.coupon)) {
      next.coupon = "Use letters, numbers, - and _ only.";
    }
    if (form.expiresAt && new Date(form.expiresAt).getTime() < Date.now() + 60_000) {
      next.expiresAt = "The end time must be in the future.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const sendNow = async () => {
    try {
      let image = form.image.trim();
      if (image) {
        setSending("image");
        image = await preparePushImage(image);
      }
      setSending("send");
      await adminApi.sendNotification({
        ...form,
        image,
        title: form.title.trim(),
        body: form.body.trim(),
        link: form.link.trim(),
        cta: form.cta.trim(),
        badge: form.badge.trim(),
        expiresAt: isoFromLocal(form.expiresAt),
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
      setSending("");
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

  const duplicate = (n: AdminNotification) => {
    const ended = n.expiresAt && new Date(n.expiresAt).getTime() < Date.now();
    setForm({
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      image: n.image,
      cta: n.cta || "",
      coupon: n.coupon || "",
      badge: n.badge || "",
      theme: n.theme || "violet",
      expiresAt: ended ? "" : localFromIso(n.expiresAt),
      popup: !!n.popup,
    });
    setErrors({});
    formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const insertEmoji = (emoji: string) => {
    const el = titleInput.current;
    const at = el?.selectionStart ?? form.title.length;
    const next = `${form.title.slice(0, at)}${emoji}${form.title.slice(at)}`.slice(0, 140);
    set("title", next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + emoji.length, at + emoji.length);
    });
  };

  const theme = offerTheme(form.theme);

  return (
    <div>
      <PageHeader
        title="Push notifications"
        subtitle="Design and send offers and notices to every customer's phone. Order and wallet updates are sent automatically."
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

      <div ref={formTop} className="grid scroll-mt-20 gap-5 xl:grid-cols-[1.35fr_1fr]">
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
                    setForm((f) => ({ ...f, ...t.value, expiresAt: t.endsIn ? localIn(t.endsIn) : "" }));
                    setErrors({});
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <form
            className="space-y-5"
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
                    onClick={() => setForm((f) => ({ ...f, kind: k.key, popup: k.key === "offer" }))}
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

            <div>
              <span className="label">Colour theme</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(OFFER_THEMES) as OfferThemeKey[]).map((key) => {
                  const t = OFFER_THEMES[key];
                  const active = form.theme === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={t.label}
                      onClick={() => set("theme", key)}
                      className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition ${
                        active ? "border-transparent ring-2" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                      style={active ? { color: t.accent, background: t.soft, ["--tw-ring-color" as string]: t.accent } : undefined}
                    >
                      <span className="h-6 w-6 rounded-full shadow-inner" style={{ background: themeGradient(t) }} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Field label="Title" error={errors.title} hint={`${form.title.length}/140 · emoji make offers stand out`}>
                <input
                  ref={titleInput}
                  className="input"
                  maxLength={140}
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. 🎉 Flat 10% off this weekend"
                />
              </Field>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-base transition hover:scale-110 hover:bg-slate-100"
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

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

            <ImageField
              label="Big picture"
              value={form.image}
              onChange={(url) => set("image", url)}
              aspect="aspect-[2/1]"
              hint="Wide images (2:1, e.g. 1200×600) look best. On send it is cropped to 2:1 and compressed so phones can show it in the notification."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Badge (optional)" error={errors.badge} hint="Ribbon on the image, e.g. 30% OFF">
                <input
                  className="input"
                  maxLength={30}
                  value={form.badge}
                  onChange={(e) => set("badge", e.target.value)}
                  placeholder="30% OFF"
                />
              </Field>
              <Field label="Button text (optional)" error={errors.cta} hint="Defaults to “Shop now”">
                <input
                  className="input"
                  maxLength={40}
                  value={form.cta}
                  onChange={(e) => set("cta", e.target.value)}
                  placeholder="Shop now"
                />
              </Field>
              <Field label="Coupon code (optional)" error={errors.coupon} hint="Customers can copy it with one tap">
                <input
                  className="input font-mono uppercase tracking-widest"
                  maxLength={30}
                  value={form.coupon}
                  onChange={(e) => set("coupon", e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  placeholder="SAVE10"
                />
              </Field>
              <Field
                label="Opens when tapped (optional)"
                error={errors.link}
                hint="An app page such as /products, or a full https:// link"
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
            </div>

            <div>
              <span className="label">Offer ends (countdown)</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {DEADLINES.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    className={`chip ${
                      (d.ms === 0 && !form.expiresAt) ? "chip-active" : ""
                    }`}
                    onClick={() => set("expiresAt", d.ms ? localIn(d.ms) : "")}
                  >
                    {d.label}
                  </button>
                ))}
                <input
                  type="datetime-local"
                  className="input w-auto py-1.5 text-sm"
                  value={form.expiresAt}
                  min={localIn(5 * 60e3)}
                  onChange={(e) => set("expiresAt", e.target.value)}
                />
              </div>
              {errors.expiresAt && <span className="field-error">{errors.expiresAt}</span>}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-brand-200">
              <span className="relative mt-0.5 inline-flex">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={form.popup}
                  onChange={(e) => set("popup", e.target.checked)}
                />
                <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
              </span>
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
                  <Sparkles className="h-4 w-4 text-brand-600" /> Full-screen animated pop-up
                </span>
                <span className="block text-xs text-slate-500">
                  Opens with confetti when it arrives while the app is open, when the push is tapped, and once on the
                  next app launch for customers who missed it.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setForm(EMPTY)} disabled={!!sending}>
                Clear
              </button>
              <button type="submit" className="btn-primary" disabled={!!sending}>
                <Send className="h-4 w-4" /> Send to all customers
              </button>
            </div>
          </form>
        </Panel>

        <Panel className="xl:sticky xl:top-4 xl:self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title">Live preview</h2>
            <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
              {(
                [
                  { key: "push", label: "Notification" },
                  { key: "popup", label: "Pop-up" },
                  { key: "inbox", label: "Inbox" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTab(t.key);
                    if (t.key === "popup") setReplay((r) => r + 1);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 transition ${tab === t.key ? "bg-white text-ink-800 shadow-sm" : "text-slate-500"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "push" && (
            <PhoneFrame>
              <TrayPreview form={previewForm} />
            </PhoneFrame>
          )}
          {tab === "popup" && (
            <PhoneFrame dim>
              <div key={replay} className="motion-safe:animate-offerIn">
                <OfferCard offer={preview} variant="popup" />
              </div>
            </PhoneFrame>
          )}
          {tab === "inbox" && (
            <div className="rounded-3xl bg-mint p-3">
              <OfferCard offer={preview} variant="inbox" />
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {tab === "push" && "How the closed-app push looks on Android."}
              {tab === "popup" && (form.popup ? "Shown full screen with confetti." : "Pop-up is off for this one.")}
              {tab === "inbox" && "Card in Account → Notifications."}
            </span>
            {tab === "popup" && (
              <button type="button" className="link shrink-0" onClick={() => setReplay((r) => r + 1)}>
                Replay animation
              </button>
            )}
          </div>
          <div className="mt-3 h-1.5 rounded-full" style={{ background: themeGradient(theme, 90) }} />
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
          {data!.notifications.map((n) => {
            const t = offerTheme(n.theme);
            const ended = n.expiresAt && new Date(n.expiresAt).getTime() < Date.now();
            return (
              <li key={n.id} className="relative flex items-start gap-3 px-4 py-3 pl-5">
                <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: themeGradient(t, 180) }} />
                <NotificationIcon kind={n.kind} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                    {n.title}
                    {n.badge && (
                      <span className="rounded-full px-2 py-px text-[10px] font-black text-white" style={{ background: themeGradient(t) }}>
                        {n.badge}
                      </span>
                    )}
                    {n.popup && <span className="badge badge-accent">Pop-up</span>}
                  </p>
                  <p className="text-xs text-slate-600">{n.body}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                    {fmt(n.createdAt)}
                    {n.createdByName ? ` · by ${n.createdByName}` : ""}
                    {n.coupon && (
                      <span className="rounded border border-dashed border-slate-300 px-1 font-mono font-bold text-slate-500">
                        {n.coupon}
                      </span>
                    )}
                    {n.expiresAt && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-3 w-3" /> {ended ? "ended" : "ends"} {fmt(n.expiresAt)}
                      </span>
                    )}
                    {n.link ? ` · opens ${n.link}` : ""}
                    {n.pushSent ? ` · pushed to ${n.pushSent} device${n.pushSent === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                {n.image && (
                  <img
                    src={imgUrl(n.image)}
                    alt=""
                    className="hidden h-12 w-24 shrink-0 rounded-lg bg-slate-50 object-cover sm:block"
                  />
                )}
                <button className="btn-icon text-slate-400 hover:text-brand-600" aria-label="Duplicate" title="Duplicate" onClick={() => duplicate(n)}>
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  className="btn-icon text-slate-400 hover:text-rose-600"
                  aria-label="Delete"
                  title="Delete"
                  onClick={() => setDeleting(n)}
                >
                  <Trash className="h-4 w-4" />
                </button>
              </li>
            );
          })}
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
            {stats ? ` (${stats.customers.toLocaleString()} accounts)` : ""}
            {form.popup ? " and open as a full-screen pop-up in the app" : ""}. It can&apos;t be unsent from phones
            that already received it.
          </>
        }
        confirmLabel={sending === "image" ? "Preparing image…" : sending ? "Sending…" : "Send now"}
        tone="primary"
        busy={!!sending}
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
