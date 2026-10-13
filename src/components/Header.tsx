import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { Category, SiteText, SuggestHit } from "../api";
import { api } from "../api";
import { taka, useDebounced } from "../lib";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { useNotifications } from "../context/NotificationContext";
import {
  Bell,
  Cart,
  ChevronDown,
  Grid,
  Heart,
  Home,
  Lock,
  Logout,
  MapPin,
  Menu,
  Package,
  Phone,
  Search,
  Shield,
  Sparkles,
  Truck,
  User,
  Wallet,
  X,
} from "./Icons";
import { Avatar } from "./ui";
import { Img } from "./Img";
import { PAYMENT_MARKS } from "./PaymentLogos";

export function Header({
  categories,
  site,
}: {
  categories: Category[];
  site: SiteText | null;
}) {
  const { count } = useCart();
  const { user, logout } = useAuth();
  const wishlist = useWishlist();
  const { unread } = useNotifications();
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [q, setQ] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    setSuggestOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return categories
      .filter((c) => c.name.toLowerCase().includes(term) || c.slug.includes(term))
      .slice(0, 5);
  }, [q, categories]);

  // Product matches for the suggestions panel. Answers are cached per term, and the
  // previous list stays on screen while the next one loads so the panel never blanks.
  const searchTerm = useDebounced(q.trim().toLowerCase(), 120);
  const hitCache = useRef(new Map<string, SuggestHit[]>());
  const [productHits, setProductHits] = useState<SuggestHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (searchTerm.length < 2) {
      setProductHits([]);
      setSearching(false);
      return;
    }
    const cached = hitCache.current.get(searchTerm);
    if (cached) {
      setProductHits(cached);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    api
      .suggest(searchTerm)
      .then((r) => {
        hitCache.current.set(searchTerm, r.products);
        if (alive) setProductHits(r.products);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setSearching(false);
      });
    return () => {
      alive = false;
    };
  }, [searchTerm]);
  const typing = q.trim().length >= 2 && (searching || q.trim().toLowerCase() !== searchTerm);

  const submit = (e?: React.FormEvent, term?: string) => {
    e?.preventDefault();
    const value = (term ?? q).trim();
    nav(value ? `/products?q=${encodeURIComponent(value)}` : "/products");
    setSuggestOpen(false);
    setQ("");
  };

  const navCategories = categories.filter((c) => c.hasPage);

  return (
    <>
      <header className="sticky top-0 z-40">
        {/* announcement — collapses once the page is scrolled */}
        {!scrolled && (
        <div className="bg-brand-gradient pt-safe text-white">
          <div className="container-ag flex items-center justify-between gap-4 py-1.5 text-[11px] font-medium sm:text-xs">
            <p className="flex items-center gap-2 truncate">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Free delivery over ৳1,000 · Cash on delivery · Genuine products only
              </span>
            </p>
            <div className="hidden items-center gap-4 sm:flex">
              <a href={`tel:${site?.phone ?? "16778"}`} className="flex items-center gap-1.5 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {site?.phone ?? "16778"}
              </a>
              <span className="opacity-80">|</span>
              <span>24–48h inside Dhaka</span>
            </div>
          </div>
        </div>
        )}

        <div
          className={`glass transition-shadow duration-300 ${scrolled ? "pt-safe shadow-soft" : ""}`}
        >
          <div className="container-ag flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <button
              className="btn-icon lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </button>

            <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Niramoy Pharmacy home">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-gradient font-display text-lg font-black text-white shadow-soft">
                N
              </span>
              <span className="hidden leading-none sm:block">
                <span className="block font-display text-lg font-extrabold text-ink-900">
                  Niramoy
                </span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-brand-500">
                  Pharmacy
                </span>
              </span>
            </Link>

            {/* search — full width on its own row on mobile, inline on desktop */}
            <div
              className="relative order-last w-full min-w-0 md:order-none md:w-auto md:flex-1"
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 140)}
            >
              <form
                onSubmit={submit}
                className="flex items-center overflow-hidden rounded-full bg-white shadow-card transition focus-within:shadow-lift"
              >
                <Search className="ml-3.5 h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search medicines, beauty, baby care…"
                  aria-label="Search products"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-ink-800 outline-none ring-0 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <button
                  type="submit"
                  aria-label="Search"
                  className="m-1 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 sm:px-5"
                >
                  <span className="hidden sm:inline">Search</span>
                  <Search className="h-4 w-4 sm:hidden" />
                </button>
              </form>

              {suggestOpen && q.trim() && (
                <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-lift">
                  {suggestions.length > 0 && (
                    <>
                      <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Categories
                      </p>
                      {suggestions.map((c) => (
                        <button
                          key={c.slug}
                          onMouseDown={() => submit(undefined, c.name)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-brand-50"
                        >
                          <Img
                            src={c.icon}
                            alt=""
                            wrapClassName="block h-6 w-6 shrink-0"
                            className="h-full w-full object-contain"
                            showShimmer={false}
                          />
                          <span className="font-semibold text-ink-800">{c.name}</span>
                          <span className="ml-auto text-xs text-slate-400">
                            {c.productCount} items
                          </span>
                        </button>
                      ))}
                    </>
                  )}

                  {productHits.length === 0 && typing && (
                    <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-400">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                      Searching products…
                    </p>
                  )}

                  {productHits.length > 0 && (
                    <div className={`transition-opacity ${typing ? "opacity-60" : ""}`}>
                      <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Products
                        {typing && (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                        )}
                      </p>
                      {productHits.map((p) => (
                        <Link
                          key={p.id}
                          to={`/product/${p.id}/${p.slug}`}
                          onClick={() => setSuggestOpen(false)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-brand-50"
                        >
                          <Img
                            src={p.image}
                            alt=""
                            wrapClassName="block h-9 w-9 shrink-0"
                            className="h-full w-full object-contain"
                            showShimmer={false}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-800">
                              {p.name}
                            </span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {p.unitLabel || p.brand}
                            </span>
                          </span>
                          <span className="ml-auto shrink-0 text-sm font-bold text-brand-700">
                            {taka(p.price)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  <button
                    onMouseDown={() => submit()}
                    className="mt-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
                  >
                    <Search className="h-4 w-4" />
                    Search “{q.trim()}” in all products
                  </button>
                </div>
              )}
            </div>

            {/* actions */}
            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to="/account/wishlist"
                className="btn-icon relative"
                aria-label={`Wishlist (${wishlist.count})`}
              >
                <Heart className="h-5 w-5" />
                {wishlist.count > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {wishlist.count > 9 ? "9+" : wishlist.count}
                  </span>
                )}
              </Link>

              {user && (
                <Link
                  to="/account/notifications"
                  className="btn-icon relative"
                  aria-label={`Notifications (${unread} new)`}
                >
                  <Bell className="h-5 w-5" />
                  {unread > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
              )}

              <Link to="/cart" className="btn-icon relative" aria-label={`Cart (${count})`}>
                <Cart className="h-5 w-5" />
                {count > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>

              {user ? (
                <div className="relative" ref={accountRef}>
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition hover:border-brand-200 hover:bg-brand-50"
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                  >
                    <Avatar initials={user.initials} className="h-7 w-7" />
                    <span className="hidden max-w-[7rem] truncate text-sm font-semibold text-ink-800 lg:block">
                      {user.name.split(" ")[0]}
                    </span>
                    <ChevronDown className="hidden h-4 w-4 text-slate-400 lg:block" />
                  </button>

                  {accountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-64 origin-top-right animate-rise overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lift"
                    >
                      <div className="flex items-center gap-3 bg-gradient-to-br from-brand-50 to-white px-4 py-3">
                        <Avatar initials={user.initials} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                      <div className="p-1.5">
                        {[
                          { to: "/account", label: "Dashboard", icon: <Grid className="h-4 w-4" /> },
                          { to: "/account/orders", label: "My orders", icon: <Package className="h-4 w-4" /> },
                          { to: "/account/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
                          { to: "/account/notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
                          { to: "/account/wishlist", label: "Wishlist", icon: <Heart className="h-4 w-4" /> },
                          { to: "/account/addresses", label: "Addresses", icon: <MapPin className="h-4 w-4" /> },
                          { to: "/account/profile", label: "Profile & security", icon: <Lock className="h-4 w-4" /> },
                        ].map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-brand-50 hover:text-brand-700"
                          >
                            {item.icon}
                            {item.label}
                          </Link>
                        ))}
                        <button
                          onClick={() => {
                            void logout();
                            nav("/");
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          <Logout className="h-4 w-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="btn-primary btn-sm hidden sm:inline-flex">
                  <User className="h-4 w-4" /> Sign in
                </Link>
              )}
            </div>
          </div>

          {/* category chips */}
          <nav className="hidden border-t border-slate-100 lg:block">
            <div className="container-ag flex items-center gap-1.5 overflow-x-auto py-2 scrollbar-none">
              <NavLink
                to="/products"
                end
                className={({ isActive }) =>
                  `chip shrink-0 ${isActive ? "chip-active" : ""}`
                }
              >
                <Grid className="h-3.5 w-3.5" /> All products
              </NavLink>
              {navCategories.map((c) => (
                <NavLink
                  key={c.slug}
                  to={`/category/${c.slug}`}
                  className={({ isActive }) => `chip shrink-0 ${isActive ? "chip-active" : ""}`}
                >
                  <Img
                    src={c.icon}
                    alt=""
                    wrapClassName="block h-4 w-4 shrink-0"
                    className="h-full w-full object-contain"
                    showShimmer={false}
                  />
                  {c.name}
                  <span className="text-[10px] font-bold opacity-60">
                    {c.productCount > 999 ? "999+" : c.productCount}
                  </span>
                </NavLink>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
              {[
                { to: "/products?sort=discount", label: "Deals" },
                { to: "/products?sort=rating", label: "Top rated" },
                { to: "/products?rx=0", label: "No prescription" },
              ].map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) => `chip ${isActive ? "chip-active" : ""}`}
                >
                  {l.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[86%] max-w-sm animate-rise overflow-y-auto bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-gradient font-display text-sm font-black text-white">
                  N
                </span>
                <span className="font-display text-lg font-extrabold text-ink-900">
                  Niramoy<span className="text-brand-500"> Pharmacy</span>
                </span>
              </span>
              <button className="btn-icon" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X />
              </button>
            </div>

            {user ? (
              <Link
                to="/account"
                className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-50 to-white p-3"
              >
                <Avatar initials={user.initials} className="h-10 w-10" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">View your account</p>
                </div>
              </Link>
            ) : (
              <div className="mb-4 flex gap-2">
                <Link to="/login" className="btn-primary btn-sm flex-1">
                  Sign in
                </Link>
                <Link to="/register" className="btn-outline btn-sm flex-1">
                  Create account
                </Link>
              </div>
            )}

            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Shop by category
            </p>
            <div className="mb-4 grid gap-1">
              {navCategories.map((c) => (
                <Link
                  key={c.slug}
                  to={`/category/${c.slug}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-ink-700 transition hover:bg-brand-50"
                >
                  <Img
                    src={c.icon}
                    alt=""
                    wrapClassName="block h-6 w-6 shrink-0"
                    className="h-full w-full object-contain"
                    showShimmer={false}
                  />
                  {c.name}
                  <span className="ml-auto text-xs text-slate-400">{c.productCount}</span>
                </Link>
              ))}
            </div>

            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Quick links
            </p>
            <div className="grid gap-1">
              {[
                { to: "/products", label: "All products" },
                { to: "/account/wishlist", label: "Wishlist" },
                { to: "/account/orders", label: "My orders" },
                { to: "/account/wallet", label: "Wallet" },
                { to: "/cart", label: "Cart" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-xl px-2 py-2 text-sm font-semibold text-ink-700 transition hover:bg-brand-50"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Footer({
  site,
  categories = [],
}: {
  site: SiteText | null;
  categories?: Category[];
}) {
  const shopLinks = categories.filter((c) => c.hasPage);
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="container-ag grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-gradient font-display font-black text-white">
              N
            </span>
            <span className="leading-none">
              <span className="block font-display text-base font-extrabold text-ink-900">Niramoy</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-brand-500">
                Pharmacy
              </span>
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            A modern local pharmacy storefront with a full medicine catalogue, accounts and
            wishlists. Orders are simulated — nothing ships and no payment is taken.
          </p>
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              We accept
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {PAYMENT_MARKS.map(({ id, Logo, label }) => (
                <span key={id} title={label} className="pay-chip">
                  <Logo className="h-5 w-auto" />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-ink-900">Shop</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li>
              <Link className="transition hover:text-brand-700" to="/products">
                All products
              </Link>
            </li>
            {shopLinks.slice(0, 5).map((c) => (
              <li key={c.slug}>
                <Link className="transition hover:text-brand-700" to={`/category/${c.slug}`}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-ink-900">Account</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            {[
              { to: "/account", label: "Dashboard" },
              { to: "/account/orders", label: "Order history" },
              { to: "/account/wallet", label: "Wallet" },
              { to: "/account/wishlist", label: "Wishlist" },
              { to: "/account/addresses", label: "Saved addresses" },
              { to: "/login", label: "Sign in" },
            ].map((l) => (
              <li key={l.to}>
                <Link className="transition hover:text-brand-700" to={l.to}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-ink-900">We promise</h4>
          <ul className="space-y-3 text-sm text-slate-500">
            <li className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              24–48h delivery inside Dhaka, 2–4 days nationwide
            </li>
            <li className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              100% authentic products from licensed distributors
            </li>
            <li className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              Hotline {site?.phone ?? "16778"} · WhatsApp {site?.whatsapp ?? "01810117100"}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4">
        <div className="container-ag flex flex-col items-center justify-between gap-2 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} Niramoy Pharmacy — local demo storefront. Not a real pharmacy; nothing is dispensed.</p>
          <p>Built with React, Vite, Tailwind, Express &amp; SQLite.</p>
        </div>
      </div>
    </footer>
  );
}

export function MobileNav() {
  const { count } = useCart();
  const { pathname } = useLocation();

  const items = [
    { to: "/", label: "Home", icon: <Home className="h-5 w-5" />, badge: 0 },
    { to: "/products", label: "Shop", icon: <Grid className="h-5 w-5" />, badge: 0 },
    { to: "/account/orders", label: "Orders", icon: <Package className="h-5 w-5" />, badge: 0 },
    { to: "/account", label: "Account", icon: <User className="h-5 w-5" />, badge: 0 },
    { to: "/cart", label: "Cart", icon: <Cart className="h-5 w-5" />, badge: count },
  ];

  const isActive = (to: string) => {
    if (to === "/") return pathname === "/";
    if (to === "/account") return pathname.startsWith("/account") && !pathname.startsWith("/account/orders");
    return pathname.startsWith(to);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
              isActive(item.to) ? "text-brand-600" : "text-slate-400"
            }`}
          >
            <span className="relative">
              {item.icon}
              {item.badge > 0 && (
                <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[9px] font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
