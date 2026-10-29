import { BulkErrorCodes, type ParsedRow, type RowError } from "@materialhub/bulk-jobs";
import {
  type ExistingDeal,
  checkOverlapAgainstSet,
  validatePriceRange,
} from "../../domain/flash-deal/validation.ts";
import { coerceFlashDealImportRow } from "./flash-deal-import.coerce.ts";
import type { FlashDealImportCtx } from "./flash-deal-import.context.ts";

/**
 * Cross-row + against-context validation. Mutates ctx.existingActiveDeals to
 * include synthetic in-batch entries (id starts with `_pending:`) so subsequent
 * rows in the same file collide.
 */
export function validateFlashDealImport(rows: ParsedRow[], ctx: FlashDealImportCtx): RowError[] {
  const errors: RowError[] = [];

  for (const parsed of rows) {
    const c = coerceFlashDealImportRow(parsed);
    if (!c.ok) {
      // Coerce errors emitted in the per-row pass; skip here to avoid duplication.
      continue;
    }
    const row = c.value;

    // 1. Resolve sku/external_id
    const resolved =
      (row.external_id && ctx.byExternalId.get(row.external_id)) ||
      (row.sku && ctx.bySku.get(row.sku));
    if (!resolved) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        errorCode: BulkErrorCodes.UNKNOWN_PRODUCT,
        errorMessage: `no product or variant matches sku="${row.sku ?? ""}" / external_id="${row.external_id ?? ""}"`,
        field: row.external_id ? "external_id" : "sku",
        rowSnapshot: { ...parsed.values },
      });
      continue;
    }
    if (resolved.deleted) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        errorCode: BulkErrorCodes.SOFT_DELETED,
        errorMessage: "target product is soft-deleted",
        field: row.external_id ? "external_id" : "sku",
        rowSnapshot: { ...parsed.values },
      });
      continue;
    }
    if (row.sku && ctx.duplicateSkus.has(row.sku)) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        errorCode: BulkErrorCodes.AMBIGUOUS_PRODUCT,
        errorMessage: `sku "${row.sku}" matches multiple rows in your catalog; use external_id instead`,
        field: "sku",
        rowSnapshot: { ...parsed.values },
      });
      continue;
    }
    if (resolved.hasVariants && !resolved.variantId) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        errorCode: BulkErrorCodes.HAS_VARIANTS_BUT_NO_VARIANT_KEY,
        errorMessage: "target product has variants — specify the variant sku/external_id instead",
        field: row.external_id ? "external_id" : "sku",
        rowSnapshot: { ...parsed.values },
      });
      continue;
    }

    // 2. Default original_price from product / variant snapshot if blank
    const effectiveOriginal =
      row.original_price ??
      (resolved.variantId
        ? (ctx.variantPrices.get(resolved.variantId) ?? ctx.productPrices.get(resolved.productId))
        : ctx.productPrices.get(resolved.productId)) ??
      0;

    // 3. Price range
    const priceErr = validatePriceRange(row.deal_price, effectiveOriginal);
    if (priceErr) {
      errors.push({
        ...priceErr,
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        rowSnapshot: { ...parsed.values },
      });
      continue;
    }

    // 4. Overlap check (in-batch synthetic entries collide with `DUPLICATE_KEY_IN_FILE`)
    const overlap = checkOverlapAgainstSet(
      resolved.productId,
      resolved.variantId,
      row.starts_at,
      row.expires_at,
      ctx.existingActiveDeals,
    );
    if (overlap) {
      errors.push({
        ...overlap,
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        rowSnapshot: { ...parsed.values },
        ...(matchedInBatch(
          ctx.existingActiveDeals,
          resolved.productId,
          resolved.variantId,
          row.starts_at,
          row.expires_at,
        )
          ? {
              errorCode: BulkErrorCodes.DUPLICATE_KEY_IN_FILE,
              errorMessage:
                "another row in this file already targets the same product/variant in an overlapping window",
            }
          : {}),
      });
      continue;
    }

    // Append synthetic entry so subsequent rows collide
    ctx.existingActiveDeals.push({
      id: `_pending:${row.rowNumber}`,
      product_id: resolved.productId,
      variant_id: resolved.variantId,
      starts_at: row.starts_at,
      expires_at: row.expires_at,
    });
  }

  return errors;
}

function matchedInBatch(
  existing: ExistingDeal[],
  productId: string,
  variantId: string | null,
  startsAt: Date,
  expiresAt: Date,
): boolean {
  for (const e of existing) {
    if (!e.id.startsWith("_pending:")) continue;
    if (e.product_id !== productId) continue;
    const variantOverlap =
      variantId !== null
        ? e.variant_id === null || e.variant_id === variantId
        : e.variant_id === null;
    if (!variantOverlap) continue;
    if (e.starts_at < expiresAt && e.expires_at > startsAt) return true;
  }
  return false;
}
