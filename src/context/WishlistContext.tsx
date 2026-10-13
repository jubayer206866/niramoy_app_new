import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

interface WishlistValue {
  ids: number[];
  has: (id: number) => boolean;
  count: number;
  toggle: (id: number, name?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { success, toast } = useToast();
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const [ids, setIds] = useState<number[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds([]);
      return;
    }
    try {
      const { ids: list } = await api.wishlistIds();
      setIds(list);
    } catch {
      setIds([]);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WishlistValue>(() => {
    const has = (id: number) => ids.includes(id);
    const toggle = async (id: number, name?: string) => {
      if (!user) {
        toast("Sign in to save products to your wishlist.", "info");
        nav(`/login?next=${encodeURIComponent(pathname + search)}`);
        return;
      }
      const saved = ids.includes(id);
      try {
        const res = saved ? await api.wishlistRemove(id) : await api.wishlistAdd(id);
        setIds(res.ids);
        if (saved) toast(`${name || "Product"} removed from wishlist`, "info");
        else success(`${name || "Product"} saved to wishlist`);
      } catch {
        toast("Could not update your wishlist. Try again.", "error");
      }
    };
    return { ids, has, count: ids.length, toggle, refresh };
  }, [ids, user, nav, pathname, search, refresh, success, toast]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
