import { useEffect, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { useFetch } from "../lib";
import { Footer, Header, MobileNav } from "./Header";

/** Jump back to the top whenever the route changes (product pages, etc.). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export default function Layout() {
  const { data: categories } = useFetch(() => api.categories(), []);
  const { data: site } = useFetch(() => api.site(), []);
  const siteInfo = useMemo(() => site ?? null, [site]);
  const { pathname } = useLocation();

  return (
    <div id="top" className="flex min-h-screen flex-col">
      <ScrollToTop />
      <Header categories={categories ?? []} site={siteInfo} />
      <main
        key={pathname}
        className="container-ag flex-1 animate-fadeIn pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))] sm:pt-5 sm:pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-[max(1.25rem,env(safe-area-inset-right))] lg:pb-10 lg:pl-[max(1.5rem,env(safe-area-inset-left))] lg:pr-[max(1.5rem,env(safe-area-inset-right))]"
      >
        <Outlet />
      </main>
      <Footer site={siteInfo} categories={categories ?? []} />
      <MobileNav />
    </div>
  );
}
