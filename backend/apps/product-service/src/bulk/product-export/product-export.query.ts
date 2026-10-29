import type { DataSource } from "typeorm";
import { categoryDescendantPredicate } from "../../domain/category/category-descendant.sql.ts";
import type { ProductExportReportRow } from "./product-export.serializer.ts";
import type { ProductExportFilters, ResolvedProductExportFields } from "./product-export.types.ts";

type ProductExportSheet = ResolvedProductExportFields["sheets"][number];
type ProductExportCellValue = string | number | boolean | Date | null | undefined;
type DbRow = Record<string, unknown>;

export class ProductExportQuery {
  constructor(private readonly dataSource: DataSource) {}

  async loadRows(args: {
    vendorId: string | null;
    admin: boolean;
    filters: ProductExportFilters;
    fields: string[];
    sheets: ProductExportSheet[];
    maxRows: number;
  }): Promise<ProductExportReportRow[]> {
    const { where, params } = buildProductWhere(args.vendorId, args.admin, args.filters);
    const products = await this.dataSource.query(
      `
      SELECT
        p.id,
        p.external_id,
        p.sku,
        p.name,
        p.slug,
        p.vendor_id,
        v.name AS vendor_name,
        v.status AS vendor_status,
        p.category_id,
        c.name AS category_name,
        p.brand_id,
        b.name AS brand_name,
        p.tags,
        p.price,
        p.compare_at_price,
        p.cost_price,
        p.currency,
        CASE
          WHEN p.price > 0 AND p.cost_price IS NOT NULL THEN p.price - p.cost_price
          ELSE NULL
        END AS margin_estimate,
        p.track_inventory,
        COALESCE(SUM(i.quantity_on_hand), 0)::int AS quantity_on_hand,
        COALESCE(SUM(i.quantity_reserved), 0)::int AS quantity_reserved,
        COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved), 0)::int AS quantity_available,
        CASE
          WHEN COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved), 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved), 0) <= 5 THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_state,
        p.status,
        p.is_featured,
        p.has_variants,
        p.published_at,
        p.meta_title,
        p.meta_description,
        p.meta_keywords,
        primary_image.url AS primary_image_url,
        COALESCE(image_counts.image_count, 0)::int AS image_count,
        COALESCE(video_counts.video_count, 0)::int AS video_count,
        COALESCE(image_counts.missing_alt_count, 0)::int AS missing_alt_count,
        COALESCE(attribute_counts.attribute_count, 0)::int AS attribute_count,
        COALESCE(variant_counts.variant_count, 0)::int AS variant_count,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN inventory i ON i.product_id = p.id AND i.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id AND pi.deleted_at IS NULL
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) primary_image ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS image_count,
          COUNT(*) FILTER (WHERE COALESCE(pi.alt_text, '') = '')::int AS missing_alt_count
        FROM product_images pi
        WHERE pi.product_id = p.id AND pi.deleted_at IS NULL
      ) image_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS video_count
        FROM product_videos pv
        WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
      ) video_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS attribute_count
        FROM product_attribute_values pav
        WHERE pav.product_id = p.id AND pav.deleted_at IS NULL
      ) attribute_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS variant_count
        FROM product_variants pv
        WHERE pv.product_id = p.id AND pv.deleted_at IS NULL
      ) variant_counts ON TRUE
      ${where}
      GROUP BY
        p.id,
        v.name,
        v.status,
        c.name,
        b.name,
        primary_image.url,
        image_counts.image_count,
        image_counts.missing_alt_count,
        video_counts.video_count,
        attribute_counts.attribute_count,
        variant_counts.variant_count
      HAVING (
        $${params.length + 1}::text IS NULL OR
        CASE
          WHEN COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved), 0) <= 0 THEN 'out_of_stock'
          WHEN COALESCE(SUM(i.quantity_on_hand - i.quantity_reserved), 0) <= 5 THEN 'low_stock'
          ELSE 'in_stock'
        END = $${params.length + 1}
      )
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 2}
      `,
      [...params, args.filters.stockState ?? null, args.maxRows],
    );

    const rows: ProductExportReportRow[] = (products as DbRow[]).map((product) => ({
      productId: String(product.id),
      values: product as ProductExportReportRow["values"],
      summaries: {
        tags: asCellValueOrArray(product.tags),
        quantity_on_hand: asCellValue(product.quantity_on_hand),
        quantity_reserved: asCellValue(product.quantity_reserved),
        quantity_available: asCellValue(product.quantity_available),
        stock_state: asCellValue(product.stock_state),
        meta_keywords: asCellValue(product.meta_keywords),
        primary_image_url: asCellValue(product.primary_image_url),
        image_count: asCellValue(product.image_count),
        video_count: asCellValue(product.video_count),
        missing_alt_count: asCellValue(product.missing_alt_count),
        attribute_count: asCellValue(product.attribute_count),
        variant_count: asCellValue(product.variant_count),
      },
    }));

    const productIds = rows.map((row) => row.productId);
    if (productIds.length === 0) {
      return rows;
    }

    await Promise.all([
      this.attachVariants(rows, productIds, args.sheets),
      this.attachInventory(rows, productIds, args.sheets),
      this.attachMedia(rows, productIds, args.sheets),
      this.attachAttributes(rows, productIds, args.sheets),
    ]);

    return rows;
  }

  private async attachVariants(
    rows: ProductExportReportRow[],
    productIds: string[],
    sheets: ProductExportSheet[],
  ) {
    if (!sheets.includes("variants")) return;
    const variants = await this.dataSource.query(
      `SELECT product_id, id AS variant_id, sku AS variant_sku, name AS variant_name, price AS variant_price,
              compare_at_price AS variant_compare_at_price, cost_price AS variant_cost_price,
              is_active AS variant_is_active, sort_order AS variant_sort_order
       FROM product_variants
       WHERE product_id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY product_id, sort_order, created_at`,
      [productIds],
    );
    attachDetailRows(rows, variants as DbRow[], "variants");
  }

  private async attachInventory(
    rows: ProductExportReportRow[],
    productIds: string[],
    sheets: ProductExportSheet[],
  ) {
    if (!sheets.includes("inventory")) return;
    const inventory = await this.dataSource.query(
      `SELECT product_id, id AS inventory_id, variant_id, warehouse_id,
              quantity_on_hand, quantity_reserved,
              quantity_on_hand - quantity_reserved AS quantity_available,
              low_stock_threshold, reorder_point, max_stock_level
       FROM inventory
       WHERE product_id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY product_id, warehouse_id NULLS FIRST, created_at`,
      [productIds],
    );
    attachDetailRows(rows, inventory as DbRow[], "inventory");
  }

  private async attachMedia(
    rows: ProductExportReportRow[],
    productIds: string[],
    sheets: ProductExportSheet[],
  ) {
    if (!sheets.includes("media")) return;
    const media = await this.dataSource.query(
      `SELECT product_id, id AS media_id, url AS media_url, thumbnail_url, alt_text,
              is_primary, sort_order, width, height, mime_type, file_size
       FROM product_images
       WHERE product_id = ANY($1::uuid[]) AND deleted_at IS NULL
       ORDER BY product_id, is_primary DESC, sort_order, created_at`,
      [productIds],
    );
    attachDetailRows(rows, media as DbRow[], "media");
  }

  private async attachAttributes(
    rows: ProductExportReportRow[],
    productIds: string[],
    sheets: ProductExportSheet[],
  ) {
    if (!sheets.includes("attributes")) return;
    const attributes = await this.dataSource.query(
      `SELECT pav.product_id, pav.id AS product_attribute_value_id,
              a.name AS attribute_name,
              av.value AS attribute_value,
              pav.text_value AS attribute_text_value,
              pav.is_visible AS attribute_is_visible
       FROM product_attribute_values pav
       LEFT JOIN attributes a ON a.id = pav.attribute_id
       LEFT JOIN attribute_values av ON av.id = pav.attribute_value_id
       WHERE pav.product_id = ANY($1::uuid[]) AND pav.deleted_at IS NULL
       ORDER BY pav.product_id, a.name`,
      [productIds],
    );
    attachDetailRows(rows, attributes as DbRow[], "attributes");
  }
}

function asCellValue(value: unknown): ProductExportCellValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function asCellValueOrArray(value: unknown): ProductExportCellValue | ProductExportCellValue[] {
  if (Array.isArray(value)) {
    return value.map(asCellValue);
  }
  return asCellValue(value);
}

function buildProductWhere(vendorId: string | null, admin: boolean, filters: ProductExportFilters) {
  const clauses = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace("?", `$${params.length}`));
  };

  if (!admin && vendorId) add("p.vendor_id = ?", vendorId);
  if (admin && filters.vendorId) add("p.vendor_id = ?", filters.vendorId);
  if (filters.status) add("p.status = ?", filters.status);
  // Category matches itself PLUS its descendants, from the same helper the
  // admin product list uses — the list hands its on-screen filters straight to
  // this export, so an exact-match export against a descendant-matching list
  // means a parent category shows hundreds of products and downloads a handful.
  // Bound by hand rather than via `add`, which only substitutes one `?`.
  if (filters.categoryId) {
    params.push(filters.categoryId);
    clauses.push(categoryDescendantPredicate(`$${params.length}`));
  }
  if (filters.brandId) add("p.brand_id = ?", filters.brandId);
  if (filters.publishState === "published") clauses.push("p.published_at IS NOT NULL");
  if (filters.publishState === "unpublished") clauses.push("p.published_at IS NULL");
  if (filters.createdFrom) add("p.created_at >= ?", filters.createdFrom);
  if (filters.createdTo) add("p.created_at <= ?", filters.createdTo);
  if (filters.updatedFrom) add("p.updated_at >= ?", filters.updatedFrom);
  if (filters.updatedTo) add("p.updated_at <= ?", filters.updatedTo);
  if (filters.search) {
    params.push(`%${filters.search}%`);
    clauses.push(
      `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.slug ILIKE $${params.length})`,
    );
  }

  return { where: `WHERE ${clauses.join(" AND ")}`, params };
}

function attachDetailRows(
  rows: ProductExportReportRow[],
  detailRows: DbRow[],
  key: "variants" | "inventory" | "media" | "attributes",
) {
  const byId = new Map(rows.map((row) => [row.productId, row]));
  for (const detailRow of detailRows) {
    const productId = String(detailRow.product_id);
    const row = byId.get(productId);
    if (!row) continue;
    const existing = row[key] ?? [];
    existing.push(detailRow as Record<string, string | number | boolean | Date | null | undefined>);
    row[key] = existing;
  }
}
