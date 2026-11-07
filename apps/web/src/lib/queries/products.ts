import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { applyStockDefault } from "../../components/product/listing-params";
import { aedToFils } from "../money";

interface ProductFilters {
	category?: string;
	brand?: string;
	vendor?: string;
	minPrice?: number;
	maxPrice?: number;
	minRating?: number;
	includeOutOfStock?: string;
	sort?: string;
	page?: number;
	limit?: number;
	q?: string;
	[key: string]: unknown;
}

export interface ProductSearchResult {
	// biome-ignore lint/suspicious/noExplicitAny: API product shape varies by context
	data: any[];
	total: number;
	cursor?: string;
	// biome-ignore lint/suspicious/noExplicitAny: facet shape is complex and varies
	facets?: any;
	did_you_mean?: string | null;
}

export function useProducts(filters: ProductFilters) {
	return useQuery<ProductSearchResult>({
		queryKey: ["products", filters],
		queryFn: async () => {
			const { data } = await api.get("/products", { params: filters });
			return data.data as ProductSearchResult;
		},
	});
}

export function useProduct(slug: string) {
	return useQuery({
		queryKey: ["product", slug],
		queryFn: async () => {
			const { data } = await api.get(`/products/${slug}`);
			return data.data;
		},
		enabled: !!slug,
	});
}

export function useProductQuestions(productId: string, page = 1) {
	return useQuery({
		queryKey: ["product-questions", productId, page],
		queryFn: async () => {
			const { data } = await api.get(`/products/${productId}/questions`, {
				params: { page },
			});
			return data.data;
		},
		enabled: !!productId,
	});
}

export function useResultCount(filters: ProductFilters) {
	return useQuery({
		queryKey: ["product-count", filters],
		queryFn: async () => {
			const { data } = await api.get("/products", {
				// applyStockDefault mirrors the listing translator: without it the
				// count would include sold-out items the listing then hides.
				params: { ...applyStockDefault(withPriceInFils(filters)), limit: 0 },
			});
			return data.data.total as number;
		},
		enabled: Object.keys(filters).length > 0,
		staleTime: 0,
	});
}

/**
 * The filter draft carries `minPrice`/`maxPrice` in whole AED (the "Price (AED)"
 * inputs), but the product-service filters in fils. Listing requests convert via
 * `buildListingParams`; the live result-count query talks to the API directly,
 * so it must convert here too — otherwise `maxPrice=20` counts only items
 * ≤ 0.20 AED and the "Show N results" button reads a wrong (usually 0) total.
 * Invalid/blank bounds are dropped rather than sent.
 */
function withPriceInFils(filters: ProductFilters): Record<string, unknown> {
	const out: Record<string, unknown> = { ...filters };
	for (const key of ["minPrice", "maxPrice"] as const) {
		if (out[key] == null) continue;
		const fils = aedToFils(out[key] as string | number);
		if (fils === undefined) delete out[key];
		else out[key] = fils;
	}
	return out;
}
