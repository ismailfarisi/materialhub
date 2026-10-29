import type { FlashDeal } from "@materialhub/database";
import type { DeepPartial } from "typeorm";

export function deriveDiscountPercentage(originalPrice: number, dealPrice: number): number {
  return Number((((originalPrice - dealPrice) / originalPrice) * 100).toFixed(2));
}

export interface FlashDealBuildInput {
  product_id: string;
  variant_id: string | null;
  title: string;
  deal_price: number;
  original_price: number;
  quantity_limit: number | null;
  starts_at: Date;
  expires_at: Date;
  is_active: boolean;
}

export function buildFlashDealEntity(
  input: FlashDealBuildInput,
  vendorId: string,
): DeepPartial<FlashDeal> {
  return {
    product_id: input.product_id,
    variant_id: input.variant_id,
    vendor_id: vendorId,
    title: input.title,
    deal_price: input.deal_price,
    original_price: input.original_price,
    discount_percentage: deriveDiscountPercentage(input.original_price, input.deal_price),
    quantity_limit: input.quantity_limit,
    starts_at: input.starts_at,
    expires_at: input.expires_at,
    is_active: input.is_active,
  };
}
