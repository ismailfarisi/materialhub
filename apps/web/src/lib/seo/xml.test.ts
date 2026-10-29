import { describe, expect, it } from "vitest";
import { buildSitemapIndex, buildUrlset } from "./xml";
import { LOCALES } from "./config";

function parseAndCheckXml(xml: string): Document {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "application/xml");
	// Assert no parse errors
	expect(doc.documentElement.nodeName).not.toBe("parsererror");
	const parseErrors = doc.querySelectorAll("parsererror");
	expect(parseErrors.length).toBe(0);
	return doc;
}

describe("buildUrlset", () => {
	it("emits one <url> per locale with reciprocal hreflang links", () => {
		const xml = buildUrlset([{ path: "/product/foo" }]);

		expect(xml).toContain("<loc>https://www.materialhubuae.com/en/product/foo</loc>");
		expect(xml).toContain("<loc>https://www.materialhubuae.com/ar/product/foo</loc>");
		expect(xml).toContain(
			'<xhtml:link rel="alternate" hreflang="ar" href="https://www.materialhubuae.com/ar/product/foo"/>',
		);
		expect(xml).toContain(
			'<xhtml:link rel="alternate" hreflang="x-default" href="https://www.materialhubuae.com/en/product/foo"/>',
		);
	});

	it("declares the xhtml namespace required for hreflang", () => {
		expect(buildUrlset([{ path: "/" }])).toContain(
			'xmlns:xhtml="http://www.w3.org/1999/xhtml"',
		);
	});

	it("emits lastmod only when provided", () => {
		const withDate = buildUrlset([
			{ path: "/a", lastModified: new Date("2026-01-02T03:04:05.000Z") },
		]);
		expect(withDate).toContain("<lastmod>2026-01-02T03:04:05.000Z</lastmod>");
		expect(buildUrlset([{ path: "/b" }])).not.toContain("<lastmod>");
	});

	it("escapes XML-significant characters in paths", () => {
		// `absoluteUrl` percent-encodes path segments (see alternates.ts), so a
		// raw "&" never reaches the XML layer at all — it becomes "%26" before
		// `escapeXml` runs. That's a stronger fix than escaping: the character
		// is gone, not just escaped.
		expect(buildUrlset([{ path: "/product/a&b" }])).toContain("a%26b");
		expect(buildUrlset([{ path: "/product/a&b" }])).not.toContain("a&b");
	});

	it("is valid when empty", () => {
		const xml = buildUrlset([]);
		expect(xml).toContain("<urlset");
		expect(xml).toContain("</urlset>");
		expect(xml).not.toContain("<url>");
	});

	it("produces well-formed XML that parses without errors", () => {
		const xml = buildUrlset([
			{ path: "/a", lastModified: new Date("2026-01-02T03:04:05.000Z") },
			{ path: "/b" },
		]);
		const doc = parseAndCheckXml(xml);
		expect(doc).toBeDefined();
		expect(doc.documentElement.nodeName).toBe("urlset");
	});

	it("emits exactly one <url> per locale with correct hreflang alternates and x-default", () => {
		const xml = buildUrlset([{ path: "/product/foo" }]);
		const doc = parseAndCheckXml(xml);

		// Count the number of <url> elements
		const urls = doc.querySelectorAll("url");
		expect(urls.length).toBe(LOCALES.length);

		// For each <url>, check that it has exactly LOCALES.length reciprocal links + 1 x-default
		for (const urlElement of urls) {
			const links = urlElement.querySelectorAll(
				'xhtml\\:link[rel="alternate"]',
			);
			// Should have one for each locale plus one x-default
			expect(links.length).toBe(LOCALES.length + 1);

			// Count x-default links (should be exactly 1)
			const xDefaultLinks = Array.from(links).filter(
				(link) => link.getAttribute("hreflang") === "x-default",
			);
			expect(xDefaultLinks.length).toBe(1);

			// Count locale links (should be exactly LOCALES.length)
			const localeLinks = Array.from(links).filter((link) => {
				const hreflang = link.getAttribute("hreflang");
				return hreflang !== "x-default";
			});
			expect(localeLinks.length).toBe(LOCALES.length);
		}
	});

	it("omits <lastmod> for invalid dates and produces well-formed XML", () => {
		const xml = buildUrlset([
			{ path: "/invalid-date", lastModified: new Date("garbage") },
		]);

		// Should parse without errors
		const doc = parseAndCheckXml(xml);
		expect(doc).toBeDefined();

		// Should not contain any <lastmod> element for the invalid-date entry
		const urls = doc.querySelectorAll("url");
		for (const urlElement of urls) {
			const locElement = urlElement.querySelector("loc");
			if (locElement?.textContent?.includes("invalid-date")) {
				const lastmodElement = urlElement.querySelector("lastmod");
				expect(lastmodElement).toBeNull();
			}
		}
	});
});

describe("buildSitemapIndex", () => {
	it("lists each child sitemap as an absolute url", () => {
		const xml = buildSitemapIndex(["static.xml", "products-0.xml"]);

		expect(xml).toContain("<sitemapindex");
		expect(xml).toContain(
			"<loc>https://www.materialhubuae.com/sitemaps/static.xml</loc>",
		);
		expect(xml).toContain(
			"<loc>https://www.materialhubuae.com/sitemaps/products-0.xml</loc>",
		);
	});
});
