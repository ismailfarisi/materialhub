const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.materialhubuae.com";

export interface BreadcrumbCrumb {
	name: string;
	/** Locale-less path, e.g. "/c/lipstick". Omit for the current page. */
	path?: string;
}

interface BreadcrumbListItem {
	"@type": "ListItem";
	position: number;
	name: string;
	item?: string;
}

/**
 * Builds schema.org BreadcrumbList JSON-LD with ABSOLUTE `item` URLs.
 *
 * schema.org requires ListItem.item to be an absolute URL. Both storefront
 * breadcrumb components previously emitted locale-relative values such as
 * `/en/c/lipstick`, which Google discards — so the storefront had no valid
 * breadcrumb markup on any page despite rendering breadcrumbs everywhere.
 *
 * The trailing crumb (the current page) may omit `path`; schema.org permits a
 * final ListItem with no `item`, which is preferable to a self-referencing link.
 */
export function buildBreadcrumbJsonLd(
	locale: string,
	crumbs: BreadcrumbCrumb[],
	homeLabel = "Home",
	siteUrl: string = SITE_URL,
) {
	// Search Console flagged "Invalid URL in field id": the origin comes from a
	// per-deployment env var, so tolerate a missing scheme, whitespace or a
	// trailing slash, and percent-encode the path (spaces, Arabic slugs).
	const trimmed = siteUrl.trim().replace(/\/+$/, "");
	const origin = new URL(
		/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
	).origin;
	const absolute = (path: string) =>
		new URL(encodeURI(`/${locale}${path}`), origin).href;

	const itemListElement: BreadcrumbListItem[] = [
		{
			"@type": "ListItem",
			position: 1,
			name: homeLabel,
			item: absolute(""),
		},
		...crumbs.map((crumb, index) => ({
			"@type": "ListItem" as const,
			position: index + 2,
			name: crumb.name,
			...(crumb.path ? { item: absolute(crumb.path) } : {}),
		})),
	];

	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement,
	};
}
