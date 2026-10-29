import { api } from "@/lib/api";
import { getFeed } from "@/lib/api/reels";
import { useQuery } from "@tanstack/react-query";

export type ReelAuthorKindFilter = "all" | "creator" | "customer" | "house";

export type ProductReel = {
  id: string;
  user_id: string;
  video_playback_url: string;
  video_duration_seconds: number;
  thumbnail_url: string;
  caption: string | null;
  language_code: string;
  status: string;
  published_at: string | null;
  like_count: number;
  view_count: number;
  save_count: number;
  share_count: number;
  author_kind: "creator" | "customer" | "house";
  is_verified_buyer: boolean;
  /** True when sourced from a licensed-reel feature (rights delivery). */
  featured?: boolean;
  user?: {
    id: string;
    name?: string | null;
    handle?: string | null;
    creator_tier?: string | null;
  };
  tags?: Array<{
    id: string;
    product_id: string;
    timestamp_seconds?: number | null;
    product?: {
      id: string;
      name: string;
      slug: string;
      price: number;
      images?: { url: string }[];
      primary_image_url?: string;
    };
  }>;
};

/** Raw row from the public GET /reels/featured endpoint. */
interface FeaturedReelRow {
  feature_id: string;
  reel_id: string;
  position: number | null;
  video_playback_url: string;
  thumbnail_url: string;
  featured: true;
}

/**
 * Featured (licensed) reels for a product or vendor, sourced from the public
 * rights-delivery endpoint. Mapped onto ProductReel so the existing rail/panel
 * components render them unchanged; `featured` flags the badge.
 */
export function useFeaturedReels(
  scope: { productId?: string; vendorId?: string },
  enabled = true,
) {
  const { productId, vendorId } = scope;
  return useQuery({
    queryKey: ["featured-reels", productId ?? null, vendorId ?? null],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (productId) params.product_id = productId;
      if (vendorId) params.vendor_id = vendorId;
      const { data } = await api.get<{ data: FeaturedReelRow[] }>(
        "/reels/featured",
        { params },
      );
      const rows = data.data ?? [];
      return rows.map(
        (r): ProductReel => ({
          id: r.reel_id,
          user_id: "",
          video_playback_url: r.video_playback_url,
          video_duration_seconds: 0,
          thumbnail_url: r.thumbnail_url,
          caption: null,
          language_code: "en",
          status: "published",
          published_at: null,
          like_count: 0,
          view_count: 0,
          save_count: 0,
          share_count: 0,
          author_kind: "creator",
          is_verified_buyer: false,
          featured: true,
        }),
      );
    },
    enabled: enabled && (!!productId || !!vendorId),
    staleTime: 60 * 1000,
  });
}

export function useProductReels(
  productId: string,
  filter: ReelAuthorKindFilter = "all",
  limit = 20,
) {
  return useQuery({
    queryKey: ["product-reels", productId, filter, limit],
    queryFn: async () => {
      const result = await getFeed({
        context: "product",
        productId,
        author_kind: filter,
        limit,
      });
      return (result.reels as ProductReel[]) ?? [];
    },
    enabled: !!productId,
    staleTime: 60 * 1000,
  });
}
