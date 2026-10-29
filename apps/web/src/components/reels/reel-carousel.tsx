"use client";
import { useEffect, useState } from "react";
import { getFeed } from "@/lib/api/reels";
import { ReelThumbnail } from "./reel-thumbnail";

interface Props {
  context: "product" | "brand" | "vendor";
  productId?: string;
  brandId?: string;
  vendorId?: string;
  locale: string;
}

export function ReelCarousel({ context, productId, brandId, vendorId, locale }: Props) {
  const [reels, setReels] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    getFeed({ context, productId, brandId, vendorId, limit: 6 })
      .then((d) => {
        if (!cancelled) setReels(d.reels);
      })
      .catch(() => {
        if (!cancelled) setReels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [context, productId, brandId, vendorId]);

  if (reels.length === 0) return null;
  return (
    <section className="my-8">
      <h2 className="text-xl font-semibold mb-3">Reels</h2>
      <div className="flex gap-3 overflow-x-auto">
        {reels.map((r) => (
          <ReelThumbnail
            key={r.id}
            reelId={r.id}
            thumbnailUrl={r.thumbnail_url}
            viewCount={r.view_count}
            locale={locale}
            playbackUrl={r.video_playback_url}
          />
        ))}
      </div>
    </section>
  );
}
