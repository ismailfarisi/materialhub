import { TTL, publicGet } from "@/lib/api-public";

/**
 * Shared by the segment layout (404 guard), `generateMetadata` and the page
 * body, which resolve from one cached upstream call rather than fetching the
 * same product three times.
 *
 * No locale is forwarded, matching the previous `apiServer()` call that sent no
 * `Accept-Language` header — so one cache entry serves every locale instead of
 * five entries holding identical payloads.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
export function fetchProduct(slug: string): Promise<any | null> {
	return publicGet(`/products/by-slug/${slug}`, {
		revalidate: TTL.productDetail,
		tags: [`product:${slug}`],
	});
}

