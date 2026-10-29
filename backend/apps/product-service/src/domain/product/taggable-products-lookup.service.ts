import type { Product } from "@materialhub/database";
import type { Repository } from "typeorm";

export interface TaggableProductRow {
  product_id: string;
  name: string;
  thumbnail_url: string | null;
  variant_label: string | null;
  delivered_at: string | null;
}

export interface ListByVendorInput {
  vendorId: string;
  q: string | null;
  limit: number;
}

export interface ListByPermissionInput {
  scope: "any_product" | "specific_brand" | "specific_vendor" | "specific_products";
  brandId?: string | null;
  vendorId?: string | null;
  productIds?: string[] | null;
  q: string | null;
  limit: number;
}

export class TaggableProductsLookupService {
  constructor(private readonly productRepo: Repository<Product>) {}

  private clampLimit(limit: number): number {
    return Math.min(Math.max(limit, 1), 50);
  }

  async listByVendor(input: ListByVendorInput): Promise<TaggableProductRow[]> {
    const qb = this.productRepo
      .createQueryBuilder("p")
      .leftJoin(
        "product_images",
        "pi",
        "pi.product_id = p.id AND pi.is_primary = TRUE AND pi.deleted_at IS NULL",
      )
      .select(["p.id AS product_id", "p.name AS name", "pi.url AS thumbnail_url"])
      .where("p.vendor_id = :vendorId", { vendorId: input.vendorId })
      .andWhere("p.deleted_at IS NULL")
      .andWhere("p.status = :publishedStatus", { publishedStatus: "published" })
      .orderBy("p.created_at", "DESC")
      .addOrderBy("p.id", "DESC")
      .limit(this.clampLimit(input.limit));

    if (input.q && input.q.trim().length > 0) {
      qb.andWhere("p.name ILIKE :qLike", { qLike: `%${input.q}%` });
    }

    const raw = await qb.getRawMany();
    return raw.map((r) => ({
      product_id: r.product_id,
      name: r.name,
      thumbnail_url: r.thumbnail_url ?? null,
      variant_label: null,
      delivered_at: null,
    }));
  }

  async listByPermission(input: ListByPermissionInput): Promise<TaggableProductRow[]> {
    const qb = this.productRepo
      .createQueryBuilder("p")
      .leftJoin(
        "product_images",
        "pi",
        "pi.product_id = p.id AND pi.is_primary = TRUE AND pi.deleted_at IS NULL",
      )
      .select(["p.id AS product_id", "p.name AS name", "pi.url AS thumbnail_url"])
      .where("p.deleted_at IS NULL")
      .andWhere("p.status = :publishedStatus", { publishedStatus: "published" })
      .orderBy("p.created_at", "DESC")
      .addOrderBy("p.id", "DESC")
      .limit(this.clampLimit(input.limit));

    switch (input.scope) {
      case "any_product":
        break;
      case "specific_brand":
        if (!input.brandId) return [];
        qb.andWhere("p.brand_id = :brandId", { brandId: input.brandId });
        break;
      case "specific_vendor":
        if (!input.vendorId) return [];
        qb.andWhere("p.vendor_id = :vendorId", { vendorId: input.vendorId });
        break;
      case "specific_products":
        if (!input.productIds || input.productIds.length === 0) return [];
        qb.andWhere("p.id = ANY(:productIds)", { productIds: input.productIds });
        break;
    }

    if (input.q && input.q.trim().length > 0) {
      qb.andWhere("p.name ILIKE :qLike", { qLike: `%${input.q}%` });
    }

    const raw = await qb.getRawMany();
    return raw.map((r) => ({
      product_id: r.product_id,
      name: r.name,
      thumbnail_url: r.thumbnail_url ?? null,
      variant_label: null,
      delivered_at: null,
    }));
  }
}
