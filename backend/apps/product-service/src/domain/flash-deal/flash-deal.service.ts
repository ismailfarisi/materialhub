import { AppDataSource, FlashDeal, Product, ProductVariant } from "@materialhub/database";
import { HttpError, NotFoundError } from "@materialhub/plugins";
import { enqueueSearchSync } from "../search/search-sync.job.ts";
import { buildFlashDealEntity, deriveDiscountPercentage } from "./builder.ts";
import { scheduleIndexUpdates } from "./effects.ts";
import {
  checkOverlapAgainstSet,
  validatePriceRange,
  validateProductOwnership,
  validateVariantBelongsToProduct,
} from "./validation.ts";

interface PublicFlashDealProduct {
  id?: string;
  name?: string;
  slug?: string;
  price?: number;
  vendor?: {
    display_name?: string | null;
    name?: string | null;
  } | null;
  images?: Array<{
    medium_url?: string | null;
    card_url?: string | null;
    thumbnail_url?: string | null;
    url?: string | null;
  }>;
}

export class FlashDealService {
  private get repo() {
    return AppDataSource.getRepository(FlashDeal);
  }
  private get productRepo() {
    return AppDataSource.getRepository(Product);
  }
  private get variantRepo() {
    return AppDataSource.getRepository(ProductVariant);
  }

  async list(filters: {
    status?: string;
    vendor_id?: string;
    product_id?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const now = new Date();

    const qb = this.repo
      .createQueryBuilder("fd")
      .leftJoinAndSelect("fd.product", "product")
      .leftJoinAndSelect("fd.vendor", "vendor")
      .leftJoinAndSelect("fd.variant", "variant")
      .where("fd.deleted_at IS NULL");

    if (filters.vendor_id)
      qb.andWhere("fd.vendor_id = :vendor_id", { vendor_id: filters.vendor_id });
    if (filters.product_id)
      qb.andWhere("fd.product_id = :product_id", { product_id: filters.product_id });

    if (filters.status === "active") {
      qb.andWhere("fd.is_active = true")
        .andWhere("fd.starts_at <= :now", { now })
        .andWhere("fd.expires_at > :now2", { now2: now });
    } else if (filters.status === "scheduled") {
      qb.andWhere("fd.starts_at > :now", { now });
    } else if (filters.status === "expired") {
      qb.andWhere("fd.expires_at <= :now", { now });
    } else if (filters.status === "disabled") {
      qb.andWhere("fd.is_active = false");
    }

    qb.orderBy("fd.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async listActivePublic(filters: {
    vendor_id?: string;
    category?: string;
    limit?: number;
  }) {
    const now = new Date();
    const limit = Math.max(1, Math.min(filters.limit ?? 12, 50));

    const qb = this.repo
      .createQueryBuilder("fd")
      .leftJoinAndSelect("fd.product", "product")
      .leftJoinAndSelect("product.vendor", "vendor")
      .leftJoinAndSelect(
        "product.images",
        "images",
        "images.is_primary = true AND images.deleted_at IS NULL",
      )
      .where("fd.deleted_at IS NULL")
      .andWhere("fd.is_active = true")
      .andWhere("fd.starts_at <= :now", { now })
      .andWhere("fd.expires_at > :now", { now })
      .andWhere("(fd.quantity_limit IS NULL OR fd.quantity_sold < fd.quantity_limit)")
      .andWhere("product.status = :status", { status: "published" })
      .andWhere("product.is_gift_only = false");

    if (filters.vendor_id) {
      qb.andWhere("fd.vendor_id = :vendorId", { vendorId: filters.vendor_id });
    }

    if (filters.category) {
      qb.leftJoin("product.category", "category").andWhere("category.slug = :category", {
        category: filters.category,
      });
    }

    const deals = await qb.orderBy("fd.expires_at", "ASC").take(limit).getMany();

    return deals.map((deal) => {
      const product = deal.product as PublicFlashDealProduct | null;
      const image = product?.images?.[0];
      return {
        id: deal.id,
        deal_price: deal.deal_price,
        original_price: deal.original_price,
        quantity_limit: deal.quantity_limit,
        quantity_sold: deal.quantity_sold,
        expires_at:
          deal.expires_at instanceof Date ? deal.expires_at.toISOString() : deal.expires_at,
        product: {
          id: product?.id,
          title: product?.name ?? "",
          slug: product?.slug ?? "",
          price: product?.price ?? deal.original_price,
          image_url:
            image?.medium_url ?? image?.card_url ?? image?.thumbnail_url ?? image?.url ?? null,
          vendor_name: product?.vendor?.display_name ?? product?.vendor?.name ?? null,
        },
      };
    });
  }

  async findById(id: string) {
    const deal = await this.repo.findOne({
      where: { id },
      relations: ["product", "vendor", "variant"],
    });
    if (!deal) throw new NotFoundError(`Flash deal ${id} not found`);
    return deal;
  }

  async create(payload: {
    product_id: string;
    variant_id?: string | null;
    vendor_id?: string;
    title: string;
    deal_price: number;
    original_price: number;
    quantity_limit?: number | null;
    starts_at: string;
    expires_at: string;
    is_active?: boolean;
  }) {
    const product = await this.productRepo.findOne({ where: { id: payload.product_id } });
    if (!product) throw new NotFoundError(`Product ${payload.product_id} not found`);

    const ownership = validateProductOwnership(payload.vendor_id ?? null, product.vendor_id);
    if (ownership) throw new HttpError(400, ownership.errorMessage, "VENDOR_MISMATCH");

    let variant: ProductVariant | null = null;
    if (payload.variant_id) {
      variant = await this.variantRepo.findOne({ where: { id: payload.variant_id } });
    }
    const variantCheck = validateVariantBelongsToProduct(
      payload.variant_id ?? null,
      variant?.product_id,
      payload.product_id,
    );
    if (variantCheck) throw new HttpError(400, variantCheck.errorMessage, "VARIANT_MISMATCH");

    const priceCheck = validatePriceRange(payload.deal_price, payload.original_price);
    if (priceCheck) throw new HttpError(400, priceCheck.errorMessage, "INVALID_PRICE");

    const startsAt = new Date(payload.starts_at);
    const expiresAt = new Date(payload.expires_at);

    await this.checkOverlap(payload.product_id, payload.variant_id ?? null, startsAt, expiresAt);

    const entity = buildFlashDealEntity(
      {
        product_id: payload.product_id,
        variant_id: payload.variant_id ?? null,
        title: payload.title,
        deal_price: payload.deal_price,
        original_price: payload.original_price,
        quantity_limit: payload.quantity_limit ?? null,
        starts_at: startsAt,
        expires_at: expiresAt,
        is_active: payload.is_active ?? true,
      },
      product.vendor_id,
    );
    const saved = await this.repo.save(this.repo.create(entity));
    await scheduleIndexUpdates(saved.product_id, saved.id, saved.expires_at);
    return saved;
  }

  async update(
    id: string,
    payload: {
      title?: string;
      deal_price?: number;
      original_price?: number;
      quantity_limit?: number | null;
      starts_at?: string;
      expires_at?: string;
      is_active?: boolean;
    },
  ) {
    const deal = await this.findById(id);

    const startsAt = payload.starts_at ? new Date(payload.starts_at) : deal.starts_at;
    const expiresAt = payload.expires_at ? new Date(payload.expires_at) : deal.expires_at;

    const newDealPrice = payload.deal_price ?? deal.deal_price;
    const newOriginalPrice = payload.original_price ?? deal.original_price;

    if (payload.deal_price !== undefined || payload.original_price !== undefined) {
      const priceCheck = validatePriceRange(newDealPrice, newOriginalPrice);
      if (priceCheck) throw new HttpError(400, priceCheck.errorMessage, "INVALID_PRICE");
    }

    if (payload.starts_at || payload.expires_at) {
      await this.checkOverlap(deal.product_id, deal.variant_id, startsAt, expiresAt, id);
    }

    if (payload.title !== undefined) deal.title = payload.title;
    if (payload.deal_price !== undefined) deal.deal_price = payload.deal_price;
    if (payload.original_price !== undefined) deal.original_price = payload.original_price;
    if (payload.quantity_limit !== undefined) deal.quantity_limit = payload.quantity_limit;
    if (payload.starts_at !== undefined) deal.starts_at = startsAt;
    if (payload.expires_at !== undefined) deal.expires_at = expiresAt;
    if (payload.is_active !== undefined) deal.is_active = payload.is_active;

    if (payload.deal_price !== undefined || payload.original_price !== undefined) {
      deal.discount_percentage = deriveDiscountPercentage(deal.original_price, deal.deal_price);
    }

    const saved = await this.repo.save(deal);
    await scheduleIndexUpdates(saved.product_id, saved.id, saved.expires_at);
    return saved;
  }

  async delete(id: string) {
    const deal = await this.findById(id);
    await this.repo.softRemove(deal);
    // Re-index now so the listing card drops the deal price immediately.
    // The previous deal-expiry:<id> delayed job (if any) will fire harmlessly later.
    try {
      await enqueueSearchSync({ type: "upsert_by_product_id", productId: deal.product_id });
    } catch (err) {
      console.error("[flash-deal] search-sync enqueue failed", {
        productId: deal.product_id,
        dealId: id,
        error: String(err),
      });
    }
  }

  async getActiveForProduct(productId: string) {
    const now = new Date();
    return this.repo
      .findOne({
        where: { product_id: productId, is_active: true },
        order: { starts_at: "ASC" },
      })
      .then((deal) => {
        if (!deal) return null;
        if (deal.starts_at > now || deal.expires_at <= now) return null;
        if (deal.quantity_limit !== null && deal.quantity_sold >= deal.quantity_limit) return null;
        return deal;
      });
  }

  /**
   * Check for overlapping active flash deals. Uses SQL to pre-filter to the
   * conflict window, then delegates the in-memory confirmation to the pure
   * `checkOverlapAgainstSet` function. Uses `getOne()` (not `getMany()`) so
   * the method is compatible with the existing test stub (which only exposes
   * `where`, `andWhere`, and `getOne` on the query builder).
   */
  private async checkOverlap(
    productId: string,
    variantId: string | null,
    startsAt: Date,
    expiresAt: Date,
    excludeId?: string,
  ) {
    const qb = this.repo
      .createQueryBuilder("fd")
      .where("fd.deleted_at IS NULL")
      .andWhere("fd.product_id = :productId", { productId })
      .andWhere("fd.is_active = true")
      .andWhere("fd.starts_at < :expiresAt", { expiresAt })
      .andWhere("fd.expires_at > :startsAt", { startsAt });

    if (variantId) {
      qb.andWhere("(fd.variant_id = :variantId OR fd.variant_id IS NULL)", { variantId });
    } else {
      qb.andWhere("fd.variant_id IS NULL");
    }

    if (excludeId) {
      qb.andWhere("fd.id != :excludeId", { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      // Delegate to the pure module — SQL already narrowed to overlapping deals,
      // so checkOverlapAgainstSet will always confirm the conflict here.
      const error = checkOverlapAgainstSet(
        productId,
        variantId,
        startsAt,
        expiresAt,
        [existing],
        excludeId,
      );
      if (error) throw new HttpError(409, error.errorMessage, "CONFLICT");
    }
  }
}
