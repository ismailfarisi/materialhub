import { BulkErrorCodes, type ParsedRow, type RowError } from "@materialhub/bulk-jobs";
import { BulkImportMode } from "@materialhub/database";
import type { CoercedProductRow, CoercedVariantRow } from "./catalog-import.schemas.ts";

function intOrNull(v: string | undefined): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isNaN(n) ? Number.NaN : n;
}
function boolOrDefault(v: string | undefined, def: boolean): boolean {
  if (v == null) return def;
  const t = v.trim().toLowerCase();
  if (t === "") return def;
  return t === "true" || t === "1" || t === "yes";
}
function boolOrNull(v: string | undefined): boolean | null {
  if (v == null) return null;
  const t = v.trim().toLowerCase();
  if (t === "") return null;
  return t === "true" || t === "1" || t === "yes";
}
function split(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}
function textOrNull(v: string | undefined): string | null {
  return (v ?? "").trim() || null;
}

export function coerceProductRow(
  row: ParsedRow,
  mode: BulkImportMode = BulkImportMode.Upsert,
): { ok: true; value: CoercedProductRow } | { ok: false; errors: RowError[] } {
  const errors: RowError[] = [];
  const v = row.values;
  const isUpdate = mode === BulkImportMode.Update;

  function err(code: string, message: string, field: string | null) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: code,
      errorMessage: message,
      field,
      rowSnapshot: { ...v },
    });
  }

  const externalId = (v.external_id ?? "").trim() || null;
  const sku = (v.sku ?? "").trim() || null;
  if (!externalId && !sku)
    err(BulkErrorCodes.MISSING_REQUIRED_FIELD, "external_id or sku is required", "external_id");

  const name = (v.name ?? "").trim() || null;
  const categorySlug = (v.category_slug ?? "").trim().toLowerCase() || null;
  const groupName = (v.group_name ?? "").trim() || null;
  const groupAttribute = (v.group_attribute ?? "").trim().toLowerCase() || null;
  const priceStr = (v.price ?? "").trim();
  const priceParsed = intOrNull(priceStr);

  if (!name && !isUpdate) err(BulkErrorCodes.MISSING_REQUIRED_FIELD, "name is required", "name");
  if (!categorySlug && !isUpdate)
    err(BulkErrorCodes.MISSING_REQUIRED_FIELD, "category_slug is required", "category_slug");
  if ((priceStr === "" || priceParsed == null) && !isUpdate)
    err(BulkErrorCodes.MISSING_REQUIRED_FIELD, "price is required", "price");
  if (priceParsed != null && Number.isNaN(priceParsed))
    err(BulkErrorCodes.INVALID_PRICE, "price must be an integer in fils", "price");
  if (priceParsed != null && !Number.isNaN(priceParsed) && priceParsed < 0)
    err(BulkErrorCodes.INVALID_PRICE, "price must be >= 0", "price");

  const statusRaw = (v.status ?? "").trim() || null;
  // No "active"/"published": going live needs admin approval, then Publish.
  const allowedStatuses = ["draft", "pending_review", "archived"] as const;
  let status: CoercedProductRow["status"] = null;
  if (statusRaw) {
    if ((allowedStatuses as readonly string[]).includes(statusRaw)) {
      status = statusRaw as (typeof allowedStatuses)[number];
    } else {
      err(
        BulkErrorCodes.INVALID_VALUE,
        `status must be one of ${allowedStatuses.join(", ")}`,
        "status",
      );
    }
  }

  const attributes: Array<{ slug: string; value: string }> = [];
  for (const [k, val] of Object.entries(v)) {
    if (!k.startsWith("attr.")) continue;
    const trimmed = String(val ?? "").trim();
    if (trimmed === "") continue;
    attributes.push({ slug: k.slice(5).toLowerCase(), value: trimmed });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      rowNumber: row.rowNumber,
      externalId,
      sku,
      name,
      slug: textOrNull(v.slug),
      shortDescription: textOrNull(v.short_description),
      description: textOrNull(v.description),
      ingredients: textOrNull(v.ingredients),
      usageInstructions: textOrNull(v.usage_instruction) ?? textOrNull(v.usage_instructions),
      categorySlug,
      brandSlug: textOrNull(v.brand_slug)?.toLowerCase() ?? null,
      status,
      price: priceParsed,
      compareAtPrice: intOrNull(v.compare_at_price),
      costPrice: intOrNull(v.cost_price),
      currency: textOrNull(v.currency),
      hasVariants: isUpdate ? boolOrNull(v.has_variants) : boolOrDefault(v.has_variants, false),
      trackInventory: isUpdate
        ? boolOrNull(v.track_inventory)
        : boolOrDefault(v.track_inventory, true),
      allowBackorder: isUpdate
        ? boolOrNull(v.allow_backorder)
        : boolOrDefault(v.allow_backorder, false),
      requiresShipping: isUpdate
        ? boolOrNull(v.requires_shipping)
        : boolOrDefault(v.requires_shipping, true),
      weightGrams: intOrNull(v.weight_grams),
      barcode: textOrNull(v.barcode),
      mpn: textOrNull(v.mpn),
      tags: split(v.tags),
      metaTitle: textOrNull(v.meta_title),
      metaDescription: textOrNull(v.meta_description),
      metaKeywords: textOrNull(v.meta_keywords),
      imageUrls: split(v.image_urls),
      initialQuantity: intOrNull(v.initial_quantity),
      groupName,
      groupAttribute,
      attributes,
    },
  };
}

export function coerceVariantRow(
  row: ParsedRow,
  mode: BulkImportMode = BulkImportMode.Upsert,
): { ok: true; value: CoercedVariantRow } | { ok: false; errors: RowError[] } {
  const errors: RowError[] = [];
  const v = row.values;
  const isUpdate = mode === BulkImportMode.Update;

  function err(code: string, msg: string, field: string | null) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: code,
      errorMessage: msg,
      field,
      rowSnapshot: { ...v },
    });
  }

  const productExternalId = (v.product_external_id ?? "").trim() || null;
  const productSku = (v.product_sku ?? "").trim() || null;
  const variantExternalId = (v.variant_external_id ?? "").trim() || null;
  const variantSku = (v.variant_sku ?? "").trim() || null;

  if (!productExternalId && !productSku)
    err(
      BulkErrorCodes.MISSING_REQUIRED_FIELD,
      "product_external_id or product_sku required",
      "product_sku",
    );
  if (!variantExternalId && !variantSku)
    err(
      BulkErrorCodes.MISSING_REQUIRED_FIELD,
      "variant_external_id or variant_sku required",
      "variant_sku",
    );

  const optionValues: Array<{ slug: string; value: string }> = [];
  for (const [k, val] of Object.entries(v)) {
    if (!k.startsWith("option.")) continue;
    const trimmed = String(val ?? "").trim();
    if (trimmed === "") continue;
    optionValues.push({ slug: k.slice(7).toLowerCase(), value: trimmed });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      rowNumber: row.rowNumber,
      productExternalId,
      productSku,
      variantExternalId,
      variantSku,
      name: (v.name ?? "").trim() || null,
      price: intOrNull(v.price),
      compareAtPrice: intOrNull(v.compare_at_price),
      costPrice: intOrNull(v.cost_price),
      weightGrams: intOrNull(v.weight_grams),
      lengthCm: intOrNull(v.length_cm),
      widthCm: intOrNull(v.width_cm),
      heightCm: intOrNull(v.height_cm),
      barcode: (v.barcode ?? "").trim() || null,
      isActive: isUpdate ? boolOrNull(v.is_active) : boolOrDefault(v.is_active, true),
      sortOrder: isUpdate ? intOrNull(v.sort_order) : (intOrNull(v.sort_order) ?? 0),
      initialQuantity: intOrNull(v.initial_quantity),
      imageUrls: split(v.image_urls),
      optionValues,
    },
  };
}
