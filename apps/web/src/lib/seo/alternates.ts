import { DEFAULT_LOCALE, LOCALES, SITE_URL } from "./config";

/**
 * Absolute, locale-prefixed URL for a locale-less path such as "/product/foo".
 *
 * Each path segment is percent-encoded individually (the "/" separators are
 * preserved) so slugs containing spaces or non-ASCII characters still produce
 * a valid <loc> per sitemaps.org — plain ASCII segments round-trip unchanged.
 */
export function absoluteUrl(locale: string, path: string): string {
	const encodedPath = path
		.split("/")
		.map((segment) => (segment === "" ? segment : encodeURIComponent(segment)))
		.join("/");
	const suffix = encodedPath === "/" ? "" : encodedPath;
	return `${SITE_URL}/${locale}${suffix}`;
}

/**
 * Reciprocal hreflang alternates for a locale-less path. Used by both the
 * sitemap and page-level generateMetadata so the two can never disagree.
 */
export function buildAlternates(
	locale: string,
	path: string,
): {
	canonical: string;
	languages: Record<string, string>;
} {
	const languages: Record<string, string> = {};
	for (const l of LOCALES) {
		languages[l] = absoluteUrl(l, path);
	}
	languages["x-default"] = absoluteUrl(DEFAULT_LOCALE, path);

	return { canonical: absoluteUrl(locale, path), languages };
}
