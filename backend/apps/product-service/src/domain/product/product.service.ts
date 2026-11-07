import {
  AppDataSource,
  Attribute,
  Brand,
  Category,
  Product,
  ProductAttributeValue,
  ProductCategory,
  ProductGroupMember,
  ProductImage,
  ProductStatus,
  ProductTranslation,
  Vendor,
  Warehouse,
  WarehouseVendorPermission,
} from "@materialhub/database";
import { HttpError, assertEnumFilter } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";
import { type EntityManager, In, IsNull, Not, type Repository } from "typeorm";
import { categoryDescendantPredicate } from "../category/category-descendant.sql.ts";
import { toPublicEcoDeclaration } from "../eco/eco-declaration.service.ts";
import { parseDeliverySpeed, resolveDeliveryFilter } from "../search/delivery-filter.ts";
import { enqueueSearchSync } from "../search/search-sync.job.ts";
import type { SearchService } from "../search/search.interface.ts";
import type { TrendingSearchService } from "../search/trending.service.ts";
import { parseAttributeParams } from "./filter-param-parser.ts";
import { toPublicProductDetail } from "./public-product.ts";

const WAREHOUSE_FULFILLMENT_PERMISSION = "fulfillment_origin";

/**
 * Hand each variant its own price tiers and leave only the product-level ones
 * (for a product without variants) on the product. Tiers arrive sorted by
 * quantity; inactive variants keep theirs for the vendor views.
 */
export function attachPriceTiers(product: any): void {
  const all: any[] = Array.isArray(product.price_tiers) ? product.price_tiers : [];
  const sorted = [...all].sort((a, b) => a.min_quantity - b.min_quantity);
  const strip = (t: any) => ({ min_quantity: t.min_quantity, unit_price: t.unit_price });
  for (const v of product.variants ?? []) {
    v.price_tiers = v.is_sample ? [] : sorted.filter((t) => t.variant_id === v.id).map(strip);
  }
  product.price_tiers = sorted.filter((t) => t.variant_id == null).map(strip);
}

type ProductTranslationInput = {
  locale?: string;
  name?: string | null;
  short_description?: string | null;
  description?: string | null;
  rich_description?: Record<string, unknown> | null;
  ingredients?: string | null;
  usage_instructions?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
};

type ProductTranslationRepository = Pick<
  Repository<ProductTranslation>,
  "findOne" | "create" | "save" | "remove"
>;

export class ProductService {
  private readonly searchService: SearchService;
  private readonly trendingService?: TrendingSearchService;

  constructor(searchService: SearchService, trendingService?: TrendingSearchService) {
    this.searchService = searchService;
    this.trendingService = trendingService;
  }

  private get repo() {
    return AppDataSource.getRepository(Product);
  }
  private get categoryRepo() {
    return AppDataSource.getRepository(ProductCategory);
  }
  private get imageRepo() {
    return AppDataSource.getRepository(ProductImage);
  }
  private get attributeValueRepo() {
    return AppDataSource.getRepository(ProductAttributeValue);
  }

  private static readonly SEARCH_RELATIONS = [
    "category",
    "brand",
    "vendor",
    "variants",
    "price_tiers",
    "inventoryRecords",
    "images",
    "attributeValues",
    "attributeValues.attribute",
    "attributeValues.attributeValue",
    "ecoDeclaration",
  ];

  async reindexProduct(productId: string): Promise<void> {
    const full = await this.repo.findOne({
      where: { id: productId },
      relations: ProductService.SEARCH_RELATIONS,
    });
    if (full) {
      await this.searchService.indexProduct(full);
      await enqueueSearchSync({ type: "upsert", product: full });
    }
  }

  private async resolveWarehouseId(
    manager: EntityManager,
    vendorId: string,
    explicitWarehouseId?: string,
  ): Promise<string | null> {
    if (explicitWarehouseId) {
      const wh = await manager.getRepository(Warehouse).findOne({
        where: { id: explicitWarehouseId, is_active: true },
      });
      if (wh?.vendor_id === vendorId) return explicitWarehouseId;
      if (wh) {
        const grant = await manager.getRepository(WarehouseVendorPermission).findOne({
          where: {
            warehouse_id: explicitWarehouseId,
            vendor_id: vendorId,
            permission: WAREHOUSE_FULFILLMENT_PERMISSION,
            is_active: true,
          },
        });
        if (grant) return explicitWarehouseId;
      }
      throw new HttpError(
        422,
        "Warehouse not available for this vendor",
        "WAREHOUSE_NOT_AVAILABLE",
      );
    }
    const defaultWarehouse = await manager.getRepository(Warehouse).findOne({
      where: { vendor_id: vendorId, is_default: true, is_active: true },
    });
    return defaultWarehouse?.id ?? null;
  }

  private async replaceProductAttributes(
    manager: any,
    productId: string,
    attributes: Array<{
      attribute_id: string;
      value_id?: string | null;
      text_value?: string | null;
    }>,
  ): Promise<void> {
    await manager.softDelete(ProductAttributeValue, {
      product_id: productId,
      variant_id: IsNull(),
    });

    for (const attr of attributes) {
      const valueId = attr.value_id ?? null;
      const textValue = attr.text_value?.trim() ? attr.text_value.trim() : null;
      if (!valueId && !textValue) continue;

      await manager.save(
        ProductAttributeValue,
        manager.create(ProductAttributeValue, {
          product_id: productId,
          variant_id: null,
          attribute_id: attr.attribute_id,
          attribute_value_id: valueId,
          text_value: textValue,
        }),
      );
    }
  }

  /**
   * `products.meta_keywords` is a text column, but the admin panel and vendor
   * dashboard both post a string[]. Collapse either shape to a comma-joined
   * string so the driver never serializes an array into the text column.
   */
  private normalizeMetaKeywords(value: unknown): string | null {
    let parts: unknown[] = [];
    if (Array.isArray(value)) parts = value;
    else if (typeof value === "string") parts = value.split(",");
    const joined = parts
      .map((k) => String(k).trim())
      .filter(Boolean)
      .join(", ");
    return joined || null;
  }

  private normalizeTranslationText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private async upsertProductTranslations(
    translationRepo: ProductTranslationRepository,
    productId: string,
    translations: ProductTranslationInput[],
  ): Promise<void> {
    for (const entry of translations) {
      const locale = this.normalizeTranslationText(entry.locale);
      if (!locale) continue;

      const existing = await translationRepo.findOne({
        where: { product_id: productId, locale },
        withDeleted: true,
      });
      const name = this.normalizeTranslationText(entry.name);

      if (!name) {
        if (existing) await translationRepo.remove(existing);
        continue;
      }

      const patch = {
        product_id: productId,
        locale,
        name,
        short_description: this.normalizeTranslationText(entry.short_description),
        description: this.normalizeTranslationText(entry.description),
        rich_description: entry.rich_description ?? null,
        ingredients: this.normalizeTranslationText(entry.ingredients),
        usage_instructions: this.normalizeTranslationText(entry.usage_instructions),
        meta_title: this.normalizeTranslationText(entry.meta_title),
        meta_description: this.normalizeTranslationText(entry.meta_description),
        deleted_at: null,
      };

      if (existing) {
        Object.assign(existing, patch);
        await translationRepo.save(existing);
      } else {
        await translationRepo.save(translationRepo.create(patch));
      }
    }
  }

  async create(vendorId: string, data: any) {
    // Verify vendor is approved
    const vendor = await AppDataSource.getRepository(Vendor).findOne({
      where: { id: vendorId },
    });
    if (!vendor || vendor.status !== "approved") {
      throw new HttpError(422, "Only approved vendors can create products", "VENDOR_NOT_APPROVED");
    }

    let slug = generateSlug(data.name);
    const existing = await this.repo.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const result = await AppDataSource.transaction(async (manager) => {
      const product = await manager.save(
        Product,
        manager.create(Product, {
          vendor_id: vendorId,
          name: data.name,
          slug,
          description: data.description,
          short_description: data.short_description ?? null,
          rich_description: data.rich_description ?? null,
          ingredients: data.ingredients ?? null,
          usage_instructions: data.usage_instructions ?? null,
          editorial: data.editorial ?? null,
          category_id: data.category_id,
          brand_id: data.brand_id ?? null,
          price: data.price,
          compare_at_price: data.compare_at_price ?? null,
          cost_price: data.cost_price ?? null,
          price_overrides: data.price_overrides ?? null,
          sku: data.sku ?? null,
          barcode: data.barcode ?? null,
          weight_grams: data.weight_grams ?? null,
          dimensions_cm: data.dimensions_cm ?? null,
          country_of_origin: data.country_of_origin ?? null,
          is_digital: data.is_digital ?? false,
          is_customizable: data.is_customizable ?? false,
          tags: data.tags ?? [],
          meta_title: data.meta_title ?? null,
          meta_description: data.meta_description ?? null,
          meta_keywords: this.normalizeMetaKeywords(data.meta_keywords),
          status: (data.status === "pending_review" ? "pending_review" : "draft") as any,
        }),
      );

      // Primary category
      await manager.save(
        ProductCategory,
        manager.create(ProductCategory, {
          product_id: product.id,
          category_id: data.category_id,
          is_primary: true,
        }),
      );

      // Additional categories
      if (data.additional_category_ids?.length) {
        for (const catId of data.additional_category_ids) {
          await manager.save(
            ProductCategory,
            manager.create(ProductCategory, {
              product_id: product.id,
              category_id: catId,
              is_primary: false,
            }),
          );
        }
      }

      if (data.attributes?.length) {
        await this.replaceProductAttributes(manager, product.id, data.attributes);
      }

      if (data.translations?.length) {
        await this.upsertProductTranslations(
          manager.getRepository(ProductTranslation),
          product.id,
          data.translations,
        );
      }

      if (!data.has_variants) {
        const Inventory = manager.getRepository("Inventory");
        const warehouseId = await this.resolveWarehouseId(
          manager,
          vendorId,
          (data as any).warehouse_id,
        );
        const openingStock = data.quantity_on_hand ?? 0;
        await Inventory.save(
          Inventory.create({
            product_id: product.id,
            vendor_id: vendorId,
            warehouse_id: warehouseId,
            quantity_on_hand: openingStock,
            quantity_reserved: 0,
            // Denormalized copy: omitting it defaults the column to 0, so the
            // row is born disagreeing with on_hand - reserved.
            quantity_available: openingStock,
          }),
        );
      }

      return product;
    });

    await this.reindexProduct(result.id);
    return result;
  }

  async listByVendor(
    vendorId: string,
    filters: {
      search?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const limit = Math.min(filters.limit ?? 20, 100);
    const page = Math.max(filters.page ?? 1, 1);
    const offset = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder("p")
      .leftJoin("p.images", "img", "img.is_primary = true AND img.deleted_at IS NULL")
      .leftJoin("p.category", "cat")
      .addSelect(["img.url", "img.thumbnail_url", "cat.name"])
      .where("p.vendor_id = :vendorId", { vendorId })
      .andWhere("p.deleted_at IS NULL");

    if (filters.search) {
      qb.andWhere("p.name ILIKE :q", { q: `%${filters.search}%` });
    }
    if (filters.status) {
      qb.andWhere("p.status = :status", { status: filters.status });
    }

    const [items, total] = await qb
      .orderBy("p.created_at", "DESC")
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        price: p.price,
        compare_at_price: p.compare_at_price,
        sku: p.sku,
        has_variants: p.has_variants,
        thumbnail_url: p.images?.[0]?.thumbnail_url ?? p.images?.[0]?.url ?? null,
        category_name: p.category?.name ?? null,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(productId: string, vendorId: string, data: any) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const allowed = [
      "name",
      "description",
      "short_description",
      "rich_description",
      "ingredients",
      "usage_instructions",
      "editorial",
      "category_id",
      "brand_id",
      "price",
      "compare_at_price",
      "cost_price",
      "sku",
      "barcode",
      "weight_grams",
      "dimensions_cm",
      "country_of_origin",
      "is_digital",
      "is_customizable",
      "tags",
      "meta_title",
      "meta_description",
    ];
    const saved = await AppDataSource.transaction(async (manager) => {
      for (const key of allowed) {
        if (key in data) (product as any)[key] = data[key];
      }
      if ("meta_keywords" in data) {
        product.meta_keywords = this.normalizeMetaKeywords(data.meta_keywords);
      }
      // A vendor may shuttle a product between draft and review, but must never
      // demote one that admin already moved past review — leaving/entering
      // `published` goes through publish()/adminUnpublish().
      // A rejected product may be fixed and resubmitted.
      if (
        "status" in data &&
        (data.status === "draft" || data.status === "pending_review") &&
        (product.status === "draft" ||
          product.status === "pending_review" ||
          product.status === "rejected")
      ) {
        product.status = data.status as any;
      }
      const next = await manager.save(Product, product);
      if ("attributes" in data) {
        await this.replaceProductAttributes(manager, product.id, data.attributes ?? []);
      }
      if ("translations" in data) {
        await this.upsertProductTranslations(
          manager.getRepository(ProductTranslation),
          product.id,
          data.translations ?? [],
        );
      }
      return next;
    });
    await this.reindexProduct(saved.id);
    return saved;
  }

  async remove(productId: string, vendorId: string) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    await this.repo.softRemove(product);
    await this.searchService.removeProduct(productId);
    await enqueueSearchSync({ type: "delete", productId });
  }

  /**
   * Vendor publish. Going live requires the admin moderation verdict: only an
   * `approved` product (admin approved it out of `pending_review`, or the
   * vendor took it offline again) can be published. Drafts must be submitted
   * for review first; `unpublished` is an admin takedown and only admin can
   * republish it. Then the content gates (image, price, stock) apply.
   */
  async publish(productId: string, vendorId: string) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
      relations: ["images", "variants"],
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.status === "published") return product;

    await this.assertVendorPublishable(product);

    product.status = "published" as any;
    product.published_at = new Date();
    const saved = await this.repo.save(product);
    await this.reindexProduct(saved.id);
    return saved;
  }

  /** Throws the HttpError that explains why this product cannot go live yet. */
  private async assertVendorPublishable(product: Product): Promise<void> {
    const status = product.status as string;
    if (status !== "approved") {
      const why: Record<string, string> = {
        draft: "Submit the product for review before publishing",
        pending_review: "The product is waiting for admin review",
        rejected: "The product was rejected; fix it and resubmit for review",
        unpublished: "The product was taken offline by MaterialHub; contact support",
        archived: "Archived products cannot be published",
      };
      throw new HttpError(
        422,
        why[status] ?? `Products in '${status}' cannot be published`,
        "NOT_APPROVED",
      );
    }

    const images = await this.imageRepo.count({
      where: { product_id: product.id },
    });
    if (images === 0) throw new HttpError(422, "Product must have at least 1 image", "NO_IMAGES");
    if (product.price <= 0)
      throw new HttpError(422, "Product price must be greater than 0", "INVALID_PRICE");

    // Inventory check. `quantity_available` is a denormalized copy maintained in
    // application code and enforced nowhere, so it drifts; derive from the two
    // authoritative columns, as the rest of the service does.
    const inventoryRepo = AppDataSource.getRepository("Inventory");
    const hasStock = await inventoryRepo
      .createQueryBuilder("i")
      .where("i.product_id = :pid", { pid: product.id })
      .andWhere("i.quantity_on_hand - i.quantity_reserved > 0")
      .getCount();
    if (hasStock === 0)
      throw new HttpError(422, "Product must have inventory to publish", "NO_INVENTORY");
  }

  /**
   * Vendor unpublish: take a live product offline. It returns to `approved`,
   * so the vendor can publish it again without another review.
   */
  async unpublish(productId: string, vendorId: string) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.status !== "published")
      throw new HttpError(422, "Only published products can be unpublished", "INVALID_STATUS");
    product.status = "approved" as any;
    const saved = await this.repo.save(product);
    await this.removeFromSearch(productId);
    return saved;
  }

  private async removeFromSearch(productId: string) {
    await this.searchService.removeProduct(productId);
    await enqueueSearchSync({ type: "delete", productId });
  }

  /**
   * Vendor bulk action. Each product goes through the same rules as the single
   * endpoints (publish moderation + content gates, search removal on archive /
   * unpublish / delete); one failing product does not block the rest.
   */
  async bulkAction(
    vendorId: string,
    action: "archive" | "publish" | "unpublish" | "delete",
    productIds: string[],
  ) {
    const products = await this.repo.find({
      where: productIds.map((id) => ({ id, vendor_id: vendorId })),
    });

    if (products.length === 0) throw new HttpError(404, "No matching products found", "NOT_FOUND");

    const succeeded: string[] = [];
    const failed: Array<{ id: string; code: string; message: string }> = [];
    const found = new Set(products.map((p) => p.id));
    for (const id of productIds) {
      if (!found.has(id))
        failed.push({ id, code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    }

    for (const product of products) {
      try {
        switch (action) {
          case "publish":
            await this.publish(product.id, vendorId);
            break;
          case "unpublish":
            await this.unpublish(product.id, vendorId);
            break;
          case "archive":
            if (product.status !== "archived") {
              await this.repo.update(product.id, { status: "archived" as any });
              await this.removeFromSearch(product.id);
            }
            break;
          case "delete":
            await this.repo.softRemove(product);
            await this.removeFromSearch(product.id);
            break;
        }
        succeeded.push(product.id);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        failed.push({ id: product.id, code: err.code, message: err.message });
      }
    }

    return { affected: succeeded.length, succeeded, failed };
  }

  async getBySlug(slug: string) {
    const product = await this.repo.findOne({
      where: { slug, status: "published" as any },
      relations: [
        "images",
        "variants",
        "price_tiers",
        "vendor",
        "brand",
        "productCategories",
        "inventoryRecords",
        "attributeValues",
        "attributeValues.attribute",
        "attributeValues.attributeValue",
        "ecoDeclaration",
      ],
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    // Storefront-safe: only an approved declaration, never the certificate key.
    (product as any).ecoDeclaration = toPublicEcoDeclaration(product.ecoDeclaration);
    attachPriceTiers(product);

    // Compute stock from inventory
    const totalAvailable = ((product as any).inventoryRecords || []).reduce(
      (sum: number, inv: any) =>
        sum + Math.max(0, (inv.quantity_on_hand || 0) - (inv.quantity_reserved || 0)),
      0,
    );
    (product as any).in_stock = totalAvailable > 0;
    (product as any).quantity_available = totalAvailable;

    return toPublicProductDetail(product);
  }

  /** Public detail by id: published products only (drafts, products under
   * review and rejected listings are not public), storefront-safe shape. */
  async getById(id: string) {
    const product = await this.repo.findOne({
      where: { id, status: "published" as any },
      relations: [
        "images",
        "variants",
        "price_tiers",
        "vendor",
        "brand",
        "productCategories",
        "inventoryRecords",
        "attributeValues",
        "attributeValues.attribute",
        "attributeValues.attributeValue",
        "ecoDeclaration",
      ],
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    (product as any).ecoDeclaration = toPublicEcoDeclaration(product.ecoDeclaration);
    attachPriceTiers(product);
    const available = ((product as any).inventoryRecords || []).reduce(
      (sum: number, inv: any) =>
        sum + Math.max(0, (inv.quantity_on_hand || 0) - (inv.quantity_reserved || 0)),
      0,
    );
    (product as any).in_stock = available > 0;
    (product as any).quantity_available = available;

    return toPublicProductDetail(product);
  }

  /** The vendor's own product, with translations, for the edit form. */
  async getByIdForVendor(id: string, vendorId: string) {
    const product = await this.repo.findOne({
      where: { id, vendor_id: vendorId },
      relations: [
        "images",
        "variants",
        "price_tiers",
        "vendor",
        "brand",
        "productCategories",
        "inventoryRecords",
        "attributeValues",
        "attributeValues.attribute",
        "attributeValues.attributeValue",
        "ecoDeclaration",
        "translations",
      ],
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    (product as any).ecoDeclaration = toPublicEcoDeclaration(product.ecoDeclaration);
    attachPriceTiers(product);
    return product;
  }

  /** Admin-only variant: also loads translations. */
  async getByIdForAdmin(id: string) {
    const product = await this.repo.findOne({
      where: { id },
      relations: [
        "images",
        "variants",
        "price_tiers",
        "vendor",
        "brand",
        "productCategories",
        "inventoryRecords",
        "attributeValues",
        "attributeValues.attribute",
        "attributeValues.attributeValue",
        "translations",
      ],
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    attachPriceTiers(product);

    return product;
  }

  private async validateFilterSlugs(filters: any): Promise<void> {
    const collect = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string" && !!s);
      if (typeof raw === "string" && raw)
        return raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      return [];
    };

    const findExisting = async (entity: any, slugs: string[]): Promise<Set<string>> => {
      if (!slugs.length) return new Set();
      const rows = (await AppDataSource.getRepository(entity).find({
        where: { slug: In(slugs) },
        select: { slug: true },
      })) as Array<{ slug: string }>;
      return new Set(rows.map((r) => r.slug));
    };

    const catSlugs = collect(filters.category);
    const brandSlugs = collect(filters.brand);
    const vendorSlugs = collect(filters.vendor);

    const [catFound, brandFound, vendorFound] = await Promise.all([
      findExisting(Category, catSlugs),
      findExisting(Brand, brandSlugs),
      findExisting(Vendor, vendorSlugs),
    ]);

    const missingCat = catSlugs.find((s) => !catFound.has(s));
    if (missingCat)
      throw new HttpError(404, `Category not found: ${missingCat}`, "CATEGORY_NOT_FOUND");
    const missingBrand = brandSlugs.find((s) => !brandFound.has(s));
    if (missingBrand)
      throw new HttpError(404, `Brand not found: ${missingBrand}`, "BRAND_NOT_FOUND");
    const missingVendor = vendorSlugs.find((s) => !vendorFound.has(s));
    if (missingVendor)
      throw new HttpError(404, `Vendor not found: ${missingVendor}`, "VENDOR_NOT_FOUND");
  }

  async search(filters: any) {
    filters.query = filters.query ?? filters.q;
    // Eco catalogue: `?plastic_ban_ready=true` → approved declarations only.
    if (filters.plastic_ban_ready === true || filters.plastic_ban_ready === "true") {
      filters.plasticBanReady = true;
    }

    if (typeof filters.ids === "string") {
      filters.ids = filters.ids
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    // SEO-friendly URLs: 404 fast if any category/brand/vendor slug doesn't exist,
    // so the storefront can render its 404 page instead of a misleading empty list.
    await this.validateFilterSlugs(filters);

    if (filters.category && !filters.categoryId) {
      const firstSlug = Array.isArray(filters.category)
        ? filters.category[0]
        : String(filters.category).split(",")[0];
      const category = await AppDataSource.getRepository(Category).findOne({
        where: { slug: firstSlug },
        select: ["id"],
      });
      if (category) {
        filters.categoryId = category.id;
      }
    }

    // Parse URL query params (e.g. color=red,blue&weight=100-500) into typed
    // AttributeFilterInput entries so the search adapter can filter correctly.
    // We pull from the global filterable-attribute pool rather than only
    // attributes linked via category_attributes, because the Typesense facet
    // builder also sources attributes from product_attribute_values directly —
    // so a filter chip can appear in the UI for an attribute that isn't linked
    // to the category in category_attributes (the link is a curation hint, not
    // a hard membership). The parser already gates per param with bySlug.get,
    // so unrelated query params are ignored.
    if (!filters.attributes?.length) {
      const attrs = await AppDataSource.getRepository(Attribute).find({
        where: { is_filterable: true, filter_input_type: Not(IsNull()) },
        relations: ["values"],
      });
      const attrDefs = attrs.map((a) => ({
        id: a.id,
        slug: a.slug,
        filter_input_type: a.filter_input_type ?? null,
        values: (a.values ?? []).map((v: any) => ({ id: v.id, slug: v.slug })),
      }));
      if (attrDefs.length) {
        const parsed = parseAttributeParams(filters, attrDefs);
        if (parsed.length) {
          filters.attributes = parsed;
        }
      }
    }
    // ?delivery=same_day|next_day&emirate=Dubai — suppliers whose default
    // warehouse serves that emirate at that speed. Ignored without an emirate.
    const deliverySpeed = parseDeliverySpeed(filters.delivery);
    if (deliverySpeed) {
      const delivery = await resolveDeliveryFilter(deliverySpeed, filters.emirate);
      if (delivery) {
        filters.deliveryVendorIds = delivery.vendorIds;
        filters.deliveryExcludeProductIds = delivery.excludeProductIds;
      }
    }
    const result: any = await this.searchService.searchProducts(filters);
    if (filters.query && result.data.length === 0 && this.searchService.didYouMean) {
      result.did_you_mean = await this.searchService.didYouMean(filters.query);
    }
    if (filters.query && result.data.length > 0 && this.trendingService) {
      // Trending is best-effort; swallow errors so search keeps working.
      this.trendingService.record(filters.query).catch(() => {});
    }
    return result;
  }

  // Images
  async addImage(
    productId: string,
    vendorId: string,
    data: {
      url: string;
      thumbnail_url?: string;
      medium_url?: string;
      alt_text?: string;
      is_primary?: boolean;
    },
  ) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");

    const count = await this.imageRepo.count({
      where: { product_id: productId },
    });
    if (count >= 10) throw new HttpError(422, "Maximum 10 images per product", "MAX_IMAGES");

    if (data.is_primary) {
      await this.imageRepo.update({ product_id: productId }, { is_primary: false });
    }

    const image = await this.imageRepo.save(
      this.imageRepo.create({
        product_id: productId,
        url: data.url,
        thumbnail_url: data.thumbnail_url ?? null,
        medium_url: data.medium_url ?? null,
        alt_text: data.alt_text ?? null,
        is_primary: data.is_primary ?? count === 0,
        sort_order: count,
      }),
    );
    await this.reindexProduct(productId);
    return image;
  }

  async reorderImages(
    productId: string,
    vendorId: string,
    items: Array<{ id: string; sort_order: number }>,
  ) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    await AppDataSource.transaction(async (manager) => {
      for (const item of items) {
        await manager.update(
          ProductImage,
          { id: item.id, product_id: productId },
          { sort_order: item.sort_order },
        );
      }
    });
    await this.reindexProduct(productId);
  }

  async removeImage(productId: string, vendorId: string, imageId: string) {
    const product = await this.repo.findOne({
      where: { id: productId, vendor_id: vendorId },
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const image = await this.imageRepo.findOne({
      where: { id: imageId, product_id: productId },
    });
    if (!image) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
    await this.imageRepo.softRemove(image);
    await this.reindexProduct(productId);
  }

  // ── Admin Methods (no vendor ownership checks) ──────────────────────

  async adminList(filters: {
    page?: number;
    limit?: number;
    status?: string;
    vendor_id?: string;
    category_id?: string;
    brand_id?: string;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
  }) {
    const page = Math.max(1, Math.trunc(Number(filters.page)) || 1);
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const qb = this.repo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.vendor", "vendor")
      .leftJoinAndSelect("p.brand", "brand")
      .leftJoinAndSelect("p.images", "images", "images.is_primary = true")
      .where("p.deleted_at IS NULL");
    assertEnumFilter(filters.status, ProductStatus);
    if (filters.status) qb.andWhere("p.status = :status", { status: filters.status });
    if (filters.vendor_id) qb.andWhere("p.vendor_id = :vendorId", { vendorId: filters.vendor_id });
    // Match the category itself plus its descendants, so picking a parent
    // ("Papers") also returns products filed under its children. Shared with
    // the product export so the two can never drift — see the helper.
    if (filters.category_id)
      qb.andWhere(categoryDescendantPredicate(":categoryId"), {
        categoryId: filters.category_id,
      });
    if (filters.brand_id) qb.andWhere("p.brand_id = :brandId", { brandId: filters.brand_id });
    if (filters.search)
      qb.andWhere("(p.name ILIKE :search OR p.sku ILIKE :search)", {
        search: `%${filters.search}%`,
      });
    const ALLOWED_SORT = ["created_at", "updated_at", "name", "price", "status"];
    const sortField = ALLOWED_SORT.includes(filters.sort ?? "") ? filters.sort! : "created_at";
    const sortOrder = (filters.order ?? "desc").toUpperCase() as "ASC" | "DESC";
    qb.orderBy(`p.${sortField}`, sortOrder);
    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return { items, total, page, limit };
  }

  async adminCreate(vendorId: string, data: any) {
    let slug = generateSlug(data.name);
    const existing = await this.repo.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const result = await AppDataSource.transaction(async (manager) => {
      const product = await manager.save(
        Product,
        manager.create(Product, {
          vendor_id: vendorId,
          name: data.name,
          slug,
          description: data.description,
          short_description: data.short_description ?? null,
          rich_description: data.rich_description ?? null,
          ingredients: data.ingredients ?? null,
          usage_instructions: data.usage_instructions ?? null,
          editorial: data.editorial ?? null,
          category_id: data.category_id,
          brand_id: data.brand_id ?? null,
          price: data.price,
          compare_at_price: data.compare_at_price ?? null,
          cost_price: data.cost_price ?? null,
          sku: data.sku ?? null,
          barcode: data.barcode ?? null,
          weight_grams: data.weight_grams ?? null,
          dimensions_cm: data.dimensions_cm ?? null,
          country_of_origin: data.country_of_origin ?? null,
          requires_shipping: data.requires_shipping ?? true,
          price_overrides: data.price_overrides ?? null,
          tags: data.tags ?? [],
          meta_title: data.meta_title ?? null,
          meta_description: data.meta_description ?? null,
          meta_keywords: this.normalizeMetaKeywords(data.meta_keywords),
          is_featured: data.is_featured ?? false,
          is_digital: data.is_digital ?? false,
          is_customizable: data.is_customizable ?? false,
          status: (data.status ?? "draft") as any,
          published_at: data.status === "published" ? new Date() : null,
        }),
      );
      // Primary category
      await manager.save(
        ProductCategory,
        manager.create(ProductCategory, {
          product_id: product.id,
          category_id: data.category_id,
          is_primary: true,
        }),
      );
      // Additional categories
      if (data.additional_category_ids?.length) {
        for (const catId of data.additional_category_ids) {
          await manager.save(
            ProductCategory,
            manager.create(ProductCategory, {
              product_id: product.id,
              category_id: catId,
              is_primary: false,
            }),
          );
        }
      }
      if (data.attributes?.length) {
        await this.replaceProductAttributes(manager, product.id, data.attributes);
      }
      if ("translations" in data) {
        await this.upsertProductTranslations(
          manager.getRepository(ProductTranslation),
          product.id,
          data.translations ?? [],
        );
      }
      // Initial inventory record (always created so publish doesn't fail with NO_INVENTORY)
      const Inventory = manager.getRepository("Inventory");
      const warehouseId = await this.resolveWarehouseId(
        manager,
        vendorId,
        (data as any).warehouse_id,
      );
      const openingStock = data.quantity_on_hand ?? 0;
      await Inventory.save(
        Inventory.create({
          product_id: product.id,
          vendor_id: vendorId,
          warehouse_id: warehouseId,
          quantity_on_hand: openingStock,
          quantity_reserved: 0,
          // Denormalized copy: omitting it defaults the column to 0, so the row
          // is born disagreeing with on_hand - reserved.
          quantity_available: openingStock,
        }),
      );
      return product;
    });

    await this.reindexProduct(result.id);
    return result;
  }

  async adminUpdate(productId: string, data: any) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const allowed = [
      "name",
      "description",
      "short_description",
      "rich_description",
      "ingredients",
      "usage_instructions",
      "editorial",
      "category_id",
      "brand_id",
      "price",
      "compare_at_price",
      "cost_price",
      "sku",
      "barcode",
      "weight_grams",
      "dimensions_cm",
      "country_of_origin",
      "requires_shipping",
      "tags",
      "meta_title",
      "meta_description",
      "is_featured",
      "is_digital",
      "is_customizable",
    ];
    const saved = await AppDataSource.transaction(async (manager) => {
      for (const key of allowed) {
        if (key in data) (product as any)[key] = data[key];
      }
      if ("meta_keywords" in data) {
        product.meta_keywords = this.normalizeMetaKeywords(data.meta_keywords);
      }
      const next = await manager.save(Product, product);
      if ("attributes" in data) {
        await this.replaceProductAttributes(manager, product.id, data.attributes ?? []);
      }
      if ("translations" in data) {
        await this.upsertProductTranslations(
          manager.getRepository(ProductTranslation),
          product.id,
          data.translations ?? [],
        );
      }
      return next;
    });
    await this.reindexProduct(saved.id);
    return saved;
  }

  async adminRemove(productId: string) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    await this.repo.softRemove(product);
    await this.searchService.removeProduct(productId);
    await enqueueSearchSync({ type: "delete", productId });
  }

  async adminPublish(productId: string) {
    const product = await this.repo.findOne({
      where: { id: productId },
      relations: ["images", "variants"],
    });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.status === "published") return product;
    const images = await this.imageRepo.count({
      where: { product_id: productId },
    });
    if (images === 0) throw new HttpError(422, "Product must have at least 1 image", "NO_IMAGES");
    if (product.price <= 0)
      throw new HttpError(422, "Product price must be greater than 0", "INVALID_PRICE");
    product.status = "published" as any;
    product.published_at = new Date();
    const saved = await this.repo.save(product);
    await this.reindexProduct(saved.id);
    return saved;
  }

  async adminApprove(productId: string, reviewerId: string) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.status !== "pending_review")
      throw new HttpError(422, "Only pending products can be approved", "INVALID_STATUS");
    product.status = "approved" as any;
    product.reviewed_at = new Date();
    product.reviewed_by = reviewerId;
    product.rejection_reason = null;
    return this.repo.save(product);
  }

  async adminReject(productId: string, reviewerId: string, reason: string) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.status !== "pending_review")
      throw new HttpError(422, "Only pending products can be rejected", "INVALID_STATUS");
    product.status = "rejected" as any;
    product.reviewed_at = new Date();
    product.reviewed_by = reviewerId;
    product.rejection_reason = reason;
    return this.repo.save(product);
  }

  async adminUnpublish(productId: string) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.status !== "published")
      throw new HttpError(422, "Only published products can be unpublished", "INVALID_STATUS");
    product.status = "unpublished" as any;
    const saved = await this.repo.save(product);
    await this.searchService.removeProduct(productId);
    await enqueueSearchSync({ type: "delete", productId });
    return saved;
  }

  async adminToggleFeature(productId: string) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    product.is_featured = !product.is_featured;
    return this.repo.save(product);
  }

  async getGroupBySlug(slug: string) {
    const product = await this.repo.findOne({
      where: { slug, status: "published" as any },
    });
    if (!product) return null;

    const membership = await AppDataSource.getRepository(ProductGroupMember).findOne({
      where: { product_id: product.id },
      relations: ["group", "group.groupingAttribute"],
    });
    if (!membership) return null;

    const members = await AppDataSource.getRepository(ProductGroupMember).find({
      where: { group_id: membership.group_id },
      relations: ["product", "product.images", "attributeValue"],
      order: { sort_order: "ASC" },
    });

    return {
      grouping_attribute: membership.group
        ? {
            id: membership.group.grouping_attribute_id,
            name: membership.group.groupingAttribute?.name,
          }
        : null,
      members: members
        .filter((m) => m.product?.status === ("published" as any))
        .map((m) => ({
          slug: m.product.slug,
          name: m.product.name,
          swatch: {
            hex: m.attributeValue?.color_hex ?? null,
            image: m.attributeValue?.swatch_image_url ?? null,
          },
          image:
            m.product.images?.[0]?.medium_url ??
            m.product.images?.[0]?.card_url ??
            m.product.images?.[0]?.thumbnail_url ??
            m.product.images?.[0]?.url ??
            null,
          price: m.product.price,
          is_current: m.product.id === product.id,
        })),
    };
  }

  // ── Internal / Integration Methods ──────────────────────────────────

  async applyAttributePatch(productId: string, attributes: Record<string, unknown>): Promise<void> {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const merged = { ...(product.attributes ?? {}), ...attributes };
    await this.repo.update(productId, { attributes: merged } as any);
  }

  async adminBulkAction(
    action:
      | "approve"
      | "reject"
      | "archive"
      | "delete"
      | "feature"
      | "unfeature"
      | "publish"
      | "unpublish",
    productIds: string[],
    options?: { reason?: string; reviewer_id?: string },
  ) {
    const products = await this.repo.find({
      where: productIds.map((id) => ({ id })),
    });
    if (products.length === 0) throw new HttpError(404, "No matching products found", "NOT_FOUND");
    switch (action) {
      case "approve":
        await this.repo.update(
          products.map((p) => p.id),
          {
            status: "approved" as any,
            reviewed_at: new Date(),
            reviewed_by: options?.reviewer_id,
          },
        );
        break;
      case "reject":
        await this.repo.update(
          products.map((p) => p.id),
          {
            status: "rejected" as any,
            reviewed_at: new Date(),
            reviewed_by: options?.reviewer_id,
            rejection_reason: options?.reason ?? "Rejected by admin",
          },
        );
        break;
      case "archive":
        await this.repo.update(
          products.map((p) => p.id),
          { status: "archived" as any },
        );
        break;
      case "publish":
        await this.repo.update(
          products.map((p) => p.id),
          { status: "published" as any, published_at: new Date() },
        );
        break;
      case "unpublish":
        await this.repo.update(
          products.map((p) => p.id),
          { status: "unpublished" as any },
        );
        for (const p of products) {
          await this.searchService.removeProduct(p.id);
          await enqueueSearchSync({ type: "delete", productId: p.id });
        }
        break;
      case "delete":
        await this.repo.softRemove(products);
        break;
      case "feature":
        await this.repo.update(
          products.map((p) => p.id),
          { is_featured: true },
        );
        break;
      case "unfeature":
        await this.repo.update(
          products.map((p) => p.id),
          { is_featured: false },
        );
        break;
    }
    return { affected: products.length };
  }

  // Admin image methods (no vendor ownership check)

  async adminAddImage(
    productId: string,
    data: {
      url: string;
      thumbnail_url?: string;
      medium_url?: string;
      alt_text?: string;
      is_primary?: boolean;
      variant_id?: string | null;
    },
  ) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const count = await this.imageRepo.count({
      where: { product_id: productId },
    });
    if (count >= 10) throw new HttpError(422, "Maximum 10 images per product", "MAX_IMAGES");
    if (data.is_primary)
      await this.imageRepo.update({ product_id: productId }, { is_primary: false });
    const image = await this.imageRepo.save(
      this.imageRepo.create({
        product_id: productId,
        variant_id: data.variant_id ?? null,
        url: data.url,
        thumbnail_url: data.thumbnail_url ?? null,
        medium_url: data.medium_url ?? null,
        alt_text: data.alt_text ?? null,
        is_primary: data.is_primary ?? count === 0,
        sort_order: count,
      }),
    );
    await this.reindexProduct(productId);
    return image;
  }

  async adminReorderImages(productId: string, items: Array<{ id: string; sort_order: number }>) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    await AppDataSource.transaction(async (manager) => {
      for (const item of items) {
        await manager.update(
          ProductImage,
          { id: item.id, product_id: productId },
          { sort_order: item.sort_order },
        );
      }
    });
    await this.reindexProduct(productId);
  }

  async adminRemoveImage(productId: string, imageId: string) {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    const image = await this.imageRepo.findOne({
      where: { id: imageId, product_id: productId },
    });
    if (!image) throw new HttpError(404, "Image not found", "IMAGE_NOT_FOUND");
    await this.imageRepo.softRemove(image);
    await this.reindexProduct(productId);
  }
}
