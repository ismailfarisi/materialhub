import { TTL, publicGet } from "@/lib/api-public";

interface ListingProbeResponse {
	data?: Array<{ price_min?: number | null }> | null;
	total?: number | null;
	facets?: {
		brands?: Array<{ value: string; label: string; count?: number }> | null;
	} | null;
}

export interface ListingFacts {
	/** Unfiltered, in-stock product count for the listing. */
	total: number;
	/** Cheapest in-stock product in the listing, in fils. */
	minPriceFils: number | null;
	/** Brand facets, for internal links and the "which brands" answer. */
	brands: Array<{ value: string; label: string }>;
}

const EMPTY_FACTS: ListingFacts = {
	total: 0,
	minPriceFils: null,
	brands: [],
};

/**
 * The handful of true facts a listing page needs for its title, description and
 * FAQ: how many products it holds, what the cheapest one costs, and which brands
 * are in it.
 *
 * One cheap request answers all three — `limit=1` sorted by price ascending
 * returns the price floor in `data[0]`, the unfiltered count in `total`, and the
 * brand list in `facets` (facets are computed across the whole result set, not
 * the returned page — the same trick the sitemap's vendor source relies on).
 *
 * `inStock` is pinned to true so the count agrees with the default listing view
 * rather than advertising products a shopper cannot buy. Because the result is
 * cached under a stable key, `generateMetadata` and the page body share a single
 * upstream call per revalidation window.
 */
async function getListingFacts(
	filter: { category: string } | { brand: string },
	locale: string,
): Promise<ListingFacts> {
	const tag =
		"category" in filter
			? `category:${filter.category}`
			: `brand:${filter.brand}`;

	const body = await publicGet<ListingProbeResponse>("/products", {
		params: {
			...filter,
			limit: 1,
			sortBy: "price_asc",
			inStock: "true",
			locale,
		},
		revalidate: TTL.productListing,
		tags: ["products", tag],
		locale,
	});

	if (!body) return EMPTY_FACTS;

	const cheapest = body.data?.[0]?.price_min;

	return {
		total: typeof body.total === "number" ? body.total : 0,
		minPriceFils: typeof cheapest === "number" ? cheapest : null,
		brands: (body.facets?.brands ?? [])
			.filter((brand) => brand?.value && brand?.label)
			.map((brand) => ({ value: brand.value, label: brand.label })),
	};
}

export function getCategoryFacts(
	slug: string,
	locale: string,
): Promise<ListingFacts> {
	return getListingFacts({ category: slug }, locale);
}

export function getBrandFacts(
	slug: string,
	locale: string,
): Promise<ListingFacts> {
	return getListingFacts({ brand: slug }, locale);
}
