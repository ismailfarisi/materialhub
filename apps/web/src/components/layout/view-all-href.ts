/**
 * Where a homepage product rail's "View all" should go.
 *
 * Precedence:
 *  1. An explicit `view_all_href` in the section settings (admin override).
 *  2. The collection the rail was drawn from, when the section is
 *     collection-backed — cms-service surfaces this as `collection_slug`.
 *  3. Bare search, which shows the whole catalogue. This is the honest
 *     fallback for rails built from an ad-hoc product query rather than a
 *     curated collection: there is no single page holding exactly that set.
 */
export function viewAllHref(
	settings: Record<string, unknown>,
	collectionSlug: string | undefined,
	locale: string,
): string {
	const explicit = settings.view_all_href;
	if (typeof explicit === "string" && explicit.trim()) return explicit;
	if (collectionSlug)
		return `/${locale}/collection/${encodeURIComponent(collectionSlug)}`;
	return `/${locale}/search`;
}
