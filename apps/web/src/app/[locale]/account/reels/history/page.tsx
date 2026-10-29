"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getWatchHistory } from "@/lib/api/reels";
import { ReelThumbnail } from "@/components/reels/reel-thumbnail";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
} from "@/components/checkout/maison-primitives";

export default function WatchHistoryPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "en";
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    getWatchHistory()
      .then((d) => {
        if (!cancelled) setItems(d.items.map((i: any) => i.reel));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>REELS</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          Watch history
        </SerifTitle>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {items.map((r) => (
          <ReelThumbnail
            key={r.id}
            reelId={r.id}
            thumbnailUrl={r.thumbnail_url}
            viewCount={r.view_count}
            locale={locale}
          />
        ))}
        {items.length === 0 && (
          <div
            className="col-span-full py-12 text-center"
            style={{
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 16,
              color: "hsl(var(--nl-russet))",
            }}
          >
            Nothing watched yet.
          </div>
        )}
      </div>
    </div>
  );
}
