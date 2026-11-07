import { describe, expect, it } from "vitest";
import { type NavTab, localizeHref, localizeNavTabs } from "./navigation";

describe("localizeHref", () => {
	it("prefixes site-relative hrefs with the locale", () => {
		expect(localizeHref("/c/papers-boards", "ar")).toBe("/ar/c/papers-boards");
		expect(localizeHref("/search?category=papers-boards&sort=newest", "ar")).toBe(
			"/ar/search?category=papers-boards&sort=newest",
		);
		expect(localizeHref("/", "en")).toBe("/en");
	});

	it("leaves localized, absolute and protocol-relative hrefs alone", () => {
		expect(localizeHref("/ar/c/pu-leather", "ar")).toBe("/ar/c/pu-leather");
		expect(localizeHref("/en", "ar")).toBe("/en");
		expect(localizeHref("https://example.com/x", "ar")).toBe("https://example.com/x");
		expect(localizeHref("//cdn.example.com/x", "ar")).toBe("//cdn.example.com/x");
	});

	it("does not mistake a path that starts with a locale code for a prefix", () => {
		expect(localizeHref("/arts", "ar")).toBe("/ar/arts");
		expect(localizeHref("/english-paper", "en")).toBe("/en/english-paper");
	});
});

describe("localizeNavTabs", () => {
	it("prefixes every link in a tab", () => {
		const tab: NavTab = {
			id: "1",
			kind: "category",
			label: "ورق وألواح",
			href: "/c/papers-boards",
			subcategories: [{ label: "ورق فني", href: "/c/art-papers" }],
			brand_list: {
				title: "",
				see_all_href: "/brands",
				brands: [{ id: "b", name: "Brand", href: "/brand/b" }],
			},
			promo_tiles: [{ image_url: "", title: "", cta_text: "", href: "/collection/kraft" }],
		};
		const [out] = localizeNavTabs([tab], "ar");
		expect(out.href).toBe("/ar/c/papers-boards");
		expect(out.subcategories[0].href).toBe("/ar/c/art-papers");
		expect(out.brand_list.see_all_href).toBe("/ar/brands");
		expect(out.brand_list.brands[0].href).toBe("/ar/brand/b");
		expect(out.promo_tiles[0].href).toBe("/ar/collection/kraft");
	});
});
