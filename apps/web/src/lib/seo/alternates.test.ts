import { describe, expect, it } from "vitest";
import { routing } from "../../../i18n/routing";
import { absoluteUrl, buildAlternates } from "./alternates";
import { LOCALES } from "./config";

describe("seo alternates", () => {
	it("sources locales from the routing config and nothing else", () => {
		expect(LOCALES).toEqual(routing.locales);
		expect(LOCALES).toEqual(["en", "ar"]);
	});

	it("builds an absolute, locale-prefixed url", () => {
		expect(absoluteUrl("en", "/product/foo")).toBe(
			"https://www.materialhubuae.com/en/product/foo",
		);
		expect(absoluteUrl("ar", "/product/foo")).toBe(
			"https://www.materialhubuae.com/ar/product/foo",
		);
	});

	it("treats the bare root path as the locale home", () => {
		expect(absoluteUrl("en", "/")).toBe("https://www.materialhubuae.com/en");
	});

	it("leaves a plain ASCII slug unchanged", () => {
		expect(absoluteUrl("en", "/product/foo-bar")).toBe(
			"https://www.materialhubuae.com/en/product/foo-bar",
		);
	});

	it("percent-encodes a space in a slug", () => {
		expect(absoluteUrl("en", "/product/foo bar")).toBe(
			"https://www.materialhubuae.com/en/product/foo%20bar",
		);
	});

	it("percent-encodes non-ASCII characters in a slug", () => {
		expect(absoluteUrl("en", "/product/منتج")).toBe(
			"https://www.materialhubuae.com/en/product/%D9%85%D9%86%D8%AA%D8%AC",
		);
	});

	it("builds reciprocal hreflang alternates with x-default on en", () => {
		expect(buildAlternates("en", "/product/foo")).toEqual({
			canonical: "https://www.materialhubuae.com/en/product/foo",
			languages: {
				en: "https://www.materialhubuae.com/en/product/foo",
				ar: "https://www.materialhubuae.com/ar/product/foo",
				"x-default": "https://www.materialhubuae.com/en/product/foo",
			},
		});
	});

	it("self-references the canonical to the rendering locale, not en", () => {
		expect(buildAlternates("ar", "/product/foo")).toEqual({
			canonical: "https://www.materialhubuae.com/ar/product/foo",
			languages: {
				en: "https://www.materialhubuae.com/en/product/foo",
				ar: "https://www.materialhubuae.com/ar/product/foo",
				"x-default": "https://www.materialhubuae.com/en/product/foo",
			},
		});
	});
});
