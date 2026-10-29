"use client";

import { RailCard } from "@/components/product/rail-card";
import type { RailProduct } from "@/lib/queries/recommendations";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRef } from "react";

interface RailProps {
  eyebrow: string;
  heading: React.ReactNode;
  sub?: string;
  items: RailProduct[] | undefined;
  isLoading?: boolean;
  /** Set on the bestsellers rail to apply a dark surface. */
  dark?: boolean;
  /** When set, the card matching this product id gets the "You're viewing" badge. */
  highlightProductId?: string;
  /** Locale prefix passed to card links. */
  localePrefix?: string;
}

export function Rail({
  eyebrow,
  heading,
  sub,
  items,
  isLoading,
  dark = false,
  highlightProductId,
  localePrefix,
}: RailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dx: number) => scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  if (!isLoading && (!items || items.length === 0)) return null;

  const fg = dark ? "text-nl-linen" : "text-nl-cacao";
  const subFg = dark ? "text-nl-pearl" : "text-nl-russet";
  const eyebrowFg = dark ? "text-nl-amber" : "text-nl-russet";
  const arrowBorder = dark ? "border-nl-pearl/25" : "border-nl-cacao/30";

  return (
    <section className={cn("py-16", dark ? "bg-nl-cacao" : "bg-transparent", fg)}>
      <div className="mx-auto max-w-[1340px] px-6 lg:px-12">
        <div className="flex items-end justify-between mb-9">
          <div className="max-w-[540px]">
            <div className={cn("text-[10px] tracking-[0.22em] uppercase mb-3", eyebrowFg)}>
              {eyebrow}
            </div>
            <h2 className="font-serif text-4xl lg:text-[42px] leading-[1.05] tracking-tight mb-3">
              {heading}
            </h2>
            {sub && <p className={cn("text-sm leading-relaxed", subFg)}>{sub}</p>}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => scrollBy(-500)}
              aria-label="Scroll left"
              className={cn("w-10 h-10 border flex items-center justify-center", arrowBorder, fg)}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(500)}
              aria-label="Scroll right"
              className={cn("w-10 h-10 border flex items-center justify-center", arrowBorder, fg)}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-6 overflow-x-auto px-6 lg:px-12 pb-4 mx-auto max-w-[1340px] scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {isLoading
          ? ["s1", "s2", "s3", "s4"].map((k) => (
              <div
                key={k}
                className={cn(
                  "flex-shrink-0 w-[252px] aspect-[4/5] animate-pulse",
                  dark ? "bg-nl-pearl/10" : "bg-nl-russet/10",
                )}
              />
            ))
          : items?.map((item) => (
              <RailCard
                key={item.id}
                item={item}
                dark={dark}
                isViewing={highlightProductId === item.id}
                localePrefix={localePrefix}
              />
            ))}
        <div className="w-6 flex-shrink-0" />
      </div>
    </section>
  );
}
