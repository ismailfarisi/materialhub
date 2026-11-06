// cart-pricing.service.ts
// The database side of trade pricing: loads price tiers for cart lines and the
// admin-set sample shipping rate. The rules themselves are pure and live in
// trade-terms.ts and price-resolver.ts.
import type { SiteSetting, VariantPriceTier } from "@materialhub/database";
import { In, type Repository } from "typeorm";
import type { PriceTierInput } from "./price-resolver.ts";

/** Used when the `sample_shipping_rate_fils` setting is missing or unreadable. */
export const DEFAULT_SAMPLE_SHIPPING_FILS = 1000;
export const SAMPLE_SHIPPING_SETTING_KEY = "sample_shipping_rate_fils";

export type TierRow = PriceTierInput & { product_id: string; variant_id: string | null };

export interface CartPricingSource {
  /** Every tier of the given products (variant and product-level rows). */
  tiersForProducts(productIds: string[]): Promise<TierRow[]>;
  /** Flat per-supplier shipping for a sample-only shipment, in fils. */
  sampleShippingFils(): Promise<number>;
}

export class CartPricingService implements CartPricingSource {
  constructor(
    private tierRepo: Repository<VariantPriceTier>,
    private siteSettingRepo: Repository<SiteSetting>,
  ) {}

  async tiersForProducts(productIds: string[]): Promise<TierRow[]> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const rows = await this.tierRepo.find({
      where: { product_id: In(ids) },
      order: { min_quantity: "ASC" },
    });
    return rows.map((r) => ({
      product_id: r.product_id,
      variant_id: r.variant_id,
      min_quantity: r.min_quantity,
      unit_price: r.unit_price,
    }));
  }

  async sampleShippingFils(): Promise<number> {
    try {
      const row = await this.siteSettingRepo.findOne({
        where: { key: SAMPLE_SHIPPING_SETTING_KEY },
      });
      const n = Math.trunc(Number(row?.value));
      return row && Number.isFinite(n) && n >= 0 ? n : DEFAULT_SAMPLE_SHIPPING_FILS;
    } catch {
      return DEFAULT_SAMPLE_SHIPPING_FILS;
    }
  }
}

/** For services built without a pricing source (older tests): no tiers, default sample rate. */
export const noTradePricing: CartPricingSource = {
  tiersForProducts: async () => [],
  sampleShippingFils: async () => DEFAULT_SAMPLE_SHIPPING_FILS,
};
