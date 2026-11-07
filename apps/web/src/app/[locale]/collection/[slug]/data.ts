import { TTL, publicGet } from "@/lib/api-public";

export const PER_PAGE = 24;

/**
 * Sorts the collection endpoint understands (ProductCollectionSort). The shared
 * SortToolbar also offers "relevance", which is a search-only concept — a
 * curated collection has a custom order instead. Anything unrecognised is
 * dropped so the collection falls back to its own default_sort rather than
 * pushing an unknown sortBy into Typesense.
 */
const COLLECTION_SORTS = new Set([
	"custom",
	"price_asc",
	"price_desc",
	"newest",
	"rating",
]);

function collectionSort(raw?: string): string | undefined {
	return raw && COLLECTION_SORTS.has(raw) ? raw : undefined;
}

export interface CollectionResponse {
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	collection?: any;
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	items?: any[];
	total?: number;
}

/** Shared by the segment layout (404 guard), metadata and page. */
export function fetchCollection(
	locale: string,
	slug: string,
	search: Record<string, string>,
) {
	const sort = collectionSort(search.sort);
	const page = Number(search.page) || 1;

	return publicGet<CollectionResponse>(
		`/collections/${encodeURIComponent(slug)}`,
		{
			params: {
				page,
				perPage: PER_PAGE,
				...(sort ? { sort } : {}),
			},
			revalidate: TTL.productListing,
			tags: [`collection:${slug}`],
			locale,
		},
	);
}

