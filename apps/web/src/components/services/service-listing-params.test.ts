import { describe, expect, it } from "vitest";
import { buildServiceListingParams } from "./service-listing-params";

describe("buildServiceListingParams", () => {
  it("converts AED price bounds to fils", () => {
    const p = buildServiceListingParams({ minPrice: "20", maxPrice: "500" });
    expect(p.min_price).toBe(2000);
    expect(p.max_price).toBe(50000);
  });

  it("drops blank or invalid price bounds instead of sending them", () => {
    const p = buildServiceListingParams({ minPrice: "", maxPrice: "abc" });
    expect(p.min_price).toBeUndefined();
    expect(p.max_price).toBeUndefined();
  });

  it("maps URL names to the API's snake_case names", () => {
    const p = buildServiceListingParams({
      area: "dubai-marina",
      visit: "home_visit",
      minDuration: "30",
      maxDuration: "120",
      minRating: "4",
      paymentMode: "pay_at_venue",
      sort: "price_asc",
      page: "2",
    });
    expect(p.area).toBe("dubai-marina");
    expect(p.visit).toBe("home_visit");
    expect(p.min_duration).toBe(30);
    expect(p.max_duration).toBe(120);
    expect(p.min_rating).toBe(4);
    expect(p.payment_mode).toBe("pay_at_venue");
    expect(p.sort).toBe("price_asc");
    expect(p.page).toBe(2);
  });

  it("passes the free-text query through as q", () => {
    expect(buildServiceListingParams({ q: "balayage" }).q).toBe("balayage");
  });

  it("defaults limit to 24 and honours an override", () => {
    expect(buildServiceListingParams({}).limit).toBe(24);
    expect(buildServiceListingParams({}, 12).limit).toBe(12);
  });

  it("ignores view, which is a client-only display concern", () => {
    expect(buildServiceListingParams({ view: "list" }).view).toBeUndefined();
  });

  it("adds locale only when supplied", () => {
    expect(buildServiceListingParams({}).locale).toBeUndefined();
    expect(buildServiceListingParams({}, 24, "ar").locale).toBe("ar");
  });

  it("drops negative duration values instead of sending them to the API", () => {
    const p = buildServiceListingParams({
      minDuration: "-30",
      maxDuration: "-120",
    });
    expect(p.min_duration).toBeUndefined();
    expect(p.max_duration).toBeUndefined();
  });

  it("drops negative rating values instead of sending them to the API", () => {
    const p = buildServiceListingParams({ minRating: "-1" });
    expect(p.min_rating).toBeUndefined();
  });

  it("drops negative page values instead of sending them to the API", () => {
    const p = buildServiceListingParams({ page: "-5" });
    expect(p.page).toBeUndefined();
  });

  it("preserves zero for numeric bounds where zero is a legitimate value", () => {
    const p = buildServiceListingParams({
      minPrice: "0",
      minDuration: "0",
      minRating: "0",
    });
    expect(p.min_price).toBe(0);
    expect(p.min_duration).toBe(0);
    expect(p.min_rating).toBe(0);
  });

  // I3a: the route DTO requires page >= 1 (t.Numeric({ minimum: 1 }) in
  // service.routes.ts); page=0 is not a legitimate page like the zero-valued
  // filters above are, so it must be clamped up rather than preserved,
  // otherwise it 422s instead of degrading to page 1.
  it("clamps page 0 up to page 1 instead of sending the API-rejected value", () => {
    const p = buildServiceListingParams({ page: "0" });
    expect(p.page).toBe(1);
  });

  // I3a: the route DTO caps min_rating at 5 (t.Numeric({ maximum: 5 })); an
  // unclamped value beyond that would 422 instead of degrading to the widest
  // valid filter.
  it("clamps minRating above 5 down to 5 instead of sending the API-rejected value", () => {
    const p = buildServiceListingParams({ minRating: "9" });
    expect(p.min_rating).toBe(5);
  });
});
