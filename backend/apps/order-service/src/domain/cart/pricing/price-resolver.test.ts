import { describe, expect, it } from "bun:test";
import { lowestUnitPrice, normaliseTiers, resolveLinePrice, tierFor } from "./price-resolver.ts";

// Greyboard 2.0 mm, 70 × 100 cm: AED 6.00 / sheet, 5.40 from 50, 4.80 from 200.
const tiers = [
  { min_quantity: 200, unit_price: 480 },
  { min_quantity: 50, unit_price: 540 },
];

describe("resolveLinePrice", () => {
  it("charges the base price below the first tier", () => {
    const r = resolveLinePrice({ basePrice: 600, tiers, quantity: 49 });
    expect(r).toMatchObject({
      unitPrice: 600,
      lineTotal: 29400,
      source: "base",
      tier: null,
      savingsFils: 0,
    });
    expect(r.nextTier).toEqual({ min_quantity: 50, unit_price: 540, units_to_go: 1 });
  });

  it("switches to a tier exactly at its minimum quantity", () => {
    const r = resolveLinePrice({ basePrice: 600, tiers, quantity: 50 });
    expect(r).toMatchObject({
      unitPrice: 540,
      lineTotal: 27000,
      source: "tier",
      savingsFils: 3000,
    });
    expect(r.tier).toEqual({ min_quantity: 50, unit_price: 540 });
    expect(r.nextTier?.min_quantity).toBe(200);
  });

  it("uses the highest tier reached", () => {
    const r = resolveLinePrice({ basePrice: 600, tiers, quantity: 1000 });
    expect(r.unitPrice).toBe(480);
    expect(r.lineTotal).toBe(480000);
    expect(r.nextTier).toBeNull();
  });

  it("never lets a tier raise the price above base", () => {
    const r = resolveLinePrice({ basePrice: 500, tiers, quantity: 60 });
    expect(r).toMatchObject({ unitPrice: 500, source: "base", savingsFils: 0 });
    expect(r.nextTier?.unit_price).toBe(480);
  });

  it("charges base when there are no tiers", () => {
    expect(resolveLinePrice({ basePrice: 1250, tiers: [], quantity: 3 })).toMatchObject({
      unitPrice: 1250,
      lineTotal: 3750,
      source: "base",
      nextTier: null,
    });
  });

  it("RFQ hook: a quoted unit price wins over tiers and base", () => {
    const r = resolveLinePrice({ basePrice: 600, tiers, quantity: 500, quotedUnitPrice: 450 });
    expect(r).toMatchObject({ unitPrice: 450, source: "quote", tier: null, nextTier: null });
    expect(r.savingsFils).toBe(75000);
  });

  it("ignores a null quote", () => {
    expect(
      resolveLinePrice({ basePrice: 600, tiers, quantity: 500, quotedUnitPrice: null }).source,
    ).toBe("tier");
  });

  it("works only in integer fils", () => {
    const r = resolveLinePrice({ basePrice: 600.7, tiers: [], quantity: 2.9 });
    expect(r.unitPrice).toBe(600);
    expect(r.lineTotal).toBe(1200);
  });
});

describe("tier helpers", () => {
  it("sorts, de-duplicates and drops invalid tiers", () => {
    expect(
      normaliseTiers([
        { min_quantity: 100, unit_price: 400 },
        { min_quantity: 1, unit_price: 100 },
        { min_quantity: 10, unit_price: -5 },
        { min_quantity: 10, unit_price: 500 },
      ]),
    ).toEqual([
      { min_quantity: 10, unit_price: 500 },
      { min_quantity: 100, unit_price: 400 },
    ]);
  });

  it("tierFor returns null below every tier", () => {
    expect(tierFor(tiers, 10, 600)).toBeNull();
  });

  it("lowestUnitPrice is the 'from' price", () => {
    expect(lowestUnitPrice(600, tiers)).toBe(480);
    expect(lowestUnitPrice(600, [])).toBe(600);
  });
});

describe("resolveLinePrice: a quote never costs more than the listing", () => {
  // Greyboard sheet: base 450 fils; 100+ at 400; 500+ at 350.
  const tiers = [
    { min_quantity: 100, unit_price: 400 },
    { min_quantity: 500, unit_price: 350 },
  ];

  it("uses the quoted price when it beats the listing's tier", () => {
    const r = resolveLinePrice({ basePrice: 450, tiers, quantity: 2000, quotedUnitPrice: 300 });
    expect(r.unitPrice).toBe(300);
    expect(r.source).toBe("quote");
  });

  it("falls back to the tier price when the quote is higher (E2E: 380 quoted vs 350 tier)", () => {
    const r = resolveLinePrice({ basePrice: 450, tiers, quantity: 2000, quotedUnitPrice: 380 });
    expect(r.unitPrice).toBe(350);
    expect(r.lineTotal).toBe(700_000);
    expect(r.source).toBe("tier");
  });

  it("caps at the base price when no tier applies", () => {
    const r = resolveLinePrice({ basePrice: 450, tiers, quantity: 10, quotedUnitPrice: 500 });
    expect(r.unitPrice).toBe(450);
    expect(r.source).toBe("base");
  });
});
