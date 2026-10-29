import type { RowError } from "@materialhub/bulk-jobs";

export interface ExistingDeal {
  id: string;
  product_id: string;
  variant_id: string | null;
  starts_at: Date;
  expires_at: Date;
}

export const baseError = (errorCode: string, errorMessage: string, field: string): RowError => ({
  rowNumber: 0,
  sheetName: null,
  errorCode,
  errorMessage,
  field,
  rowSnapshot: {},
});

export function validateProductOwnership(
  payloadVendorId: string | null,
  productVendorId: string,
): RowError | null {
  if (payloadVendorId === null) return null;
  if (payloadVendorId === productVendorId) return null;
  return baseError(
    "vendor_mismatch",
    "Selected product belongs to a different vendor",
    "product_id",
  );
}

export function validateVariantBelongsToProduct(
  variantId: string | null,
  variantOwnerProductId: string | undefined,
  productId: string,
): RowError | null {
  if (variantId === null) return null;
  if (variantOwnerProductId === productId) return null;
  return baseError(
    "variant_mismatch",
    "Selected variant doesn't belong to this product",
    "variant_id",
  );
}

export function validatePriceRange(dealPrice: number, originalPrice: number): RowError | null {
  if (dealPrice <= 0 || originalPrice <= 0) {
    return baseError("invalid_price", "Prices must be positive integers (fils)", "deal_price");
  }
  if (dealPrice >= originalPrice) {
    return baseError("invalid_price", "deal_price must be less than original_price", "deal_price");
  }
  return null;
}

export function checkOverlapAgainstSet(
  productId: string,
  variantId: string | null,
  startsAt: Date,
  expiresAt: Date,
  existingActiveDeals: ExistingDeal[],
  excludeId?: string,
): RowError | null {
  for (const existing of existingActiveDeals) {
    if (existing.id === excludeId) continue;
    if (existing.product_id !== productId) continue;
    // Variant overlap rule (matches FlashDealService.checkOverlap):
    //   variantId provided  → conflict if existing.variant_id === variantId OR existing.variant_id IS NULL
    //   variantId null      → conflict only if existing.variant_id IS NULL
    if (variantId !== null) {
      if (existing.variant_id !== null && existing.variant_id !== variantId) continue;
    } else {
      if (existing.variant_id !== null) continue;
    }
    // Window overlap (half-open): existing.starts_at < expires_at AND existing.expires_at > startsAt
    if (existing.starts_at < expiresAt && existing.expires_at > startsAt) {
      return baseError(
        "overlapping_flash_deal",
        "An active flash deal already exists for this product/variant in the given time range",
        "starts_at",
      );
    }
  }
  return null;
}
