import { describe, expect, it } from "vitest";
import {
	buildBrandListingParams,
	buildListingParams,
	buildSearchListingParams,
} from "../listing-params";

describe("buildListingParams", () => {
	it("maps ?page to the backend's cursor param", () => {
		const params = buildListingParams("fragrance", { page: "3" });
		expect(params.cursor).toBe("3");
		expect(params).not.toHaveProperty("page");
	});

	it("maps ?sort to the backend's sortBy param", () => {
		const params = buildListingParams("fragrance", { sort: "price_asc" });
		expect(params.sortBy).toBe("price_asc");
		expect(params).not.toHaveProperty("sort");
	});

	it("omits cursor/sortBy when neither paginating nor sorting", () => {
		const params = buildListingParams("fragrance", {});
		expect(params).not.toHaveProperty("cursor");
		expect(params).not.toHaveProperty("sortBy");
		expect(params).toMatchObject({ category: "fragrance", limit: 24 });
	});

	it("forwards filter params alongside the translated ones and converts price to fils", () => {
		const params = buildListingParams("fragrance", {
			brand: "ajmal",
			minPrice: "200",
			page: "2",
			sort: "rating",
		});
		expect(params).toMatchObject({
			category: "fragrance",
			limit: 24,
			brand: "ajmal",
			// storefront AED (200) → backend fils (20000)
			minPrice: 20000,
			cursor: "2",
			sortBy: "rating",
		});
	});

	it("converts minPrice/maxPrice from AED to fils, rounding fractional AED", () => {
		const params = buildListingParams("fragrance", {
			minPrice: "50",
			maxPrice: "199.99",
		});
		expect(params.minPrice).toBe(5000);
		expect(params.maxPrice).toBe(19999);
	});

	it("drops a non-numeric price param instead of forwarding NaN", () => {
		const params = buildListingParams("fragrance", { minPrice: "abc" });
		expect(params).not.toHaveProperty("minPrice");
	});

	it("respects a custom page size", () => {
		const params = buildListingParams("fragrance", {}, 48);
		expect(params.limit).toBe(48);
	});

	it("includes the route locale for backend localization", () => {
		const params = buildListingParams("fragrance", {}, 24, "ar");
		expect(params.locale).toBe("ar");
	});
});

describe("buildSearchListingParams", () => {
	it("maps ?page to cursor and ?sort to sortBy, like category listings", () => {
		const params = buildSearchListingParams("lip", {
			page: "2",
			sort: "rating",
		});
		expect(params).toMatchObject({
			q: "lip",
			limit: 24,
			cursor: "2",
			sortBy: "rating",
		});
		expect(params).not.toHaveProperty("page");
		expect(params).not.toHaveProperty("sort");
	});

	it("sets q from the explicit query and never duplicates the URL's q param", () => {
		// `q` lives in the URL too; the explicit query argument must win.
		const params = buildSearchListingParams("lipstick", { q: "lip" });
		expect(params.q).toBe("lipstick");
	});

	it("forwards filter params alongside the translated ones and converts price to fils", () => {
		const params = buildSearchListingParams("lip", {
			brand: "ajmal",
			minPrice: "200",
			page: "3",
		});
		expect(params).toMatchObject({
			q: "lip",
			limit: 24,
			brand: "ajmal",
			minPrice: 20000,
			cursor: "3",
		});
	});

	it("omits cursor/sortBy when neither paginating nor sorting", () => {
		const params = buildSearchListingParams("lip", {});
		expect(params).not.toHaveProperty("cursor");
		expect(params).not.toHaveProperty("sortBy");
	});

	it("includes the route locale for backend localization", () => {
		const params = buildSearchListingParams("lip", {}, 24, "ar");
		expect(params.locale).toBe("ar");
	});
});

describe("in-stock default", () => {
	it("hides sold-out products on category listings by default", () => {
		const params = buildListingParams("skincare", {});
		expect(params.inStock).toBe("true");
	});

	it("hides sold-out products on brand listings by default", () => {
		const params = buildBrandListingParams("ouai", {});
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
