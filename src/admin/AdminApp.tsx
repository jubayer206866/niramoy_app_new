import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/ui";
import { PageLoading } from "../components/Errors";
import {
  Bell,
  Chart,
  Folder,
  Gear,
  Grid,
  Image as ImageIcon,
  Lock,
  Logout,
  Menu,
  Package,
  Receipt,
  Shield,
  Users,
  Wallet,
  X,
} from "../components/Icons";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import ProductEditorPage from "./pages/ProductEditorPage";
import OrdersPage from "./pages/OrdersPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import CustomersPage from "./pages/CustomersPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CategoriesPage from "./pages/CategoriesPage";
import BannersPage from "./pages/BannersPage";
import MediaPage from "./pages/MediaPage";
import SettingsPage from "./pages/SettingsPage";
import WalletPage from "./pages/WalletPage";
import NotificationsPage from "./pages/NotificationsPage";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: <Chart className="h-4 w-4" />, end: true }],
  },
  {
    section: "Catalogue",
    items: [
      { to: "/admin/products", label: "Products", icon: <Package className="h-4 w-4" /> },
      { to: "/admin/categories", label: "Categories", icon: <Grid className="h-4 w-4" /> },
      { to: "/admin/banners", label: "Banners", icon: <ImageIcon className="h-4 w-4" /> },
      { to: "/admin/media", label: "Media library", icon: <Folder className="h-4 w-4" /> },
    ],
  },
  {
    section: "Commerce",
    items: [
      { to: "/admin/orders", label: "Orders", icon: <Receipt className="h-4 w-4" /> },
      { to: "/admin/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
      { to: "/admin/customers", label: "Customers", icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    section: "Marketing",
    items: [{ to: "/admin/notifications", label: "Push notifications", icon: <Bell className="h-4 w-4" /> }],
  },
  {
    section: "Store",
    items: [{ to: "/admin/settings", label: "Settings", icon: <Gear className="h-4 w-4" /> }],
  },
];

const TITLES: Record<string, string> = {
  products: "Products",
  categories: "Categories",
  banners: "Banners",
  media: "Media library",
  orders: "Orders",
  wallet: "Wallet",
  notifications: "Push notifications",
  customers: "Customers",
  settings: "Settings",
};

function titleFor(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "Dashboard";
  const [, section, id] = parts;
  if (section === "products" && id) return id === "new" ? "New product" : "Edit product";
  if (section === "orders" && id) return `Order ${id}`;
  if (section === "customers" && id) return "Customer profile";
  return TITLES[section] ?? "Admin";
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          isActive
            ? "bg-brand-600 text-white shadow-soft"
            : "text-white/60 hover:bg-white/10 hover:text-white"
        }`
      }
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

export default function AdminApp() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-mint">
      {/* ------------------------------------------------------ sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink-900 pl-[env(safe-area-inset-left)] text-white transition-transform duration-300 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
          <Link to="/admin" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient font-display text-lg font-extrabold shadow-glow">
              N
            </span>
            <span>
              <span className="block font-display text-sm font-extrabold leading-none">
                Niramoy
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">
                Admin panel
              </span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="scroll-native flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                {group.section}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarLink key={item.to} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Link
            to="/"
            className="mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <Shield className="h-4 w-4" />
            View storefront
          </Link>
          <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
            <Avatar initials={user?.initials || "A"} className="h-8 w-8 text-[11px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{user?.name}</p>
              <p className="truncate text-[11px] text-white/45">{user?.email}</p>
            </div>
            <button
              onClick={() => void logout()}
              title="Sign out"
              aria-label="Sign out"
              className="grid h-7 w-7 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <Logout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* -------------------------------------------------------- main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-ink-700 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-900">
                {titleFor(location.pathname)}
              </p>
              <p className="hidden text-[11px] text-slate-400 sm:block">
                Niramoy Pharmacy · {user?.email}
              </p>
            </div>
            <Link to="/" className="btn-outline btn-sm hidden sm:inline-flex">
              Storefront
            </Link>
            <Link to="/admin/settings" className="btn-primary btn-sm">
              <Lock className="h-3.5 w-3.5" /> Settings
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:py-8">
          <Suspense fallback={<PageLoading rows={4} />}>
            <Routes>
              <Route index element={<DashboardPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/new" element={<ProductEditorPage />} />
              <Route path="products/:id" element={<ProductEditorPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="banners" element={<BannersPage />} />
              <Route path="media" element={<MediaPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
