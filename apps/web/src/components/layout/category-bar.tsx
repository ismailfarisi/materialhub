"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon_url?: string;
}

export function CategoryBar({ categories }: { categories: Category[] }) {
  const locale = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: "left" | "right") {
    if (scrollRef.current) {
      const amount = direction === "left" ? -200 : 200;
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  }

  return (
    <div className="relative border-b">
      <div className="mx-auto max-w-[1400px] flex items-center px-2 md:px-8">
        <button
          onClick={() => scroll("left")}
          className="p-1 hover:bg-accent rounded shrink-0"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={scrollRef}
          className="flex gap-1 overflow-x-auto scrollbar-hide py-2"
        >
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/${locale}/c/${cat.slug}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap hover:bg-accent transition-colors"
            >
              {cat.icon_url && (
                <img src={cat.icon_url} alt="" className="h-5 w-5" />
              )}
              {cat.name}
            </Link>
          ))}
        </div>
        <button
          onClick={() => scroll("right")}
          className="p-1 hover:bg-accent rounded shrink-0"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
