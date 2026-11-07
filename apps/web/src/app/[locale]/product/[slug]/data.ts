import { TTL, publicGet } from "@/lib/api-public";

/**
 * Shared by the segment layout (404 guard), `generateMetadata` and the page
 * body, which resolve from one cached upstream call per locale rather than
 * fetching the same product three times. The locale is forwarded so the
 * product's translation (name, description, SEO copy) is served on /ar;
 * the cache key includes it.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
export function fetchProduct(slug: string, locale = "en"): Promise<any | null> {
	return publicGet(`/products/by-slug/${slug}`, {
		revalidate: TTL.productDetail,
		tags: [`product:${slug}`],
		locale,
		params: { locale },
	});
}
