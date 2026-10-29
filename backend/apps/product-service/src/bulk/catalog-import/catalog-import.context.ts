import { config } from "@materialhub/config";
import {
  Attribute,
  AttributeValue,
  Brand,
  BulkImportMode,
  Category,
  CategoryAttribute,
  Product,
  ProductVariant,
  Warehouse,
} from "@materialhub/database";
import type { DataSource } from "typeorm";

export interface ResolvedProductKey {
  productId: string;
  hasVariants: boolean;
  deleted: boolean;
}

export interface ResolvedVariantKey {
  variantId: string;
  productId: string;
  deleted: boolean;
}

export interface AttributeInfo {
  id: string;
  slug: string;
  type: string;
  isFilterable: boolean;
  isVariant: boolean;
  isGroupable: boolean;
  valuesBySlug: Map<string, { id: string; slug: string; value: string }>;
}

export interface CatalogImportCtx {
  vendorId: string;
  mode: BulkImportMode;
  defaultWarehouseId: string | null;
  categoriesBySlug: Map<string, { id: string; slug: string }>;
  brandsBySlug: Map<string, { id: string; slug: string }>;
  attributesBySlug: Map<string, AttributeInfo>;
  /** categoryId → required attribute slugs (both variant + non-variant). */
  requiredAttrsByCategory: Map<string, Set<string>>;
  productsBySku: Map<string, ResolvedProductKey>;
  productsByExternalId: Map<string, ResolvedProductKey>;
  variantsByProductAndSku: Map<string, ResolvedVariantKey>;
  variantsByProductAndExternalId: Map<string, ResolvedVariantKey>;
  /** Public Drive API key for folder URL expansion. null disables folder support. */
  googleDriveApiKey: string | null;
}

function slugKey(s: string): string {
  return s.trim().toLowerCase();
}

export async function buildCatalogImportContext(args: {
  dataSource: DataSource;
  vendorId: string | null;
  importMode?: BulkImportMode;
}): Promise<CatalogImportCtx> {
  if (!args.vendorId) throw new Error("catalog_import requires a vendor");
  const ds = args.dataSource;

  const warehouseRow = await ds
    .getRepository(Warehouse)
    .createQueryBuilder("w")
    .where(
      "w.vendor_id = :v AND w.is_default = true AND w.is_active = true AND w.deleted_at IS NULL",
      { v: args.vendorId },
    )
    .getOne();

  const categoriesBySlug = new Map<string, { id: string; slug: string }>();
  const allCategories = await ds.getRepository(Category).find();
  const categoriesById = new Map<string, Category>();
  for (const c of allCategories) {
    categoriesBySlug.set(slugKey(c.slug), { id: c.id, slug: c.slug });
    categoriesById.set(c.id, c);
  }

  const brandsBySlug = new Map<string, { id: string; slug: string }>();
  for (const b of await ds.getRepository(Brand).find()) {
    brandsBySlug.set(slugKey(b.slug), { id: b.id, slug: b.slug });
  }

  const attributesBySlug = new Map<string, AttributeInfo>();
  const attrs = await ds.getRepository(Attribute).find();
  const values = await ds.getRepository(AttributeValue).find();
  const valuesByAttr = new Map<string, AttributeValue[]>();
  for (const v of values) {
    const list = valuesByAttr.get(v.attribute_id) ?? [];
    list.push(v);
    valuesByAttr.set(v.attribute_id, list);
  }
  for (const a of attrs) {
    const valuesBySlug = new Map<string, { id: string; slug: string; value: string }>();
    for (const v of valuesByAttr.get(a.id) ?? []) {
      valuesBySlug.set(slugKey(v.slug), {
        id: v.id,
        slug: v.slug,
        value: v.value,
      });
    }
    attributesBySlug.set(slugKey(a.slug), {
      id: a.id,
      slug: a.slug,
      type: a.type,
      isFilterable: a.is_filterable,
      isVariant: a.is_variant,
      isGroupable: a.is_groupable,
      valuesBySlug,
    });
  }

  const directRequiredAttrsByCategory = new Map<string, Set<string>>();
  const reqRows = await ds
    .getRepository(CategoryAttribute)
    .createQueryBuilder("ca")
    .innerJoinAndSelect("ca.attribute", "a")
    .where("ca.is_required = true")
    .getMany();
  for (const ca of reqRows) {
    const set = directRequiredAttrsByCategory.get(ca.category_id) ?? new Set();
    set.add(slugKey(ca.attribute.slug));
    directRequiredAttrsByCategory.set(ca.category_id, set);
  }
  const requiredAttrsByCategory = new Map<string, Set<string>>();
  for (const category of allCategories) {
    const inherited = new Set<string>();
    let cursor: Category | undefined = category;
    while (cursor) {
      for (const slug of directRequiredAttrsByCategory.get(cursor.id) ?? []) {
        inherited.add(slug);
      }
      cursor = cursor.parent_id ? categoriesById.get(cursor.parent_id) : undefined;
    }
    if (inherited.size > 0) requiredAttrsByCategory.set(category.id, inherited);
  }

  const products = await ds
    .getRepository(Product)
    .createQueryBuilder("p")
    .where("p.vendor_id = :v", { v: args.vendorId })
    .getMany();
  const variants = await ds
    .getRepository(ProductVariant)
    .createQueryBuilder("v")
    .innerJoin("v.product", "p")
    .where("p.vendor_id = :v", { v: args.vendorId })
    .getMany();

  const productsBySku = new Map<string, ResolvedProductKey>();
  const productsByExternalId = new Map<string, ResolvedProductKey>();
  for (const p of products) {
    const entry: ResolvedProductKey = {
      productId: p.id,
      hasVariants: !!p.has_variants,
      deleted: p.deleted_at != null,
    };
    if (p.sku) productsBySku.set(p.sku, entry);
    if (p.external_id) productsByExternalId.set(p.external_id, entry);
  }

  const variantsByProductAndSku = new Map<string, ResolvedVariantKey>();
  const variantsByProductAndExternalId = new Map<string, ResolvedVariantKey>();
  for (const v of variants) {
    const entry: ResolvedVariantKey = {
      variantId: v.id,
      productId: v.product_id,
      deleted: v.deleted_at != null,
    };
    if (v.sku) variantsByProductAndSku.set(`${v.product_id}|${v.sku}`, entry);
    if (v.external_id)
      variantsByProductAndExternalId.set(`${v.product_id}|${v.external_id}`, entry);
  }

  return {
    vendorId: args.vendorId,
    mode: args.importMode ?? BulkImportMode.Upsert,
    defaultWarehouseId: warehouseRow?.id ?? null,
    categoriesBySlug,
    brandsBySlug,
    attributesBySlug,
    requiredAttrsByCategory,
    productsBySku,
    productsByExternalId,
    variantsByProductAndSku,
    variantsByProductAndExternalId,
    googleDriveApiKey: config.google.driveApiKey,
  };
}
