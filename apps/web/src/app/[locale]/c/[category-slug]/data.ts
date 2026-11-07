import { TTL, publicGet } from "@/lib/api-public";

// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
export type Category = any;

/** Shared by the segment layout (404 guard), metadata and page: one cache entry. */
export function fetchCategory(slug: string, locale: string): Promise<Category | null> {
	return publicGet<Category>(`/categories/${slug}`, {
		revalidate: TTL.categoryTree,
		tags: [`category:${slug}`],
		locale,
	});
}
