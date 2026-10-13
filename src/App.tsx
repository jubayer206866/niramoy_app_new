import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./admin/RequireAdmin";
import { PageLoading } from "./components/Errors";
import HomePage from "./pages/HomePage";
import ListingPage from "./pages/ListingPage";
import ProductPage from "./pages/ProductPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import WishlistPage from "./pages/WishlistPage";
import AccountPage from "./pages/account/AccountPage";
import AccountOverview from "./pages/account/AccountOverview";
import AccountOrders from "./pages/account/AccountOrders";
import AccountOrderDetail from "./pages/account/AccountOrderDetail";
import AccountAddresses from "./pages/account/AccountAddresses";
import AccountProfile from "./pages/account/AccountProfile";
import AccountWallet from "./pages/account/AccountWallet";
import AccountNotifications from "./pages/account/AccountNotifications";
import NotFoundPage from "./pages/NotFoundPage";

// The whole admin panel is one lazy chunk - storefront visitors never download it.
const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <RequireAdmin>
            <Suspense fallback={<PageLoading rows={4} />}>
              <AdminApp />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/products" element={<ListingPage />} />
        <Route path="/category/:slug" element={<ListingPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/product/:id/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/wishlist" element={<Navigate to="/account/wishlist" replace />} />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        >
          <Route index element={<AccountOverview />} />
          <Route path="orders" element={<AccountOrders />} />
          <Route path="orders/:id" element={<AccountOrderDetail />} />
          <Route path="wallet" element={<AccountWallet />} />
          <Route path="notifications" element={<AccountNotifications />} />
          <Route path="wishlist" element={<WishlistPage />} />
          <Route path="addresses" element={<AccountAddresses />} />
          <Route path="profile" element={<AccountProfile />} />
        </Route>
        <Route path="/brand" element={<Navigate to="/products" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
