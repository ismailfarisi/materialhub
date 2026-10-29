import {
  AppDataSource,
  GiftBox,
  GiftBoxItem,
  GiftBoxOccasion,
  GiftBoxStyle,
  GiftOccasion,
  Product,
  ProductVariant,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import { type PricingItem, computeGiftBoxPrice } from "@materialhub/utils";
import { In } from "typeorm";

export interface ResolvedGiftBox {
  gift_box_id: string;
  box_name_snapshot: string;
  style_snapshot: Record<string, unknown> | null;
  occasion_snapshot: Record<string, unknown> | null;
  packaging_price: number;
  discount_total: number;
  unit_price: number; // computed total per box
  components: {
    product_id: string;
    variant_id: string | null;
    vendor_id: string;
    unit_price: number;
    quantity: number;
  }[];
}

/**
 * Reads a gift box directly from the DB and returns a fully-priced, validated
 * snapshot ready to persist as a cart_gift_box row.
 *
 * NOTE: gift-only products ARE allowed inside a box (that's the whole point of
 * a gift box). We only reject when a product row is missing or soft-deleted.
 */
export class GiftBoxCartResolver {
  private get giftBoxRepo() {
    return AppDataSource.getRepository(GiftBox);
  }
  private get giftBoxItemRepo() {
    return AppDataSource.getRepository(GiftBoxItem);
  }
  private get styleRepo() {
    return AppDataSource.getRepository(GiftBoxStyle);
  }
  private get occasionLinkRepo() {
    return AppDataSource.getRepository(GiftBoxOccasion);
  }
  private get occasionRepo() {
    return AppDataSource.getRepository(GiftOccasion);
  }
  private get productRepo() {
    return AppDataSource.getRepository(Product);
  }
  private get variantRepo() {
    return AppDataSource.getRepository(ProductVariant);
  }

  async resolve(giftBoxId: string): Promise<ResolvedGiftBox> {
    // 1. Load box + style + items.
    const box = await this.giftBoxRepo.findOne({ where: { id: giftBoxId } });
    if (!box) throw new NotFoundError("Gift box not found");

    const style = await this.styleRepo.findOne({ where: { id: box.style_id } });
    if (!style) throw new NotFoundError("Gift box style not found");

    const items = await this.giftBoxItemRepo.find({
      where: { gift_box_id: box.id },
      order: { sort_order: "ASC" },
    });

    // 2. Availability window.
    if (!box.is_active) {
      throw new BadRequestError("Gift box is not available");
    }
    const now = new Date();
    if (box.starts_at && now < new Date(box.starts_at)) {
      throw new BadRequestError("Gift box is not available");
    }
    if (box.expires_at && now > new Date(box.expires_at)) {
      throw new BadRequestError("Gift box is not available");
    }

    if (items.length === 0) {
      throw new BadRequestError("Gift box has no items");
    }

    // 3. Capacity.
    const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
    if (totalQty > style.max_capacity) {
      throw new BadRequestError("Gift box exceeds its style capacity");
    }

    // 4. Occasion snapshot (optional).
    const occasionLinks = await this.occasionLinkRepo.find({
      where: { gift_box_id: box.id },
    });
    let occasionSnapshot: Record<string, unknown> | null = null;
    if (occasionLinks.length > 0) {
      const occasions = await this.occasionRepo.find({
        where: { id: In(occasionLinks.map((l) => l.occasion_id)) },
      });
      if (occasions.length > 0) {
        occasionSnapshot = {
          occasions: occasions.map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
        };
      }
    }

    // 5. Hydrate prices.
    const productIds = [...new Set(items.map((it) => it.product_id))];
    const variantIds = [
      ...new Set(items.map((it) => it.variant_id).filter((v): v is string => v != null)),
    ];

    const products = await this.productRepo.find({ where: { id: In(productIds) } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const variants =
      variantIds.length > 0 ? await this.variantRepo.find({ where: { id: In(variantIds) } }) : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const pricingItems: PricingItem[] = [];
    const components: ResolvedGiftBox["components"] = [];

    for (const it of items) {
      const product = productMap.get(it.product_id);
      // A box containing a gift-only product is fine to sell; only block if the
      // product row is missing or soft-deleted.
      if (!product) {
        throw new BadRequestError("A product in this gift box is no longer available");
      }

      let unitPrice = product.price;
      if (it.variant_id) {
        const variant = variantMap.get(it.variant_id);
        if (!variant) {
          throw new BadRequestError("A product variant in this gift box is no longer available");
        }
        unitPrice = variant.price;
      }

      const component = {
        product_id: it.product_id,
        variant_id: it.variant_id,
        vendor_id: product.vendor_id,
        unit_price: unitPrice,
        quantity: it.quantity,
      };
      components.push(component);
      pricingItems.push({
        product_id: it.product_id,
        variant_id: it.variant_id,
        vendor_id: product.vendor_id,
        unit_price: unitPrice,
        quantity: it.quantity,
      });
    }

    // 6. Price the box.
    const price = computeGiftBoxPrice({
      items: pricingItems,
      packagingPrice: style.base_price,
      discountPercentage: box.discount_percentage == null ? null : Number(box.discount_percentage),
    });

    // 7. Build the resolved snapshot.
    return {
      gift_box_id: box.id,
      box_name_snapshot: box.name,
      style_snapshot: {
        name: style.name,
        dimensions: style.dimensions,
        images: style.images,
      },
      occasion_snapshot: occasionSnapshot,
      packaging_price: style.base_price,
      discount_total: price.discount,
      unit_price: price.total,
      components,
    };
  }
}
