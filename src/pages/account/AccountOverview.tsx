import { Link } from "react-router-dom";
import { api } from "../../api";
import { useFetch, taka } from "../../lib";
import { Img } from "../../components/Img";
import { useAuth } from "../../context/AuthContext";
import { Avatar, EmptyState, SectionHeading, StatCard } from "../../components/ui";
import { PageLoading } from "../../components/Errors";
import {
  ChevronRight,
  Heart,
  MapPin,
  Package,
  Sparkles,
  Star,
  Truck,
} from "../../components/Icons";

export default function AccountOverview() {
  const { user, defaultAddress, wishlistCount } = useAuth();
  const { data: summary, loading } = useFetch(() => api.overview(), []);
  const { data: orders } = useFetch(() => api.orders(), []);
  const { data: wish } = useFetch(() => api.wishlist(), []);

  const recent = (orders?.orders ?? []).slice(0, 3);
  const savedProducts = (wish?.products ?? []).slice(0, 4);

  return (
    <div className="space-y-5">
      {/* welcome */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-gradient p-5 text-white shadow-lift sm:p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar initials={user?.initials ?? "A"} className="h-14 w-14 text-lg" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-white/75">Welcome back</p>
            <h1 className="font-display text-2xl font-extrabold">{user?.name}</h1>
            <p className="text-sm text-white/85">
              Member since{" "}
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "today"}
            </p>
          </div>
          <Link to="/products" className="btn ml-auto bg-white/15 text-white hover:bg-white/25">
            <Sparkles className="h-4 w-4" /> New order
          </Link>
        </div>
      </section>

      {loading && !summary ? (
        <PageLoading rows={2} />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Orders"
            value={String(summary?.orders ?? 0)}
            hint="Lifetime orders placed"
            icon={<Package className="h-4 w-4" />}
          />
          <StatCard
            label="Total spend"
            value={taka(summary?.spend ?? 0)}
            hint="Across all orders"
            icon={<Truck className="h-4 w-4" />}
          />
          <StatCard
            label="Wishlist"
            value={String(summary?.wishlist ?? wishlistCount)}
            hint="Saved products"
            icon={<Heart className="h-4 w-4" />}
          />
          <StatCard
            label="Addresses"
            value={String(summary?.addresses ?? 0)}
            hint="Delivery locations"
            icon={<MapPin className="h-4 w-4" />}
          />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* recent orders */}
        <section>
          <SectionHeading
            title="Recent orders"
            action={
              <Link to="/account/orders" className="link flex items-center gap-1 text-sm">
                All orders <ChevronRight className="h-4 w-4" />
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="No orders yet"
              message="Your first order will appear here with live status and re-order shortcuts."
              action={
                <Link to="/products" className="btn-primary">
                  Start shopping
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {recent.map((o) => (
                <Link
                  key={o.id}
                  to={`/account/orders/${o.id}`}
                  className="card card-hover block p-4 no-underline"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-display text-sm font-bold">{o.id}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(o.placedAt).toLocaleString()} · {o.itemsCount} items
                      </p>
                    </div>
                    <span className="badge-success capitalize">{o.status}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {(o.items ?? []).slice(0, 4).map((it) => (
                      <span
                        key={`${o.id}-${it.id}`}
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-50 p-0.5"
                      >
                        <Img src={it.image} alt="" className="h-full w-full object-contain" />
                      </span>
                    ))}
                    <p className="ml-auto font-display text-base font-extrabold">{taka(o.total)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5">
          {/* default address */}
          <section>
            <SectionHeading
              title="Default address"
              action={
                <Link to="/account/addresses" className="link text-sm">
                  Manage
                </Link>
              }
            />
            <div className="card p-4">
              {defaultAddress ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
                    {defaultAddress.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{defaultAddress.name}</p>
                  <p className="text-xs text-slate-500">{defaultAddress.phone}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {defaultAddress.address}, {defaultAddress.city}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  No address saved yet.{" "}
                  <Link to="/account/addresses" className="link">
                    Add one
                  </Link>{" "}
                  for a faster checkout.
                </p>
              )}
            </div>
          </section>

          {/* wishlist preview */}
          <section>
            <SectionHeading
              title="From your wishlist"
              action={
                <Link to="/wishlist" className="link text-sm">
                  View all
                </Link>
              }
            />
            {savedProducts.length === 0 ? (
              <div className="card p-4 text-sm text-slate-500">
                Tap the <Heart className="inline h-4 w-4 text-rose-500" /> on any product to save it
                for later.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {savedProducts.map((p) => (
                  <Link
                    key={p.id}
                    to={`/product/${p.id}/${p.slug}`}
                    className="card card-hover flex flex-col p-2.5"
                  >
                    <span className="relative mb-2 block aspect-square w-full overflow-hidden rounded-xl bg-slate-50 p-1">
                      <Img src={p.image} alt={p.name} className="h-full w-full object-contain" />
                    </span>
                    <p className="line-clamp-2 text-xs font-semibold">{p.name}</p>
                    <p className="mt-1 text-xs font-bold text-brand-700">{taka(p.price)}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className="card flex items-center gap-3 bg-gradient-to-br from-white to-brand-50/70 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-white">
              <Star className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">Rate your purchases</p>
              <p className="text-xs text-slate-500">
                Reviews help other customers choose the right product.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
