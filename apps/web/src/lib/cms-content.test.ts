import { describe, expect, it } from "vitest";
import { bannersToSlides, cmsSlugFromPath, sanitizeCmsHtml } from "./cms-content";

describe("cmsSlugFromPath", () => {
	it("accepts one kebab-case segment", () => {
		expect(cmsSlugFromPath(["sample-policy"])).toBe("sample-policy");
	});
	it("rejects nested or malformed paths without a fetch", () => {
		expect(cmsSlugFromPath(["a", "b"])).toBeNull();
		expect(cmsSlugFromPath(["Bad_Slug"])).toBeNull();
		expect(cmsSlugFromPath(["..%2Fadmin"])).toBeNull();
		expect(cmsSlugFromPath([])).toBeNull();
		expect(cmsSlugFromPath(undefined)).toBeNull();
	});
});

describe("sanitizeCmsHtml", () => {
	it("keeps editor formatting", () => {
		const html = '<h2>Sample orders</h2><p>Up to <strong>3</strong> A4 swatches.</p><ul><li>Kraft</li></ul>';
		expect(sanitizeCmsHtml(html)).toBe(html);
	});
	it("strips script, handlers and javascript: links", () => {
		const out = sanitizeCmsHtml(
			'<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="https://cdn.test/a.jpg" onerror="x()">',
		);
		expect(out).not.toMatch(/script|onclick|onerror|javascript:/);
		expect(out).toContain('<img src="https://cdn.test/a.jpg" />');
	});
	it("demotes h1 so the page title stays the only h1", () => {
		expect(sanitizeCmsHtml("<h1>Title</h1>")).toBe("<h2>Title</h2>");
	});
	it("adds noopener to new-tab links", () => {
		expect(sanitizeCmsHtml('<a href="https://x.test" target="_blank">x</a>')).toContain('rel="noopener noreferrer"');
	});
	it("handles empty content", () => {
		expect(sanitizeCmsHtml(null)).toBe("");
	});
});

describe("bannersToSlides", () => {
	it("maps CMS banners to hero slides and skips imageless ones", () => {
		const slides = bannersToSlides(
			[
				{ id: "b1", title: "Kraft week", subtitle: null, image_url: "https://cdn.test/k.jpg", mobile_image_url: null, link_url: "/en/c/kraft-paper", placement: "home_hero", locale: null },
				{ id: "b2", title: "No image", subtitle: null, image_url: "", mobile_image_url: null, link_url: null, placement: "home_hero", locale: null },
			],
			"Shop now",
		);
		expect(slides).toEqual([
			{ id: "b1", title: "Kraft week", subtitle: undefined, image_url: "https://cdn.test/k.jpg", mobile_image_url: undefined, cta_url: "/en/c/kraft-paper", cta_label: "Shop now" },
		]);
		expect(bannersToSlides(null)).toEqual([]);
	});
});
