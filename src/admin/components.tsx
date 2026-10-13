import { useEffect, useRef, useState, type ReactNode } from "react";
import { useToast } from "../context/ToastContext";
import { EmptyState } from "../components/ui";
import {
  Check,
  Copy,
  Image as ImageIcon,
  Search,
  Trash,
  Upload,
  X,
} from "../components/Icons";
import { imgUrl, useDebounced } from "../lib";
import { adminApi, type MediaFile } from "./api";

/* ------------------------------------------------------------------ layout */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl bg-white p-2.5 ring-1 ring-slate-900/[.06] shadow-card">
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-[12rem] flex-1 ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      className={`input w-auto cursor-pointer pr-8 ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="scrollbar-none scroll-native mb-4 flex gap-1.5 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`tab shrink-0 ${value === t.key ? "tab-active" : ""}`}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                value === t.key ? "bg-white/20" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- states */
export function Empty({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel p-6">
      <EmptyState title={title} message={message} action={action} />
    </div>
  );
}

/* ------------------------------------------------------------------ forms */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 text-left disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </span>
      {(label || hint) && (
        <span>
          {label && <span className="block text-sm font-semibold text-ink-800">{label}</span>}
          {hint && <span className="block text-xs text-slate-400">{hint}</span>}
        </span>
      )}
    </button>
  );
}

export function CheckPill({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`chip ${checked ? "chip-active" : ""}`}
    >
      {checked && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- order pill */
const STATUS_TONES: Record<string, string> = {
  placed: "badge-warn",
  confirmed: "badge bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  shipped: "badge bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  delivered: "badge-success",
  cancelled: "badge-danger",
};

export function OrderStatusPill({ status }: { status: string }) {
  return (
    <span className={`${STATUS_TONES[status] ?? "badge bg-slate-100 text-slate-600"} capitalize`}>
      {status}
    </span>
  );
}

export const ORDER_STATUSES = ["placed", "confirmed", "shipped", "delivered", "cancelled"] as const;

/* ------------------------------------------------------------------ modal */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm"
      />
      <div
        className={`animate-rise relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift sm:rounded-3xl ${
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="scroll-native min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "danger",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={tone === "danger" ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-slate-600">{message}</div>
    </Modal>
  );
}

/* ------------------------------------------------------------ image picker */
const MEDIA_TABS = [
  { key: "uploads", label: "Uploads" },
  { key: "products", label: "Catalogue" },
  { key: "banners", label: "Banners" },
  { key: "categories", label: "Categories" },
];

/** Standalone modal that lists media folders, uploads files and picks one. */
export function MediaPickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [dir, setDir] = useState("uploads");
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [writable, setWritable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaFile | null>(null);
  const toast = useToast();
  const debounced = useDebounced(q, 300);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    adminApi
      .media({ dir, q: debounced })
      .then((r) => {
        if (!alive) return;
        setFiles(r.files);
        setWritable(r.writable);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, [open, dir, debounced, toast]);

  useEffect(() => setPendingDelete(null), [open, dir]);

  const deleteFile = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await adminApi.deleteMedia(pendingDelete.name, dir);
      setFiles((prev) => prev.filter((f) => f.url !== pendingDelete.url));
      setPendingDelete(null);
      toast.success("Image deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the image.");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
      });
      const { file: saved } = await adminApi.uploadMedia(file.name, data);
      setDir("uploads");
      setQ("");
      setFiles((prev) => [saved, ...prev]);
      onPick(saved.url);
      onClose();
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose an image"
      size="lg"
      footer={
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile}
          />
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload new"}
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {MEDIA_TABS.map((t) => (
          <button
            key={t.key}
            className={`chip ${dir === t.key ? "chip-active" : ""}`}
            onClick={() => {
              setDir(t.key);
              setQ("");
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mb-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search file name…" />
      </div>

      {pendingDelete && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
          <img
            src={imgUrl(pendingDelete.url)}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain p-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-700">Delete this image permanently?</p>
            <p className="truncate text-xs text-rose-600/80">
              {pendingDelete.name} - anything still using it will show a placeholder.
            </p>
          </div>
          <button className="btn-outline btn-sm" disabled={busy} onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button
            className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700"
            disabled={busy}
            onClick={() => void deleteFile()}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}

      {files.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          No images here yet - upload one to get started.
        </p>
      ) : (
        <div className="scroll-native grid max-h-[46vh] grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-5">
          {files.map((f) => (
            <div key={f.url} className="group relative aspect-square">
              <button
                type="button"
                onClick={() => {
                  onPick(f.url);
                  onClose();
                }}
                title={f.name}
                className={`h-full w-full overflow-hidden rounded-xl border bg-slate-50 transition hover:border-brand-400 hover:ring-2 hover:ring-brand-100 ${
                  pendingDelete?.url === f.url ? "border-rose-400 ring-2 ring-rose-200" : "border-slate-200"
                }`}
              >
                <img
                  src={imgUrl(f.url)}
                  alt={f.name}
                  loading="lazy"
                  className="h-full w-full object-contain p-1"
                />
                <span className="absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-ink-900/70 px-1.5 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  {f.name}
                </span>
              </button>
              {writable && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(f)}
                  aria-label={`Delete ${f.name}`}
                  title="Delete image"
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-slate-500 shadow-soft transition hover:text-rose-600 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Tip: paste any <code className="rounded bg-slate-100 px-1">/img/…</code> path or a full URL
        into the field behind the preview.
      </p>
    </Modal>
  );
}

export function ImageField({
  label,
  value,
  onChange,
  hint,
  aspect = "aspect-square",
}: {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  aspect?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex items-start gap-3">
        <span
          className={`grid ${aspect} w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50`}
        >
          {value ? (
            <img
              src={imgUrl(value)}
              alt=""
              className="h-full w-full object-contain p-1"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-slate-300" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => setOpen(true)}>
              Choose image
            </button>
            {value && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => onChange("")}>
                Remove
              </button>
            )}
          </div>
          <input
            className="input"
            placeholder="…or paste an image path / URL"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
      </div>

      <MediaPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(url) => {
          onChange(url);
          setOpen(false);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ misc */
/** Placeholder rows while a table loads. */
export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="panel divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <div className="skeleton h-11 w-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5 rounded" />
            <div className="skeleton h-3 w-1/5 rounded" />
          </div>
          <div className="skeleton hidden h-6 w-16 rounded-full sm:block" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CopyButton({ value, label = "Copy URL" }: { value: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn-outline btn-sm"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => toast.success("Copied to clipboard"))
          .catch(() => toast.error("Clipboard unavailable"));
      }}
    >
      <Copy className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
