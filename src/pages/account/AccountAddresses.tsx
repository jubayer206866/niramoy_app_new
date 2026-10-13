import { useState } from "react";
import { api, ApiError, type Address } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { EmptyState, Field, SectionHeading } from "../../components/ui";
import { Check, MapPin, Pencil, Plus, Trash, X } from "../../components/Icons";

const EMPTY = {
  label: "Home",
  name: "",
  phone: "",
  address: "",
  city: "Dhaka",
  area: "",
  isDefault: false,
};

export default function AccountAddresses() {
  const { addresses, setAddresses, user } = useAuth();
  const { success, error: toastError } = useToast();

  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ ...EMPTY, name: user?.name ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startNew = () => {
    setForm({ ...EMPTY, name: user?.name ?? "", phone: user?.phone ?? "" });
    setEditing("new");
    setError("");
  };

  const startEdit = (a: Address) => {
    setForm({
      label: a.label,
      name: a.name,
      phone: a.phone,
      address: a.address,
      city: a.city,
      area: a.area,
      isDefault: a.isDefault,
    });
    setEditing(a.id);
    setError("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        editing === "new"
          ? await api.createAddress(form)
          : await api.updateAddress(Number(editing), form);
      setAddresses(res.addresses);
      success(editing === "new" ? "Address added" : "Address updated");
      setEditing(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not save this address. Try again.";
      setError(message);
      toastError(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Address) => {
    if (!confirm(`Delete the “${a.label}” address?`)) return;
    try {
      const res = await api.deleteAddress(a.id);
      setAddresses(res.addresses);
      success("Address removed");
    } catch {
      toastError("Could not remove that address.");
    }
  };

  const makeDefault = async (a: Address) => {
    try {
      const res = await api.updateAddress(a.id, { ...a, isDefault: true });
      setAddresses(res.addresses);
      success(`${a.label} is now your default address`);
    } catch {
      toastError("Could not update the default address.");
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Delivery addresses"
        subtitle="Saved addresses make checkout a one-tap experience."
        action={
          <button className="btn-primary btn-sm" onClick={startNew}>
            <Plus className="h-4 w-4" /> Add address
          </button>
        }
      />

      {editing && (
        <form onSubmit={save} className="panel">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">
              {editing === "new" ? "New address" : "Edit address"}
            </h2>
            <button type="button" className="btn-icon" onClick={() => setEditing(null)} aria-label="Cancel">
              <X />
            </button>
          </header>

          {error && <p className="field-error mb-2">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label" hint="Home, Office, Parents…">
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </Field>
            <Field label="Recipient name *">
              <input
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Mobile number *">
              <input
                className="input"
                required
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="01XXXXXXXXX"
              />
            </Field>
            <Field label="City">
              <input
                className="input"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Full address *" hint="House, road, block, landmark">
                <textarea
                  className="input resize-none"
                  required
                  rows={3}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Area / Thana" hint="Optional">
              <input
                className="input"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </Field>
            <label className="flex items-end gap-2 pb-3 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              Set as default delivery address
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save address"}
            </button>
            <button type="button" className="btn-outline" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !editing ? (
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="No saved addresses"
          message="Add your home or office address to speed up future checkouts."
          action={
            <button className="btn-primary" onClick={startNew}>
              Add your first address
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <article key={a.id} className="card flex flex-col p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{a.label}</p>
                  <p className="truncate text-xs text-slate-500">{a.name}</p>
                </div>
                {a.isDefault && <span className="badge-success ml-auto">Default</span>}
              </div>

              <p className="mt-3 text-sm text-slate-600">{a.address}</p>
              <p className="text-xs text-slate-500">
                {a.city}
                {a.area ? `, ${a.area}` : ""} · {a.phone}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-outline btn-sm" onClick={() => startEdit(a)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {!a.isDefault && (
                  <button className="btn-ghost btn-sm" onClick={() => void makeDefault(a)}>
                    <Check className="h-3.5 w-3.5" /> Make default
                  </button>
                )}
                <button
                  className="btn-ghost btn-sm ml-auto text-rose-600 hover:bg-rose-50"
                  onClick={() => void remove(a)}
                >
                  <Trash className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
