/**
 * Cache tags the backend may expire through POST /api/revalidate (see
 * backend/libs/utils/src/storefront-revalidate.ts). Only tags the storefront
 * actually uses are accepted, so a leaked secret can at worst refresh public
 * pages, not flush arbitrary cache entries.
 */
const ALLOWED_TAG =
	/^(?:cms-pages|categories|header-navigation|cms-page:[a-z0-9][a-z0-9/_-]{0,254}|category:[a-z0-9][a-z0-9_-]{0,254})$/;
const MAX_TAGS = 50;

/** The de-duplicated tag list from a request body, or null if any tag is not allowed. */
export function acceptedRevalidateTags(input: unknown): string[] | null {
	const tags = (input as { tags?: unknown } | null)?.tags;
	if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_TAGS) return null;
	if (!tags.every((t) => typeof t === "string" && ALLOWED_TAG.test(t))) return null;
	return [...new Set(tags as string[])];
}
