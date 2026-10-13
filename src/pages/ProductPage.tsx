import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { taka, useFetch } from "../lib";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../context/WishlistContext";
import ProductCard from "../components/ProductCard";
import Carousel from "../components/Carousel";
import { Img } from "../components/Img";
import { ErrorBox, PageLoading } from "../components/Errors";
import {
  Alert,
  Breadcrumbs,
  EmptyState,
  PriceBlock,
  QuantityStepper,
  SectionHeading,
  Stars,
} from "../components/ui";
import {
  Cart,
  Check,
  Clock,
  Heart,
  Package,
  Phone,
  Shield,
  Star,
  Truck,
} from "../components/Icons";

export default function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { add, items, setQty } = useCart();
  const { user } = useAuth();
  const { success, toast } = useToast();
  const wishlist = useWishlist();

  const { data, loading, error } = useFetch(() => api.product(id ?? ""), [id]);
  const reviews = useFetch(() => api.reviews(id ?? ""), [id]);

  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setLocalQty] = useState(1);
  const [tab, setTab] = useState<"description" | "faq" | "reviews">("description");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    setImgIdx(0);
    setLocalQty(1);
    setTab("description");
  }, [id]);

  const gallery = useMemo(() => {
    if (!data) return [];
    return data.product.images.length
      ? data.product.images
      : data.product.image
        ? [data.product.image]
        : [];
  }, [data]);

  if (error) return <ErrorBox message={error} />;
  if (loading || !data) return <PageLoading rows={3} />;

  const { product, related } = data;
  const inCart = items.find((i) => i.id === product.id);
  const saved = wishlist.has(product.id);
  const reviewList = reviews.data?.reviews ?? [];
  const average = reviews.data?.average || product.rating;

  const addToCart = (goToCheckout = false) => {
    add(product, qty);
    success(`${qty} × ${product.name} added to cart`);
    if (goToCheckout) nav("/checkout");
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingReview(true);
    try {
      await api.addReview({ productId: product.id, rating: reviewRating, body: reviewBody });
      toast("Thanks! Your review is live.", "success");
      setReviewBody("");
      reviews.refresh();
    } catch {
      toast("Could not save your review.", "error");
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="pb-20 lg:pb-0">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Products", to: "/products" },
          { label: product.name },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* gallery */}
        <div className="lg:sticky lg:top-[7.5rem] lg:self-start">
          <div className="card overflow-hidden p-3">
            <div className="group relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-brand-50/60">
              <Img
                src={gallery[imgIdx]}
                alt={product.name}
                eager
                className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
              <button
                type="button"
                onClick={() => void wishlist.toggle(product.id, product.name)}
                className={`absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border backdrop-blur transition ${
                  saved
                    ? "border-rose-200 bg-rose-50 text-rose-500"
                    : "border-slate-200 bg-white/85 text-slate-500 hover:text-rose-500"
                }`}
                aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
              >
                <Heart filled={saved} className="h-5 w-5" />
              </button>
              {product.discountPercent > 0 && (
                <span className="absolute left-3 top-3 rounded-xl bg-coral-gradient px-2.5 py-1.5 text-xs font-extrabold text-white shadow-soft">
                  {Math.round(product.discountPercent)}% OFF
                </span>
              )}
            </div>
          </div>

          {gallery.length > 1 && (
            <div className="scroll-native mt-3 flex gap-2 overflow-x-auto pb-1">
              {gallery.map((g, i) => (
                <button
                  key={`${g}-${i}`}
                  onClick={() => setImgIdx(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white p-1 transition ${
                    i === imgIdx ? "border-brand-500 shadow-soft" : "border-slate-100 hover:border-brand-200"
                  }`}
                  aria-label={`View image ${i + 1}`}
                >
                  <Img src={g} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { icon: <Shield className="h-4 w-4" />, label: "Genuine" },
              { icon: <Truck className="h-4 w-4" />, label: "Fast delivery" },
              { icon: <Package className="h-4 w-4" />, label: "Easy returns" },
            ].map((b) => (
              <span
                key={b.label}
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-white py-2 text-[11px] font-semibold text-slate-500"
              >
                <span className="text-brand-500">{b.icon}</span>
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* info */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {product.brand && (
              <Link
                to={`/products?brand=${encodeURIComponent(product.brand)}`}
                className="badge bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700"
              >
                {product.brand}
              </Link>
            )}
            {product.rx ? (
              <span className="badge-rx">Prescription required</span>
            ) : (
              <span className="badge-success">Over the counter</span>
            )}
            {product.cold && <span className="badge-cold">❄ Cold chain</span>}
            {product.stockStatus ? (
              <span className="badge-success">
                <Check className="h-3 w-3" /> In stock
              </span>
            ) : (
              <span className="badge-danger">Out of stock</span>
            )}
          </div>

          <h1 className="mt-2 font-display text-xl font-extrabold leading-snug sm:text-2xl">
            {product.name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {product.generic && (
              <span>
                Generic: <span className="font-semibold text-ink-800">{product.generic}</span>
              </span>
            )}
            {product.strength && <span>Strength: {product.strength}</span>}
            {product.form && <span>{product.form}</span>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Stars rating={average} count={product.ratingCount} size="md" />
            <span className="text-xs text-slate-400">
              {product.viewCount.toLocaleString()} views
            </span>
          </div>

          <div className="card mt-4 p-4">
            <PriceBlock
              price={product.price}
              mrp={product.mrp}
              discountPercent={product.discountPercent}
              size="lg"
            />
            {product.mrp > product.price && (
              <p className="mt-1 text-xs font-semibold text-emerald-600">
                You save {taka(product.mrp - product.price)} on this item
              </p>
            )}
            {product.unitLabel && (
              <p className="mt-1 text-xs text-slate-500">Pack size: {product.unitLabel}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <QuantityStepper value={qty} onChange={setLocalQty} />
              <button
                className="btn-primary flex-1 min-w-[10rem]"
                disabled={!product.stockStatus}
                onClick={() => addToCart(false)}
              >
                <Cart className="h-4 w-4" /> Add to cart
              </button>
              <button
                className="btn-coral flex-1 min-w-[9rem]"
                disabled={!product.stockStatus}
                onClick={() => addToCart(true)}
              >
                Buy now
              </button>
            </div>

            {inCart && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                <span>Already in cart · {inCart.qty} pc</span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg bg-white px-2 py-1 font-bold shadow-card"
                    onClick={() => setQty(inCart.id, inCart.qty - 1)}
                  >
                    −
                  </button>
                  <button
                    className="rounded-lg bg-white px-2 py-1 font-bold shadow-card"
                    onClick={() => setQty(inCart.id, inCart.qty + 1)}
                  >
                    +
                  </button>
                  <Link to="/cart" className="underline">
                    View cart
                  </Link>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-500" /> Free delivery over ৳1,000
              </p>
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-500" /> Delivered in 24–48h (Dhaka)
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand-500" /> Pharmacist help: 16778
              </p>
              <p className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-brand-500" /> Cash on delivery available
              </p>
            </div>
          </div>

          {product.note && (
            <div className="mt-3">
              <Alert tone="info">{product.note}</Alert>
            </div>
          )}

          {product.shortDesc && (
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{product.shortDesc}</p>
          )}

          {/* tabs */}
          <div className="mt-6">
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-card">
              {[
                { key: "description", label: "Description" },
                { key: "faq", label: `FAQ${product.faqs?.length ? ` (${product.faqs.length})` : ""}` },
                { key: "reviews", label: `Reviews${reviewList.length ? ` (${reviewList.length})` : ""}` },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as typeof tab)}
                  className={`tab ${tab === t.key ? "tab-active" : ""}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {tab === "description" && (
                <div className="panel">
                  {product.descriptionHtml ? (
                    <div
                      className="prose-sm max-w-none text-sm leading-relaxed text-slate-600 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
                      dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      No detailed description was published for this product. Ask our pharmacist on
                      16778 if you need guidance.
                    </p>
                  )}
                </div>
              )}

              {tab === "faq" && (
                <div className="space-y-2">
                  {(product.faqs ?? []).length === 0 && (
                    <EmptyState
                      title="No questions yet"
                      message="Have a question about this product? Our pharmacists can help on 16778."
                    />
                  )}
                  {(product.faqs ?? []).map((f, i) => (
                    <div key={i} className="card overflow-hidden">
                      <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                        aria-expanded={openFaq === i}
                      >
                        <span className="text-sm font-semibold text-ink-800">{f.question}</span>
                        <span className="text-lg text-brand-600">{openFaq === i ? "−" : "+"}</span>
                      </button>
                      {openFaq === i && (
                        <p className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600">
                          {f.answer}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === "reviews" && (
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-3">
                    {reviewList.length === 0 && (
                      <EmptyState
                        title="No customer reviews yet"
                        message="Be the first to review this product and help other shoppers."
                      />
                    )}
                    {reviewList.map((r) => (
                      <div key={r.id} className="card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                              {r.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="text-sm font-semibold">{r.name}</span>
                          </div>
                          <Stars rating={r.rating} />
                        </div>
                        {r.body && <p className="mt-2 text-sm text-slate-600">{r.body}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="card h-fit p-4">
                    {user ? (
                      <form onSubmit={submitReview} className="space-y-3">
                        <p className="font-display text-sm font-bold">Write a review</p>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReviewRating(n)}
                              aria-label={`${n} star${n > 1 ? "s" : ""}`}
                              className="p-0.5"
                            >
                              <Star
                                filled={n <= reviewRating}
                                className={`h-6 w-6 ${n <= reviewRating ? "text-amber-400" : "text-slate-300"}`}
                              />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={reviewBody}
                          onChange={(e) => setReviewBody(e.target.value)}
                          rows={4}
                          placeholder="Share how this product worked for you…"
                          className="input resize-none"
                        />
                        <button className="btn-primary w-full" disabled={savingReview}>
                          {savingReview ? "Saving…" : "Submit review"}
                        </button>
                      </form>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-semibold">Share your experience</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Sign in to rate this product and help other customers.
                        </p>
                        <Link to="/login" className="btn-primary mt-3 w-full">
                          Sign in to review
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-10">
          <SectionHeading title="You may also need" subtitle="Frequently bought together" />
          <Carousel>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </Carousel>
        </section>
      )}

      {/* sticky mobile add-to-cart bar — sits just above the fixed bottom nav,
          clear of the home indicator on notched devices */}
      <div
        data-testid="mobile-buy-bar"
        className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 pl-safe pr-safe backdrop-blur lg:hidden"
        style={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="min-w-0 flex-1">
            <PriceBlock
              price={product.price}
              mrp={product.mrp}
              discountPercent={product.discountPercent}
              size="sm"
            />
            <p className="mt-0.5 truncate text-[10px] text-slate-400">
              {product.unitLabel || product.name}
            </p>
          </div>

          {product.price > 0 ? (
            <button
              type="button"
              disabled={!product.stockStatus}
              onClick={() => addToCart(false)}
              className={`btn btn-sm shrink-0 px-4 py-2.5 ${inCart ? "btn-outline" : "btn-coral"}`}
            >
              {inCart ? <Check className="h-4 w-4" /> : <Cart className="h-4 w-4" />}
              {!product.stockStatus
                ? "Out of stock"
                : inCart
                  ? `In cart · ${inCart.qty}`
                  : "Add to cart"}
            </button>
          ) : (
            <a href="tel:16778" className="btn-outline btn-sm shrink-0 px-4 py-2.5">
              <Phone className="h-4 w-4" /> Call to order
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
