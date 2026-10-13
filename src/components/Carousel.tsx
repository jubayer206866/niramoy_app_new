import { useRef } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "./Icons";

export default function Carousel({
  children,
  itemClass = "w-[46%] shrink-0 xs:w-40 sm:w-44 lg:w-48",
}: {
  children: ReactNode[];
  itemClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 260), behavior: "smooth" });
  };

  return (
    <div className="group/carousel relative">
      <div
        ref={ref}
        className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
      >
        {children.map((child, i) => (
          <div key={i} className={`${itemClass} snap-start`}>
            {child}
          </div>
        ))}
      </div>
      <button
        aria-label="Scroll left"
        onClick={() => scrollBy(-1)}
        className="absolute -left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-slate-100 bg-white text-slate-600 shadow-soft transition hover:text-brand-600 lg:group-hover/carousel:grid"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        aria-label="Scroll right"
        onClick={() => scrollBy(1)}
        className="absolute -right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-slate-100 bg-white text-slate-600 shadow-soft transition hover:text-brand-600 lg:group-hover/carousel:grid"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
