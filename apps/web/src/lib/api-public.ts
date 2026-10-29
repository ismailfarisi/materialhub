import { API_URL } from "@/lib/seo/config";
import axios from "axios";
import { unstable_cache } from "next/cache";

/**
 * Cookie-free, cached read client for PUBLIC catalog data.
 *
 * Why this exists alongside `apiServer()` (src/lib/api-server.ts): that helper
 * calls `cookies()`, which opts the entire route into dynamic rendering. A page
 * whose catalog data flows through it can therefore never be statically
 * rendered or served from the ISR cache no matter what `revalidate` it exports,
 * and every crawl costs a cold round-trip to the API. Public catalog reads
 * (product, category, facets, site settings) carry no per-user data, so they go
 * through this client instead — plain axios wrapped in `unstable_cache`, with no
 * cookie or header access anywhere in the call path.
 *
 * The cache key is assembled explicitly from path + query + locale rather than
 * relying on Next deriving one from the request init, so an Arabic response can
 * never be served for an English request.
 *
 * Use `apiServer()` for anything personalised (cart, wishlist, a feed ranked for
 * the signed-in user). Use this for anything a crawler would see.
 */

/**
 * Cache lifetimes, in seconds. These mirror the cache-aside strategy documented
 * in CLAUDE.md ("Product listing: 5min, product detail: 10min, category tree:
 * 1hr, vendor profile: 30min") so the Next-side cache and the backend Redis
 * cache do not disagree about how stale a page is allowed to be.
 */
export const TTL = {
	productListing: 300,
	productDetail: 600,
	categoryTree: 3600,
	vendorProfile: 1800,
} as const;

type QueryValue = string | number | boolean | undefined | null;

/**
 * Query string with keys sorted, so two callers passing the same params in a
 * different literal order share one cache entry instead of fragmenting it.
 */
function buildQuery(params?: Record<string, QueryValue>): string {
	if (!params) return "";
	const search = new URLSearchParams();
	for (const key of Object.keys(params).sort()) {
		const value = params[key];
		if (value === undefined || value === null || value === "") continue;
		search.set(key, String(value));
	}
	const qs = search.toString();
	return qs ? `?${qs}` : "";
}

export interface PublicGetOptions {
	/** Cache lifetime in seconds — pick one of {@link TTL}. */
	revalidate: number;
	/** Tags for `revalidateTag()` once a CMS/catalog webhook is wired up. */
	tags?: string[];
	/** Sent as `Accept-Language` and folded into the cache key. */
	locale?: string;
	params?: Record<string, QueryValue>;
}

/**
 * GET a public endpoint and return the `data` field of the API envelope, or
 * `null` if the request failed. Callers that need the raw body (endpoints which
 * are not enveloped, e.g. `/reels/feed`) should use {@link publicGetRaw}.
 */
export async function publicGet<T = unknown>(
	path: string,
	options: PublicGetOptions,
): Promise<T | null> {
	const body = await publicGetRaw<{ data?: T }>(path, options);
	return body?.data ?? null;
}

/** As {@link publicGet}, but resolves the whole response body un-unwrapped. */
export async function publicGetRaw<T = unknown>(
	path: string,
	options: PublicGetOptions,
): Promise<T | null> {
	const { revalidate, tags = [], locale, params } = options;
	const query = buildQuery(params);
	const url = `${API_URL}${path}${query}`;

	const load = unstable_cache(
		async () => {
			const { data } = await axios.get(url, {
				timeout: 15000,
				...(locale ? { headers: { "Accept-Language": locale } } : {}),
			});
			return (data ?? null) as T | null;
		},
		["public-api", path, query, locale ?? "-"],
		{ revalidate, tags },
	);

	try {
		return await load();
	} catch {
		// Deliberately not cached. `unstable_cache` stores whatever its callback
		// resolves with, so returning null from *inside* the callback would pin a
		// transient upstream failure into the cache for the whole TTL window —
		// one blip would blank the page for five minutes. Throwing out of the
		// callback leaves the cache untouched and we degrade for one request.
		return null;
	}
}
