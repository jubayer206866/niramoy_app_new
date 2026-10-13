import { Link } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../lib";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../context/WishlistContext";
import ProductCard from "../components/ProductCard";
import { EmptyState, ProductGridSkeleton } from "../components/ui";
import { ErrorBox } from "../components/Errors";
import { Cart, Heart } from "../components/Icons";

export default function WishlistPage() {
  const { data, loading, error } = useFetch(() => api.wishlist(), []);
  const { add } = useCart();
  const { success } = useToast();
  const wishlist = useWishlist();

  // dropping a heart removes it from the grid immediately, no refetch needed
  const products = (data?.products ?? []).filter((p) => wishlist.ids.includes(p.id));

  const moveAll = () => {
    products.forEach((p) => add(p, 1));
    success(`${products.length} products added to your cart`);
  };

  if (error) return <ErrorBox message={error} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <Heart className="h-6 w-6 text-rose-500" /> Your wishlist
          </h1>
          <p className="text-sm text-slate-500">
            {products.length} saved product{products.length === 1 ? "" : "s"}
          </p>
        </div>
        {products.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={moveAll}>
              <Cart className="h-4 w-4" /> Add all to cart
            </button>
            <Link to="/products" className="btn-outline btn-sm">
              Find more
            </Link>
          </div>
        )}
      </div>

      {loading && <ProductGridSkeleton count={8} />}

      {!loading && products.length === 0 && (
        <EmptyState
          icon={<Heart className="h-6 w-6" />}
          title="Nothing saved yet"
          message="Tap the heart on any product to keep it here for later — perfect for monthly refills."
          action={
            <Link to="/products" className="btn-primary">
              Browse products
            </Link>
          }
        />
      )}

      {!loading && products.length > 0 && (
        <div className="animate-fadeUp grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
