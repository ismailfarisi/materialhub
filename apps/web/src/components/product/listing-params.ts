/**
 * Translate storefront listing URL params into the product-service
 * `GET /products` query contract.
 *
 * The browser URL uses page-number pagination (`?page=N`) and `?sort=…` so
 * listing URLs stay clean, shareable, and SEO-friendly. The product-service
 * search endpoint, however, paginates by `cursor` (a stringified page number)
 * and sorts by `sortBy` — see `typesense-search.adapter.ts` (`buildSearchParams`
 * reads `filters.cursor` and `filters.sortBy`, never `page`/`sort`).
 *
 * Without this translation the API silently ignores `?page` and `?sort`: the
 * pagination and sort controls render and update the URL, but every request
 * comes back as page 1 in the default order. Map the params here, at the single
 * point where the storefront talks to the API, rather than polluting the URL
 * with backend-shaped param names.
 */
import { aedToFils } from "../../lib/money";

export type ListingUrlParams = Record<string, string | undefined>;

/**
 * The storefront URL carries prices in whole AED (`?minPrice=200`) so the
 * listing URL and the "Price: 200 – ∞" filter pill read in human units. The
 * product-service, however, stores and compares every price in fils (the
 * smallest currency unit — AED × 100; see `products.price` / Typesense
 * `price_min`/`price_max`). Convert here, at the single storefront→API
 * boundary, so a "≤ 200" filter means ≤ 200 AED and not ≤ 2 AED. Values that
 * aren't finite numbers are dropped rather than forwarded as NaN.
 */
const PRICE_PARAMS = new Set(["minPrice", "maxPrice"]);

/**
 * Storefront listings hide sold-out products unless the shopper opts in.
 *
 * The URL carries the shopper's intent as `?includeOutOfStock=true` (absent =
 * the default, in-stock only) while the product-service speaks `inStock`. The
 * two are NOT inverses: `inStock=false` means "only out-of-stock items", so
 * opting in must *omit* the filter entirely rather than send `false`.
 *
 * Exported because the live "Show N results" count in the filter sheet queries
 * `/products` directly, bypassing the listing translator — it has to apply the
 * same default or the count disagrees with the results it is counting.
 */
export const INCLUDE_OUT_OF_STOCK_PARAM = "includeOutOfStock";

export function applyStockDefault<T extends Record<string, unknown>>(
	params: T,
): Record<string, unknown> {
	const { [INCLUDE_OUT_OF_STOCK_PARAM]: includeOutOfStock, inStock: _inStock, ...rest } = params;
	const out: Record<string, unknown> = { ...rest };
	if (includeOutOfStock !== "true" && includeOutOfStock !== true) {
		out.inStock = "true";
	}
	return out;
}

/**
 * Shared translator: copy forward filter params and rewrite the two params the
 * backend names differently (`page`→`cursor`, `sort`→`sortBy`). Both the
 * category listing and the search page funnel through here so neither silently
 * drops pagination/sort.
 */
function translateListingParams(
	base: Record<string, string | number>,
	urlParams: ListingUrlParams,
	locale?: string,
): Record<string, string | number> {
	const { page, sort, ...rest } = urlParams;

	const params: Record<string, string | number> = { ...base };
	if (locale) params.locale = locale;

	for (const [key, value] of Object.entries(rest)) {
		if (value == null) continue;
		if (PRICE_PARAMS.has(key)) {
			const fils = aedToFils(value);
			if (fils !== undefined) params[key] = fils;
			continue;
		}
		params[key] = value;
	}

	// page-number → cursor (the backend's "cursor" is just the page number as a string)
	if (page) params.cursor = page;
	// sort → sortBy
	if (sort) params.sortBy = sort;

	return applyStockDefault(params) as Record<string, string | number>;
}

export function buildListingParams(
	categorySlug: string,
	urlParams: ListingUrlParams,
	limit = 24,
	locale?: string,
): Record<string, string | number> {
	return translateListingParams(
		{ category: categorySlug, limit },
		urlParams,
		locale,
	);
}

/**
 * Search listings share the category translation but key off the free-text
 * query instead of a category slug. The query also lives in the URL (`?q=`),
 * so we drop it from the forwarded params and let the explicit `query` argument
 * be the single source of truth.
 */
export function buildSearchListingParams(
	query: string,
	urlParams: ListingUrlParams,
	limit = 24,
	locale?: string,
): Record<string, string | number> {
	const { q: _q, ...rest } = urlParams;
	return translateListingParams({ q: query, limit }, rest, locale);
}

/**
 * Brand listings pin the results to a single brand via the page slug, exactly
 * as the category listing pins by category. Any `brand` URL param is dropped so
 * the slug is the single source of truth (the brand facet is hidden on this
 * page) while vendor/price/rating/attribute filters still flow through.
 */
export function buildBrandListingParams(
	brandSlug: string,
	urlParams: ListingUrlParams,
	limit = 24,
	locale?: string,
): Record<string, string | number> {
	const { brand: _brand, ...rest } = urlParams;
	return translateListingParams({ brand: brandSlug, limit }, rest, locale);
}
