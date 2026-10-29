"use client";

import { useEffect, useRef, useState } from "react";
import { getFeed, getReel, recordView, type GetFeedParams } from "@/lib/api/reels";
import { ReelPlayer, type ReelTag } from "./reel-player";
import { ProductDrawer } from "./product-drawer";
import { ReelOverlayActions } from "./reel-overlay-actions";
import { FeedTabSwitcher } from "./feed-tab-switcher";

type FeedTab = "for_you" | "latest" | "following";
type FeedContext = GetFeedParams["context"];

interface DrawerProduct {
  id: string;
  slug?: string;
  name: string;
  priceFils: number;
  imageUrl: string;
  inStock?: boolean;
}

interface Props {
  initialContext?: FeedContext;
  locale?: string;
  // When set, fetches this reel first and shows it as the first item; the feed
  // continues with regular getFeed results (deduped) so the user can scroll on
  // to the next reel from a permalink-style entry point.
  seedReelId?: string;
  hideTabSwitcher?: boolean;
  // Scopes the continuation feed when initialContext is "category" (e.g. opened
  // from a category listing's story rail). Ignored for other contexts.
  categorySlug?: string;
}

function mapTags(raw: any[] | undefined): ReelTag[] {
  return (raw ?? []).map((t: any) => ({
    id: t.id,
    timestampSeconds: Number(t.timestamp_seconds ?? t.timestampSeconds ?? 0),
    display_x: t.display_x != null ? Number(t.display_x) : null,
    display_y: t.display_y != null ? Number(t.display_y) : null,
    product: t.product
      ? {
          id: t.product.id,
          slug: t.product.slug,
          name: t.product.name ?? "Product",
          priceFils: Number(
            t.product.price_fils ?? t.product.priceFils ?? t.product.price ?? 0,
          ),
          imageUrl: t.product.primary_image_url ?? t.product.imageUrl ?? "",
        }
      : {
          id: t.product_id,
          name: "Product",
          priceFils: 0,
          imageUrl: "",
        },
  }));
}

export function ReelFeed({
  initialContext = "home",
  locale = "en",
  seedReelId,
  hideTabSwitcher = false,
  categorySlug,
}: Props) {
  const [tab, setTab] = useState<FeedTab>("for_you");
  const [reels, setReels] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [drawerProduct, setDrawerProduct] = useState<DrawerProduct | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());

  async function loadMore(reset = false) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await getFeed({
        context: initialContext,
        tab,
        categorySlug: initialContext === "category" ? categorySlug : undefined,
        cursor: reset ? undefined : cursorRef.current ?? undefined,
        limit: 10,
      });
      setReels((prev) => {
        const base = reset ? [] : prev;
        const have = new Set(base.map((r) => r.id));
        const fresh = data.reels.filter((r) => !have.has(r.id));
        return [...base, ...fresh];
      });
      cursorRef.current = data.nextCursor;
      setCursor(data.nextCursor);
    } catch (e: any) {
      setError(
        e?.response?.data?.error ?? e?.message ?? "Failed to load feed",
      );
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    cursorRef.current = null;
    setCursor(null);
    viewedRef.current = new Set();
    if (seedReelId) {
      // Seeded entry — show the chosen reel first, then immediately prefetch the
      // regular feed so the next reel is queued by the time the user scrolls.
      // loadMore dedupes the seed reel out of the result.
      setReels([]);
      getReel(seedReelId)
        .then((seed) => {
          setReels([seed]);
          loadMore();
        })
        .catch((e) =>
          setError(e?.response?.data?.error ?? e?.message ?? "Failed to load reel"),
        );
    } else {
      setReels([]);
      loadMore(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, initialContext, seedReelId]);

  // IntersectionObserver to detect active reel + record view
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = Number(
              (entry.target as HTMLElement).dataset.index ?? "-1",
            );
            const reel = reels[idx];
            if (reel && !viewedRef.current.has(reel.id)) {
              viewedRef.current.add(reel.id);
              const duration = Number(reel.video_duration_seconds ?? 0);
              recordView(reel.id, {
                watchDurationSeconds: duration * 0.6,
                completionPercentage: 0.6,
                deviceType:
                  typeof window !== "undefined" && window.innerWidth < 768
                    ? "web_mobile"
                    : "web_desktop",
              }).catch(() => {});
            }
            if (idx >= reels.length - 3 && cursorRef.current) {
              loadMore();
            }
          }
        }
      },
      { threshold: [0.6], root },
    );
    root
      .querySelectorAll("[data-index]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reels, cursor]);

  return (
    <div
      ref={containerRef}
      className="bg-black h-screen overflow-y-scroll snap-y snap-mandatory"
    >
      {!hideTabSwitcher && <FeedTabSwitcher active={tab} onChange={setTab} />}
      {error && (
        <div className="fixed top-14 inset-x-0 z-40 text-center text-red-400 text-sm">
          {error}
        </div>
      )}
      {reels.map((r, i) => (
        <section
          key={r.id}
          data-index={i}
          className="h-screen w-full snap-start relative"
        >
          <ReelPlayer
            reelId={r.id}
            playbackUrl={r.video_playback_url}
            thumbnailUrl={r.thumbnail_url}
            tags={mapTags(r.tags)}
            onTagTap={(t) => setDrawerProduct(t.product)}
          />
          <ReelOverlayActions
            reelId={r.id}
            creatorId={r.user_id}
            initialState={{
              liked: r.viewerState?.liked ?? false,
              saved: r.viewerState?.saved ?? false,
              following: r.viewerState?.following ?? false,
              likeCount: r.like_count ?? 0,
              saveCount: r.save_count ?? 0,
              shareCount: r.share_count ?? 0,
            }}
          />
        </section>
      ))}
      {reels.length === 0 && !error && (
        <div className="h-screen flex items-center justify-center text-white">
          Loading...
        </div>
      )}
      <ProductDrawer
        product={drawerProduct}
        open={!!drawerProduct}
        onClose={() => setDrawerProduct(null)}
        locale={locale}
      />
    </div>
  );
}
