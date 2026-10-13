import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageLoading } from "../components/Errors";
import { EmptyState } from "../components/ui";
import { Shield } from "../components/Icons";

/**
 * Guards the whole /admin tree: sends anonymous visitors to the login page
 * (with a `next` redirect) and shows an access screen for signed-in
 * customers. Kept separate from AdminApp so the admin bundle stays lazy.
 */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoading rows={3} />;
  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="grid min-h-[70vh] place-items-center p-6">
        <EmptyState
          icon={<Shield className="h-6 w-6" />}
          title="Administrator access required"
          message="Your account does not have permission to open the admin panel. Ask a store administrator to upgrade your role, or sign in with an admin account."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/" className="btn-outline">
                Back to store
              </Link>
              <Link to="/account" className="btn-primary">
                My account
              </Link>
            </div>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
