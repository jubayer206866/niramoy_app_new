import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type Address, type Order } from "../api";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { taka, useFetch } from "../lib";
import { useLiveEvents } from "../live";
import { Alert, Field } from "../components/ui";
import { Img } from "../components/Img";
import { Check, Lock, MapPin, Package, Shield, Wallet as WalletIcon } from "../components/Icons";
import {
  AmexLogo,
  BkashLogo,
  CodLogo,
  MastercardLogo,
  NagadLogo,
  RocketLogo,
  VisaLogo,
} from "../components/PaymentLogos";

type PaymentOption = {
  id: string;
  label: string;
  hint: string;
  Logo?: (p: { className?: string }) => JSX.Element;
  cards?: boolean;
};

const PAYMENTS: PaymentOption[] = [
  { id: "cod", label: "Cash on delivery", hint: "Pay the rider when your order arrives", Logo: CodLogo },
  { id: "bkash", label: "bKash", hint: "Mobile wallet payment", Logo: BkashLogo },
  { id: "nagad", label: "Nagad", hint: "Mobile wallet payment", Logo: NagadLogo },
  { id: "rocket", label: "Rocket", hint: "DBBL mobile banking", Logo: RocketLogo },
  { id: "card", label: "Card", hint: "Visa · Mastercard · American Express", cards: true },
];

function PaymentMark({ option }: { option: PaymentOption }) {
  if (option.cards) {
    return (
      <span className="flex items-center gap-1.5">
        <VisaLogo className="h-6 w-auto" />
        <MastercardLogo className="h-6 w-auto" />
        <AmexLogo className="h-6 w-auto" />
      </span>
    );
  }
  const Logo = option.Logo!;
  return <Logo className="h-7 w-auto" />;
}

export default function CheckoutPage() {
  const { items, count, subtotal, savings, delivery, total, clear } = useCart();
  const { user, addresses, defaultAddress, refresh } = useAuth();
  const { success, error: toastError } = useToast();
  const nav = useNavigate();

  const [addressId, setAddressId] = useState<number | "new">(
    defaultAddress?.id ?? (addresses.length ? addresses[0].id : "new"),
  );
  const [form, setForm] = useState({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    address: "",
    city: "Dhaka",
    note: "",
    email: user?.email ?? "",
  });
  const [payment, setPayment] = useState("cod");
  const [saveAddress, setSaveAddress] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<Order | null>(null);

  const { data: wallet, reload: reloadWallet } = useFetch(
    () => (user ? api.wallet() : Promise.resolve(null)),
    [user?.id],
  );
  useLiveEvents(["wallet"], reloadWallet);
  const balance = wallet?.balance ?? 0;
  const walletCovers = !!wallet && balance >= total;
  const shortfall = Math.max(Math.ceil(total - balance), 0);

  const selectedAddress = useMemo(
    () => (addressId === "new" ? null : addresses.find((a) => a.id === addressId) || null),
    [addressId, addresses],
  );

  if (placed) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="bg-brand-gradient px-6 py-8 text-center text-white">
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
              <Check className="h-7 w-7" />
            </span>
            <h1 className="font-display text-2xl font-extrabold">Order confirmed</h1>
            <p className="mt-1 text-sm text-white/85">
              Order <span className="font-bold">{placed.id}</span> · we will call you on{" "}
              {placed.phone} to confirm delivery.
            </p>
          </div>
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Delivery to</p>
                <p className="mt-1 text-sm font-semibold">{placed.name}</p>
                <p className="text-sm text-slate-500">
                  {placed.address}, {placed.city}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment</p>
                <p className="mt-1 text-sm font-semibold capitalize">
                  {placed.paymentMethod === "wallet"
                    ? "Niramoy Wallet · paid"
                    : PAYMENTS.find((p) => p.id === placed.paymentMethod)?.label ?? placed.paymentMethod}
                </p>
                <p className="text-sm text-slate-500">
                  {placed.itemsCount} items · {taka(placed.total)}
                </p>
                {placed.paymentMethod === "wallet" && wallet && (
                  <p className="text-xs text-slate-500">Wallet balance now {taka(wallet.balance)}</p>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {(placed.items ?? []).map((line) => (
                <div key={line.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white p-1">
                    <Img src={line.image} alt="" className="h-full w-full object-contain" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-slate-500">
                      {line.qty} × {taka(line.price)}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{taka(line.price * line.qty)}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {user ? (
                <Link to="/account/orders" className="btn-primary">
                  <Package className="h-4 w-4" /> View my orders
                </Link>
              ) : (
                <Link to="/register" className="btn-primary">
                  Create an account to track this order
                </Link>
              )}
              <Link to="/products" className="btn-outline">
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Package className="h-6 w-6" />
        </span>
        <h1 className="font-display text-lg font-bold">Your cart is empty</h1>
        <p className="mt-1 text-sm text-slate-500">Add products before proceeding to checkout.</p>
        <Link to="/products" className="btn-primary mt-4">
          Browse products
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payment === "wallet" && !walletCovers) {
      setError(`Your wallet balance is ${taka(balance)}. Add ${taka(shortfall)} or choose another payment method.`);
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      items: items.map((i) => ({ id: i.id, qty: i.qty })),
      name: selectedAddress?.name ?? form.name,
      phone: selectedAddress?.phone ?? form.phone,
      address: selectedAddress?.address ?? form.address,
      city: selectedAddress?.city ?? form.city,
      email: form.email,
      note: form.note,
      paymentMethod: payment,
      saveAddress: saveAddress && !selectedAddress,
    };
    try {
      const { order } = await api.placeOrder(payload);
      clear();
      setPlaced(order);
      success(
        order.paymentMethod === "wallet"
          ? `Paid ${taka(order.total)} from your wallet - order ${order.id} placed`
          : `Order ${order.id} placed successfully`,
      );
      if (user) void refresh();
      reloadWallet();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not place your order. Please try again.";
      setError(message);
      toastError(message);
      if (payment === "wallet") reloadWallet();
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "input";

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-extrabold">Checkout</h1>
      <p className="mb-4 text-sm text-slate-500">
        {count} items · {user ? `Signed in as ${user.email}` : "Checking out as a guest"}
      </p>

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* address */}
          <section className="panel">
            <header className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <MapPin className="h-4 w-4 text-brand-500" /> Delivery address
              </h2>
              {!user && (
                <Link to="/login?next=/checkout" className="text-xs font-bold text-brand-600 hover:underline">
                  Sign in for saved addresses
                </Link>
              )}
            </header>

            {addresses.length > 0 && (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {addresses.map((a: Address) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddressId(a.id)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      addressId === a.id
                        ? "border-brand-500 bg-brand-50/60 shadow-soft"
                        : "border-slate-200 hover:border-brand-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-brand-600">
                        {a.label}
                      </span>
                      {a.isDefault && <span className="badge-success">Default</span>}
                    </div>
                    <p className="mt-1 text-sm font-semibold">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.phone}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {a.address}, {a.city}
                    </p>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAddressId("new")}
                  className={`rounded-2xl border border-dashed p-3 text-left transition ${
                    addressId === "new" ? "border-brand-500 bg-brand-50/60" : "border-slate-300 hover:border-brand-300"
                  }`}
                >
                  <p className="text-sm font-semibold">+ Use a new address</p>
                  <p className="text-xs text-slate-500">Enter a different delivery point</p>
                </button>
              </div>
            )}

            {addressId === "new" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name *">
                  <input
                    className={inputCls}
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Mobile number *">
                  <input
                    className={inputCls}
                    required
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="01XXXXXXXXX"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Full address *" hint="House / road / area, landmark">
                    <textarea
                      className={`${inputCls} resize-none`}
                      required
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="City">
                  <input
                    className={inputCls}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </Field>
                <Field label="Email" hint="For the order receipt (optional)">
                  <input
                    className={inputCls}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                {user && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    Save this address to my account
                  </label>
                )}
              </div>
            )}

            {selectedAddress && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold">{selectedAddress.name}</p>
                <p className="text-slate-500">{selectedAddress.phone}</p>
                <p className="text-slate-500">
                  {selectedAddress.address}, {selectedAddress.city}
                </p>
              </div>
            )}
          </section>

          {/* payment */}
          <section className="panel">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
              <Lock className="h-4 w-4 text-brand-500" /> Payment method
            </h2>

            <div
              className={`mb-2 flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition ${
                payment === "wallet"
                  ? "border-brand-500 bg-brand-50/60 shadow-soft"
                  : "border-slate-200"
              }`}
            >
              <button
                type="button"
                disabled={!walletCovers}
                onClick={() => setPayment("wallet")}
                aria-pressed={payment === "wallet"}
                className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white">
                  <WalletIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    Niramoy Wallet
                    {wallet && (
                      <span className={walletCovers ? "badge-success" : "badge bg-slate-100 text-slate-600"}>
                        {taka(balance)}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {!user
                      ? "Sign in to pay with your wallet balance"
                      : !wallet
                        ? "Checking your balance…"
                        : walletCovers
                          ? `Pay instantly · ${taka(balance - total)} left after this order`
                          : `Not enough balance · add ${taka(shortfall)} to pay with your wallet`}
                  </span>
                </span>
              </button>
              {payment === "wallet" && walletCovers ? (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white">
                  <Check className="h-3 w-3" />
                </span>
              ) : !user ? (
                <Link to="/login?next=/checkout" className="btn-outline btn-sm">
                  Sign in
                </Link>
              ) : wallet && !walletCovers ? (
                <Link to={`/account/wallet?add=${shortfall}&next=/checkout`} className="btn-outline btn-sm">
                  Add money
                </Link>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PAYMENTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPayment(p.id)}
                  aria-pressed={payment === p.id}
                  className={`relative flex flex-col gap-2 rounded-2xl border p-3 text-left transition ${
                    payment === p.id
                      ? "border-brand-500 bg-brand-50/60 shadow-soft"
                      : "border-slate-200 hover:border-brand-300 hover:shadow-soft"
                  }`}
                >
                  {payment === p.id && (
                    <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <PaymentMark option={p} />
                  <span className="text-sm font-bold">{p.label}</span>
                  <span className="text-[11px] text-slate-500">{p.hint}</span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <Field label="Order note" hint="Allergies, delivery instructions or a prescription reference">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Please call before delivery"
                />
              </Field>
            </div>
          </section>
        </div>

        {/* summary */}
        <aside className="h-fit lg:sticky lg:top-[7.5rem]">
          <div className="card p-4">
            <h2 className="font-display text-lg font-extrabold">Your order</h2>
            <div className="scroll-native mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-2.5">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-50 p-0.5">
                    <Img src={i.image} alt="" className="h-full w-full object-contain" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{i.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {i.qty} × {taka(i.price)}
                    </p>
                  </div>
                  <p className="text-xs font-bold">{taka(i.price * i.qty)}</p>
                </div>
              ))}
            </div>

            <div className="divider my-3" />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="font-semibold">{taka(subtotal)}</dd>
              </div>
              {savings > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt>Savings</dt>
                  <dd className="font-semibold">−{taka(savings)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Delivery</dt>
                <dd className="font-semibold">
                  {delivery === 0 ? <span className="text-emerald-600">FREE</span> : taka(delivery)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <dt className="font-display text-base font-bold">Total</dt>
                <dd className="font-display text-xl font-extrabold text-brand-700">{taka(total)}</dd>
              </div>
            </dl>

            {error && (
              <div className="mt-3">
                <Alert tone="error">{error}</Alert>
              </div>
            )}

            <button className="btn-coral mt-4 w-full" disabled={busy}>
              {busy
                ? "Placing order…"
                : payment === "wallet"
                  ? `Pay ${taka(total)} from wallet`
                  : `Place order · ${taka(total)}`}
            </button>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Accepted payment methods
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="pay-chip"><BkashLogo className="h-5 w-auto" /></span>
                <span className="pay-chip"><NagadLogo className="h-5 w-auto" /></span>
                <span className="pay-chip"><RocketLogo className="h-5 w-auto" /></span>
                <span className="pay-chip"><VisaLogo className="h-5 w-auto" /></span>
                <span className="pay-chip"><MastercardLogo className="h-5 w-auto" /></span>
                <span className="pay-chip"><AmexLogo className="h-5 w-auto" /></span>
                <span className="pay-chip"><CodLogo className="h-5 w-auto" /></span>
              </div>
            </div>

            <p className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <Shield className="h-3.5 w-3.5" /> Demo checkout — no real payment is processed
            </p>
            <button
              type="button"
              onClick={() => nav("/cart")}
              className="mt-2 w-full text-center text-xs font-semibold text-slate-500 hover:text-brand-600"
            >
              ← Back to cart
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
