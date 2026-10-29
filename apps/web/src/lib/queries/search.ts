import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";

export interface SuggestProduct {
	id: string;
	slug: string;
	name: string;
	image_url: string | null;
	price_min: number;
	price_max: number;
}

export interface SuggestCategoryOrBrand {
	id: string;
	name: string;
	slug: string;
}

export interface SuggestResponse {
	products: SuggestProduct[];
	categories: SuggestCategoryOrBrand[];
	brands: SuggestCategoryOrBrand[];
	did_you_mean: string | null;
}

export function useTrendingSearches(limit = 10) {
	return useQuery({
		queryKey: ["trending-searches", limit],
		queryFn: async () => {
			const { data } = await api.get("/search/trending", { params: { limit } });
			return (data.data as Array<{ query: string; count: number }>) || [];
		},
		staleTime: 10 * 60 * 1000,
		gcTime: 15 * 60 * 1000,
	});
}

export function useSearchSuggest(q: string) {
	return useQuery({
		queryKey: ["search-suggest", q],
		queryFn: async () => {
			const { data } = await api.get("/products/suggest", {
				params: { q, limit: 5 },
			});
			return data.data as SuggestResponse;
		},
		enabled: q.trim().length >= 2,
		staleTime: 30_000,
		gcTime: 5 * 60_000,
		placeholderData: keepPreviousData,
	});
}
