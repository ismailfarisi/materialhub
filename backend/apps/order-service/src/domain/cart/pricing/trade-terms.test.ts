import { describe, expect, it } from "bun:test";
import { HttpError } from "@materialhub/plugins";
import {
  DEFAULT_SAMPLE_MAX_QUANTITY,
  assertQuantity,
  checkQuantity,
  nextValidQuantity,
  tradeTermsFor,
} from "./trade-terms.ts";

const product = {
  price: 900,
  unit_of_measure: "roll",
  min_order_quantity: 1,
  order_increment: 1,
};
const variant = {
  id: "v-carton",
  price: 12000,
  unit_of_measure: "carton",
  units_per_pack: 500,
  pack_contents_unit: "sheet",
  min_order_quantity: 2,
  order_increment: 2,
  is_sample: false,
};
const tierRows = [
  { variant_id: "v-carton", min_quantity: 10, unit_price: 11000 },
  { variant_id: "v-other", min_quantity: 10, unit_price: 1 },
  { variant_id: null, min_quantity: 20, unit_price: 800 },
];

describe("tradeTermsFor", () => {
  it("reads a variant line from the variant and its own tiers", () => {
    const t = tradeTermsFor(product, variant, tierRows);
    expect(t).toMatchObject({
      unit: "carton",
      unitsPerPack: 500,
      packContentsUnit: "sheet",
      minOrderQuantity: 2,
      orderIncrement: 2,
      isSample: false,
      maxQuantity: null,
      basePrice: 12000,
    });
    expect(t.tiers).toEqual([{ min_quantity: 10, unit_price: 11000 }]);
  });

  it("reads a simple product from product columns and product-level tiers", () => {
    const t = tradeTermsFor(product, null, tierRows);
    expect(t.unit).toBe("roll");
    expect(t.basePrice).toBe(900);
    expect(t.tiers).toEqual([{ min_quantity: 20, unit_price: 800 }]);
  });

  it("gives a sample single-unit ordering, a cap and no tiers", () => {
    const t = tradeTermsFor(
      product,
      {
        ...variant,
        id: "v-carton",
        is_sample: true,
        sample_max_quantity: null,
        min_order_quantity: 5,
      },
      tierRows,
    );
    expect(t).toMatchObject({
      isSample: true,
      minOrderQuantity: 1,
      orderIncrement: 1,
      maxQuantity: DEFAULT_SAMPLE_MAX_QUANTITY,
      tiers: [],
    });
  });

  it("falls back to 1 for missing or bad rules", () => {
    const t = tradeTermsFor({ price: 100, min_order_quantity: 0, order_increment: null }, null);
    expect(t.minOrderQuantity).toBe(1);
    expect(t.orderIncrement).toBe(1);
  });
});

describe("checkQuantity", () => {
  // MOQ 50 sheets, then steps of 25.
  const terms = tradeTermsFor(
    { price: 600, unit_of_measure: "sheet", min_order_quantity: 50, order_increment: 25 },
    null,
  );

  it("accepts the minimum and each increment above it", () => {
    for (const q of [50, 75, 100, 525]) expect(checkQuantity(terms, q)).toBeNull();
  });

  it("rejects below the minimum with MIN_ORDER_QUANTITY", () => {
    const v = checkQuantity(terms, 10);
    expect(v?.code).toBe("MIN_ORDER_QUANTITY");
    expect(v?.details).toMatchObject({
      min_order_quantity: 50,
      suggested_quantity: 50,
      unit: "sheet",
    });
    expect(v?.message).toContain("50 × sheet");
  });

  it("rejects off-step quantities with ORDER_INCREMENT and suggests the next step", () => {
    const v = checkQuantity(terms, 60);
    expect(v?.code).toBe("ORDER_INCREMENT");
    expect(v?.details.suggested_quantity).toBe(75);
  });

  it("caps samples with SAMPLE_QUANTITY_CAP", () => {
    const sample = tradeTermsFor(
      { price: 0 },
      { id: "s", price: 500, is_sample: true, sample_max_quantity: 3 },
    );
    expect(checkQuantity(sample, 3)).toBeNull();
    const v = checkQuantity(sample, 4);
    expect(v?.code).toBe("SAMPLE_QUANTITY_CAP");
    expect(v?.details.suggested_quantity).toBe(3);
  });

  it("nextValidQuantity rounds up to a valid step", () => {
    expect(nextValidQuantity(terms, 1)).toBe(50);
    expect(nextValidQuantity(terms, 51)).toBe(75);
    expect(nextValidQuantity(terms, 75)).toBe(75);
  });

  it("assertQuantity throws a 422 HttpError carrying code and details", () => {
    try {
      assertQuantity(terms, 60);
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const err = e as HttpError;
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe("ORDER_INCREMENT");
      expect((err.details as { suggested_quantity: number }).suggested_quantity).toBe(75);
    }
  });
});
