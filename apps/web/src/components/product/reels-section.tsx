"use client";

import { PdpReelsPanel } from "@/components/product/pdp-reels-panel";
import { ReelTile } from "@/components/product/reel-tile";
import {
  type ReelAuthorKindFilter,
  useFeaturedReels,
  useProductReels,
} from "@/lib/queries/product-reels";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Video } from "lucide-react";
import { useMemo, useRef, useState } from "react";

interface ReelsSectionProps {
  productId: string;
  productTitle: string;
  /** Vendor whose featured reels should be prepended to the rail. */
  vendorId?: string;
  /** When known, label the "House" tab with the brand/vendor name. */
  houseLabel?: string;
  /** Whether the current user has purchased this product (gates Submit-your-own). */
  canSubmit?: boolean;
}

const TABS: Array<{ id: ReelAuthorKindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "creator", label: "Creators" },
  { id: "customer", label: "Customers" },
  { id: "house", label: "The House" },
];

export function ReelsSection({
  productId,
  productTitle,
  vendorId,
  houseLabel,
  canSubmit = false,
}: ReelsSectionProps) {
  const [filter, setFilter] = useState<ReelAuthorKindFilter>("all");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data, isPending } = useProductReels(productId, filter, 20);
  const { data: featuredData } = useFeaturedReels({ productId, vendorId });

  // Prepend featured (licensed) reels — only on the "All" tab, deduped against
  // the regular feed so a featured reel that's also in the feed shows once.
  const reels = useMemo(() => {
    const base = data ?? [];
    if (filter !== "all" || !featuredData?.length) return base;
    const featuredIds = new Set(featuredData.map((r) => r.id));
    return [...featuredData, ...base.filter((r) => !featuredIds.has(r.id))];
  }, [data, featuredData, filter]);

  const counts = useMemo(() => {
    if (filter !== "all") {
      return { all: undefined, [filter]: reels.length };
    }
    return reels.reduce(
      (acc, r) => {
        acc.all++;
        acc[r.author_kind]++;
        return acc;
      },
      { all: 0, creator: 0, customer: 0, house: 0 } as Record<string, number>,
    );
  }, [filter, reels]);

  const scrollBy = (dx: number) => scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  const tabs = TABS.map((t) => (t.id === "house" && houseLabel ? { ...t, label: houseLabel } : t));

  if (!isPending && reels.length === 0 && filter === "all") {
    return null;
  }

  return (
    <section className="py-24 border-t border-nl-cacao/15 relative">
      <div className="mx-auto max-w-[1340px] px-6 lg:px-12">
        <div className="flex items-end justify-between mb-9 gap-6 flex-wrap">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-nl-russet mb-3">
              Worn by
            </div>
            <h2 className="font-serif text-4xl lg:text-5xl leading-[1.05] tracking-tight">
              The reel <span className="italic text-nl-amber">— {productTitle}</span>
            </h2>
            <p className="text-sm text-nl-russet mt-3 max-w-[480px] leading-relaxed">
              Stories from creators, customers, and the maker. Tap any reel to watch — every video
              shoppable.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              disabled={!canSubmit}
              title={canSubmit ? undefined : "Buy first to share your story"}
              className={cn(
                "px-4 py-3 border text-[10px] tracking-[0.22em] uppercase flex items-center gap-2",
                canSubmit
                  ? "border-nl-cacao text-nl-cacao hover:bg-nl-cacao/5"
                  : "border-nl-cacao/30 text-nl-cacao/50 cursor-not-allowed",
              )}
            >
              <Video className="w-3.5 h-3.5" />
              Submit your own
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => scrollBy(-500)}
                aria-label="Scroll left"
                className="w-10 h-10 border border-nl-cacao/30 text-nl-cacao flex items-center justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(500)}
                aria-label="Scroll right"
                className="w-10 h-10 border border-nl-cacao/30 text-nl-cacao flex items-center justify-center"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          role="tablist"
          className="flex gap-1 mb-7 border-b border-nl-cacao/15 overflow-x-auto flex-nowrap scrollbar-hide -mx-6 px-6 lg:mx-0 lg:px-0"
        >
          {tabs.map((t) => {
            const active = filter === t.id;
            const count = counts[t.id];
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setFilter(t.id)}
                className={cn(
                  "px-5 py-3.5 -mb-px border-b text-[11px] tracking-[0.22em] uppercase flex items-center gap-2 transition-colors flex-shrink-0 whitespace-nowrap",
                  active
                    ? "text-nl-cacao border-nl-cacao"
                    : "text-nl-cacao/50 border-transparent hover:text-nl-cacao/80",
                )}
              >
                {t.label}
                {count != null && <span className="text-[9px] opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto overflow-y-hidden px-6 lg:px-12 pb-6 scrollbar-hide"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {isPending
          ? ["s1", "s2", "s3", "s4"].map((k) => (
              <div
                key={k}
                className="flex-shrink-0 w-[232px] aspect-[9/16] bg-nl-russet/15 animate-pulse"
              />
            ))
          : reels.map((reel, i) => (
              <ReelTile key={reel.id} reel={reel} onClick={() => setOpenIdx(i)} />
            ))}
        <div className="w-6 flex-shrink-0" />
      </div>

      {openIdx !== null && (
        <PdpReelsPanel
          reels={reels}
          index={openIdx}
          onClose={() => setOpenIdx(null)}
          onChange={setOpenIdx}
        />
      )}
    </section>
  );
}
