import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import AuthShell from "../components/AuthShell";
import { Field } from "../components/ui";
import { Alert } from "../components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const { success } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const user = await login(email.trim(), password);
      success(`Welcome back, ${user.name.split(" ")[0]}!`);
      nav(next.startsWith("/") ? next : "/account", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Could not sign in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to track orders, manage addresses and re-order favourites."
      footer={
        <>
          New to Niramoy?{" "}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Email address" error={fields.email}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" error={fields.password}>
          <div className="relative">
            <input
              className="input pr-16"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <Link to="/products" className="transition hover:text-brand-600">
            Continue as guest →
          </Link>
          <span>You stay signed in until you log out</span>
        </div>
      </form>
    </AuthShell>
  );
}
