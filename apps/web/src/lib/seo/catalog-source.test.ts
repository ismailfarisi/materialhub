import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getBrands,
	getCategories,
	getProductCount,
	getProducts,
	getVendors,
} from "./catalog-source";

vi.mock("axios");

const mockedGet = vi.mocked(axios.get);

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

function productPage(slugs: string[], cursor: string | null) {
	return {
		data: {
			statusCode: 200,
			data: {
				data: slugs.map((slug) => ({
					slug,
					created_at: "2026-01-02T03:04:05.000Z",
				})),
				total: 4984,
				cursor,
			},
		},
	};
}

describe("getProducts", () => {
	it("reads the array from the nested data.data envelope", async () => {
		mockedGet.mockResolvedValueOnce(productPage(["alpha", "beta"], null));

		const entries = await getProducts();

		expect(entries).toEqual([
			{
				path: "/product/alpha",
				lastModified: new Date("2026-01-02T03:04:05.000Z"),
			},
			{
				path: "/product/beta",
				lastModified: new Date("2026-01-02T03:04:05.000Z"),
			},
		]);
	});

	it("follows the cursor until it is exhausted", async () => {
		mockedGet
			.mockResolvedValueOnce(productPage(["a"], "2"))
			.mockResolvedValueOnce(productPage(["b"], "3"))
			.mockResolvedValueOnce(productPage(["c"], null));

		const entries = await getProducts();

		expect(entries.map((e) => e.path)).toEqual([
			"/product/a",
			"/product/b",
			"/product/c",
		]);
		expect(mockedGet).toHaveBeenCalledTimes(3);
	});

	it("requests at most 250 per page, the API ceiling", async () => {
		mockedGet.mockResolvedValueOnce(productPage(["a"], null));

		await getProducts();

		expect(mockedGet.mock.calls[0][0]).toContain("limit=250");
		expect(mockedGet.mock.calls[0][0]).toContain("cursor=1");
	});

	it("skips products with no slug", async () => {
		mockedGet.mockResolvedValueOnce({
			data: { data: { data: [{ slug: "ok" }, { slug: null }], cursor: null } },
		});

		expect(await getProducts()).toEqual([{ path: "/product/ok" }]);
	});

	// This is the regression that caused the production bug: the previous
	// implementation wrapped every fetch in an empty catch and degraded to a
	// one-URL sitemap without any signal.
	it("throws instead of returning an empty list when the API fails", async () => {
		mockedGet.mockRejectedValueOnce(new Error("boom"));

		await expect(getProducts()).rejects.toThrow(/sitemap upstream failed/);
	});

	it("throws when the cursor loop hits the page cap with cursor still truthy", async () => {
		// Always return a page with a non-null cursor to simulate an infinite
		// stream that will eventually hit the MAX_PAGES cap
		mockedGet.mockResolvedValue(productPage(["product"], "next-cursor"));

		await expect(getProducts()).rejects.toThrow(
			/sitemap upstream failed: product catalog exceeded expected size/,
		);
	});

	it("ends normally when a final page has zero items and cursor is still truthy (regression test)", async () => {
		// This simulates the case where the catalog total is an exact multiple of
		// PAGE_SIZE: the API returns a final page with zero items but cursor is
		// still truthy. The previous code broke before reassigning cursor, causing
		// the post-loop check to falsely throw "catalog exceeded expected size".
		mockedGet
			.mockResolvedValueOnce(productPage(["alpha"], "cursor-2"))
			.mockResolvedValueOnce(productPage([], "cursor-3"));

		const entries = await getProducts();

		expect(entries).toEqual([
			{
				path: "/product/alpha",
				lastModified: new Date("2026-01-02T03:04:05.000Z"),
			},
		]);
	});
});

describe("getProductCount", () => {
	it("returns body.data.total", async () => {
		mockedGet.mockResolvedValueOnce(productPage(["alpha"], null));

		expect(await getProductCount()).toBe(4984);
	});

	it("issues exactly one request, for limit=1", async () => {
		mockedGet.mockResolvedValueOnce(productPage(["alpha"], null));

		await getProductCount();

		expect(mockedGet).toHaveBeenCalledTimes(1);
		expect(mockedGet.mock.calls[0][0]).toContain("limit=1");
	});

	it("throws when total is absent instead of defaulting to 0", async () => {
		mockedGet.mockResolvedValueOnce({
			data: { data: { data: [], cursor: null } },
		});

		await expect(getProductCount()).rejects.toThrow(
			/sitemap upstream failed/,
		);
	});
});

describe("getCategories", () => {
	it("flattens the category tree recursively", async () => {
		mockedGet.mockResolvedValueOnce({
			data: {
				data: [
					{
						slug: "health-and-beauty",
						children: [
							{ slug: "makeup", children: [{ slug: "lipstick" }] },
							{ slug: "skincare", children: [] },
						],
					},
				],
			},
		});

		const entries = await getCategories();

		expect(entries.map((e) => e.path)).toEqual([
			"/c/health-and-beauty",
			"/c/makeup",
			"/c/lipstick",
			"/c/skincare",
		]);
	});

	it("uses the public categories/tree route, not products/categories", async () => {
		mockedGet.mockResolvedValueOnce({ data: { data: [] } });

		await getCategories();

		expect(mockedGet.mock.calls[0][0]).toContain("/categories/tree");
	});
});

describe("getBrands", () => {
	it("maps brand slugs to brand paths", async () => {
		mockedGet.mockResolvedValueOnce({
			data: { data: [{ slug: "flormar" }, { slug: "note" }] },
		});

		expect((await getBrands()).map((e) => e.path)).toEqual([
			"/brand/flormar",
			"/brand/note",
		]);
	});
});

describe("getVendors", () => {
	it("derives vendors from product facets so only vendors with products appear", async () => {
		mockedGet.mockResolvedValueOnce({
			data: {
				data: {
					data: [],
					facets: {
						vendors: [
							{ value: "multiplex-international", count: 3261 },
							{ value: "b-living", count: 126 },
						],
					},
				},
			},
		});

		expect((await getVendors()).map((e) => e.path)).toEqual([
			"/vendor/multiplex-international",
			"/vendor/b-living",
		]);
	});
});
