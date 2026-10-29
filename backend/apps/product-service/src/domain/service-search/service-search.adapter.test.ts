import { describe, expect, it } from "bun:test";
import { ServiceSearchAdapter } from "./service-search.adapter.ts";
import type { ServiceFilters } from "./service-search.interface.ts";

const adapter = new ServiceSearchAdapter();
const build = (f: Parameters<typeof adapter.buildServiceSearchParams>[0]) =>
  adapter.buildServiceSearchParams(f);

// Filter-injection tests below deliberately pass strings outside the
// `paymentMode` union — simulating untrusted/malformed input that reaches
// this layer at runtime despite the compile-time type (e.g. from a query
// string) — so they cast through ServiceFilters["paymentMode"] rather than
// weakening `build`'s parameter type.
const buildWithUntrustedPaymentMode = (
  f: Omit<ServiceFilters, "paymentMode"> & { paymentMode?: string },
) => adapter.buildServiceSearchParams(f as ServiceFilters);

describe("buildServiceSearchParams — always-on constraints", () => {
  it("restricts to published", () => {
    expect(build({}).filter_by).toContain("status:=published");
  });

  it("uses wildcard query and price sort by default", () => {
    const p = build({});
    expect(p.q).toBe("*");
    expect(p.sort_by).toBe("created_at:desc");
  });
});

describe("buildServiceSearchParams — visit widening", () => {
  it("at_premises also matches either", () => {
    expect(build({ visit: "at_premises" }).filter_by).toContain(
      "location_mode:=[at_premises,either]",
    );
  });

  it("home_visit also matches either", () => {
    expect(build({ visit: "home_visit" }).filter_by).toContain(
      "location_mode:=[home_visit,either]",
    );
  });

  it("omits the clause entirely when visit is unset", () => {
    expect(build({}).filter_by).not.toContain("location_mode");
  });
});

describe("buildServiceSearchParams — filters", () => {
  it("filters area by slug", () => {
    expect(build({ area: "dubai-marina" }).filter_by).toContain("area_slugs:=dubai-marina");
  });

  /**
   * `area_slugs` is the UNION of the premises and home-visit coverage sets for
   * an "either" offering, so pairing it with the visit filter returns
   * offerings the vendor can't actually be had that way in that area — a salon
   * with a Dubai Marina branch that only travels to JLT would answer
   * `?visit=home_visit&area=dubai-marina`.
   */
  it("scopes the area to the requested visit bucket", () => {
    expect(build({ area: "dubai-marina", visit: "home_visit" }).filter_by).toContain(
      "home_visit_area_slugs:=dubai-marina",
    );
    expect(build({ area: "dubai-marina", visit: "at_premises" }).filter_by).toContain(
      "premises_area_slugs:=dubai-marina",
    );
  });

  it("falls back to the union when no visit side is chosen", () => {
    const f = build({ area: "dubai-marina" }).filter_by;
    expect(f).toContain("area_slugs:=dubai-marina");
    expect(f).not.toContain("home_visit_area_slugs");
    expect(f).not.toContain("premises_area_slugs");
  });

  it("filters category by slug", () => {
    expect(build({ category: "hair" }).filter_by).toContain("category_slug:=hair");
  });

  it("applies price bounds in fils", () => {
    const f = build({ minPrice: 10000, maxPrice: 50000 }).filter_by;
    expect(f).toContain("price_fils:>= 10000");
    expect(f).toContain("price_fils:<= 50000");
  });

  it("applies duration bounds in minutes", () => {
    const f = build({ minDuration: 30, maxDuration: 120 }).filter_by;
    expect(f).toContain("duration_minutes:>= 30");
    expect(f).toContain("duration_minutes:<= 120");
  });

  it("ignores a zero or non-numeric rating instead of matching everything", () => {
    expect(build({ minRating: 0 }).filter_by).not.toContain("rating_avg");
    expect(build({ minRating: Number.NaN }).filter_by).not.toContain("rating_avg");
    expect(build({ minRating: 4 }).filter_by).toContain("rating_avg:>= 4");
  });

  it("filters payment mode", () => {
    expect(build({ paymentMode: "pay_at_venue" }).filter_by).toContain(
      "payment_mode:=pay_at_venue",
    );
  });
});

describe("buildServiceSearchParams — filter value sanitization", () => {
  it("still filters on a normal slug", () => {
    const f = build({
      area: "dubai-marina",
      category: "hair",
      paymentMode: "pay_at_venue",
    }).filter_by;
    expect(f).toContain("area_slugs:=dubai-marina");
    expect(f).toContain("category_slug:=hair");
    expect(f).toContain("payment_mode:=pay_at_venue");
  });

  it("drops an area value containing filter syntax instead of interpolating it", () => {
    const f = build({ area: "x || status:=draft" }).filter_by;
    expect(f).not.toContain("status:=draft");
    expect(f).not.toContain("area_slugs");
  });

  it("drops a category value containing a colon instead of interpolating it", () => {
    const f = build({ category: "hair:evil" }).filter_by;
    expect(f).not.toContain("category_slug:=hair:evil");
    expect(f).not.toContain("category_slug");
  });

  it("drops a paymentMode value containing filter syntax instead of interpolating it", () => {
    const f = buildWithUntrustedPaymentMode({
      paymentMode: "pay_at_venue || status:=draft",
    }).filter_by;
    expect(f).not.toContain("status:=draft");
    expect(f).not.toContain("payment_mode");
  });

  it("the status:=published gate survives an injection attempt across all fields", () => {
    const f = buildWithUntrustedPaymentMode({
      area: "x || status:=draft",
      category: "y && status:=archived",
      paymentMode: "z, status:=paused",
    }).filter_by;
    expect(f).toBe("status:=published");
  });
});

describe("buildServiceSearchParams — sort and paging", () => {
  it("maps each sort option", () => {
    expect(build({ sortBy: "price_asc" }).sort_by).toBe("price_fils:asc");
    expect(build({ sortBy: "price_desc" }).sort_by).toBe("price_fils:desc");
    expect(build({ sortBy: "rating" }).sort_by).toBe("rating_avg:desc");
    expect(build({ sortBy: "newest" }).sort_by).toBe("created_at:desc");
  });

  it("prefers text relevance when a query is present and no sort is chosen", () => {
    expect(build({ query: "balayage" }).sort_by).toBe("_text_match:desc,rating_avg:desc");
  });

  it("caps limit at 50 and defaults to 24", () => {
    expect(build({}).per_page).toBe(24);
    expect(build({ limit: 500 }).per_page).toBe(50);
  });

  it("defaults to page 1 and never goes below it", () => {
    expect(build({}).page).toBe(1);
    expect(build({ page: 0 }).page).toBe(1);
    expect(build({ page: 3 }).page).toBe(3);
  });

  it("facets on the fields the listing UI renders", () => {
    expect(build({}).facet_by).toBe(
      "area_slugs,category_slug,location_mode,payment_mode,vendor_slug",
    );
  });
});
