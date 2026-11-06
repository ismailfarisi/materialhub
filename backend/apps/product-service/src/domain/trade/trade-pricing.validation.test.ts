import { describe, expect, it } from "bun:test";
import { HttpError } from "@materialhub/plugins";
import { validateSample, validateTradeTerms } from "./trade-pricing.validation.ts";

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof HttpError ? e.code : String(e);
  }
}

describe("validateTradeTerms", () => {
  it("defaults to single units with no unit stated", () => {
    expect(validateTradeTerms({}, {}, 600)).toEqual({
      unit_of_measure: null,
      units_per_pack: null,
      pack_contents_unit: null,
      min_order_quantity: 1,
      order_increment: 1,
    });
  });

  it("accepts a carton of 500 sheets with sorted, descending tiers", () => {
    const v = validateTradeTerms(
      {
        unit_of_measure: "carton",
        units_per_pack: 500,
        pack_contents_unit: "sheet",
        min_order_quantity: 2,
        order_increment: 1,
        tiers: [
          { min_quantity: 20, unit_price: 10000 },
          { min_quantity: 5, unit_price: 11000 },
        ],
      },
      {},
      12000,
    );
    expect(v.tiers).toEqual([
      { min_quantity: 5, unit_price: 11000 },
      { min_quantity: 20, unit_price: 10000 },
    ]);
  });

  it("keeps current values for fields a partial update leaves out", () => {
    const v = validateTradeTerms(
      { order_increment: 10 },
      { unit_of_measure: "sheet" as any, min_order_quantity: 50 },
      600,
    );
    expect(v).toMatchObject({
      unit_of_measure: "sheet",
      min_order_quantity: 50,
      order_increment: 10,
    });
  });

  it.each([
    [{ unit_of_measure: "litre" }, "INVALID_UNIT_OF_MEASURE"],
    [{ min_order_quantity: 0 }, "INVALID_MIN_ORDER_QUANTITY"],
    [{ min_order_quantity: 1.5 }, "INVALID_MIN_ORDER_QUANTITY"],
    [{ order_increment: 0 }, "INVALID_ORDER_INCREMENT"],
    [
      { unit_of_measure: "sheet", units_per_pack: 100, pack_contents_unit: "sheet" },
      "INVALID_UNITS_PER_PACK",
    ],
    [{ unit_of_measure: "pack", units_per_pack: 100 }, "INVALID_PACK_CONTENTS_UNIT"],
    [
      { min_order_quantity: 10, tiers: [{ min_quantity: 10, unit_price: 500 }] },
      "TIER_BELOW_MIN_ORDER",
    ],
    [{ tiers: [{ min_quantity: 10, unit_price: 600 }] }, "TIER_PRICE_NOT_LOWER"],
    [
      {
        tiers: [
          { min_quantity: 10, unit_price: 500 },
          { min_quantity: 50, unit_price: 550 },
        ],
      },
      "TIER_PRICE_NOT_LOWER",
    ],
    [
      {
        tiers: [
          { min_quantity: 10, unit_price: 500 },
          { min_quantity: 10, unit_price: 400 },
        ],
      },
      "DUPLICATE_PRICE_TIER",
    ],
    [{ tiers: [{ min_quantity: 10, unit_price: 4.5 }] }, "INVALID_TIER_PRICE"],
    [
      {
        tiers: Array.from({ length: 11 }, (_, i) => ({ min_quantity: i + 2, unit_price: 500 - i })),
      },
      "TOO_MANY_PRICE_TIERS",
    ],
  ] as const)("rejects %j with %s", (input, code) => {
    expect(codeOf(() => validateTradeTerms(input as any, {}, 600))).toBe(code);
  });
});

describe("validateSample", () => {
  it("accepts a priced sample, a free one, and turning it off", () => {
    expect(codeOf(() => validateSample({ enabled: true, price: 500, max_quantity: 3 }))).toBeNull();
    expect(codeOf(() => validateSample({ enabled: true, price: 0 }))).toBeNull();
    expect(codeOf(() => validateSample({ enabled: false }))).toBeNull();
  });

  it("needs a price and a sensible cap", () => {
    expect(codeOf(() => validateSample({ enabled: true }))).toBe("INVALID_SAMPLE_PRICE");
    expect(codeOf(() => validateSample({ enabled: true, price: 100, max_quantity: 50 }))).toBe(
      "INVALID_SAMPLE_MAX_QUANTITY",
    );
  });
});
