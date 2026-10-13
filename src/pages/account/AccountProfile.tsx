import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Avatar, Field, SectionHeading } from "../../components/ui";
import { Lock, Logout, Shield, User } from "../../components/Icons";

export default function AccountProfile() {
  const { user, refresh, logout } = useAuth();
  const { success, error: toastError } = useToast();
  const nav = useNavigate();

  const [profile, setProfile] = useState({ name: user?.name ?? "", phone: user?.phone ?? "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      await api.updateProfile(profile);
      await refresh();
      success("Profile updated");
    } catch (err) {
      if (err instanceof ApiError) setProfileErrors(err.fields);
      toastError("Could not update your profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setPwErrors({ confirm: "Passwords do not match." });
      return;
    }
    setSavingPw(true);
    setPwErrors({});
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      success("Password changed");
    } catch (err) {
      if (err instanceof ApiError) setPwErrors(err.fields);
      else toastError("Could not change your password.");
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading title="Profile & security" subtitle="Manage how we reach you and keep your account safe." />

      <section className="panel">
        <div className="mb-4 flex items-center gap-4">
          <Avatar initials={user?.initials ?? "A"} className="h-14 w-14 text-lg" />
          <div>
            <p className="font-display text-lg font-bold">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
          <span className="badge-success ml-auto hidden sm:inline-flex">
            <Shield className="h-3 w-3" /> Verified
          </span>
        </div>

        <form onSubmit={saveProfile} className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" error={profileErrors.name}>
            <input
              className="input"
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </Field>
          <Field label="Mobile number" error={profileErrors.phone}>
            <input
              className="input"
              inputMode="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="01XXXXXXXXX"
            />
          </Field>
          <Field label="Email address" hint="Email cannot be changed in this demo">
            <input className="input bg-slate-50" value={user?.email ?? ""} readOnly />
          </Field>
          <div className="flex items-end">
            <button className="btn-primary w-full sm:w-auto" disabled={savingProfile}>
              <User className="h-4 w-4" />
              {savingProfile ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base font-bold">
          <Lock className="h-4 w-4 text-brand-500" /> Change password
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Signing out of other devices happens automatically when you change your password.
        </p>

        <form onSubmit={savePassword} className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password" error={pwErrors.currentPassword}>
            <input
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </Field>
          <Field label="New password" error={pwErrors.newPassword}>
            <input
              className="input"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password" error={pwErrors.confirm}>
            <input
              className="input"
              type="password"
              required
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-3">
            <button className="btn-primary" disabled={savingPw}>
              {savingPw ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel border-rose-100">
        <h2 className="font-display text-base font-bold text-rose-600">Session</h2>
        <p className="mt-1 text-xs text-slate-500">
          You are signed in on this device. Sessions expire after 30 days of inactivity.
        </p>
        <button
          className="btn-outline mt-3 text-rose-600"
          onClick={() => {
            void logout();
            nav("/");
          }}
        >
          <Logout className="h-4 w-4" /> Sign out of this device
        </button>
      </section>
    </div>
  );
}
