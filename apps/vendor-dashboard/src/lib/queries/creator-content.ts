import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const CREATOR_DIRECTORY_PAGE_SIZE = 24;

export interface DiscoveryCard {
  id: string;
  video_playback_url: string;
  thumbnail_url: string;
  video_duration_seconds: number;
  language_code: string;
  caption: string | null;
  published_at: string | null;
  created_at: string;
  creator: { id: string; name: string };
  tagged_products: Array<{ id: string; name: string }>;
  engagement: { views: number; likes: number; saves: number; shares: number };
  attributed?: { orders: number; gmv_fils: number; product_taps: number };
  is_shortlisted: boolean;
}

interface CardList {
  items: DiscoveryCard[];
  asOf: string;
}

export type MineSort = "recent" | "most_viewed" | "most_gmv" | "most_taps";

export function useMyUgc(params: { sort: MineSort; productId?: string }) {
  return useQuery({
    queryKey: ["creator-content", "mine", params.sort, params.productId ?? null],
    queryFn: async () => {
      const { data } = await api.get<{ data: CardList }>("/vendor/reels/discovery/mine", {
        params: { sort: params.sort, product_id: params.productId, limit: 24 },
      });
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useBrowseUgc(params: {
  sort: "ranking" | "recent";
  q?: string;
  language?: string;
  categoryId?: string;
}) {
  // Normalize empty strings to undefined ONCE so the query key matches the
  // actual request params (otherwise `q: ""` and a cleared search fragment the cache).
  const normalized = {
    sort: params.sort,
    q: params.q || undefined,
    language: params.language || undefined,
    categoryId: params.categoryId || undefined,
  };
  return useQuery({
    queryKey: ["creator-content", "browse", normalized],
    queryFn: async () => {
      const { data } = await api.get<{ data: CardList }>("/vendor/reels/discovery/browse", {
        params: {
          sort: normalized.sort,
          q: normalized.q,
          language: normalized.language,
          category_id: normalized.categoryId,
          limit: 24,
        },
      });
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useShortlist() {
  return useQuery({
    queryKey: ["creator-content", "shortlist"],
    queryFn: async () => {
      const { data } = await api.get<{ data: CardList }>("/vendor/reels/shortlist");
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useToggleShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reelId: string; saved: boolean; note?: string }) => {
      if (input.saved) {
        await api.delete(`/vendor/reels/shortlist/${input.reelId}`);
      } else {
        await api.post("/vendor/reels/shortlist", { reel_id: input.reelId, note: input.note });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator-content"] });
    },
  });
}

export function formatAED(fils: number | null | undefined): string {
  if (fils == null) return "—";
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** One approved creator from GET /vendor/reels/creators. Mirrors the backend's
 *  CreatorDirectoryCard. `id` is the user id — what InviteToCollabModal needs. */
export interface CreatorDirectoryCard {
  id: string;
  display_name: string;
  bio: string;
  primary_category: string;
  avatar_url: string | null;
  intro_video_url: string | null;
  sample_count: number;
}

export function useCreatorDirectory(params: { q?: string; category?: string }) {
  // Same normalization as useBrowseUgc: `q: ""` and a cleared search must not
  // become two different cache entries.
  const normalized = {
    q: params.q || undefined,
    category: params.category || undefined,
  };
  return useInfiniteQuery({
    queryKey: ["creator-content", "creators", normalized],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ data: { items: CreatorDirectoryCard[] } }>(
        "/vendor/reels/creators",
        {
          params: {
            q: normalized.q,
            category: normalized.category,
            limit: CREATOR_DIRECTORY_PAGE_SIZE,
            offset: pageParam,
          },
        },
      );
      return data.data;
    },
    initialPageParam: 0,
    // A short page means we've hit the end; the backend has no total count to
    // check against, so this is the only signal available.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.items.length < CREATOR_DIRECTORY_PAGE_SIZE
        ? undefined
        : allPages.length * CREATOR_DIRECTORY_PAGE_SIZE,
    staleTime: 60_000,
  });
}

/** One headline figure on a creator's media kit. Values are free text — the
 *  creator writes "68K+", not 68000. */
export interface MediaKitStat {
  label: string;
  value: string;
}

/** A donut slice or a top-locations row. */
export interface MediaKitSegment {
  label: string;
  percent: number;
}

export interface MediaKitVideo {
  id: string;
  video_url: string;
  caption: string | null;
}

/**
 * One creator's media kit, from GET /vendor/reels/creators/:id.
 *
 * There is deliberately no contact field of any kind — no handles, no email.
 * The backend never selects them, and the only way to reach a creator from
 * this page is an invite to one of your open collabs.
 *
 * Every figure in `stats`, `audience` and `top_locations` is typed by the
 * creator, not measured by the platform. The page labels them accordingly.
 */
export interface CreatorMediaKit {
  id: string;
  display_name: string;
  bio: string;
  primary_category: string;
  avatar_url: string | null;
  has_media_kit: boolean;
  headline: string | null;
  pull_quote: string | null;
  about: string | null;
  location_label: string | null;
  collaboration_note: string | null;
  stats: MediaKitStat[];
  content_types: string[];
  audience: MediaKitSegment[];
  top_locations: MediaKitSegment[];
  intro_video_url: string | null;
  samples: MediaKitVideo[];
}

export function useCreatorMediaKit(id: string) {
  return useQuery({
    queryKey: ["creator-content", "creator", id],
    queryFn: async () => {
      const { data } = await api.get<{ data: CreatorMediaKit }>(`/vendor/reels/creators/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
