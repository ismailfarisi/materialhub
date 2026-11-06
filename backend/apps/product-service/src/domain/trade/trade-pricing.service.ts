// trade-pricing.service.ts
// Reads and writes a listing's trade pricing: unit of measure, minimum order,
// order increment, quantity-break tiers, and its sample variant.
import { AppDataSource, Product, ProductVariant, VariantPriceTier } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { type EntityManager, IsNull } from "typeorm";
import type { InventoryService } from "../inventory/inventory.service.ts";
import { enqueueSearchSync } from "../search/search-sync.job.ts";
import {
  type SampleInput,
  type TradeTermsInput,
  type ValidTradeTerms,
  validateSample,
  validateTradeTerms,
} from "./trade-pricing.validation.ts";

/** option_values of the sample variant; keeps it out of the normal option axes. */
export const SAMPLE_OPTION_VALUES = { sample: "sample" } as const;

export interface TradeTermsView extends Omit<ValidTradeTerms, "tiers"> {
  variant_id: string | null;
  name: string | null;
  sku: string | null;
  price: number;
  tiers: { min_quantity: number; unit_price: number }[];
}

export interface TradePricingView {
  product_id: string;
  has_variants: boolean;
  /** Product-level terms; used only when the product has no variants. */
  product: TradeTermsView;
  variants: TradeTermsView[];
  sample: {
    variant_id: string;
    enabled: boolean;
    price: number;
    max_quantity: number | null;
    sku: string | null;
  } | null;
}

function termsOf(
  src: Product | ProductVariant,
  variantId: string | null,
  tiers: VariantPriceTier[],
): TradeTermsView {
  return {
    variant_id: variantId,
    name: variantId ? (src as ProductVariant).name : null,
    sku: src.sku ?? null,
    price: src.price,
    unit_of_measure: src.unit_of_measure ?? null,
    units_per_pack: src.units_per_pack ?? null,
    pack_contents_unit: src.pack_contents_unit ?? null,
    min_order_quantity: src.min_order_quantity ?? 1,
    order_increment: src.order_increment ?? 1,
    tiers: tiers
      .filter((t) => (variantId ? t.variant_id === variantId : t.variant_id === null))
      .sort((a, b) => a.min_quantity - b.min_quantity)
      .map((t) => ({ min_quantity: t.min_quantity, unit_price: t.unit_price })),
  };
}

export class TradePricingService {
  constructor(
    private readonly inventoryService: Pick<InventoryService, "restock">,
    private readonly syncProduct: (productId: string) => Promise<void>,
  ) {}

  private async ownedProduct(manager: EntityManager, productId: string, vendorId: string | null) {
    const product = await manager.findOne(Product, { where: { id: productId } });
    if (!product || (vendorId && product.vendor_id !== vendorId)) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
    return product;
  }

  async get(productId: string, vendorId: string | null): Promise<TradePricingView> {
    const manager = AppDataSource.manager;
    const product = await this.ownedProduct(manager, productId, vendorId);
    const variants = await manager.find(ProductVariant, {
      where: { product_id: productId },
      order: { sort_order: "ASC" },
    });
    const tiers = await manager.find(VariantPriceTier, { where: { product_id: productId } });
    const sample = variants.find((v) => v.is_sample) ?? null;
    return {
      product_id: productId,
      has_variants: product.has_variants,
      product: termsOf(product, null, tiers),
      variants: variants.filter((v) => !v.is_sample).map((v) => termsOf(v, v.id, tiers)),
      sample: sample
        ? {
            variant_id: sample.id,
            enabled: sample.is_active,
            price: sample.price,
            max_quantity: sample.sample_max_quantity ?? null,
            sku: sample.sku ?? null,
          }
        : null,
    };
  }

  /**
   * Save the terms of one sellable: a variant (`variant_id`), or the product
   * itself when `variant_id` is null. Sending `tiers` replaces the tier table;
   * leaving it out keeps the current tiers (re-checked against the new terms).
   */
  async set(
    productId: string,
    vendorId: string | null,
    input: TradeTermsInput & { variant_id?: string | null },
  ): Promise<TradePricingView> {
    await AppDataSource.transaction(async (manager) => {
      const product = await this.ownedProduct(manager, productId, vendorId);
      const variantId = input.variant_id ?? null;
      let target: Product | ProductVariant = product;
      if (variantId) {
        const variant = await manager.findOne(ProductVariant, {
          where: { id: variantId, product_id: productId },
        });
        if (!variant) throw new HttpError(404, "Variant not found", "VARIANT_NOT_FOUND");
        if (variant.is_sample) {
          throw new HttpError(422, "Samples have no trade terms", "SAMPLE_HAS_NO_TRADE_TERMS");
        }
        target = variant;
      }

      const tierWhere = { product_id: productId, variant_id: variantId ?? IsNull() };
      const existingTiers = await manager.find(VariantPriceTier, { where: tierWhere });
      const valid = validateTradeTerms(
        {
          ...input,
          tiers:
            input.tiers ??
            existingTiers.map((t) => ({ min_quantity: t.min_quantity, unit_price: t.unit_price })),
        },
        target,
        target.price,
      );

      target.unit_of_measure = valid.unit_of_measure;
      target.units_per_pack = valid.units_per_pack;
      target.pack_contents_unit = valid.pack_contents_unit;
      target.min_order_quantity = valid.min_order_quantity;
      target.order_increment = valid.order_increment;
      await manager.save(target);

      if (input.tiers !== undefined) {
        await manager.delete(VariantPriceTier, tierWhere);
        if (valid.tiers?.length) {
          await manager.save(
            VariantPriceTier,
            valid.tiers.map((t) =>
              manager.create(VariantPriceTier, {
                product_id: productId,
                variant_id: variantId,
                min_quantity: t.min_quantity,
                unit_price: t.unit_price,
              }),
            ),
          );
        }
      }
    });
    await enqueueSearchSync({ type: "upsert_by_product_id", productId });
    return this.get(productId, vendorId);
  }

  /**
   * Turn the product's sample on or off. A sample is a variant flagged
   * `is_sample`: it is ordered one unit at a time up to its cap, ships at the
   * admin-set sample rate, has no tiers and never sets the listing's price.
   * Turning it off deactivates the variant (order history keeps pointing at it).
   */
  async setSample(
    productId: string,
    vendorId: string | null,
    input: SampleInput,
  ): Promise<TradePricingView> {
    validateSample(input);
    const restock = await AppDataSource.transaction(async (manager) => {
      const product = await this.ownedProduct(manager, productId, vendorId);
      let sample = await manager.findOne(ProductVariant, {
        where: { product_id: productId, is_sample: true },
      });
      if (!input.enabled) {
        if (sample?.is_active) {
          sample.is_active = false;
          await manager.save(sample);
        }
        return null;
      }
      if (!sample) {
        const count = await manager.count(ProductVariant, { where: { product_id: productId } });
        sample = manager.create(ProductVariant, {
          product_id: productId,
          name: "Sample",
          sku: input.sku?.trim() || `${productId.slice(0, 8)}-sample`,
          option_values: { ...SAMPLE_OPTION_VALUES },
          price: input.price ?? 0,
          is_active: true,
          is_sample: true,
          sort_order: count,
          min_order_quantity: 1,
          order_increment: 1,
          unit_of_measure: null,
        });
      }
      sample.is_active = true;
      sample.price = input.price ?? sample.price;
      sample.sample_max_quantity = input.max_quantity ?? null;
      if (input.sku !== undefined) sample.sku = input.sku?.trim() || sample.sku;
      sample = await manager.save(sample);
      return input.quantity_on_hand && input.quantity_on_hand > 0
        ? { vendorId: product.vendor_id, variantId: sample.id, quantity: input.quantity_on_hand }
        : null;
    });
    if (restock) {
      await this.inventoryService.restock(restock.vendorId, {
        product_id: productId,
        variant_id: restock.variantId,
        quantity: restock.quantity,
      });
    }
    await this.syncProduct(productId);
    return this.get(productId, vendorId);
  }
}
