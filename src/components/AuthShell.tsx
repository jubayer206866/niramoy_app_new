import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Heart, Package, Shield, Sparkles, Truck } from "./Icons";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  aside = [],
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  aside?: string[];
}) {
  const perks = aside.length
    ? aside
    : [
        "Track every order and re-order in one tap",
        "Save products to a wishlist you can share",
        "Faster checkout with saved addresses",
      ];

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-soft lg:grid-cols-2">
      {/* brand panel */}
      <aside className="relative hidden flex-col justify-between bg-brand-gradient p-8 text-white lg:flex">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-white/10" />
        <div className="relative">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 font-display font-black backdrop-blur">
              N
            </span>
            <span className="font-display text-xl font-extrabold">
              Niramoy <span className="text-brand-200">Pharmacy</span>
            </span>
          </Link>
          <h2 className="mt-10 font-display text-3xl font-extrabold leading-tight">
            Your pharmacy,
            <br /> always in your pocket.
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-white/90">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative grid grid-cols-3 gap-2 text-[11px] font-semibold">
          {[
            { icon: <Truck className="h-4 w-4" />, label: "Fast delivery" },
            { icon: <Shield className="h-4 w-4" />, label: "100% genuine" },
            { icon: <Heart className="h-4 w-4" />, label: "Free to join" },
          ].map((item) => (
            <span key={item.label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 py-3">
              {item.icon}
              {item.label}
            </span>
          ))}
        </div>
      </aside>

      {/* form */}
      <div className="p-6 sm:p-9">
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient font-display font-black text-white">
            N
          </span>
          <span className="font-display text-lg font-extrabold text-ink-900">
            Niramoy<span className="text-brand-500"> Pharmacy</span>
          </span>
        </div>
        <h1 className="font-display text-2xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Package className="h-3.5 w-3.5" /> Local demo — no real payments or prescriptions.
        </p>
      </div>
    </div>
  );
}
