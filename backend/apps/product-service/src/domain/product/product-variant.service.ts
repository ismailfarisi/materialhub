import { AppDataSource, ProductVariant } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { AttributeService } from "../attribute/attribute.service.ts";
import type { InventoryService } from "../inventory/inventory.service.ts";
import { enqueueSearchSync } from "../search/search-sync.job.ts";

const MAX_VARIANTS = 100;

export interface ExplicitVariantInput {
  option_values: Record<string, string>;
  name?: string;
  price: number;
  compare_at_price?: number | null;
  cost_price?: number | null;
  sku?: string;
  barcode?: string | null;
  quantity_on_hand?: number;
}

export class ProductVariantService {
  private readonly attributeService: AttributeService;
  private readonly inventoryService: InventoryService;

  constructor(attributeService: AttributeService, inventoryService: InventoryService) {
    this.attributeService = attributeService;
    this.inventoryService = inventoryService;
  }

  private get repo() {
    return AppDataSource.getRepository(ProductVariant);
  }

  private get productRepo() {
    return AppDataSource.getRepository("Product");
  }

  async generateVariants(
    productId: string,
    vendorId: string | null,
    variantAttributes: Array<{
      attributeId: string;
      valueIds: string[];
    }>,
  ) {
    const product = await this.getOwnedProduct(productId, vendorId);

    // Build cartesian product
    const attrGroups: Array<Array<{ attributeId: string; valueId: string; value: string }>> = [];

    for (const va of variantAttributes) {
      const attr = await this.attributeService.findById(va.attributeId);
      if (!attr.is_variant) {
        throw new HttpError(
          422,
          `Attribute '${attr.name}' is not a variant attribute`,
          "NOT_VARIANT_ATTR",
        );
      }
      const group = va.valueIds.map((vid) => {
        const val = attr.values?.find((v: any) => v.id === vid);
        if (!val) throw new HttpError(404, `Attribute value ${vid} not found`, "VALUE_NOT_FOUND");
        return { attributeId: va.attributeId, valueId: vid, value: val.slug };
      });
      attrGroups.push(group);
    }

    const combinations = this.cartesianProduct(attrGroups);
    if (combinations.length > MAX_VARIANTS) {
      throw new HttpError(
        400,
        `Variant combinations exceed limit of ${MAX_VARIANTS}`,
        "TOO_MANY_VARIANTS",
      );
    }

    // Get existing variants to preserve
    const existing = await this.repo.find({ where: { product_id: productId } });

    const newVariants: ProductVariant[] = [];
    for (const combo of combinations) {
      const optionValues = this.sortOptionValues(
        Object.fromEntries(combo.map((c) => [c.attributeId, c.value])),
      );
      const optionValuesStr = JSON.stringify(optionValues);

      // Check if variant already exists
      const existingVariant = existing.find(
        (v) =>
          JSON.stringify(
            this.sortOptionValues((v.option_values ?? {}) as Record<string, string>),
          ) === optionValuesStr,
      );
      if (existingVariant) continue; // Preserve existing

      const name = combo.map((c) => c.value).join(" / ");
      const sku = `${productId.slice(0, 8)}-${combo.map((c) => c.value).join("-")}`;

      newVariants.push(
        this.repo.create({
          product_id: productId,
          name,
          sku,
          option_values: optionValues,
          // price is required (non-nullable) — inherit from parent product
          price: product.price ?? 0,
          compare_at_price: product.compare_at_price ?? null,
          cost_price: product.cost_price ?? null,
          is_active: true,
          sort_order: existing.length + newVariants.length,
        }),
      );
    }

    if (newVariants.length > 0) {
      await this.repo.save(newVariants);
      await this.syncProductAfterVariantChange(productId);
    }

    return this.repo.find({
      where: { product_id: productId },
      order: { sort_order: "ASC" },
    });
  }

  /** Create variants from explicit rows (the wizard's combination matrix): each row
   * carries its own price/sku/initial stock instead of inheriting the product price. */
  async createExplicitVariants(
    productId: string,
    vendorId: string | null,
    rows: ExplicitVariantInput[],
  ) {
    const product = await this.getOwnedProduct(productId, vendorId);

    const existing = await this.repo.find({ where: { product_id: productId } });
    if (existing.length + rows.length > MAX_VARIANTS) {
      throw new HttpError(
        400,
        `Variant combinations exceed limit of ${MAX_VARIANTS}`,
        "TOO_MANY_VARIANTS",
      );
    }

    const seen = new Set(
      existing.map((v) =>
        JSON.stringify(this.sortOptionValues((v.option_values ?? {}) as Record<string, string>)),
      ),
    );

    const newVariants: ProductVariant[] = [];
    const stockByIndex = new Map<number, number>();
    for (const row of rows) {
      if (Object.keys(row.option_values).length === 0) {
        throw new HttpError(422, "Variant option_values must not be empty", "EMPTY_OPTION_VALUES");
      }
      const optionValues = this.sortOptionValues(row.option_values);
      const key = JSON.stringify(optionValues);
      if (seen.has(key)) continue; // Preserve existing / skip duplicate rows
      seen.add(key);

      const parts = Object.values(optionValues);
      const name = row.name?.trim() || parts.join(" / ");
      const sku =
        row.sku?.trim() ||
        `${productId.slice(0, 8)}-${parts.map((p) => this.slugPart(p)).join("-")}`;

      if (row.quantity_on_hand && row.quantity_on_hand > 0) {
        stockByIndex.set(newVariants.length, row.quantity_on_hand);
      }

      newVariants.push(
        this.repo.create({
          product_id: productId,
          name,
          sku,
          barcode: row.barcode ?? null,
          option_values: optionValues,
          price: row.price,
          compare_at_price: row.compare_at_price ?? null,
          cost_price: row.cost_price ?? null,
          is_active: true,
          sort_order: existing.length + newVariants.length,
        }),
      );
    }

    if (newVariants.length > 0) {
      await this.repo.save(newVariants);

      // Initial per-variant stock goes into the vendor's default warehouse
      const stockVendorId = vendorId ?? product.vendor_id;
      for (const [index, quantity] of stockByIndex) {
        const variant = newVariants[index];
        if (!variant) continue;
        await this.inventoryService.restock(stockVendorId, {
          product_id: productId,
          variant_id: variant.id,
          quantity,
        });
      }

      await this.syncProductAfterVariantChange(productId);
    }

    return this.repo.find({
      where: { product_id: productId },
      order: { sort_order: "ASC" },
    });
  }

  private async getOwnedProduct(productId: string, vendorId: string | null) {
    const product = (await this.productRepo.findOne({ where: { id: productId } })) as any;
    if (!product || (vendorId && product.vendor_id !== vendorId)) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
    return product;
  }

  /** The product-level price of a variable product is derived, not entered:
   * keep it at min(active variant prices) so listings show a correct "from" price. */
  private async syncProductAfterVariantChange(productId: string) {
    const variants = await this.repo.find({ where: { product_id: productId } });
    if (variants.length === 0) {
      await this.productRepo.update(productId, { has_variants: false });
    } else {
      const active = variants.filter((v) => v.is_active);
      const patch: Record<string, unknown> = { has_variants: true };
      if (active.length > 0) {
        patch.price = Math.min(...active.map((v) => v.price));
      }
      await this.productRepo.update(productId, patch);
    }
    await enqueueSearchSync({ type: "upsert_by_product_id", productId });
  }

  private slugPart(value: string): string {
    return (
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "v"
    );
  }

  private sortOptionValues(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = obj[key] ?? "";
    }
    return sorted;
  }

  private cartesianProduct<T>(arrays: T[][]): T[][] {
    return arrays.reduce<T[][]>(
      (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
      [[]],
    );
  }

  async update(
    productId: string,
    variantId: string,
    data: Partial<{
      name: string;
      sku: string;
      barcode: string | null;
      price: number;
      compare_at_price: number | null;
      cost_price: number | null;
      weight_grams: number | null;
      dimensions_cm: { length: number; width: number; height: number } | null;
      sort_order: number;
      is_active: boolean;
    }>,
  ) {
    const variant = await this.repo.findOne({
      where: { id: variantId, product_id: productId },
    });
    if (!variant) throw new HttpError(404, "Variant not found", "VARIANT_NOT_FOUND");
    Object.assign(variant, data);
    const saved = await this.repo.save(variant);
    if (data.price !== undefined || data.is_active !== undefined) {
      await this.syncProductAfterVariantChange(productId);
    }
    return saved;
  }

  async remove(productId: string, variantId: string) {
    const variant = await this.repo.findOne({
      where: { id: variantId, product_id: productId },
    });
    if (!variant) throw new HttpError(404, "Variant not found", "VARIANT_NOT_FOUND");
    await this.repo.softRemove(variant);
    await this.syncProductAfterVariantChange(productId);
  }
}
