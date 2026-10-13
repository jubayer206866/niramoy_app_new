import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "../api";

export interface CartItem {
  id: number;
  slug: string;
  name: string;
  image: string;
  unitLabel: string;
  price: number;
  mrp: number;
  qty: number;
  rx: boolean;
}

export const FREE_DELIVERY_OVER = 1000;
export const DELIVERY_FEE = 60;

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  savings: number;
  delivery: number;
  total: number;
  has: (id: number) => boolean;
  add: (p: Product, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "niramoy-pharmacy-cart-v1";

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const add = (p: Product, qty = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === p.id);
        if (existing) {
          return prev.map((i) =>
            i.id === p.id ? { ...i, qty: Math.min(i.qty + qty, 99) } : i,
          );
        }
        return [
          ...prev,
          {
            id: p.id,
            slug: p.slug,
            name: p.name,
            image: p.image,
            unitLabel: p.unitLabel,
            price: p.price,
            mrp: p.mrp,
            qty,
            rx: p.rx,
          },
        ];
      });
    };
    const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);
    const delivery = items.length === 0 || subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
    return {
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotal,
      savings: items.reduce((n, i) => n + i.qty * Math.max(i.mrp - i.price, 0), 0),
      delivery,
      total: subtotal + delivery,
      has: (id: number) => items.some((i) => i.id === id),
      add,
      setQty: (id, qty) =>
        setItems((prev) =>
          qty <= 0
            ? prev.filter((i) => i.id !== id)
            : prev.map((i) => (i.id === id ? { ...i, qty: Math.min(qty, 99) } : i)),
        ),
      remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
