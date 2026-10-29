import { describe, expect, it } from "vitest";
import { buildBreadcrumbJsonLd } from "./breadcrumb-jsonld";

describe("buildBreadcrumbJsonLd", () => {
	it("emits absolute ListItem.item URLs", () => {
		const jsonLd = buildBreadcrumbJsonLd("en", [
			{ name: "Lipstick", path: "/c/lipstick" },
		]);

		expect(jsonLd.itemListElement).toEqual([
			{
				"@type": "ListItem",
				position: 1,
				name: "Home",
				item: "https://www.materialhubuae.com/en",
			},
			{
				"@type": "ListItem",
				position: 2,
				name: "Lipstick",
				item: "https://www.materialhubuae.com/en/c/lipstick",
			},
		]);
	});

	// schema.org requires ListItem.item to be an absolute URL. Relative values
	// are why the storefront's breadcrumbs were being discarded by Google.
	it("never emits a relative item URL", () => {
		const jsonLd = buildBreadcrumbJsonLd("ar", [
			{ name: "Makeup", path: "/c/makeup" },
			{ name: "A Product" },
		]);

		for (const entry of jsonLd.itemListElement) {
			if ("item" in entry) {
				expect(entry.item).toMatch(/^https:\/\//);
			}
		}
	});

	it("prefixes the rendering locale, not a fixed one", () => {
		const jsonLd = buildBreadcrumbJsonLd("ar", []);
		expect(jsonLd.itemListElement[0].item).toBe("https://www.materialhubuae.com/ar");
	});

	// The final crumb is the current page. schema.org permits omitting `item`
	// on it, and doing so is preferable to a self-referencing link.
	it("omits item on a crumb that has no path", () => {
		const jsonLd = buildBreadcrumbJsonLd("en", [{ name: "A Product" }]);

		expect(jsonLd.itemListElement[1]).toEqual({
			"@type": "ListItem",
			position: 2,
			name: "A Product",
		});
		expect(jsonLd.itemListElement[1]).not.toHaveProperty("item");
	});

	it("numbers positions sequentially from 1 with no gaps", () => {
		const jsonLd = buildBreadcrumbJsonLd("en", [
			{ name: "Makeup", path: "/c/makeup" },
			{ name: "Lips", path: "/c/lips" },
			{ name: "A Product" },
		]);

		expect(jsonLd.itemListElement.map((e) => e.position)).toEqual([1, 2, 3, 4]);
	});

	it("localises the home crumb label when one is supplied", () => {
		const jsonLd = buildBreadcrumbJsonLd("ar", [], "الرئيسية");
		expect(jsonLd.itemListElement[0].name).toBe("الرئيسية");
	});

	// Search Console: "Invalid URL in field id (in itemListElement.item)".
	// NEXT_PUBLIC_SITE_URL is set per deployment; a missing scheme, stray
	// whitespace or trailing slash must never reach the emitted URL.
	it.each([
		["https://materialhubuae.com", "https://materialhubuae.com/en"],
		["https://materialhubuae.com/", "https://materialhubuae.com/en"],
		[" https://materialhubuae.com\n", "https://materialhubuae.com/en"],
		["materialhubuae.com", "https://materialhubuae.com/en"],
	])("normalises site URL %j", (siteUrl, expected) => {
		const jsonLd = buildBreadcrumbJsonLd("en", [], "Home", siteUrl);
		expect(jsonLd.itemListElement[0].item).toBe(expected);
	});

	it("percent-encodes path characters that are not valid in a URL", () => {
		const jsonLd = buildBreadcrumbJsonLd(
			"ar",
			[
				{ name: "Oud", path: "/c/rose oud" },
				{ name: "عطور", path: "/c/عطور" },
			],
			"Home",
			"https://materialhubuae.com",
		);
		expect(jsonLd.itemListElement[1].item).toBe(
			"https://materialhubuae.com/ar/c/rose%20oud",
		);
		expect(jsonLd.itemListElement[2].item).toBe(
			"https://materialhubuae.com/ar/c/%D8%B9%D8%B7%D9%88%D8%B1",
		);
	});

	it("every emitted item parses as an absolute https URL", () => {
		const jsonLd = buildBreadcrumbJsonLd(
			"en",
			[
				{ name: "Makeup", path: "/c/makeup" },
				{ name: "Brands", path: "/brands" },
			],
			"Home",
			" materialhubuae.com/ ",
		);
		for (const entry of jsonLd.itemListElement) {
			const url = new URL(entry.item as string);
			expect(url.protocol).toBe("https:");
			expect(url.href).toBe(entry.item);
		}
	});

	it("is a well-formed BreadcrumbList", () => {
		const jsonLd = buildBreadcrumbJsonLd("en", []);
		expect(jsonLd["@context"]).toBe("https://schema.org");
		expect(jsonLd["@type"]).toBe("BreadcrumbList");
	});
});
