import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export type RailType = "more-from-brand" | "pairs-with" | "cross-brand" | "bestsellers";

export type RailProduct = {
  id: string;
  name: string;
  slug: string;
  price: number; // fils
  compare_at_price?: number | null;
  rating_avg?: number | string | null;
  rating_count?: number | null;
  vendor_id?: string | null;
  vendor?: { id: string; name?: string; business_name?: string; slug?: string } | null;
  brand?: { id: string; name?: string; slug?: string } | null;
  category_id?: string | null;
  images?: { url: string; alt_text?: string | null }[];
  in_stock?: boolean;
};

export function useRecommendations(productId: string, type: RailType, limit?: number) {
  return useQuery({
    queryKey: ["recommendations", productId, type, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ type });
      if (limit != null) params.set("limit", String(limit));
      const { data } = await api.get<{ data: RailProduct[] }>(
        `/products/${productId}/recommendations?${params}`,
      );
      return data.data ?? [];
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
