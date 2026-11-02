import { describe, expect, it } from "vitest";
import {
	buildBrandListingParams,
	buildListingParams,
	buildSearchListingParams,
} from "../listing-params";

describe("buildListingParams", () => {
	it("maps ?page to the backend's cursor param", () => {
		const params = buildListingParams("papers-boards", { page: "3" });
		expect(params.cursor).toBe("3");
		expect(params).not.toHaveProperty("page");
	});

	it("maps ?sort to the backend's sortBy param", () => {
		const params = buildListingParams("papers-boards", { sort: "price_asc" });
		expect(params.sortBy).toBe("price_asc");
		expect(params).not.toHaveProperty("sort");
	});

	it("omits cursor/sortBy when neither paginating nor sorting", () => {
		const params = buildListingParams("papers-boards", {});
		expect(params).not.toHaveProperty("cursor");
		expect(params).not.toHaveProperty("sortBy");
		expect(params).toMatchObject({ category: "papers-boards", limit: 24 });
	});

	it("forwards filter params alongside the translated ones and converts price to fils", () => {
		const params = buildListingParams("papers-boards", {
			brand: "ajmal",
			minPrice: "200",
			page: "2",
			sort: "rating",
		});
		expect(params).toMatchObject({
			category: "papers-boards",
			limit: 24,
			brand: "ajmal",
			// storefront AED (200) → backend fils (20000)
			minPrice: 20000,
			cursor: "2",
			sortBy: "rating",
		});
	});

	it("converts minPrice/maxPrice from AED to fils, rounding fractional AED", () => {
		const params = buildListingParams("papers-boards", {
			minPrice: "50",
			maxPrice: "199.99",
		});
		expect(params.minPrice).toBe(5000);
		expect(params.maxPrice).toBe(19999);
	});

	it("drops a non-numeric price param instead of forwarding NaN", () => {
		const params = buildListingParams("papers-boards", { minPrice: "abc" });
		expect(params).not.toHaveProperty("minPrice");
	});

	it("respects a custom page size", () => {
		const params = buildListingParams("papers-boards", {}, 48);
		expect(params.limit).toBe(48);
	});

	it("includes the route locale for backend localization", () => {
		const params = buildListingParams("papers-boards", {}, 24, "ar");
		expect(params.locale).toBe("ar");
	});
});

describe("buildSearchListingParams", () => {
	it("maps ?page to cursor and ?sort to sortBy, like category listings", () => {
		const params = buildSearchListingParams("kraft", {
			page: "2",
			sort: "rating",
		});
		expect(params).toMatchObject({
			q: "kraft",
			limit: 24,
			cursor: "2",
			sortBy: "rating",
		});
		expect(params).not.toHaveProperty("page");
		expect(params).not.toHaveProperty("sort");
	});

	it("sets q from the explicit query and never duplicates the URL's q param", () => {
		// `q` lives in the URL too; the explicit query argument must win.
		const params = buildSearchListingParams("kraft paper", { q: "kraft" });
		expect(params.q).toBe("kraft paper");
	});

	it("forwards filter params alongside the translated ones and converts price to fils", () => {
		const params = buildSearchListingParams("kraft", {
			brand: "ajmal",
			minPrice: "200",
			page: "3",
		});
		expect(params).toMatchObject({
			q: "kraft",
			limit: 24,
			brand: "ajmal",
			minPrice: 20000,
			cursor: "3",
		});
	});

	it("omits cursor/sortBy when neither paginating nor sorting", () => {
		const params = buildSearchListingParams("kraft", {});
		expect(params).not.toHaveProperty("cursor");
		expect(params).not.toHaveProperty("sortBy");
	});

	it("includes the route locale for backend localization", () => {
		const params = buildSearchListingParams("kraft", {}, 24, "ar");
		expect(params.locale).toBe("ar");
	});
});

describe("in-stock default", () => {
	it("hides sold-out products on category listings by default", () => {
		const params = buildListingParams("skincare", {});
		expect(params.inStock).toBe("true");
	});

	it("hides sold-out products on brand listings by default", () => {
		const params = buildBrandListingParams("gulf-board", {});
		expect(params.inStock).toBe("true");
	});

	it("hides sold-out products on search by default", () => {
		const params = buildSearchListingParams("serum", {});
		expect(params.inStock).toBe("true");
	});

	it("drops the filter entirely when the shopper opts in", () => {
		const params = buildListingParams("skincare", {
			includeOutOfStock: "true",
		});
		// NOT inStock=false — that would return ONLY sold-out products.
		expect(params.inStock).toBeUndefined();
		expect(params.includeOutOfStock).toBeUndefined();
	});

	it("never forwards a raw inStock URL param to the API", () => {
		const params = buildListingParams("skincare", { inStock: "false" });
		expect(params.inStock).toBe("true");
	});
});
