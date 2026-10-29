import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { computeActiveFilters } from "../filter-state";
import { useFilterDraft } from "../use-filter-draft";

describe("useFilterDraft", () => {
	it("returns initial draft and updates via setDraft", () => {
		const { result } = renderHook(() =>
			useFilterDraft({ minPrice: "10", brand: "ouai" }),
		);

		expect(result.current.draft).toEqual({ minPrice: "10", brand: "ouai" });
		act(() =>
			result.current.setDraft({ minPrice: "10", brand: "ouai,sephora" }),
		);
		expect(result.current.draft.brand).toBe("ouai,sephora");
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
		brands: [{ value: "ouai", label: "Ouai", count: 24 }],
		vendors: [{ value: "v1", label: "Vendor One" }],
		attributes: [],
		priceRange: { min: 0, max: 100000 },
	};

	it("returns no pills when no filters are set", () => {
		const out = computeActiveFilters(facets, new URLSearchParams());
		expect(out.pills).toHaveLength(0);
		expect(out.count).toBe(0);
	});

	it("counts each selected brand as one", () => {
		const params = new URLSearchParams("brand=ouai,sephora");
		const out = computeActiveFilters(facets, params);
		expect(out.count).toBe(2);
		expect(out.pills.map((p) => p.label)).toEqual([
			"Brand: Ouai",
			"Brand: sephora",
		]);
	});

	it("counts includeOutOfStock=true as one and minPrice OR maxPrice as one", () => {
		const params = new URLSearchParams("includeOutOfStock=true&minPrice=10");
		const out = computeActiveFilters(facets, params);
		expect(out.count).toBe(2);
	});

	it("ignores sort and view", () => {
		const params = new URLSearchParams("sort=price_asc&view=list");
		const out = computeActiveFilters(facets, params);
		expect(out.count).toBe(0);
		expect(out.pills).toHaveLength(0);
	});
});
