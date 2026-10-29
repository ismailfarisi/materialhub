import { absoluteUrl } from "./alternates";
import type { SitemapEntry } from "./catalog-source";
import { DEFAULT_LOCALE, LOCALES, SITE_URL } from "./config";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Expands each locale-less entry into one <url> per locale, each carrying the
 * full set of reciprocal hreflang links plus x-default. Google requires every
 * alternate in a set to point back at every other, including itself.
 */
export function buildUrlset(
	entries: SitemapEntry[],
	priority = 0.7,
	changefreq = "weekly",
): string {
	const blocks: string[] = [];

	for (const entry of entries) {
		const links = LOCALES.map(
			(locale) =>
				`    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(
					absoluteUrl(locale, entry.path),
				)}"/>`,
		).join("\n");
		const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
			absoluteUrl(DEFAULT_LOCALE, entry.path),
		)}"/>`;
		const lastmod =
			entry.lastModified && !Number.isNaN(entry.lastModified.getTime())
				? `\n    <lastmod>${entry.lastModified.toISOString()}</lastmod>`
				: "";

		for (const locale of LOCALES) {
			blocks.push(
				`  <url>\n    <loc>${escapeXml(
					absoluteUrl(locale, entry.path),
				)}</loc>${lastmod}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n${links}\n${xDefault}\n  </url>`,
			);
		}
	}

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${blocks.join("\n")}
</urlset>`;
}

export function buildSitemapIndex(files: string[]): string {
	const blocks = files.map(
		(file) =>
			`  <sitemap>\n    <loc>${escapeXml(
				`${SITE_URL}/sitemaps/${file}`,
			)}</loc>\n  </sitemap>`,
	);

	return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${blocks.join("\n")}
</sitemapindex>`;
}
