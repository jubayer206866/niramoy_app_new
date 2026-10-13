import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api";
import { adminApi, type AdminProduct, type ProductPayload } from "../api";
import {
  CheckPill,
  Confirm,
  ImageField,
  MediaPickerModal,
  PageHeader,
  RowsSkeleton,
  Toggle,
} from "../components";
import { ErrorBox } from "../../components/Errors";
import { X, ChevronLeft, External, Trash, Plus } from "../../components/Icons";
import { useToast } from "../../context/ToastContext";
import { imgUrl, useFetch } from "../../lib";

interface FormState {
  name: string;
  slug: string;
  brand: string;
  generic: string;
  strength: string;
  form: string;
  type: string;
  unitLabel: string;
  price: string;
  mrp: string;
  discountPercent: string;
  shortDesc: string;
  descriptionHtml: string;
  note: string;
  metaTitle: string;
  image: string;
  images: string[];
  stockStatus: boolean;
  rx: boolean;
  cold: boolean;
  hidden: boolean;
}

const EMPTY: FormState = {
  name: "",
  slug: "",
  brand: "",
  generic: "",
  strength: "",
  form: "",
  type: "",
  unitLabel: "",
  price: "",
  mrp: "",
  discountPercent: "0",
  shortDesc: "",
  descriptionHtml: "",
  note: "",
  metaTitle: "",
  image: "",
  images: [],
  stockStatus: true,
  rx: false,
  cold: false,
  hidden: false,
};

function fromProduct(p: AdminProduct): FormState {
  return {
    name: p.name ?? "",
    slug: p.slug ?? "",
    brand: p.brand ?? "",
    generic: p.generic ?? "",
    strength: p.strength ?? "",
    form: p.form ?? "",
    type: p.type ?? "",
    unitLabel: p.unitLabel ?? "",
    price: String(p.price ?? ""),
    mrp: String(p.mrp ?? ""),
    discountPercent: String(p.discountPercent ?? 0),
    shortDesc: p.shortDesc ?? "",
    descriptionHtml: p.descriptionHtml ?? "",
    note: p.note ?? "",
    metaTitle: p.metaTitle ?? "",
    image: p.image ?? "",
    images: p.images ?? [],
    stockStatus: !!p.stockStatus,
    rx: !!p.rx,
    cold: !!p.cold,
    hidden: !!p.hidden,
  };
}

function Input({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input font-mono text-xs leading-relaxed" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export default function ProductEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picker, setPicker] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const { data, loading, error, refresh } = useFetch(
    () =>
      isNew
        ? Promise.resolve({ product: null as AdminProduct | null, categories: [] as string[] })
        : adminApi.product(id!),
    [id],
  );
  const { data: allCategories } = useFetch(() => adminApi.categories(), []);

  const p = data?.product;
  useEffect(() => {
    if (p && String(p.id) !== loadedId) {
      setForm(fromProduct(p));
      setPicked(data?.categories ?? []);
      setLoadedId(String(p.id));
      setFields({});
    }
  }, [p, data, loadedId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setFields({});
    const payload: ProductPayload = {
      name: form.name,
      slug: form.slug,
      price: Number(form.price) || 0,
      mrp: Number(form.mrp) || Number(form.price) || 0,
      discountPercent: Number(form.discountPercent) || 0,
      stockStatus: form.stockStatus,
      rx: form.rx,
      cold: form.cold,
      hidden: form.hidden,
      type: form.type,
      form: form.form,
      strength: form.strength,
      generic: form.generic,
      brand: form.brand,
      shortDesc: form.shortDesc,
      descriptionHtml: form.descriptionHtml,
      note: form.note,
      metaTitle: form.metaTitle,
      unitLabel: form.unitLabel,
      image: form.image,
      images: form.images,
      categories: picked,
    };
    try {
      if (isNew) {
        const res = await adminApi.createProduct(payload);
        toast.success("Product created");
        nav(`/admin/products/${res.product.id}`, { replace: true });
      } else {
        const res = await adminApi.updateProduct(id!, payload);
        setForm(fromProduct(res.product));
        setPicked(res.categories);
        toast.success("Product saved");
        refresh();
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (Object.keys(e.fields).length) toast.error("Please fix the highlighted fields.");
        else toast.error(e.message);
      } else {
        toast.error("Could not save the product.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id) return;
    try {
      await adminApi.deleteProduct(id);
      toast.success("Product deleted");
      nav("/admin/products", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the product.");
    }
  };

  if (!isNew && loading) return <RowsSkeleton rows={6} />;
  if (!isNew && error) return <ErrorBox message={error} />;

  const gallery = form.images.filter(Boolean);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/products" className="btn-ghost btn-sm -ml-2">
          <ChevronLeft className="h-4 w-4" /> Back to products
        </Link>
        {!isNew && p && (
          <Link to={`/product/${p.id}/${p.slug}`} target="_blank" className="btn-outline btn-sm">
            <External className="h-4 w-4" /> View in store
          </Link>
        )}
      </div>

      <PageHeader
        title={isNew ? "Add product" : p?.name || "Edit product"}
        subtitle={
          isNew
            ? "Create a new item - it appears on the storefront as soon as you save it."
            : `Editing #${p?.id} · changes are written to the live catalogue`
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        {/* ------------------------------------------------------ main form */}
        <div className="space-y-5">
          <section className="panel space-y-4">
            <h2 className="section-title">Basics</h2>
            <Input
              label="Product name"
              value={form.name}
              onChange={(v) => set("name", v)}
              error={fields.name}
              placeholder="e.g. Napa Extra 500mg"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Slug"
                value={form.slug}
                onChange={(v) => set("slug", v)}
                error={fields.slug}
                hint="URL path - leave blank to generate from the name"
              />
              <Input label="Brand" value={form.brand} onChange={(v) => set("brand", v)} />
              <Input label="Generic / molecule" value={form.generic} onChange={(v) => set("generic", v)} />
              <Input label="Strength" value={form.strength} onChange={(v) => set("strength", v)} placeholder="500mg" />
              <Input label="Form" value={form.form} onChange={(v) => set("form", v)} placeholder="Tablet / Capsule" />
              <Input label="Type" value={form.type} onChange={(v) => set("type", v)} placeholder="medicine / beauty…" />
            </div>
            <Input
              label="Unit label"
              value={form.unitLabel}
              onChange={(v) => set("unitLabel", v)}
              hint="Shown under the price, e.g. 'Strip of 10'"
            />
          </section>

          <section className="panel space-y-4">
            <h2 className="section-title">Pricing & stock</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Price (৳)"
                value={form.price}
                onChange={(v) => set("price", v)}
                error={fields.price}
                hint="Selling price"
              />
              <Input
                label="MRP (৳)"
                value={form.mrp}
                onChange={(v) => set("mrp", v)}
                hint="Strike-through price"
              />
              <Input
                label="Discount %"
                value={form.discountPercent}
                onChange={(v) => set("discountPercent", v)}
                hint="Badge shown on cards"
              />
            </div>
            <div className="divider" />
            <div className="flex flex-wrap items-center gap-6">
              <Toggle
                checked={form.stockStatus}
                onChange={(v) => set("stockStatus", v)}
                label="In stock"
                hint={form.stockStatus ? "Customers can add it to the cart" : "Shows as out of stock"}
              />
              <Toggle
                checked={form.rx}
                onChange={(v) => set("rx", v)}
                label="Prescription (Rx)"
                hint="Adds the Rx badge"
              />
              <Toggle
                checked={form.cold}
                onChange={(v) => set("cold", v)}
                label="Cold chain"
                hint="Keep refrigerated badge"
              />
            </div>
          </section>

          <section className="panel space-y-4">
            <h2 className="section-title">Description</h2>
            <Area
              label="Short description"
              value={form.shortDesc}
              onChange={(v) => set("shortDesc", v)}
              rows={2}
              hint="One or two lines shown under the product title"
            />
            <Area
              label="Description (HTML)"
              value={form.descriptionHtml}
              onChange={(v) => set("descriptionHtml", v)}
              rows={8}
              hint="Full page body - basic HTML is allowed"
            />
            <Area label="Note" value={form.note} onChange={(v) => set("note", v)} rows={2} />
          </section>

          <section className="panel space-y-4">
            <h2 className="section-title">Images</h2>
            <ImageField
              label="Primary image"
              value={form.image}
              onChange={(v) => set("image", v)}
              hint="Used on cards, search results and the product page"
            />

            <div>
              <span className="label">Gallery ({gallery.length})</span>
              <div className="flex flex-wrap gap-2">
                {gallery.map((src, i) => (
                  <span
                    key={`${src}-${i}`}
                    className="group relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  >
                    <img src={imgUrl(src)} alt="" className="h-full w-full object-contain p-1" />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() =>
                        set(
                          "images",
                          gallery.filter((_, idx) => idx !== i),
                        )
                      }
                      className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-ink-900/80 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setPicker(true)}
                  className="grid h-16 w-16 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-brand-400 hover:text-brand-600"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                The gallery rotates on the product page. The primary image always shows first.
              </p>
            </div>
            <MediaPickerModal
              open={picker}
              onClose={() => setPicker(false)}
              onPick={(url) => set("images", [...gallery, url])}
            />
          </section>
        </div>

        {/* --------------------------------------------------------- sidebar */}
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <section className="panel space-y-4">
            <h2 className="section-title">Publishing</h2>
            <Toggle
              checked={!form.hidden}
              onChange={(v) => set("hidden", !v)}
              label={form.hidden ? "Unpublished" : "Live on the storefront"}
              hint={form.hidden ? "Hidden from every listing and search" : "Visible to customers"}
            />
            <div className="divider" />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary flex-1" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
              </button>
              {!isNew && (
                <Link
                  to={`/product/${p?.id}/${p?.slug}`}
                  target="_blank"
                  className="btn-outline"
                  title="View in store"
                >
                  <External className="h-4 w-4" />
                </Link>
              )}
            </div>
            {!isNew && (
              <button className="btn w-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100" onClick={() => setConfirmDelete(true)}>
                <Trash className="h-4 w-4" /> Delete product
              </button>
            )}
          </section>

          <section className="panel space-y-3">
            <h2 className="section-title">Categories</h2>
            <p className="text-xs text-slate-400">
              Products need at least one category to show on listing pages.
            </p>
            <div className="flex flex-wrap gap-2">
              {(allCategories ?? []).map((c) => (
                <CheckPill
                  key={c.slug}
                  checked={picked.includes(c.slug)}
                  onChange={(on) =>
                    setPicked((prev) => (on ? [...prev, c.slug] : prev.filter((s) => s !== c.slug)))
                  }
                >
                  {c.name}
                </CheckPill>
              ))}
            </div>
          </section>

          <section className="panel space-y-3">
            <h2 className="section-title">SEO</h2>
            <Input
              label="Meta title"
              value={form.metaTitle}
              onChange={(v) => set("metaTitle", v)}
              hint="Search engine title - falls back to the product name"
            />
            <Input label="URL slug" value={form.slug} onChange={(v) => set("slug", v)} error={fields.slug} />
          </section>
        </div>
      </div>

      <Confirm
        open={confirmDelete}
        title="Delete this product?"
        message={
          <>
            <strong>{form.name || "This product"}</strong> will be removed from the catalogue and the
            storefront. This cannot be undone from the panel.
          </>
        }
        confirmLabel="Delete product"
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
