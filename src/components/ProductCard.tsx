import { Link } from "react-router-dom";
import type { Product } from "../api";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../context/WishlistContext";
import { Heart, Cart, Check, Phone } from "./Icons";
import { Stars, PriceBlock } from "./ui";
import { Img, imagePlaceholder } from "./Img";

export { Stars };
// kept for existing importers (cart / checkout / product page)
export const productPlaceholder = imagePlaceholder;

export default function ProductCard({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  const { add, items } = useCart();
  const { success } = useToast();
  const wishlist = useWishlist();
  const saved = wishlist.has(product.id);
  const inCart = items.find((i) => i.id === product.id);
  const href = `/product/${product.id}/${product.slug}`;

  const onAdd = () => {
    add(product);
    success(`${product.name} added to cart`);
  };

  return (
    <article className="card-hover group relative flex h-full flex-col overflow-hidden p-3">
      <button
        type="button"
        onClick={() => void wishlist.toggle(product.id, product.name)}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={saved}
        className={`absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border backdrop-blur transition ${
          saved
            ? "border-rose-200 bg-rose-50 text-rose-500"
            : // always visible on touch devices, revealed on hover elsewhere
              "border-slate-200 bg-white/85 text-slate-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        }`}
      >
        <Heart filled={saved} className="h-4 w-4" />
      </button>

      <Link
        to={href}
        className="relative mb-2.5 block aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-brand-50/60"
      >
        <Img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.06]"
        />
        {product.discountPercent > 0 && (
          <span className="absolute left-2 top-2 rounded-lg bg-coral-gradient px-2 py-1 text-[10px] font-extrabold text-white shadow-soft">
            -{Math.round(product.discountPercent)}%
          </span>
        )}
        {product.rx && (
          <span className="absolute bottom-2 left-2 rounded-md bg-brand-600/95 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Rx
          </span>
        )}
        {!product.stockStatus && (
          <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </Link>

      <span className="block h-4 truncate text-[10px] font-bold uppercase leading-4 tracking-wide text-brand-600">
        {product.brand}
      </span>

      <Link
        to={href}
        className="line-clamp-2 min-h-[2.75em] text-sm font-semibold leading-snug text-ink-800 transition hover:text-brand-700"
      >
        {product.name}
      </Link>

      <div className="mt-1 flex min-h-[18px] items-center gap-2">
        {!compact && product.unitLabel && (
          <span className="truncate text-[11px] text-slate-400">{product.unitLabel}</span>
        )}
        <Stars rating={product.rating} count={product.ratingCount} className="ml-auto" />
      </div>

      <div className="mt-auto pt-2">
        <PriceBlock
          price={product.price}
          mrp={product.mrp}
          discountPercent={product.discountPercent}
        />
      </div>

      {product.price <= 0 ? (
        <a href="tel:16778" className="btn-outline btn-sm mt-2.5 w-full py-2">
          <Phone className="h-4 w-4" /> Call to order
        </a>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={!product.stockStatus}
          className={`mt-2.5 w-full ${inCart ? "btn-outline btn-sm" : "btn-coral btn-sm"} py-2`}
        >
          {inCart ? (
            <>
              <Check className="h-4 w-4" /> In cart · {inCart.qty}
            </>
          ) : (
            <>
              <Cart className="h-4 w-4" /> Add to cart
            </>
          )}
        </button>
      )}
    </article>
  );
}
