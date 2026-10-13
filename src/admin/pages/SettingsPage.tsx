import { useEffect, useState } from "react";
import { adminApi } from "../api";
import { PageHeader, Panel, RowsSkeleton } from "../components";
import { ErrorBox } from "../../components/Errors";
import { useToast } from "../../context/ToastContext";
import { useFetch } from "../../lib";

const KNOWN: { key: string; label: string; hint: string; area?: boolean }[] = [
  { key: "tagline", label: "Tagline", hint: "Shown under the logo in the header" },
  { key: "phone", label: "Hotline", hint: "Customer care number" },
  { key: "whatsapp", label: "WhatsApp", hint: "Shown on the contact widgets" },
  {
    key: "seo_text",
    label: "SEO / footer text",
    hint: "Long text at the bottom of the page - good for search engines",
    area: true,
  },
];

const decodeEntities = (s: string) => {
  if (!s.includes("&")) return s;
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
};

const decodeAll = (v: Record<string, string>) =>
  Object.fromEntries(Object.entries(v).map(([k, val]) => [k, typeof val === "string" ? decodeEntities(val) : val]));

export default function SettingsPage() {
  const toast = useToast();
  const { data, loading, error } = useFetch(() => adminApi.site(), []);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !dirty) setValues(decodeAll(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const set = (key: string, v: string) => {
    setValues((prev) => ({ ...(prev ?? {}), [key]: v }));
    setDirty(true);
  };

  const save = async () => {
    if (!values) return;
    setSaving(true);
    try {
      const next = await adminApi.saveSite(values);
      setValues(next);
      setDirty(false);
      toast.success("Store settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !values) return <RowsSkeleton rows={3} />;
  if (error) return <ErrorBox message={error} />;

  const extraKeys = Object.keys(values ?? {}).filter((k) => !KNOWN.some((n) => n.key === k));

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Store-wide text shown across the storefront"
        actions={
          <button className="btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="space-y-4">
          <h2 className="section-title">Store info</h2>
          {KNOWN.map((f) =>
            f.area ? (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                <textarea
                  className="input text-sm leading-relaxed"
                  rows={6}
                  value={values?.[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
                <span className="mt-1 block text-xs text-slate-400">{f.hint}</span>
              </label>
            ) : (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                <input
                  className="input"
                  value={values?.[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
                <span className="mt-1 block text-xs text-slate-400">{f.hint}</span>
              </label>
            ),
          )}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="section-title mb-3">Preview</h2>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="font-display text-lg font-extrabold text-ink-900">Niramoy Pharmacy</p>
              <p className="mt-0.5 text-sm text-slate-500">{values?.tagline || "—"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                {values?.phone && (
                  <span className="rounded-lg bg-brand-50 px-2 py-1 font-semibold text-brand-700">
                    ☎ {values.phone}
                  </span>
                )}
                {values?.whatsapp && (
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                    WhatsApp {values.whatsapp}
                  </span>
                )}
              </div>
              {values?.seo_text && (
                <p className="mt-3 line-clamp-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
                  {values.seo_text}
                </p>
              )}
            </div>
          </Panel>

          {extraKeys.length > 0 && (
            <Panel className="space-y-4">
              <h2 className="section-title">Other keys</h2>
              {extraKeys.map((k) => (
                <label key={k} className="block">
                  <span className="label font-mono">{k}</span>
                  <input
                    className="input"
                    value={values?.[k] ?? ""}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </label>
              ))}
            </Panel>
          )}

          <p className="px-1 text-xs text-slate-400">
            These values live in the catalogue database. Changes are saved immediately and survive a
            re-harvest.
          </p>
        </div>
      </div>
    </div>
  );
}
