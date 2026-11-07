import { TTL, publicGet } from "@/lib/api-public";

// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
export type Brand = any;

/** Shared by the segment layout (404 guard), metadata and page: one cache entry. */
export function fetchBrand(slug: string, locale: string): Promise<Brand | null> {
	// Brands are catalogue taxonomy and change about as often as categories do,
	// so they share the category-tree lifetime rather than the listing one.
	return publicGet<Brand>(`/brands/${slug}`, {
		revalidate: TTL.categoryTree,
		tags: [`brand:${slug}`],
		locale,
	});
}
