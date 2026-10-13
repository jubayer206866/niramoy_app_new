import { useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, type AdminCategory } from "../api";
import {
  Confirm,
  ImageField,
  Modal,
  PageHeader,
  RowsSkeleton,
  Toggle,
} from "../components";
import { EmptyBox, ErrorBox } from "../../components/Errors";
import { Pencil, Plus, Trash, Grid } from "../../components/Icons";
import { imgUrl, useFetch } from "../../lib";
import { useToast } from "../../context/ToastContext";

type Draft = { slug: string; name: string; icon: string; hasPage: boolean };
const EMPTY_DRAFT: Draft = { slug: "", name: "", icon: "", hasPage: true };

export default function CategoriesPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useFetch(() => adminApi.categories(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setIsNew(true);
    setFields({});
  };

  const openEdit = (c: AdminCategory) => {
    setDraft({ slug: c.slug, name: c.name, icon: c.icon || "", hasPage: c.hasPage });
    setIsNew(false);
    setFields({});
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setFields({});
    try {
      if (isNew) {
        await adminApi.createCategory({
          slug: draft.slug || draft.name,
          name: draft.name,
          icon: draft.icon,
          hasPage: draft.hasPage,
        });
        toast.success("Category created");
      } else {
        await adminApi.updateCategory(draft.slug, {
          name: draft.name,
          icon: draft.icon,
          hasPage: draft.hasPage,
        });
        toast.success("Category saved");
      }
      setDraft(null);
      refresh();
    } catch (e) {
      const err = e as Error & { fields?: Record<string, string> };
      setFields(err.fields ?? {});
      toast.error(err.message || "Could not save the category.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await adminApi.deleteCategory(pendingDelete.slug);
      toast.success(`"${pendingDelete.name}" deleted`);
      setPendingDelete(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the category.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="The tiles and filters customers use to browse the store"
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="h-4 w-4" /> New category
          </button>
        }
      />

      {loading && <RowsSkeleton rows={6} />}
      {error && <ErrorBox message={error} />}

      {!loading && !error && (data ?? []).length === 0 && (
        <EmptyBox
          icon={<Grid className="h-6 w-6" />}
          title="No categories"
          message="Create your first category to start grouping products."
        />
      )}

      {!loading && !error && (data ?? []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((c) => (
            <article key={c.slug} className="card group p-4 transition hover:ring-brand-200">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50 text-brand-600">
                  {c.icon ? (
                    <img
                      src={imgUrl(c.icon)}
                      alt=""
                      className="h-full w-full object-contain p-1.5"
                      loading="lazy"
                    />
                  ) : (
                    <Grid className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-extrabold text-ink-900">
                    {c.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">/{c.slug}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(c)}
                    aria-label={`Edit ${c.name}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(c)}
                    aria-label={`Delete ${c.name}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <Link
                  to={`/admin/products?cat=${encodeURIComponent(c.slug)}`}
                  className="font-semibold text-brand-600 hover:underline"
                >
                  {c.productCount.toLocaleString()} products
                </Link>
                <span className={c.hasPage ? "badge-success" : "badge bg-slate-100 text-slate-500"}>
                  {c.hasPage ? "Listing page" : "Hidden"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* editor */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={isNew ? "New category" : "Edit category"}
        footer={
          <>
            <button className="btn-outline" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : isNew ? "Create category" : "Save changes"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <label className="block">
              <span className="label">Name</span>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Vitamins & Supplements"
              />
              {fields.name && <span className="field-error">{fields.name}</span>}
            </label>
            <label className="block">
              <span className="label">Slug</span>
              <input
                className="input font-mono"
                value={draft.slug}
                disabled={!isNew}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="vitamins-supplements"
              />
              {isNew ? (
                fields.slug ? (
                  <span className="field-error">{fields.slug}</span>
                ) : (
                  <span className="mt-1 block text-xs text-slate-400">
                    Used in URLs - lowercase letters, numbers and dashes
                  </span>
                )
              ) : (
                <span className="mt-1 block text-xs text-slate-400">
                  Slugs cannot change after creation
                </span>
              )}
            </label>
            <ImageField
              label="Icon"
              value={draft.icon}
              onChange={(v) => setDraft({ ...draft, icon: v })}
              hint="Square image or icon shown on the home tiles"
            />
            <Toggle
              checked={draft.hasPage}
              onChange={(v) => setDraft({ ...draft, hasPage: v })}
              label="Listing page enabled"
              hint="Customers can open this category as a page"
            />
          </div>
        )}
      </Modal>

      <Confirm
        open={!!pendingDelete}
        title="Delete this category?"
        message={
          <>
            <strong>{pendingDelete?.name}</strong> will be removed. Categories that still contain
            products cannot be deleted - reassign those products first.
          </>
        }
        confirmLabel="Delete category"
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
