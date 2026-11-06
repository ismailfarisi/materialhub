import { describe, expect, it } from "bun:test";
import {
  isDeliveryEligible,
  normaliseEmirate,
  parseDeliverySpeed,
} from "./delivery-eligibility.ts";
import { TypesenseSearchAdapter } from "./typesense-search.adapter.ts";

const wh = (handling: number, same: string[], next: string[] = []) => ({
  handling_days: handling,
  same_day_emirates: same,
  next_day_emirates: next,
});

describe("delivery filter", () => {
  it("parses the speed and emirate", () => {
    expect(parseDeliverySpeed("same_day")).toBe("same_day");
    expect(parseDeliverySpeed("express")).toBeNull();
    expect(normaliseEmirate("abu_dhabi")).toBe("Abu Dhabi");
    expect(normaliseEmirate("Doha")).toBeNull();
  });

  it("needs zero handling and the same-day list for same-day", () => {
    expect(isDeliveryEligible(wh(0, ["Dubai"]), "same_day", "Dubai")).toBe(true);
    expect(isDeliveryEligible(wh(1, ["Dubai"]), "same_day", "Dubai")).toBe(false);
    expect(isDeliveryEligible(wh(0, [], ["Dubai"]), "same_day", "Dubai")).toBe(false);
  });

  it("accepts next-day from either list with matching handling", () => {
    expect(isDeliveryEligible(wh(0, [], ["Sharjah"]), "next_day", "Sharjah")).toBe(true);
    expect(isDeliveryEligible(wh(1, ["Sharjah"]), "next_day", "Sharjah")).toBe(true);
    expect(isDeliveryEligible(wh(1, [], ["Sharjah"]), "next_day", "Sharjah")).toBe(false);
    expect(isDeliveryEligible(wh(0, ["Dubai"]), "next_day", "Sharjah")).toBe(false);
  });

  it("lets a product override knock a made-to-order item out", () => {
    expect(isDeliveryEligible(wh(0, ["Dubai"]), "same_day", "Dubai", 4)).toBe(false);
    expect(isDeliveryEligible(wh(2, ["Dubai"]), "next_day", "Dubai", 1)).toBe(true);
  });

  it("adds vendor and exclusion clauses to the Typesense filter", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = adapter.buildSearchParams({
      deliveryVendorIds: ["v1", "v2"],
      deliveryExcludeProductIds: ["p9"],
    });
    expect(params.filter_by).toContain("vendor_id:=[v1,v2]");
    expect(params.filter_by).toContain("id:!=[p9]");
    const none = adapter.buildSearchParams({ deliveryVendorIds: [] });
    expect(none.filter_by).toContain("vendor_id:=[__none__]");
  });
});
