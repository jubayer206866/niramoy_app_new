import { useState } from "react";
import type { Banner } from "../../api";
import { adminApi } from "../api";
import { Confirm, ImageField, Modal, PageHeader, RowsSkeleton } from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { Image, Pencil, Plus, Trash, External } from "../../components/Icons";
import { imgUrl, useFetch } from "../../lib";
import { useToast } from "../../context/ToastContext";

type Draft = { id?: number; title: string; subtitle: string; link: string; image: string; machine: string };
const EMPTY: Draft = { title: "", subtitle: "", link: "", image: "", machine: "top_carousel_1" };

export default function BannersPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useFetch(() => adminApi.banners(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Banner | null>(null);

  const openNew = () => {
    setDraft({ ...EMPTY });
  };
  const openEdit = (b: Banner) => {
    setDraft({
      id: b.id,
      title: b.title || "",
      subtitle: b.subtitle || "",
      link: b.link || "",
      image: b.image || "",
      machine: b.machine || "",
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      if (draft.id) {
        await adminApi.updateBanner(draft.id, { ...draft, id: undefined });
        toast.success("Banner saved");
      } else {
        await adminApi.createBanner({ ...draft });
        toast.success("Banner created");
      }
      setDraft(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the banner.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await adminApi.deleteBanner(pendingDelete.id);
      toast.success("Banner deleted");
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the banner.");
    } finally {
      setBusy(false);
    }
  };

  const banners = data ?? [];
  const hero = banners.filter((b) => (b.machine || "").includes("top_carousel"));

  return (
    <div>
      <PageHeader
        title="Banners"
        subtitle={`${hero.length} banner${hero.length === 1 ? "" : "s"} in the home carousel`}
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> New banner
          </button>
        }
      />

      {loading && <RowsSkeleton rows={4} />}
      {error && <ErrorBox message={error} />}
      {!loading && !error && banners.length === 0 && (
        <EmptyBox
          icon={<Image className="h-6 w-6" />}
          title="No banners"
          message="Add a banner to populate the home page carousel."
        />
      )}

      {!loading && !error && banners.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banners.map((b) => (
            <article key={b.id} className="card group overflow-hidden">
              <div className="relative aspect-[16/7] bg-slate-100">
                {b.image ? (
                  <img
                    src={imgUrl(b.image)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs text-slate-400">
                    No image
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-md bg-ink-900/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                  {b.machine || "—"}
                </span>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(b)}
                    aria-label="Edit banner"
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-500 shadow-soft hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(b)}
                    aria-label="Delete banner"
                    className="grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-slate-500 shadow-soft hover:text-rose-600"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <p className="truncate font-display text-base font-extrabold text-ink-900">
                  {b.title || "Untitled banner"}
                </p>
                {b.subtitle && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{b.subtitle}</p>
                )}
                {b.link && (
                  <a
                    href={b.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                  >
                    <External className="h-3.5 w-3.5" /> {b.link}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit banner" : "New banner"}
        footer={
          <>
            <button className="btn-outline" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save banner"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <label className="block">
              <span className="label">Title</span>
              <input
                className="input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Flat 20% off vitamins"
              />
            </label>
            <label className="block">
              <span className="label">Subtitle</span>
              <input
                className="input"
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                placeholder="This week only"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Link</span>
                <input
                  className="input"
                  value={draft.link}
                  onChange={(e) => setDraft({ ...draft, link: e.target.value })}
                  placeholder="/category/supplement"
                />
              </label>
              <label className="block">
                <span className="label">Machine</span>
                <input
                  className="input font-mono"
                  value={draft.machine}
                  onChange={(e) => setDraft({ ...draft, machine: e.target.value })}
                  placeholder="top_carousel_1"
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Machine names containing "top_carousel" show in the home hero
                </span>
              </label>
            </div>
            <ImageField
              label="Image"
              value={draft.image}
              onChange={(v) => setDraft({ ...draft, image: v })}
              aspect="aspect-[16/7]"
              hint="Wide image - 1200×500 or larger looks best"
            />
          </div>
        )}
      </Modal>

      <Confirm
        open={!!pendingDelete}
        title="Delete this banner?"
        message={
          <>
            <strong>{pendingDelete?.title || "This banner"}</strong> will be removed from the
            storefront.
          </>
        }
        confirmLabel="Delete banner"
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
