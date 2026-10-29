import axios from "axios";
import { API_URL } from "./config";

export interface SitemapEntry {
	/** Locale-less path, e.g. "/product/foo". Locale is added by the XML layer. */
	path: string;
	lastModified?: Date;
}

/** API ceiling. limit=1000 returns HTTP 500. */
const PAGE_SIZE = 250;
/** Safety stop for the cursor loop: 100 * 250 = 25,000 products. */
const MAX_PAGES = 100;

/** Backend hard maximum: t.Numeric({ minimum: 1, maximum: 50 }) on GET /services. */
const SERVICE_PAGE_SIZE = 50;
/** Safety stop for the services page loop: 100 * 50 = 5,000 services. */
const MAX_SERVICE_PAGES = 100;

/**
 * Fetch and fail loudly. The previous sitemap wrapped every call in an empty
 * catch, so three separate upstream failures silently produced a sitemap
 * containing only the homepage. A visible error is strictly better.
 */
async function fetchJson(path: string): Promise<any> {
	const url = `${API_URL}${path}`;
	try {
		const { data } = await axios.get(url, { timeout: 20000 });
		return data;
	} catch (error) {
		const status = axios.isAxiosError(error)
			? error.response?.status
			: undefined;
		console.error(
			`[sitemap] upstream fetch failed: ${url} (status ${status ?? "none"})`,
		);
		throw new Error(
			`sitemap upstream failed: ${path} (status ${status ?? "unknown"})`,
		);
	}
}

export async function getProducts(): Promise<SitemapEntry[]> {
	const entries: SitemapEntry[] = [];
	let cursor: string | number | null = 1;
	let hitPageCap = true; // Assume we hit the cap; set to false on natural exit

	for (let page = 0; page < MAX_PAGES && cursor; page++) {
		const body = await fetchJson(
			`/products?limit=${PAGE_SIZE}&cursor=${cursor}`,
		);
		const items = body?.data?.data ?? [];
		if (!items.length) {
			hitPageCap = false; // Empty page means catalog was exhausted
			break;
		}

		for (const product of items) {
			if (!product?.slug) continue;
			entries.push({
				path: `/product/${product.slug}`,
				...(product.created_at
					? { lastModified: new Date(product.created_at) }
					: {}),
			});
		}

		cursor = body?.data?.cursor ?? null;
	}

	// If cursor became null, we exited via cursor exhaustion (natural end)
	if (cursor === null) {
		hitPageCap = false;
	}

	// If we exited the loop because page cap was reached while cursor is still
	// truthy, the catalog exceeds our size limit and we must fail loudly
	if (hitPageCap && cursor !== null && cursor !== undefined) {
		console.error(
			`[sitemap] product cursor loop hit page cap at ${MAX_PAGES} iterations with cursor still truthy`,
		);
		throw new Error(
			`sitemap upstream failed: product catalog exceeded expected size (page cap: ${MAX_PAGES})`,
		);
	}

	return entries;
}

/**
 * Total product count for computing sitemap index chunk counts, without
 * paginating the entire catalog. Issues a single request.
 */
export async function getProductCount(): Promise<number> {
	const body = await fetchJson("/products?limit=1");
	const total = body?.data?.total;
	if (typeof total !== "number") {
		throw new Error(
			"sitemap upstream failed: /products?limit=1 response missing data.total",
		);
	}
	return total;
}

export async function getCategories(): Promise<SitemapEntry[]> {
	const body = await fetchJson("/categories/tree");
	const entries: SitemapEntry[] = [];

	const walk = (nodes: any[]) => {
		for (const node of nodes ?? []) {
			if (node?.slug) entries.push({ path: `/c/${node.slug}` });
			if (node?.children?.length) walk(node.children);
		}
	};
	walk(body?.data ?? []);

	return entries;
}

export async function getBrands(): Promise<SitemapEntry[]> {
	const body = await fetchJson("/brands");
	return (body?.data ?? [])
		.filter((brand: any) => brand?.slug)
		.map((brand: any) => ({ path: `/brand/${brand.slug}` }));
}

/**
 * Vendors come from product facets rather than /vendors, which is not in the
 * public route allowlist. This is also more correct: facets only contain
 * vendors that have live products, so we never advertise an empty storefront.
 */
export async function getVendors(): Promise<SitemapEntry[]> {
	const body = await fetchJson("/products?limit=1");
	return (body?.data?.facets?.vendors ?? [])
		.filter((vendor: any) => vendor?.value)
		.map((vendor: any) => ({ path: `/vendor/${vendor.value}` }));
}

/**
 * Service offerings for the sitemap. GET /services returns only PUBLISHED
 * offerings, so this yields an empty list until the first one is approved —
 * which is exactly the intent: the section ships now and starts emitting on
 * its own, with no follow-up task to remember.
 *
 * Paginates via the `page` query param (1-based) rather than a cursor, since
 * that's what GET /services supports. Like getProducts, this fails loudly
 * (throws) rather than silently truncating if the page cap is hit while the
 * response's `total` says more services remain.
 */
export async function getServices(): Promise<SitemapEntry[]> {
	const entries: SitemapEntry[] = [];
	let fetchedCount = 0;
	let total: number | undefined;

	for (let page = 1; page <= MAX_SERVICE_PAGES; page++) {
		const body = await fetchJson(`/services?limit=${SERVICE_PAGE_SIZE}&page=${page}`);
		// biome-ignore lint/suspicious/noExplicitAny: untyped sitemap source row
		const items: any[] = body?.data ?? [];
		if (typeof body?.total === "number") total = body.total;

		if (!items.length) break;

		fetchedCount += items.length;
		for (const service of items) {
			if (!service?.slug) continue;
			entries.push({ path: `/service/${service.slug}` });
		}

		// Stop once we've collected everything the API told us to expect. If
		// the API never reported a total (malformed response), don't loop
		// blindly — treat the page we have as the whole list.
		if (total === undefined || fetchedCount >= total) break;
	}

	// If the total the API reported is more than we managed to fetch within
	// the page cap, the service catalog exceeds our size limit and we must
	// fail loudly rather than return a silently truncated sitemap.
	if (total !== undefined && fetchedCount < total) {
		console.error(
			`[sitemap] service page loop hit page cap at ${MAX_SERVICE_PAGES} iterations with total=${total} fetchedCount=${fetchedCount}`,
		);
		throw new Error(
			`sitemap upstream failed: service catalog exceeded expected size (page cap: ${MAX_SERVICE_PAGES})`,
		);
	}

	return entries;
}
