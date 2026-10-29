import { describe, expect, it } from "bun:test";
import type { DgRate } from "./delivery-groups.ts";
import { selectedShippingFils } from "./shipping-total.ts";

const item = (id: string, vendor_id: string) => ({
  id,
  vendor_id,
  product_id: `p-${id}`,
  quantity: 1,
  unit_price: 5000,
});

const rate = (over: Partial<DgRate>): DgRate => ({
  id: "r1",
  vendor_id: null,
  zone_id: null,
  method: "standard",
  base_cost: 1500,
  per_kg_cost: null,
  free_above: null,
  estimated_days_min: 2,
  estimated_days_max: 4,
  ...over,
});

describe("selectedShippingFils", () => {
  it("returns 0 when there are no items", () => {
    expect(
      selectedShippingFils({
        items: [],
        rates: [rate({})],
        zoneId: null,
        vendorHolidays: new Set(),
        subtotalFils: 9000,
      }),
    ).toBe(0);
  });

  it("charges the platform-default base_cost for a single vendor", () => {
    expect(
      selectedShippingFils({
        items: [item("i1", "v1")],
        rates: [rate({})],
        zoneId: null,
        vendorHolidays: new Set(),
        subtotalFils: 9000,
      }),
    ).toBe(1500);
  });

  it("is free above the rate's free_above threshold", () => {
    expect(
      selectedShippingFils({
        items: [item("i1", "v1")],
        rates: [rate({ free_above: 15000 })],
        zoneId: null,
        vendorHolidays: new Set(),
        subtotalFils: 20000,
      }),
    ).toBe(0);
  });

  it("picks the cheapest method when multiple exist", () => {
    expect(
      selectedShippingFils({
        items: [item("i1", "v1")],
        rates: [
          rate({ method: "standard", base_cost: 1500 }),
          rate({ id: "r2", method: "express", base_cost: 3000 }),
        ],
        zoneId: null,
        vendorHolidays: new Set(),
        subtotalFils: 9000,
      }),
    ).toBe(1500);
  });
});
