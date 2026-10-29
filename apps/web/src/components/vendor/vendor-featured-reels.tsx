"use client";

import { PdpReelsPanel } from "@/components/product/pdp-reels-panel";
import { ReelTile } from "@/components/product/reel-tile";
import { useFeaturedReels } from "@/lib/queries/product-reels";
import { useState } from "react";

interface VendorFeaturedReelsProps {
  vendorId: string;
  vendorName?: string;
}

/**
 * Vendor-storefront rail of featured (licensed) reels, sourced from the public
 * rights-delivery endpoint. Renders nothing when the vendor has no featured
 * reels, so it can be dropped onto the storefront unconditionally.
 */
export function VendorFeaturedReels({
  vendorId,
  vendorName,
}: VendorFeaturedReelsProps) {
  const { data } = useFeaturedReels({ vendorId });
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const reels = data ?? [];

  if (reels.length === 0) return null;

  return (
    <section className="py-16 border-t border-nl-cacao/15">
      <div className="mx-auto max-w-[1340px] px-6 lg:px-12">
        <div className="text-[10px] tracking-[0.22em] uppercase text-nl-russet mb-3">
          Featured reels
        </div>
        <h2 className="font-serif text-3xl lg:text-4xl leading-[1.05] tracking-tight mb-8">
          Licensed stories
          {vendorName ? (
            <span className="italic text-nl-amber"> — {vendorName}</span>
          ) : null}
        </h2>
      </div>

      <div
        className="flex gap-4 overflow-x-auto overflow-y-hidden px-6 lg:px-12 pb-6 scrollbar-hide"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {reels.map((reel, i) => (
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
