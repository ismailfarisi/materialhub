"use client";

import { ShoppingBag } from "lucide-react";
import { useRef, useState } from "react";
import { tapReelTag } from "@/lib/api/reels";

// Tap anywhere outside a tag toggles play/pause. Tags catch their own clicks
// because they're absolutely-positioned buttons stacked above the video.

function formatPriceFils(fils: number): string {
  return `AED ${(fils / 100).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface ReelTag {
  id: string;
  timestampSeconds: number;
  display_x?: number | null;
  display_y?: number | null;
  product: {
    id: string;
    slug?: string;
    name: string;
    priceFils: number;
    imageUrl: string;
    inStock?: boolean;
    vendorId?: string | null;
    brandId?: string | null;
  };
}

interface Props {
  reelId: string;
  playbackUrl: string;
  thumbnailUrl: string;
  tags: ReelTag[];
  onTagTap: (tag: ReelTag) => void;
  /** Default "cover" — fills the slot and crops. Use "contain" to letterbox and show the full 9:16 frame inside a wider/taller slot (e.g. PDP side panel). */
  fit?: "cover" | "contain";
}

export function ReelPlayer({
  reelId,
  playbackUrl,
  thumbnailUrl,
  tags,
  onTagTap,
  fit = "cover",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // A tag chip is visible within a 3-second window around its timestamp.
  const visibleTags = tags.filter(
    (t) => Math.abs(t.timestampSeconds - currentTime) < 3,
  );

  async function handleTagClick(tag: ReelTag) {
    try {
      const result = await tapReelTag(reelId, tag.id);
      // Replace cached tag product with the authoritative payload
      // returned by the attribution endpoint (includes vendor/brand IDs,
      // inStock, and a confirmed price snapshot).
      onTagTap({
        ...tag,
        product: {
          ...tag.product,
          id: result.product.id,
          name: result.product.name,
          priceFils: result.product.priceFils,
          imageUrl: result.product.imageUrl ?? tag.product.imageUrl,
          inStock: result.product.inStock,
          vendorId: result.product.vendorId,
          brandId: result.product.brandId,
        },
      });
    } catch (err) {
      // Attribution failed (network error, 410 tag_or_product_unavailable,
      // etc.) — fall back to the cached tag shape so the user still sees
      // the drawer. The backend records attribution best-effort.
      console.error("[reels] tag tap attribution failed", err);
      onTagTap(tag);
    }
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  return (
    // Fill the parent slot (typically a snap section sized to the viewport).
    // The inner box stays 9:16 and centers, so tag x/y offsets map to actual
    // video pixels even when the surrounding slot is wider than the video.
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <div className="relative h-full aspect-[9/16] max-w-full">
        <video
          ref={videoRef}
          src={playbackUrl}
          poster={thumbnailUrl}
          playsInline
          autoPlay
          muted
          loop
          onClick={togglePlay}
          className={`absolute inset-0 w-full h-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
          onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
        />
        {visibleTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleTagClick(tag);
            }}
            className="absolute pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 py-1 pl-1 pr-3 text-left shadow-xl ring-1 ring-black/5 backdrop-blur transition hover:scale-105 max-w-[70%]"
            style={{
              left: `${(tag.display_x ?? 0.5) * 100}%`,
              top: `${(tag.display_y ?? 0.85) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 overflow-hidden">
              {tag.product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tag.product.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ShoppingBag className="h-4 w-4 text-gray-500" strokeWidth={2} />
              )}
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="truncate text-xs font-semibold text-gray-900">
                {tag.product.name}
              </span>
              {tag.product.priceFils > 0 && (
                <span className="text-[11px] font-medium text-primary">
                  {formatPriceFils(tag.product.priceFils)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
