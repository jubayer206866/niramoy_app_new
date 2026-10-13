import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import AuthShell from "../components/AuthShell";
import { Alert, Field } from "../components/ui";

function strengthOf(password: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  const tones = ["bg-slate-200", "bg-rose-400", "bg-amber-400", "bg-brand-400", "bg-brand-600"];
  return { score, label: labels[score], tone: tones[score] };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const { success } = useToast();
  const nav = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const strength = useMemo(() => strengthOf(form.password), [form.password]);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError("");
    setFields({});
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      success(`Account created — welcome, ${user.name.split(" ")[0]}!`);
      nav("/account", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Could not create your account. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join thousands of customers ordering medicine and essentials online."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
      aside={[
        "Free to join — no membership fees",
        "Save addresses for one-tap checkout",
        "Keep a wishlist of your regular items",
      ]}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Full name" error={fields.name}>
          <input
            className="input"
            required
            value={form.name}
            onChange={set("name")}
            placeholder="Rahim Uddin"
            autoComplete="name"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={fields.email}>
            <input
              className="input"
              type="email"
              required
              value={form.email}
              onChange={set("email")}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label="Mobile" hint="Optional — used for delivery updates" error={fields.phone}>
            <input
              className="input"
              inputMode="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder="01XXXXXXXXX"
              autoComplete="tel"
            />
          </Field>
        </div>

        <Field label="Password" error={fields.password}>
          <div className="relative">
            <input
              className="input pr-16"
              type={show ? "text" : "password"}
              required
              minLength={6}
              value={form.password}
              onChange={set("password")}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wide text-brand-600 hover:bg-brand-50"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        {form.password && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${strength.tone}`}
                style={{ width: `${(strength.score / 4) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-[11px] font-semibold text-slate-500">
              {strength.label}
            </span>
          </div>
        )}

        <Field
          label="Confirm password"
          error={mismatch ? "Passwords do not match." : undefined}
        >
          <input
            className="input"
            type="password"
            required
            value={form.confirm}
            onChange={set("confirm")}
            placeholder="Repeat your password"
            autoComplete="new-password"
          />
        </Field>

        <button className="btn-primary w-full" disabled={busy || mismatch}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-xs text-slate-400">
          By continuing you agree this is a local demo with simulated orders.
        </p>
      </form>
    </AuthShell>
  );
}
