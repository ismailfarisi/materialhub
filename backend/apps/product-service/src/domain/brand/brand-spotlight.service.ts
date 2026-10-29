import { AppDataSource } from "@materialhub/database";

export interface BrandSpotlightCandidate {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  product_count: number;
  is_featured: boolean;
}

export interface BrandSpotlightProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_url: string | null;
}

interface ProductRow extends BrandSpotlightProduct {
  brand_id: string;
}

export interface BrandSpotlightItem extends BrandSpotlightCandidate {
  top_products: BrandSpotlightProduct[];
}

export class BrandSpotlightService {
  // Indirection so tests can stub.
  protected runQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
    return AppDataSource.query(sql, params);
  }

  async selectBrands(limit: number): Promise<BrandSpotlightCandidate[]> {
    const overFetch = Math.ceil(limit * 1.5);
    const sql = `
      SELECT id, name, slug, logo_url, description, product_count, is_featured
      FROM brands
      WHERE deleted_at IS NULL AND is_active = true AND status = 'approved'
      ORDER BY is_featured DESC, sort_order ASC, product_count DESC, name ASC
      LIMIT $1
    `;
    return this.runQuery<BrandSpotlightCandidate>(sql, [overFetch]);
  }

  async loadTopProductsByBrand(brandIds: string[]): Promise<Map<string, BrandSpotlightProduct[]>> {
    const map = new Map<string, BrandSpotlightProduct[]>();
    if (!brandIds.length) return map;

    const sql = `
      SELECT b.id AS brand_id,
             p.id, p.name, p.slug, p.price,
             (SELECT pi.url
                FROM product_images pi
               WHERE pi.product_id = p.id AND pi.deleted_at IS NULL
               ORDER BY pi.is_primary DESC, pi.sort_order ASC
               LIMIT 1) AS image_url
      FROM unnest($1::uuid[]) AS b(id)
      JOIN LATERAL (
        SELECT id, name, slug, price, sales_count, created_at
          FROM products
         WHERE brand_id = b.id
           AND deleted_at IS NULL
           AND status = 'published'
         ORDER BY (sales_count > 0) DESC, sales_count DESC, created_at DESC
         LIMIT 3
      ) p ON true
    `;
    const rows = await this.runQuery<ProductRow>(sql, [brandIds]);
    for (const r of rows) {
      const arr = map.get(r.brand_id) ?? [];
      arr.push({ id: r.id, name: r.name, slug: r.slug, price: r.price, image_url: r.image_url });
      map.set(r.brand_id, arr);
    }
    return map;
  }

  async getSpotlight(rawLimit: number): Promise<BrandSpotlightItem[]> {
    const limit = Math.max(4, Math.min(12, rawLimit | 0));
    const candidates = await this.selectBrands(limit);
    const productsByBrand = await this.loadTopProductsByBrand(candidates.map((c) => c.id));

    const enriched: BrandSpotlightItem[] = [];
    for (const c of candidates) {
      const top = productsByBrand.get(c.id);
      if (!top || top.length === 0) continue;
      enriched.push({ ...c, top_products: top });
      if (enriched.length === limit) break;
    }
    return enriched;
  }
}
