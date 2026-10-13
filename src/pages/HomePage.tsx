import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Banner, type Category, type Product } from "../api";
import { imgUrl, useFetch } from "../lib";
import ProductCard from "../components/ProductCard";
import Carousel from "../components/Carousel";
import { Img } from "../components/Img";
import { ErrorBox, Loading } from "../components/Errors";
import { SectionHeading, Stars } from "../components/ui";
import {
  ChevronRight,
  Clock,
  Grid,
  Phone,
  Search,
  Shield,
  Sparkles,
  Truck,
  Wallet,
} from "../components/Icons";

/* ------------------------------------------------ mobile-native home (lg:hidden) */
/** Full-width, auto-advancing, swipeable banner carousel with dot indicators. */
function MobileBanners({ banners }: { banners: Banner[] }) {
  const slides = banners.slice(0, 6);
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const pausedUntil = useRef(0);

  const goTo = (i: number, smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    const i = Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), slides.length - 1);
    setIdx((prev) => (prev === i ? prev : i));
  };

  // auto-advance, same rhythm as the desktop hero
  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setInterval(() => {
      const el = scroller.current;
      if (!el || document.hidden || Date.now() < pausedUntil.current || !el.clientWidth) return;
      const cur = Math.round(el.scrollLeft / el.clientWidth);
      const next = cur + 1;
      if (next >= slides.length) goTo(0, false);
      else goTo(next);
      // warm the target + the slide after it so autoplay never lands on a shimmer
      for (const w of [slides[next % slides.length], slides[(next + 1) % slides.length]]) {
        if (w?.image) {
          const im = new window.Image();
          im.src = imgUrl(w.image);
        }
      }
    }, 4500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  if (!slides.length) return null;

  return (
    <section
      aria-label="Promotions"
      onPointerDown={() => {
        pausedUntil.current = Date.now() + 10000;
      }}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
      >
        {slides.map((b, i) => (
          <Link
            key={b.id ?? i}
            to={bannerLink(b)}
            className="w-full shrink-0 snap-center"
            aria-label={b.title || `Promotion ${i + 1}`}
          >
            <Img
              src={b.image}
              alt={b.title || "Promotion"}
              eager={i === 0}
              wrapClassName="block"
              className="aspect-[1000/247] w-full rounded-2xl object-cover shadow-soft ring-1 ring-slate-200/70"
            />
          </Link>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5" role="tablist" aria-label="Banner slides">
          {slides.map((b, i) => (
            <button
              key={b.id ?? i}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Show banner ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? "w-5 bg-brand-600" : "w-1.5 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Shared banner link resolution (mobile hero + desktop hero both use it). */
function bannerLink(b: Banner) {
  return b.link?.startsWith("/category-home/")
    ? `/category/${b.link.replace("/category-home/", "")}`
    : b.link?.startsWith("/category/")
      ? b.link
      : "/products";
}

/** Circular icon strip - the native "app icon grid" pattern. */
/** Pastel tile backgrounds, cycled through the category grid. */
const TILE_TONES = [
  "from-violet-50 to-violet-100",
  "from-amber-50 to-orange-100",
  "from-emerald-50 to-emerald-100",
  "from-sky-50 to-sky-100",
  "from-rose-50 to-pink-100",
  "from-lime-50 to-lime-100",
  "from-indigo-50 to-indigo-100",
  "from-teal-50 to-cyan-100",
];

const itemCount = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k items` : `${n} items`;

/** Letter placeholders were generated as SVG; real category art is a photo. */
const hasArtwork = (c: Category) => !!c.icon && !/\.svg$/i.test(c.icon);

function MobileCategoryStrip({ categories }: { categories: Category[] }) {
  return (
    <section aria-label="Shop by category">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-600">Explore</p>
          <h2 className="font-display text-lg font-extrabold text-ink-900">Shop by category</h2>
        </div>
        <Link to="/products" className="flex items-center gap-0.5 text-xs font-bold text-brand-600">
          See all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5">
        {categories.map((c, i) => (
          <MobileCategoryTile key={c.slug} c={c} tone={TILE_TONES[i % TILE_TONES.length]} />
        ))}
        {categories.length % 4 !== 0 && (
        <Link to="/products" className="flex flex-col items-center gap-1.5 active:scale-95">
          <span className="grid aspect-square w-full place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <Grid className="h-7 w-7" />
          </span>
          <span className="text-center text-[11px] font-bold leading-tight text-ink-800">All products</span>
          <span className="-mt-1 text-[10px] text-slate-400">Browse all</span>
        </Link>
        )}
      </div>
    </section>
  );
}

function MobileCategoryTile({ c, tone }: { c: Category; tone: string }) {
  const [wide, setWide] = useState(false);
  const thumbs = c.thumbs ?? [];
  const collage = (!hasArtwork(c) || wide) && thumbs.length > 0;

  return (
    <Link to={`/category/${c.slug}`} className="flex flex-col items-center gap-1.5 transition active:scale-95">
      <span
        className={`relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br ${tone} shadow-card ring-1 ring-slate-900/5`}
      >
        {collage ? (
          <>
            {thumbs[1] && (
              <span className="absolute left-[6%] top-[12%] w-[48%] -rotate-12 rounded-xl bg-white p-1 shadow-soft">
                <img src={imgUrl(thumbs[1])} alt="" loading="lazy" className="aspect-square w-full object-contain" />
              </span>
            )}
            {thumbs[2] && (
              <span className="absolute right-[6%] top-[12%] w-[48%] rotate-12 rounded-xl bg-white p-1 shadow-soft">
                <img src={imgUrl(thumbs[2])} alt="" loading="lazy" className="aspect-square w-full object-contain" />
              </span>
            )}
            <span className="absolute bottom-[7%] left-1/2 z-10 w-[56%] -translate-x-1/2 rounded-xl bg-white p-1 shadow-lift">
              <img src={imgUrl(thumbs[0])} alt="" loading="lazy" className="aspect-square w-full object-contain" />
            </span>
          </>
        ) : hasArtwork(c) ? (
          <img
            src={imgUrl(c.icon)}
            alt=""
            loading="lazy"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > img.naturalHeight * 1.4) setWide(true);
            }}
            className="absolute inset-0 h-full w-full object-contain p-1.5 mix-blend-multiply"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center font-display text-2xl font-black text-brand-600/70">
            {c.name.charAt(0)}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-center text-[11px] font-bold leading-tight text-ink-800">{c.name}</span>
      {c.productCount > 0 && <span className="-mt-1 text-[10px] text-slate-400">{itemCount(c.productCount)}</span>}
    </Link>
  );
}

/** Quick-action pill row, like a native app's shortcut chips. */
function MobileQuickPills() {
  const pills = [
    { to: "/products?sort=discount", label: "Deals", icon: <Sparkles className="h-4 w-4" /> },
    { to: "/products?rx=0", label: "No Rx", icon: <Shield className="h-4 w-4" /> },
    { to: "/products?sort=rating", label: "Top rated", icon: <Clock className="h-4 w-4" /> },
    { to: "/products", label: "All", icon: <Grid className="h-4 w-4" /> },
  ];
  return (
    <div className="scrollbar-none scroll-native -mx-3.5 flex gap-2 overflow-x-auto px-3.5 sm:-mx-5 sm:px-5">
      {pills.map((p) => (
        <Link
          key={p.label}
          to={p.to}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-ink-700 shadow-card transition active:scale-95"
        >
          <span className="text-brand-600">{p.icon}</span>
          {p.label}
        </Link>
      ))}
    </div>
  );
}

/** Brand welcome card at the top of the phone home screen. */
function MobileHero() {
  const perks = [
    { icon: <Shield className="h-4 w-4" />, label: "100% genuine" },
    { icon: <Truck className="h-4 w-4" />, label: "Fast delivery" },
    { icon: <Wallet className="h-4 w-4" />, label: "Cash on delivery" },
  ];
  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-lift"
      style={{ background: "linear-gradient(140deg,#2e1574 0%,#4b25ab 38%,#6a3df0 78%,#8b5cf6 100%)" }}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-accent-400/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-fuchsia-400/25 blur-3xl" />
      <div className="pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-2xl border border-white/15 bg-white/5 rotate-12" />
      <div className="pointer-events-none absolute right-12 top-14 h-8 w-8 rounded-xl border border-white/10 bg-white/5 -rotate-6" />

      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white ring-1 ring-white/20 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-accent-300" /> Trusted by 1M+ customers
        </span>
        <h1 className="mt-3 font-display text-[1.6rem] font-extrabold leading-[1.15] text-white">
          Medicine, beauty &amp; everyday care,{" "}
          <span className="text-accent-300">delivered in hours.</span>
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-white/85">
          Authentic products from licensed distributors, prescription upload, cold-chain handling and cash on
          delivery across Bangladesh.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {perks.map((p) => (
            <div
              key={p.label}
              className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 px-1.5 py-2.5 text-center ring-1 ring-white/15 backdrop-blur"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-brand-700">{p.icon}</span>
              <span className="text-[11px] font-semibold leading-tight text-white">{p.label}</span>
            </div>
          ))}
        </div>

        <Link
          to="/products"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl bg-white py-3 text-sm font-bold text-brand-700 shadow-soft transition active:scale-[.98]"
        >
          Shop now <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

/** Compact reassurance banner styled like a native info card. */
function MobileTrustCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-brand-50/70 p-3.5 ring-1 ring-brand-100">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-card">
        <Truck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink-900">Free delivery over ৳1,000</p>
        <p className="text-[11px] leading-snug text-slate-500">
          Cash on delivery · 24–48h inside Dhaka · genuine products only
        </p>
      </div>
      <a
        href="tel:16778"
        className="btn-primary btn-sm shrink-0"
        aria-label="Call pharmacist 16778"
      >
        <Phone className="h-3.5 w-3.5" /> Call
      </a>
    </div>
  );
}

/* --------------------------------------------------------------------- hero */
function Hero({ banners }: { banners: Banner[] }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const slides = banners.slice(0, 6);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  const to = bannerLink;

  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-brand-gradient text-white shadow-lift">
      <div className="pointer-events-none absolute inset-0 bg-mesh opacity-90" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-white/10 blur-2xl" />

      <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:p-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Trusted by 1M+ customers
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-[1.1] text-white sm:text-4xl lg:text-[2.75rem]">
            Medicine, beauty &amp; everyday care,
            <span className="text-accent-200"> delivered in hours.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/85 sm:text-base">
            Authentic products from licensed distributors, prescription upload, cold-chain
            handling and cash on delivery across Bangladesh.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              nav(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
            }}
            className="mt-6 flex max-w-xl items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-soft"
          >
            <Search className="ml-2.5 h-5 w-5 shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for medicine, brand or category…"
              aria-label="Search products"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-ink-800 outline-none placeholder:text-slate-400"
            />
            <button className="btn-coral btn-sm px-4 py-2.5">Search</button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-white/85">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> 100% genuine
            </span>
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> Free delivery over ৳1,000
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> 24–48h inside Dhaka
            </span>
          </div>
        </div>

        {slides.length > 0 && (
          <div className="relative">
            <div className="overflow-hidden rounded-2xl bg-white/10 p-2 backdrop-blur">
              <div
                className="flex transition-transform duration-700 ease-out"
                style={{ transform: `translateX(-${idx * 100}%)` }}
              >
                {slides.map((b, i) => (
                  <Link key={b.id ?? i} to={to(b)} className="w-full shrink-0">
                    <Img
                      src={b.image}
                      alt={b.title || "Promotion"}
                      eager={i === 0}
                      wrapClassName="block"
                      className="aspect-[16/9] w-full rounded-xl object-cover"
                    />
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- trust strip */
function TrustStrip() {
  const items = [
    { icon: <Truck className="h-5 w-5" />, title: "Same-day dispatch", text: "Order before 5pm" },
    { icon: <Shield className="h-5 w-5" />, title: "Genuine medicines", text: "Licensed sources" },
    { icon: <Phone className="h-5 w-5" />, title: "Pharmacist support", text: "Hotline 16778" },
    { icon: <Clock className="h-5 w-5" />, title: "Refund guarantee", text: "7-day returns" },
  ];
  return (
    <section className="mb-6 grid grid-cols-2 gap-2.5 sm:mb-7 sm:gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.title} className="card flex items-center gap-2.5 p-3 sm:gap-3 sm:p-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 sm:h-11 sm:w-11">
            {item.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-ink-900 sm:text-sm">{item.title}</p>
            <p className="truncate text-[11px] text-slate-500 sm:text-xs">{item.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------ category grid */
function CategoryGrid() {
  const { data } = useFetch(() => api.categories(), []);
  const categories = (data ?? []).filter((c) => c.hasPage);
  if (!categories.length) {
    return (
      <section className="mb-7">
        <SectionHeading title="Shop by category" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton h-28 w-full rounded-none" />
              <div className="space-y-1.5 p-3">
                <div className="skeleton mx-auto h-3 w-2/3" />
                <div className="skeleton mx-auto h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="mb-7">
      <SectionHeading
        title="Shop by category"
        subtitle={`${categories.length} departments · thousands of products`}
        action={
          <Link to="/products" className="link flex items-center gap-1 text-sm">
            Browse all <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {categories.map((c) => (
          <CategoryTile key={c.slug} c={c} />
        ))}
      </div>
    </section>
  );
}

function CategoryTile({ c }: { c: Category }) {
  return (
    <Link
      to={`/category/${c.slug}`}
      className="card-hover group flex flex-col overflow-hidden"
    >
      {/* large image backdrop */}
      <div className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-brand-50 via-white to-accent-50 sm:h-32">
        <span className="absolute inset-0 bg-mesh opacity-80" aria-hidden="true" />
        <Img
          src={c.icon}
          alt=""
          wrapClassName="absolute inset-0 block"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col items-center gap-0.5 px-2.5 pb-3 pt-2.5 text-center">
        <span className="line-clamp-2 text-[11px] font-bold leading-tight text-ink-800 sm:text-xs">
          {c.name}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          {c.productCount.toLocaleString()} items
        </span>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ promos */
function PromoRow() {
  const promos = [
    {
      title: "Free delivery",
      text: "On every order above ৳1,000",
      tone: "from-brand-600 to-brand-400",
      to: "/products",
      icon: <Truck className="h-5 w-5" />,
    },
    {
      title: "Up to 70% off",
      text: "Daily deals on essentials",
      tone: "from-coral-500 to-coral-400",
      to: "/products?sort=discount",
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      title: "Order by category",
      text: "Browse all departments",
      tone: "from-slate-800 to-slate-600",
      to: "/products",
      icon: <Grid className="h-5 w-5" />,
    },
  ];
  return (
    <section className="mb-7 grid gap-3 sm:grid-cols-3">
      {promos.map((p) => (
        <Link
          key={p.title}
          to={p.to}
          className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${p.tone} p-4 text-white shadow-soft transition hover:shadow-lift`}
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">{p.icon}</span>
          <p className="mt-3 font-display text-lg font-extrabold">{p.title}</p>
          <p className="text-xs text-white/85">{p.text}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold">
            Shop now <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </section>
  );
}

/* --------------------------------------------------------- product carousel */
function ProductSection({ title, cat, products }: { title: string; cat: string; products: Product[] }) {
  if (!products.length) return null;
  return (
    <section className="mb-7">
      <SectionHeading
        title={title}
        action={
          <Link to={`/category/${cat}`} className="link flex items-center gap-1 text-sm">
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
      <Carousel>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </Carousel>
    </section>
  );
}

/* --------------------------------------------------------------- cta + why */
function WhyBand() {
  const items = [
    {
      title: "Prescription upload",
      text: "Send a photo of your prescription and a pharmacist verifies it before dispatch.",
    },
    {
      title: "Cold-chain delivery",
      text: "Insulin and other refrigerated items travel in temperature-controlled boxes.",
    },
    {
      title: "Reorder in a tap",
      text: "Every order is saved in your account so refills take seconds, not minutes.",
    },
  ];
  return (
    <section className="mb-7 overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <p className="eyebrow">Why Niramoy Pharmacy</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
            Care that arrives with the medicine
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            A complete pharmacy experience: verified products, saved addresses, order history and a
            wishlist that keeps your monthly essentials together.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary">
              Create free account
            </Link>
            <Link to="/products" className="btn-outline">
              Start shopping
            </Link>
          </div>
        </div>
        <div className="grid gap-3">
          {items.map((item, i) => (
            <div key={item.title} className="card flex items-start gap-3 p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-ink-900">{item.title}</p>
                <p className="text-xs leading-relaxed text-slate-500">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- page */
export default function HomePage() {
  const { data, loading, error } = useFetch(() => api.home(), []);
  // must run unconditionally (hooks rules) even though only the mobile layout
  // (<lg) renders the category strip
  const { data: allCategories } = useFetch(() => api.categories(), []);

  const featured = useMemo(() => data?.sections[0]?.products.slice(0, 1)[0], [data]);
  const categories = useMemo(
    () => (allCategories ?? []).filter((c) => c.hasPage),
    [allCategories],
  );

  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <Loading rows={10} />;

  return (
    <div>
      {/* ---------------- mobile-native home (phones, <lg) ---------------- */}
      <div className="space-y-5 lg:hidden">
        {/* greeting + search entry (search field itself lives in the header) */}
        <MobileHero />

        <MobileQuickPills />
        <MobileBanners banners={data.banners} />
        <MobileCategoryStrip categories={categories} />
        <MobileTrustCard />

        {data.sections.map((s) => (
          <ProductSection key={s.title} title={s.title} cat={s.cat} products={s.products} />
        ))}

        {featured && (
          <Link
            to={`/product/${featured.id}/${featured.slug}`}
            className="card flex items-center gap-3.5 p-3.5"
          >
            <span className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-brand-50 p-2">
              <Img src={featured.image} alt={featured.name} className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">Product of the day</span>
              <span className="mt-0.5 line-clamp-2 block font-display text-sm font-extrabold">
                {featured.name}
              </span>
              <span className="mt-1 block">
                <Stars rating={featured.rating} count={featured.ratingCount} />
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
          </Link>
        )}
      </div>

      {/* ---------------- desktop home (≥lg) ---------------- */}
      <div className="hidden lg:block">
        <Hero banners={data.banners} />
        <TrustStrip />
        <CategoryGrid />
        <PromoRow />
        {featured && (
          <section className="mb-7 grid gap-3 sm:grid-cols-[1.2fr_1fr]">
            <div className="card flex items-center gap-4 p-4">
              <span className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-brand-50 p-2">
                <Img
                  src={featured.image}
                  alt={featured.name}
                  className="h-full w-full object-contain"
                />
              </span>
              <div className="min-w-0">
                <p className="eyebrow">Product of the day</p>
                <Link
                  to={`/product/${featured.id}/${featured.slug}`}
                  className="line-clamp-2 font-display text-lg font-extrabold hover:text-brand-700"
                >
                  {featured.name}
                </Link>
                <div className="mt-1">
                  <Stars rating={featured.rating} count={featured.ratingCount} />
                </div>
              </div>
            </div>
            <div className="card flex flex-col justify-center gap-2 bg-gradient-to-br from-white to-brand-50/70 p-5">
              <p className="eyebrow">Need help ordering?</p>
              <p className="font-display text-lg font-extrabold">
                Our pharmacists are one call away
              </p>
              <a href="tel:16778" className="btn-primary w-fit">
                <Phone className="h-4 w-4" /> Call 16778
              </a>
            </div>
          </section>
        )}
        {data.sections.map((s) => (
          <ProductSection key={s.title} title={s.title} cat={s.cat} products={s.products} />
        ))}
        <WhyBand />
      </div>
    </div>
  );
}
