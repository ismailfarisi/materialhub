import { describe, expect, it } from "bun:test";
import { formDeliveryGroups } from "../../checkout/quote/delivery-groups.ts";
import { selectedShippingFils } from "../../checkout/quote/shipping-total.ts";
import { capForSamples, sampleOnlyVendorIds, sampleShippingRule } from "./sample-shipping.ts";

const rates = [
  {
    id: "r1",
    vendor_id: null,
    zone_id: null,
    method: "standard",
    base_cost: 2500,
    per_kg_cost: null,
    free_above: 15000,
    estimated_days_min: 1,
    estimated_days_max: 3,
  },
];

describe("sample shipping", () => {
  it("only counts suppliers whose lines are all samples", () => {
    const ids = sampleOnlyVendorIds([
      { vendor_id: "a", is_sample: true },
      { vendor_id: "b", is_sample: true },
      { vendor_id: "b", is_sample: false },
    ]);
    expect([...ids]).toEqual(["a"]);
  });

  it("has no rule when there are no samples", () => {
    expect(sampleShippingRule([{ vendor_id: "a" }], 1000)).toBeUndefined();
  });

  it("caps a method at the sample rate but never raises it", () => {
    const rule = sampleShippingRule([{ vendor_id: "a", is_sample: true }], 1000);
    expect(capForSamples(2500, "a", rule)).toBe(1000);
    expect(capForSamples(0, "a", rule)).toBe(0);
    expect(capForSamples(2500, "b", rule)).toBe(2500);
  });

  it("applies per supplier in delivery groups and the charged total", () => {
    const items = [
      { id: "i1", vendor_id: "a", product_id: "p1", quantity: 1, unit_price: 500 },
      { id: "i2", vendor_id: "b", product_id: "p2", quantity: 10, unit_price: 600 },
    ];
    const sampleShipping = sampleShippingRule(
      [
        { vendor_id: "a", is_sample: true },
        { vendor_id: "b", is_sample: false },
      ],
      1000,
    );
    const base = {
      items,
      rates,
      zoneId: null,
      vendorHolidays: new Set<string>(),
      subtotalFils: 6500,
    };
    expect(selectedShippingFils(base)).toBe(5000);
    expect(selectedShippingFils({ ...base, sampleShipping })).toBe(3500);
    const groups = formDeliveryGroups({ ...base, sampleShipping });
    expect(groups[0]?.methods[0]?.price_fils).toBe(3500);
  });
});
