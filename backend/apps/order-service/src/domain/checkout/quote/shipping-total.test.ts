import { describe, expect, it } from "bun:test";
import type { DgRate } from "./delivery-groups.ts";
import {
  reconcileVendorShipping,
  selectedShippingByVendor,
  selectedShippingFils,
} from "./shipping-total.ts";

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

describe("selectedShippingByVendor", () => {
  const base = { zoneId: null, vendorHolidays: new Set<string>(), subtotalFils: 9000 };

  it("gives each vendor its own rate and adds up to the charged total", () => {
    const input = {
      ...base,
      items: [item("i1", "v1"), item("i2", "v2"), item("i3", "v2")],
      rates: [rate({}), rate({ id: "r2", vendor_id: "v2", base_cost: 2500 })],
    };
    const byVendor = selectedShippingByVendor(input);
    expect(byVendor).toEqual({ v1: 1500, v2: 2500 });
    expect(byVendor.v1! + byVendor.v2!).toBe(selectedShippingFils(input));
  });

  it("uses the method the merged group chose, not each vendor's own cheapest", () => {
    // v1: standard 1,000 / express 2,000; v2: standard 3,000 / express 1,500.
    // Grouped together: standard 4,000 vs express 3,500 -> express.
    const input = {
      ...base,
      items: [item("i1", "v1"), item("i2", "v2")],
      rates: [
        rate({ id: "a", vendor_id: "v1", method: "standard", base_cost: 1000 }),
        rate({ id: "b", vendor_id: "v1", method: "express", base_cost: 2000 }),
        rate({ id: "c", vendor_id: "v2", method: "standard", base_cost: 3000 }),
        rate({ id: "d", vendor_id: "v2", method: "express", base_cost: 1500 }),
      ],
    };
    expect(selectedShippingFils(input)).toBe(3500);
    expect(selectedShippingByVendor(input)).toEqual({ v1: 2000, v2: 1500 });
  });

  it("a vendor with no shippable method gets 0", () => {
    const input = { ...base, items: [item("i1", "v1")], rates: [] };
    expect(selectedShippingByVendor(input)).toEqual({ v1: 0 });
  });
});

describe("reconcileVendorShipping", () => {
  it("is a no-op when the parts already add up", () => {
    expect(reconcileVendorShipping({ v1: 1500, v2: 2500 }, 4000)).toEqual({ v1: 1500, v2: 2500 });
  });
  it("rescales to the exact total, integer fils", () => {
    const out = reconcileVendorShipping({ v1: 1000, v2: 2000 }, 1001);
    expect(out.v1! + out.v2!).toBe(1001);
    expect(Number.isInteger(out.v1)).toBe(true);
  });
  it("splits evenly when every part is 0", () => {
    expect(reconcileVendorShipping({ v1: 0, v2: 0 }, 3)).toEqual({ v1: 2, v2: 1 });
  });
});
