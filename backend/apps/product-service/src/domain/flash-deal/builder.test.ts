import { describe, expect, test } from "bun:test";
import { buildFlashDealEntity, deriveDiscountPercentage } from "./builder.ts";

describe("deriveDiscountPercentage", () => {
  test("25% discount: 7500 from 10000", () => {
    expect(deriveDiscountPercentage(10000, 7500)).toBe(25);
  });
  test("rounds to 2 decimals: 199 from 300 → 33.67", () => {
    expect(deriveDiscountPercentage(300, 199)).toBe(33.67);
  });
  test("99% discount: 100 from 10000", () => {
    expect(deriveDiscountPercentage(10000, 100)).toBe(99);
  });
});

describe("buildFlashDealEntity", () => {
  const VENDOR = "00000000-0000-0000-0000-00000000000a";
  const PRODUCT = "00000000-0000-0000-0000-0000000000a1";
  const startsAt = new Date("2026-06-01T00:00:00Z");
  const expiresAt = new Date("2026-06-08T00:00:00Z");

  test("builds entity with derived discount and supplied vendor", () => {
    const entity = buildFlashDealEntity(
      {
        product_id: PRODUCT,
        variant_id: null,
        title: "Summer sale",
        deal_price: 7500,
        original_price: 10000,
        quantity_limit: null,
        starts_at: startsAt,
        expires_at: expiresAt,
        is_active: true,
      },
      VENDOR,
    );
    expect(entity.product_id).toBe(PRODUCT);
    expect(entity.vendor_id).toBe(VENDOR);
    expect(entity.title).toBe("Summer sale");
    expect(entity.deal_price).toBe(7500);
    expect(entity.original_price).toBe(10000);
    expect(entity.discount_percentage).toBe(25);
    expect(entity.quantity_limit).toBeNull();
    expect(entity.is_active).toBe(true);
    expect(entity.starts_at).toEqual(startsAt);
    expect(entity.expires_at).toEqual(expiresAt);
  });

  test("propagates variant_id when set", () => {
    const variantId = "00000000-0000-0000-0000-0000000000a2";
    const entity = buildFlashDealEntity(
      {
        product_id: PRODUCT,
        variant_id: variantId,
        title: "x",
        deal_price: 100,
        original_price: 200,
        quantity_limit: 50,
        starts_at: startsAt,
        expires_at: expiresAt,
        is_active: false,
      },
      VENDOR,
    );
    expect(entity.variant_id).toBe(variantId);
    expect(entity.quantity_limit).toBe(50);
    expect(entity.is_active).toBe(false);
  });
});
