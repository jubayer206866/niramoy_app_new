import { Link } from "react-router-dom";
import { FREE_DELIVERY_OVER, useCart } from "../context/CartContext";
import { taka } from "../lib";
import { EmptyState, QuantityStepper } from "../components/ui";
import { Img } from "../components/Img";
import { Cart, Check, Shield, Trash, Truck } from "../components/Icons";
import { PAYMENT_MARKS } from "../components/PaymentLogos";

export default function CartPage() {
  const { items, count, subtotal, savings, delivery, total, setQty, remove, clear } = useCart();

  if (!items.length) {
    return (
      <div className="py-6">
        <EmptyState
          icon={<Cart className="h-6 w-6" />}
          title="Your cart is empty"
          message="Browse thousands of medicines, beauty and healthcare products and add your essentials."
          action={
            <Link to="/products" className="btn-primary">
              Start shopping
            </Link>
          }
        />
      </div>
    );
  }

  const remaining = Math.max(FREE_DELIVERY_OVER - subtotal, 0);
  const progress = Math.min((subtotal / FREE_DELIVERY_OVER) * 100, 100);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Shopping cart</h1>
          <p className="text-sm text-slate-500">
            {count} item{count > 1 ? "s" : ""} · {taka(subtotal)} before delivery
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={clear} className="font-semibold text-rose-500 hover:underline">
            Clear cart
          </button>
          <Link to="/products" className="font-semibold text-brand-600 hover:underline">
            ← Continue shopping
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {/* free delivery progress */}
          <div className="card p-4">
            {delivery === 0 ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <Check className="h-4 w-4" /> You unlocked free delivery on this order.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                <Truck className="h-4 w-4 text-brand-500" />
                Add {taka(remaining)} more for free delivery
              </p>
            )}
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-gradient transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {items.map((item) => (
            <div key={item.id} className="card p-3">
              <div className="flex gap-3">
                <Link
                  to={`/product/${item.id}/${item.slug}`}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-brand-50/60 p-1.5 sm:h-24 sm:w-24"
                >
                  <Img src={item.image} alt={item.name} className="h-full w-full object-contain" />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/product/${item.id}/${item.slug}`}
                      className="line-clamp-2 text-sm font-semibold text-ink-800 transition hover:text-brand-700"
                    >
                      {item.name}
                    </Link>
                    <button
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {item.unitLabel && <span>{item.unitLabel}</span>}
                    {item.rx && <span className="badge-rx">Rx required</span>}
                    {item.mrp > item.price && (
                      <span className="badge-success">
                        Save {taka((item.mrp - item.price) * item.qty)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                    <QuantityStepper
                      value={item.qty}
                      onChange={(n) => setQty(item.id, n)}
                      className="scale-95 sm:scale-100"
                    />
                    <div className="text-right">
                      <p className="font-display text-base font-extrabold">
                        {taka(item.price * item.qty)}
                      </p>
                      {item.mrp > item.price && (
                        <p className="text-[11px] text-slate-400 line-through">
                          {taka(item.mrp * item.qty)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* summary */}
        <aside className="h-fit lg:sticky lg:top-[7.5rem]">
          <div className="card p-4">
            <h2 className="font-display text-lg font-extrabold">Order summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal ({count} items)</dt>
                <dd className="font-semibold">{taka(subtotal)}</dd>
              </div>
              {savings > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt>Product savings</dt>
                  <dd className="font-semibold">−{taka(savings)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Delivery</dt>
                <dd className="font-semibold">
                  {delivery === 0 ? <span className="text-emerald-600">FREE</span> : taka(delivery)}
                </dd>
              </div>
              <div className="divider my-2" />
              <div className="flex items-baseline justify-between">
                <dt className="font-display text-base font-bold">Total</dt>
                <dd className="font-display text-xl font-extrabold text-brand-700">
                  {taka(total)}
                </dd>
              </div>
            </dl>

            <Link to="/checkout" className="btn-coral mt-4 w-full">
              Proceed to checkout
            </Link>

            <div className="mt-4 space-y-2 text-xs text-slate-500">
              <p className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-brand-500" /> Payments are simulated in this demo
              </p>
              <p className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-brand-500" /> Cash on delivery available nationwide
              </p>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                We accept
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {PAYMENT_MARKS.map(({ id, Logo, label }) => (
                  <span key={id} title={label} className="pay-chip h-8">
                    <Logo className="h-4 w-auto" />
                  </span>
                ))}
              </div>
            </div>
          </div>

          {savings > 0 && (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-xs font-bold text-emerald-700">
              🎉 You are saving {taka(savings)} on this order
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
