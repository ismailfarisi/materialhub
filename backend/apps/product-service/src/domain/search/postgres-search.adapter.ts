import { AppDataSource, Product } from "@materialhub/database";
import { type PaginatedResult, decodeCursor, encodeCursor } from "@materialhub/utils";
import type { ProductFilters, SearchService, SuggestProduct } from "./search.interface.ts";

export class PostgresSearchAdapter implements SearchService {
  async searchProducts(filters: ProductFilters): Promise<PaginatedResult<any>> {
    const limit = Math.min(filters.limit ?? 20, 100);
    const qb = AppDataSource.getRepository(Product)
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.images", "img", "img.is_primary = true")
      .leftJoinAndSelect("p.vendor", "v")
      .where("p.deleted_at IS NULL")
      // Gift-only products are sold exclusively inside gift boxes and must
      // never appear in the public storefront catalog or search results.
      .andWhere("p.is_gift_only IS NOT TRUE");

    // Status filter (default: published for public)
    if (filters.status) {
      qb.andWhere("p.status = :status", { status: filters.status });
    } else {
      qb.andWhere("p.status = :status", { status: "published" });
    }

    if (filters.ids?.length) {
      qb.andWhere("p.id IN (:...ids)", { ids: filters.ids });
    }

    // Full-text search
    if (filters.query) {
      qb.andWhere("p.search_vector @@ plainto_tsquery('english', :query)", {
        query: filters.query,
      });
    }

    // Category filter (using materialized path for descendants)
    if (filters.categoryPath) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.path LIKE :catPath)",
        {
          catPath: `${filters.categoryPath}%`,
        },
      );
    } else if (filters.categoryId) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = :catId)",
        {
          catId: filters.categoryId,
        },
      );
    }

    // Brand filter
    if (filters.brandId) {
      qb.andWhere("p.brand_id = :brandId", { brandId: filters.brandId });
    }

    // Vendor filter
    if (filters.vendorId) {
      qb.andWhere("p.vendor_id = :vendorId", { vendorId: filters.vendorId });
    }

    // Price range
    if (filters.minPrice !== undefined) {
      qb.andWhere("p.price >= :minPrice", { minPrice: filters.minPrice });
    }
    if (filters.maxPrice !== undefined) {
      qb.andWhere("p.price <= :maxPrice", { maxPrice: filters.maxPrice });
    }

    // Rating floor ("4.0 & up"). Value arrives as a string from the query;
    // coerce to a number so the comparison binds against the float column.
    if (filters.minRating !== undefined && Number.isFinite(Number(filters.minRating))) {
      qb.andWhere("p.rating_avg >= :minRating", { minRating: Number(filters.minRating) });
    }

    // Tags
    if (filters.tags?.length) {
      qb.andWhere("p.tags && :tags", { tags: filters.tags });
    }

    // Attribute filtering — only the value-based kinds (checkbox, radio) are
    // supported by this fallback adapter. range / toggle require typed columns
    // that live only in the Typesense schema.
    if (filters.attributes?.length) {
      let idx = 0;
      for (const attr of filters.attributes) {
        if (attr.kind !== "checkbox" && attr.kind !== "radio") continue;
        const valueIds = attr.kind === "checkbox" ? attr.valueIds : [attr.valueId];
        qb.andWhere(
          `EXISTS (SELECT 1 FROM product_attribute_values pav${idx} WHERE pav${idx}.product_id = p.id AND pav${idx}.attribute_id = :attrId${idx} AND pav${idx}.attribute_value_id IN (:...valIds${idx}))`,
          { [`attrId${idx}`]: attr.attributeId, [`valIds${idx}`]: valueIds },
        );
        idx++;
      }
    }

    // Sorting
    switch (filters.sortBy) {
      case "price_asc":
        qb.orderBy("p.price", "ASC");
        break;
      case "price_desc":
        qb.orderBy("p.price", "DESC");
        break;
      case "newest":
        qb.orderBy("p.created_at", "DESC");
        break;
      case "rating":
        qb.orderBy("p.rating_avg", "DESC");
        break;
      default:
        qb.orderBy("p.created_at", "DESC");
    }
    qb.addOrderBy("p.id", "ASC"); // Tiebreaker

    // Cursor pagination
    if (filters.cursor) {
      const decoded = decodeCursor(filters.cursor);
      if (decoded) {
        qb.andWhere("(p.created_at, p.id) < (:cursorVal, :cursorId)", {
          cursorVal: decoded.sortValue,
          cursorId: decoded.id,
        });
      }
    }

    qb.take(limit + 1); // Fetch one extra to determine hasMore

    const results = await qb.getMany();
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const lastItem = data[data.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor("created_at", lastItem.created_at.toISOString(), lastItem.id)
        : null;

    return { data, nextCursor, hasMore };
  }

  async searchProductIds(filters: ProductFilters, cap: number): Promise<string[]> {
    const qb = AppDataSource.getRepository(Product)
      .createQueryBuilder("p")
      .select("p.id", "id")
      .where("p.deleted_at IS NULL")
      .andWhere("p.status = :status", { status: filters.status ?? "published" })
      // Gift-only products must not surface in any public catalog query.
      .andWhere("p.is_gift_only IS NOT TRUE");

    if (filters.ids?.length) qb.andWhere("p.id IN (:...ids)", { ids: filters.ids });

    if (filters.categoryId) {
      const catIds = Array.isArray(filters.categoryId) ? filters.categoryId : [filters.categoryId];
      qb.andWhere(
        "EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (:...catIds))",
        { catIds },
      );
    }
    if (filters.brandId) {
      const brandIds = Array.isArray(filters.brandId) ? filters.brandId : [filters.brandId];
      qb.andWhere("p.brand_id IN (:...brandIds)", { brandIds });
    }
    if (filters.vendorId) {
      const vIds = Array.isArray(filters.vendorId) ? filters.vendorId : [filters.vendorId];
      qb.andWhere("p.vendor_id IN (:...vIds)", { vIds });
    }
    if (filters.minPrice !== undefined)
      qb.andWhere("p.price >= :minPrice", { minPrice: filters.minPrice });
    if (filters.maxPrice !== undefined)
      qb.andWhere("p.price <= :maxPrice", { maxPrice: filters.maxPrice });
    if (filters.minRating !== undefined && Number.isFinite(Number(filters.minRating)))
      qb.andWhere("p.rating_avg >= :minRating", { minRating: Number(filters.minRating) });
    if (filters.tags?.length) qb.andWhere("p.tags && :tags", { tags: filters.tags });
    if (filters.skus?.length) {
      qb.andWhere(
        "(p.sku IN (:...skus) OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.sku IN (:...skus)))",
        { skus: filters.skus },
      );
    }

    switch (filters.sortBy) {
      case "price_asc":
        qb.orderBy("p.price", "ASC");
        break;
      case "price_desc":
        qb.orderBy("p.price", "DESC");
        break;
      case "rating":
        qb.orderBy("p.rating_avg", "DESC");
        break;
      default:
        qb.orderBy("p.created_at", "DESC");
    }
    qb.addOrderBy("p.id", "ASC");
    qb.limit(cap);

    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  async indexProduct(_product: any): Promise<void> {
    // No-op for PostgreSQL — search_vector is auto-updated by DB trigger
  }

  async removeProduct(_productId: string): Promise<void> {
    // No-op for PostgreSQL — soft delete handles this
  }

  // TODO: implement Postgres-based suggest if/when adapter is selected at runtime
  async suggest(_query: string, _limit?: number): Promise<SuggestProduct[]> {
    return [];
  }
}
