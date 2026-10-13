import { useRef, useState } from "react";
import { adminApi } from "../api";
import { CopyButton, PageHeader, RowsSkeleton, SearchInput, Select, Tabs, Toolbar } from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { External, Image, Trash, Upload } from "../../components/Icons";
import { imgUrl, useDebounced, useFetch } from "../../lib";
import { useToast } from "../../context/ToastContext";

const DIRS = [
  { key: "uploads", label: "Uploads" },
  { key: "products", label: "Catalogue" },
  { key: "banners", label: "Banners" },
  { key: "categories", label: "Categories" },
];

const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(Math.round(bytes / 1024), 1)} KB`;

export default function MediaPage() {
  const toast = useToast();
  const [dir, setDir] = useState("uploads");
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 300);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ name: string; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, loading, error, refresh } = useFetch(
    () => adminApi.media({ dir, q: debounced }),
    [dir, debounced],
  );

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of files) {
      try {
        const payload = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read file."));
          reader.readAsDataURL(file);
        });
        await adminApi.uploadMedia(file.name, payload);
        ok++;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `${file.name} failed.`);
      }
    }
    setBusy(false);
    if (ok) {
      toast.success(`${ok} image${ok === 1 ? "" : "s"} uploaded`);
      setDir("uploads");
      refresh();
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await adminApi.deleteMedia(pendingDelete.name, dir);
      toast.success("File deleted");
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the file.");
    } finally {
      setBusy(false);
    }
  };

  const files = data?.files ?? [];

  return (
    <div>
      <PageHeader
        title="Media library"
        subtitle="Images used by banners, products and categories"
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={upload}
            />
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload images"}
            </button>
          </>
        }
      />

      <Tabs
        value={dir}
        onChange={(k) => setDir(k)}
        tabs={DIRS.map((d) => ({ key: d.key, label: d.label }))}
      />

      <Toolbar>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={dir === "products" ? "Filter catalogue file names…" : "Filter file names…"}
        />
        <Select
          value=""
          onChange={() => undefined}
          options={[{ value: "", label: `${files.length} files` }]}
          className="cursor-default opacity-70"
        />
      </Toolbar>

      {loading && <RowsSkeleton rows={6} />}
      {error && <ErrorBox message={error} />}

      {!loading && !error && files.length === 0 && (
        <EmptyBox
          icon={<Image className="h-6 w-6" />}
          title="No images"
          message={
            dir === "uploads"
              ? "Upload images to use them on banners and products."
              : "This folder has no images."
          }
        />
      )}

      {!loading && !error && files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {files.map((f) => (
            <figure key={f.url} className="card group overflow-hidden">
              <div className="relative aspect-square bg-slate-50">
                <img
                  src={imgUrl(f.url)}
                  alt={f.name}
                  loading="lazy"
                  className="h-full w-full object-contain p-2"
                />
                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-ink-900/80 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                  <a
                    href={imgUrl(f.url)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open image"
                    className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-ink-800 hover:text-brand-600"
                  >
                    <External className="h-3.5 w-3.5" />
                  </a>
                  {data?.writable && (
                    <button
                      onClick={() => setPendingDelete({ name: f.name, url: f.url })}
                      aria-label="Delete image"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-ink-800 hover:text-rose-600"
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <figcaption className="space-y-2 p-2.5">
                <p className="truncate text-xs font-semibold" title={f.name}>
                  {f.name}
                </p>
                <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
                  <span>{kb(f.size)}</span>
                  <CopyButton value={f.url} label="Copy" />
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
          <button
            aria-label="Cancel"
            className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm"
            onClick={() => setPendingDelete(null)}
          />
          <div className="animate-rise relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-lift">
            <h2 className="font-display text-lg font-extrabold">Delete this image?</h2>
            <div className="my-3 overflow-hidden rounded-xl bg-slate-50">
              <img src={imgUrl(pendingDelete.url)} alt="" className="max-h-40 w-full object-contain" />
            </div>
            <p className="truncate text-xs text-slate-500">{pendingDelete.name}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="btn bg-rose-600 text-white hover:bg-rose-700"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
