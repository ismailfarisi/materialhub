import { BulkErrorCodes, type RowError } from "@materialhub/bulk-jobs";
import { BulkImportMode } from "@materialhub/database";
import type { CatalogImportCtx } from "./catalog-import.context.ts";
import type { CoercedProductRow, CoercedVariantRow } from "./catalog-import.schemas.ts";

export interface CrossValidateResult {
  errors: RowError[];
  validProducts: CoercedProductRow[];
  validVariants: CoercedVariantRow[];
}

export function crossValidate(
  products: CoercedProductRow[],
  variants: CoercedVariantRow[],
  ctx: CatalogImportCtx,
): CrossValidateResult {
  const errors: RowError[] = [];
  const bannedProductRows = new Set<number>();
  const bannedVariantRows = new Set<number>();
  const isUpdate = ctx.mode === BulkImportMode.Update;

  const pushProduct = (
    rowNumber: number,
    code: string,
    message: string,
    field: string | null,
    snap: Record<string, unknown>,
  ) => {
    errors.push({
      rowNumber,
      sheetName: "Products",
      errorCode: code,
      errorMessage: message,
      field,
      rowSnapshot: snap,
    });
    bannedProductRows.add(rowNumber);
  };

  const pushVariant = (
    rowNumber: number,
    code: string,
    message: string,
    field: string | null,
    snap: Record<string, unknown>,
  ) => {
    errors.push({
      rowNumber,
      sheetName: "Variants",
      errorCode: code,
      errorMessage: message,
      field,
      rowSnapshot: snap,
    });
    bannedVariantRows.add(rowNumber);
  };

  // Duplicate key detection within Products
  const seenExternal = new Map<string, number>();
  const seenSku = new Map<string, number>();
  for (const p of products) {
    if (p.externalId) {
      const prior = seenExternal.get(p.externalId);
      if (prior !== undefined) {
        pushProduct(
          p.rowNumber,
          BulkErrorCodes.DUPLICATE_KEY_IN_FILE,
          `duplicate external_id "${p.externalId}"`,
          "external_id",
          { external_id: p.externalId },
        );
        pushProduct(
          prior,
          BulkErrorCodes.DUPLICATE_KEY_IN_FILE,
          `duplicate external_id "${p.externalId}"`,
          "external_id",
          { external_id: p.externalId },
        );
      } else {
        seenExternal.set(p.externalId, p.rowNumber);
      }
    }
    if (p.sku) {
      const prior = seenSku.get(p.sku);
      if (prior !== undefined) {
        pushProduct(
          p.rowNumber,
          BulkErrorCodes.DUPLICATE_KEY_IN_FILE,
          `duplicate sku "${p.sku}"`,
          "sku",
          { sku: p.sku },
        );
        pushProduct(
          prior,
          BulkErrorCodes.DUPLICATE_KEY_IN_FILE,
          `duplicate sku "${p.sku}"`,
          "sku",
          { sku: p.sku },
        );
      } else {
        seenSku.set(p.sku, p.rowNumber);
      }
    }
  }

  for (const p of products) {
    if (bannedProductRows.has(p.rowNumber)) continue;

    const existing =
      (p.externalId && ctx.productsByExternalId.get(p.externalId)) ||
      (p.sku && ctx.productsBySku.get(p.sku)) ||
      null;

    if (isUpdate && !existing) {
      pushProduct(
        p.rowNumber,
        BulkErrorCodes.UPDATE_PRODUCT_NOT_FOUND,
        `no existing product matches "${p.externalId ?? p.sku}"`,
        p.externalId ? "external_id" : "sku",
        { external_id: p.externalId, sku: p.sku },
      );
      continue;
    }

    // Category: required in upsert mode (coerce guarantees a slug is present);
    // in update mode validate only when a slug was actually provided.
    if (p.categorySlug) {
      if (!ctx.categoriesBySlug.get(p.categorySlug)) {
        pushProduct(
          p.rowNumber,
          BulkErrorCodes.UNKNOWN_CATEGORY,
          `unknown category_slug "${p.categorySlug}"`,
          "category_slug",
          { category_slug: p.categorySlug },
        );
        continue;
      }
    } else if (!isUpdate) {
      pushProduct(
        p.rowNumber,
        BulkErrorCodes.UNKNOWN_CATEGORY,
        `unknown category_slug "${p.categorySlug}"`,
        "category_slug",
        { category_slug: p.categorySlug },
      );
      continue;
    }

    if (p.brandSlug && !ctx.brandsBySlug.has(p.brandSlug)) {
      pushProduct(
        p.rowNumber,
        BulkErrorCodes.UNKNOWN_BRAND,
        `unknown brand_slug "${p.brandSlug}"`,
        "brand_slug",
        { brand_slug: p.brandSlug },
      );
      continue;
    }

    let attrOk = true;
    for (const a of p.attributes) {
      const info = ctx.attributesBySlug.get(a.slug);
      if (!info) {
        pushProduct(
          p.rowNumber,
          BulkErrorCodes.UNKNOWN_ATTRIBUTE,
          `unknown attribute "attr.${a.slug}"`,
          `attr.${a.slug}`,
          { [`attr.${a.slug}`]: a.value },
        );
        attrOk = false;
        break;
      }
      if (info.valuesBySlug.size > 0) {
        const val = info.valuesBySlug.get(a.value.toLowerCase());
        if (!val) {
          const suggestions = [...info.valuesBySlug.keys()].slice(0, 5).join(", ");
          pushProduct(
            p.rowNumber,
            BulkErrorCodes.UNKNOWN_ATTRIBUTE_VALUE,
            `value "${a.value}" not allowed for "${a.slug}" (try: ${suggestions})`,
            `attr.${a.slug}`,
            { [`attr.${a.slug}`]: a.value },
          );
          attrOk = false;
          break;
        }
      }
    }
    if (!attrOk) continue;
  }

  for (const p of products) {
    if (bannedProductRows.has(p.rowNumber) || !p.groupName) continue;

    if (!p.groupAttribute) {
      pushProduct(
        p.rowNumber,
        BulkErrorCodes.GROUP_ATTRIBUTE_REQUIRED,
        "group_attribute is required when group_name is set",
        "group_attribute",
        { group_name: p.groupName },
      );
      continue;
    }

    const info = ctx.attributesBySlug.get(p.groupAttribute);
    if (!info || !info.isGroupable || (info.type !== "select" && info.type !== "color")) {
      pushProduct(
        p.rowNumber,
        BulkErrorCodes.ATTRIBUTE_NOT_GROUPABLE,
        `group_attribute "${p.groupAttribute}" must be a groupable select/color attribute`,
        "group_attribute",
        { group_attribute: p.groupAttribute },
      );
      continue;
    }

    const valueAttr = p.attributes.find((a) => a.slug === p.groupAttribute);
    const resolved = valueAttr ? info.valuesBySlug.get(valueAttr.value.toLowerCase()) : undefined;
    if (!resolved) {
      pushProduct(
        p.rowNumber,
        BulkErrorCodes.GROUP_VALUE_MISSING,
        `row in group "${p.groupName}" has no valid "${p.groupAttribute}" value`,
        "group_attribute",
        { group_name: p.groupName, group_attribute: p.groupAttribute },
      );
    }
  }

  const byGroup = new Map<string, CoercedProductRow[]>();
  for (const p of products) {
    if (!p.groupName) continue;
    const list = byGroup.get(p.groupName) ?? [];
    list.push(p);
    byGroup.set(p.groupName, list);
  }

  for (const [groupName, rows] of byGroup) {
    const attrs = new Set(rows.map((r) => r.groupAttribute).filter(Boolean));
    if (attrs.size > 1) {
      for (const r of rows) {
        pushProduct(
          r.rowNumber,
          BulkErrorCodes.INCONSISTENT_GROUP_ATTRIBUTE,
          `group "${groupName}" uses more than one group_attribute`,
          "group_attribute",
          { group_name: groupName, group_attribute: r.groupAttribute },
        );
      }
      continue;
    }

    const seenValues = new Set<string>();
    for (const r of rows) {
      const valueAttr = r.attributes.find((a) => a.slug === r.groupAttribute);
      const key = valueAttr?.value.toLowerCase();
      if (!key) continue;
      if (seenValues.has(key)) {
        pushProduct(
          r.rowNumber,
          BulkErrorCodes.DUPLICATE_GROUP_VALUE,
          `group "${groupName}" repeats the value "${key}"`,
          "group_attribute",
          {
            group_name: groupName,
            group_attribute: r.groupAttribute,
            value: key,
          },
        );
      }
      seenValues.add(key);
    }
  }

  for (const v of variants) {
    const parentKey = v.productExternalId ?? v.productSku ?? "";
    const parentInFile = products.find(
      (p) =>
        (v.productExternalId && p.externalId === v.productExternalId) ||
        (v.productSku && p.sku === v.productSku),
    );
    const parentInDb =
      (v.productExternalId && ctx.productsByExternalId.get(v.productExternalId)) ||
      (v.productSku && ctx.productsBySku.get(v.productSku)) ||
      null;

    if (isUpdate) {
      if (!parentInDb) {
        pushVariant(
          v.rowNumber,
          BulkErrorCodes.UPDATE_PRODUCT_NOT_FOUND,
          `no existing product matches "${parentKey}"`,
          v.productExternalId ? "product_external_id" : "product_sku",
          { parent: parentKey },
        );
        continue;
      }
      const varEntry =
        (v.variantExternalId &&
          ctx.variantsByProductAndExternalId.get(
            `${parentInDb.productId}|${v.variantExternalId}`,
          )) ||
        (v.variantSku &&
          ctx.variantsByProductAndSku.get(`${parentInDb.productId}|${v.variantSku}`)) ||
        null;
      if (!varEntry) {
        pushVariant(
          v.rowNumber,
          BulkErrorCodes.UPDATE_VARIANT_NOT_FOUND,
          `no existing variant matches "${v.variantExternalId ?? v.variantSku}"`,
          v.variantExternalId ? "variant_external_id" : "variant_sku",
          { variant: v.variantExternalId ?? v.variantSku },
        );
        continue;
      }
    } else if (!parentInFile && !parentInDb) {
      pushVariant(
        v.rowNumber,
        BulkErrorCodes.UNKNOWN_PRODUCT,
        `no parent product matches "${parentKey}"`,
        v.productExternalId ? "product_external_id" : "product_sku",
        { parent: parentKey },
      );
      continue;
    }

    for (const opt of v.optionValues) {
      const info = ctx.attributesBySlug.get(opt.slug);
      if (!info) {
        pushVariant(
          v.rowNumber,
          BulkErrorCodes.UNKNOWN_ATTRIBUTE,
          `unknown option attribute "option.${opt.slug}"`,
          `option.${opt.slug}`,
          { [`option.${opt.slug}`]: opt.value },
        );
        break;
      }
      if (info.valuesBySlug.size > 0 && !info.valuesBySlug.get(opt.value.toLowerCase())) {
        pushVariant(
          v.rowNumber,
          BulkErrorCodes.UNKNOWN_ATTRIBUTE_VALUE,
          `value "${opt.value}" not allowed for "option.${opt.slug}"`,
          `option.${opt.slug}`,
          { [`option.${opt.slug}`]: opt.value },
        );
        break;
      }
    }
  }

  // Duplicate option combination within a product's variant set
  const perProductVariantKeys = new Map<string, Map<string, number>>();
  for (const v of variants) {
    if (bannedVariantRows.has(v.rowNumber)) continue;
    const parentKey = v.productExternalId ?? v.productSku ?? "";
    const optKey = [...v.optionValues]
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((o) => `${o.slug}=${o.value.toLowerCase()}`)
      .join("&");
    const map = perProductVariantKeys.get(parentKey) ?? new Map<string, number>();
    if (optKey) {
      const prior = map.get(optKey);
      if (prior !== undefined) {
        pushVariant(
          v.rowNumber,
          BulkErrorCodes.DUPLICATE_VARIANT_OPTIONS,
          `duplicate option combination for parent "${parentKey}"`,
          null,
          { optionKey: optKey },
        );
        pushVariant(
          prior,
          BulkErrorCodes.DUPLICATE_VARIANT_OPTIONS,
          `duplicate option combination for parent "${parentKey}"`,
          null,
          { optionKey: optKey },
        );
      } else {
        map.set(optKey, v.rowNumber);
      }
    }
    perProductVariantKeys.set(parentKey, map);
  }

  const validProducts = products.filter((p) => !bannedProductRows.has(p.rowNumber));
  const validVariants = variants.filter((v) => !bannedVariantRows.has(v.rowNumber));
  return { errors, validProducts, validVariants };
}
