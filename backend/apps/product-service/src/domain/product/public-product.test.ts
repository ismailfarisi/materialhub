import { describe, expect, test } from "bun:test";
import { toPublicProductDetail } from "./public-product.ts";

describe("toPublicProductDetail", () => {
  test("strips vendor money/compliance fields and stock internals", () => {
    const out: any = toPublicProductDetail({
      id: "p1",
      vendor: {
        id: "v1",
        name: "MaterialHub Eco Supply",
        slug: "materialhub-eco-supply",
        rating_avg: 4.6,
        stripe_account_id: "acct_123",
        commission_value: 12,
        commission_tiers: [{ rate: 10 }],
        total_sales: 9_999_00,
        minimum_payout: 10_000,
        trade_license_number: "CN-123",
        rejection_reason: "x",
        verified_by: "admin-1",
        contact_email: "ops@vendor.ae",
      },
      inventoryRecords: [
        {
          variant_id: null,
          quantity_on_hand: 50,
          quantity_reserved: 8,
          warehouse_id: "wh1",
          reorder_point: 5,
        },
        { variant_id: "s1", quantity_on_hand: 3, quantity_reserved: 5 },
      ],
    });
    expect(out.vendor).toEqual({
      id: "v1",
      name: "MaterialHub Eco Supply",
      slug: "materialhub-eco-supply",
      rating_avg: 4.6,
    });
    expect(out.inventoryRecords).toEqual([
      { variant_id: null, quantity_available: 42 },
      { variant_id: "s1", quantity_available: 0 },
    ]);
  });
});

import { applyProductTranslation } from "./public-product.ts";

describe("applyProductTranslation", () => {
  test("overlays non-blank translated fields and keeps English for blanks", () => {
    const p: any = applyProductTranslation(
      { name: "Greyboard 2mm", description: "Rigid board", meta_title: "Greyboard" },
      { name: "كرتون رمادي 2 مم", description: "  ", meta_title: null },
    );
    expect(p.name).toBe("كرتون رمادي 2 مم");
    expect(p.description).toBe("Rigid board");
    expect(p.meta_title).toBe("Greyboard");
  });
});
