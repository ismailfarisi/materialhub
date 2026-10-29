import { describe, expect, it } from "vitest";
import { computeActiveServiceFilters } from "./service-filter-state";

const config = {
  areas: [{ value: "dubai-marina", label: "Dubai Marina", count: 3 }],
  categories: [{ value: "hair", label: "Hair", count: 2 }],
  priceRange: { min: 0, max: 100000 },
};

describe("computeActiveServiceFilters", () => {
  it("counts nothing when no filters are set", () => {
    expect(computeActiveServiceFilters(config, new URLSearchParams("")).count).toBe(0);
  });

  it("produces an area pill with the display label, not the slug", () => {
    const { pills, count } = computeActiveServiceFilters(
      config,
      new URLSearchParams("area=dubai-marina"),
    );
    expect(count).toBe(1);
    expect(pills[0]).toEqual({ group: "area", value: "dubai-marina", label: "Dubai Marina" });
  });

  it("treats a price range as a single pill", () => {
    const { count } = computeActiveServiceFilters(
      config,
      new URLSearchParams("minPrice=20&maxPrice=500"),
    );
    expect(count).toBe(1);
  });

  it("ignores sort, view, page and q", () => {
    const { count } = computeActiveServiceFilters(
      config,
      new URLSearchParams("sort=price_asc&view=list&page=2&q=balayage"),
    );
    expect(count).toBe(0);
  });

  it("ignores an unknown param instead of inventing a pill for it", () => {
    // The product-side computeActiveFilters treats unknown params as
    // attributes; services have no attributes, so an unknown param must be
    // dropped rather than rendered as a bogus pill.
    const { count } = computeActiveServiceFilters(
      config,
      new URLSearchParams("mystery=1"),
    );
    expect(count).toBe(0);
  });
});
