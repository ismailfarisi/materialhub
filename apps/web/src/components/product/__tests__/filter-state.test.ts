import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { computeActiveFilters } from "../filter-state";
import { useFilterDraft } from "../use-filter-draft";

describe("useFilterDraft", () => {
	it("returns initial draft and updates via setDraft", () => {
		const { result } = renderHook(() =>
			useFilterDraft({ minPrice: "10", brand: "gulf-board" }),
		);

		expect(result.current.draft).toEqual({ minPrice: "10", brand: "gulf-board" });
		act(() =>
			result.current.setDraft({ minPrice: "10", brand: "gulf-board,jebel-papers" }),
		);
		expect(result.current.draft.brand).toBe("gulf-board,jebel-papers");
	});

	it("clear() empties filters but keeps the sort", () => {
		const { result } = renderHook(() =>
			useFilterDraft({ minPrice: "10", sort: "price_asc" }),
		);
		act(() => result.current.clear());
		expect(result.current.draft).toEqual({ sort: "price_asc" });
	});

	it("reset() returns to the initial draft", () => {
		const { result } = renderHook(() => useFilterDraft({ minPrice: "10" }));
		act(() => result.current.setDraft({ minPrice: "50" }));
		act(() => result.current.reset());
		expect(result.current.draft).toEqual({ minPrice: "10" });
	});
});

describe("computeActiveFilters", () => {
	const facets = {
		brands: [{ value: "gulf-board", label: "Gulf Board", count: 24 }],
		vendors: [{ value: "sharjah-leather", label: "Sharjah Leather House" }],
		attributes: [],
		priceRange: { min: 0, max: 100000 },
	};

	it("returns no pills when no filters are set", () => {
		const out = computeActiveFilters(facets, new URLSearchParams());
		expect(out.pills).toHaveLength(0);
		expect(out.count).toBe(0);
	});

	it("counts each selected brand as one", () => {
		const params = new URLSearchParams("brand=gulf-board,jebel-papers");
		const out = computeActiveFilters(facets, params);
		expect(out.count).toBe(2);
		expect(out.pills.map((p) => p.label)).toEqual([
			"Brand: Gulf Board",
			"Brand: jebel-papers",
		]);
	});

	it("counts includeOutOfStock=true as one and minPrice OR maxPrice as one", () => {
		const params = new URLSearchParams("includeOutOfStock=true&minPrice=10");
		const out = computeActiveFilters(facets, params);
		expect(out.count).toBe(2);
	});

	it("labels suppliers and marks spec and price values as mono", () => {
		const params = new URLSearchParams(
			"vendor=sharjah-leather&gsm=350&minPrice=10&maxPrice=40",
		);
		const out = computeActiveFilters(
			{
				...facets,
				attributes: [
					{
						key: "gsm",
						name: "GSM",
						filter_input_type: "checkbox",
						values: [{ value: "350", label: "350 gsm" }],
					},
				],
			},
			params,
		);
		const byGroup = Object.fromEntries(out.pills.map((p) => [p.group, p]));
		expect(byGroup.vendor.label).toBe("Supplier: Sharjah Leather House");
		expect(byGroup.gsm).toMatchObject({ field: "GSM", display: "350 gsm", mono: true });
		expect(byGroup.price).toMatchObject({ display: "AED 10 – 40", mono: true });
	});

	it("ignores sort and view", () => {
		const params = new URLSearchParams("sort=price_asc&view=list");
		const out = computeActiveFilters(facets, params);
		expect(out.count).toBe(0);
		expect(out.pills).toHaveLength(0);
	});
});
