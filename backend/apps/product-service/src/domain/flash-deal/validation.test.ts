import { describe, expect, test } from "bun:test";
import {
  type ExistingDeal,
  checkOverlapAgainstSet,
  validatePriceRange,
  validateProductOwnership,
  validateVariantBelongsToProduct,
} from "./validation.ts";

const VENDOR_A = "00000000-0000-0000-0000-00000000000a";
const VENDOR_B = "00000000-0000-0000-0000-00000000000b";
const PRODUCT = "00000000-0000-0000-0000-0000000000a1";
const VARIANT = "00000000-0000-0000-0000-0000000000a2";
const OTHER_PRODUCT = "00000000-0000-0000-0000-0000000000b1";

describe("validateProductOwnership", () => {
  test("null payload vendor_id → null (caller didn't claim a vendor)", () => {
    expect(validateProductOwnership(null, VENDOR_A)).toBeNull();
  });
  test("payload vendor matches product owner → null", () => {
    expect(validateProductOwnership(VENDOR_A, VENDOR_A)).toBeNull();
  });
  test("payload vendor mismatches product owner → VENDOR_MISMATCH", () => {
    const err = validateProductOwnership(VENDOR_B, VENDOR_A);
    expect(err?.errorCode).toBe("vendor_mismatch");
  });
});

describe("validateVariantBelongsToProduct", () => {
  test("variant_id null → null (no variant requested)", () => {
    expect(validateVariantBelongsToProduct(null, undefined, PRODUCT)).toBeNull();
  });
  test("variant_id belongs to product → null", () => {
    expect(validateVariantBelongsToProduct(VARIANT, PRODUCT, PRODUCT)).toBeNull();
  });
  test("variant_id belongs to different product → VARIANT_MISMATCH", () => {
    const err = validateVariantBelongsToProduct(VARIANT, OTHER_PRODUCT, PRODUCT);
    expect(err?.errorCode).toBe("variant_mismatch");
  });
  test("variant_id supplied but variant not found → VARIANT_MISMATCH", () => {
    const err = validateVariantBelongsToProduct(VARIANT, undefined, PRODUCT);
    expect(err?.errorCode).toBe("variant_mismatch");
  });
});

describe("validatePriceRange", () => {
  test("deal < original, both > 0 → null", () => {
    expect(validatePriceRange(7500, 10000)).toBeNull();
  });
  test("deal == original → INVALID_PRICE", () => {
    expect(validatePriceRange(10000, 10000)?.errorCode).toBe("invalid_price");
  });
  test("deal > original → INVALID_PRICE", () => {
    expect(validatePriceRange(11000, 10000)?.errorCode).toBe("invalid_price");
  });
  test("deal_price <= 0 → INVALID_PRICE", () => {
    expect(validatePriceRange(0, 10000)?.errorCode).toBe("invalid_price");
    expect(validatePriceRange(-1, 10000)?.errorCode).toBe("invalid_price");
  });
  test("original_price <= 0 → INVALID_PRICE", () => {
    expect(validatePriceRange(7500, 0)?.errorCode).toBe("invalid_price");
  });
});

describe("checkOverlapAgainstSet", () => {
  const baseStart = new Date("2026-06-01T00:00:00Z");
  const baseEnd = new Date("2026-06-08T00:00:00Z");

  function makeExisting(overrides: Partial<ExistingDeal> = {}): ExistingDeal {
    return {
      id: "existing-1",
      product_id: PRODUCT,
      variant_id: null,
      starts_at: baseStart,
      expires_at: baseEnd,
      ...overrides,
    };
  }

  test("no existing deals → null", () => {
    expect(checkOverlapAgainstSet(PRODUCT, null, baseStart, baseEnd, [])).toBeNull();
  });
  test("disjoint windows on same product → null", () => {
    const existing = [makeExisting()];
    const startsAfter = new Date("2026-06-09T00:00:00Z");
    const endsAfter = new Date("2026-06-15T00:00:00Z");
    expect(checkOverlapAgainstSet(PRODUCT, null, startsAfter, endsAfter, existing)).toBeNull();
  });
  test("overlapping windows on same product, both product-level → OVERLAPPING_FLASH_DEAL", () => {
    const existing = [makeExisting()];
    const startsInside = new Date("2026-06-03T00:00:00Z");
    const endsAfter = new Date("2026-06-15T00:00:00Z");
    const err = checkOverlapAgainstSet(PRODUCT, null, startsInside, endsAfter, existing);
    expect(err?.errorCode).toBe("overlapping_flash_deal");
  });
  test("variant-level deal vs product-level deal on same product → conflicts", () => {
    const existing = [makeExisting({ variant_id: null })];
    const err = checkOverlapAgainstSet(PRODUCT, VARIANT, baseStart, baseEnd, existing);
    expect(err?.errorCode).toBe("overlapping_flash_deal");
  });
  test("variant-level deal vs same variant on same product → conflicts", () => {
    const existing = [makeExisting({ variant_id: VARIANT })];
    const err = checkOverlapAgainstSet(PRODUCT, VARIANT, baseStart, baseEnd, existing);
    expect(err?.errorCode).toBe("overlapping_flash_deal");
  });
  test("variant-level deals on different variants of same product → no conflict", () => {
    const existing = [makeExisting({ variant_id: "00000000-0000-0000-0000-0000000000aa" })];
    const err = checkOverlapAgainstSet(PRODUCT, VARIANT, baseStart, baseEnd, existing);
    expect(err).toBeNull();
  });
  test("excludeId skips the matching existing deal (used by update)", () => {
    const existing = [makeExisting({ id: "deal-being-updated" })];
    expect(
      checkOverlapAgainstSet(PRODUCT, null, baseStart, baseEnd, existing, "deal-being-updated"),
    ).toBeNull();
  });
  test("conflict against an in-batch synthetic id → still reported", () => {
    const existing = [makeExisting({ id: "_pending:5" })];
    const err = checkOverlapAgainstSet(PRODUCT, null, baseStart, baseEnd, existing);
    expect(err?.errorCode).toBe("overlapping_flash_deal");
  });
});
