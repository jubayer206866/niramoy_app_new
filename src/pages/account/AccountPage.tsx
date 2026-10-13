import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Avatar } from "../../components/ui";
import { useNotifications } from "../../context/NotificationContext";
import {
  Bell,
  Grid,
  Heart,
  Lock,
  Logout,
  MapPin,
  Package,
  Shield,
  Wallet,
} from "../../components/Icons";

const NAV = [
  { to: "/account", label: "Dashboard", icon: <Grid className="h-4 w-4" />, end: true },
  { to: "/account/orders", label: "My orders", icon: <Package className="h-4 w-4" /> },
  { to: "/account/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
  { to: "/account/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { to: "/wishlist", label: "Wishlist", icon: <Heart className="h-4 w-4" /> },
  { to: "/account/addresses", label: "Addresses", icon: <MapPin className="h-4 w-4" /> },
  { to: "/account/profile", label: "Profile & security", icon: <Lock className="h-4 w-4" /> },
];

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const { unread } = useNotifications();
  const badge = (to: string) =>
    to === "/account/notifications" && unread > 0 ? (
      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-[7.5rem] lg:self-start">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Avatar initials={user?.initials ?? "A"} className="h-12 w-12 text-base" />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50/70 px-3 py-2 text-[11px] font-semibold text-brand-700">
            <Shield className="h-3.5 w-3.5" /> Account verified
          </div>

          {/* desktop nav */}
          <nav className="mt-4 hidden space-y-1 lg:block">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-600 text-white shadow-soft"
                      : "text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                  }`
                }
              >
                {item.icon}
                {item.label}
                {badge(item.to)}
              </NavLink>
            ))}
            <button
              onClick={() => {
                void logout();
                toast("You have been signed out.");
                nav("/");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <Logout className="h-4 w-4" /> Sign out
            </button>
          </nav>
        </div>

        <Link to="/products" className="btn-outline btn-sm mt-3 hidden w-full lg:inline-flex">
          Continue shopping
        </Link>
      </aside>

      <div className="min-w-0">
        {/* mobile tabs */}
        <div className="scrollbar-none scroll-native -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `chip shrink-0 ${isActive ? "chip-active" : ""}`}
            >
              {item.icon}
              {item.label}
              {badge(item.to)}
            </NavLink>
          ))}
        </div>
        <div className="animate-fadeUp">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
