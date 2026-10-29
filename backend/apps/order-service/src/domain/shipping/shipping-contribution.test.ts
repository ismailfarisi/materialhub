import { describe, expect, it } from "bun:test";
import { type ContributionTierRow, resolveShippingContribution } from "./shipping-contribution.ts";

// Global Schedule A defaults, in fils.
const GLOBAL: ContributionTierRow[] = [
  { vendor_id: null, min_order_value: 0, vendor_contribution: 300, is_active: true },
  { vendor_id: null, min_order_value: 2100, vendor_contribution: 500, is_active: true },
  { vendor_id: null, min_order_value: 5100, vendor_contribution: 800, is_active: true },
  { vendor_id: null, min_order_value: 12100, vendor_contribution: 1000, is_active: true },
];

describe("resolveShippingContribution", () => {
  it("picks the band for the subtotal (greatest min_order_value <= subtotal)", () => {
    expect(resolveShippingContribution(0, GLOBAL, "v1")).toBe(300);
    expect(resolveShippingContribution(1500, GLOBAL, "v1")).toBe(300);
    expect(resolveShippingContribution(9000, GLOBAL, "v1")).toBe(800);
  });

  it("treats min_order_value as inclusive lower bound (boundary)", () => {
    expect(resolveShippingContribution(2050, GLOBAL, "v1")).toBe(300); // 20.50 AED -> band 0
    expect(resolveShippingContribution(2100, GLOBAL, "v1")).toBe(500); // 21.00 AED -> band 1
  });

  it("caps at the top band's contribution", () => {
    expect(resolveShippingContribution(30000, GLOBAL, "v1")).toBe(1000);
  });

  it("returns 0 when there are no tiers", () => {
    expect(resolveShippingContribution(9000, [], "v1")).toBe(0);
  });

  it("uses the vendor's override rows instead of global when present", () => {
    const tiers: ContributionTierRow[] = [
      ...GLOBAL,
      { vendor_id: "v1", min_order_value: 0, vendor_contribution: 0, is_active: true },
    ];
    // v1 has a single override band (free) -> 0; global is ignored for v1.
    expect(resolveShippingContribution(9000, tiers, "v1")).toBe(0);
    // v2 has no override -> falls back to global.
    expect(resolveShippingContribution(9000, tiers, "v2")).toBe(800);
  });

  it("ignores inactive rows", () => {
    const tiers: ContributionTierRow[] = [
      { vendor_id: null, min_order_value: 0, vendor_contribution: 300, is_active: true },
      { vendor_id: null, min_order_value: 5100, vendor_contribution: 800, is_active: false },
    ];
    expect(resolveShippingContribution(9000, tiers, "v1")).toBe(300);
  });
});
