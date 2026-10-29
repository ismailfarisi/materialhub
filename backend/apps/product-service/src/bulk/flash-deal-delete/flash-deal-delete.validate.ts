import { BulkErrorCodes, type ParsedRow, type RowError } from "@materialhub/bulk-jobs";
import { coerceFlashDealDeleteRow } from "./flash-deal-delete.coerce.ts";
import type { FlashDealDeleteCtx } from "./flash-deal-delete.context.ts";

export function validateFlashDealDelete(rows: ParsedRow[], ctx: FlashDealDeleteCtx): RowError[] {
  const errors: RowError[] = [];

  for (const parsed of rows) {
    const c = coerceFlashDealDeleteRow(parsed);
    if (!c.ok) continue; // duplicates per-row coerce errors

    const row = c.value;
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
    if (row.sku && ctx.duplicateSkus.has(row.sku)) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: parsed.sheetName,
        errorCode: BulkErrorCodes.AMBIGUOUS_PRODUCT,
        errorMessage: `sku "${row.sku}" matches multiple rows in your catalog; use external_id instead`,
        field: "sku",
        rowSnapshot: { ...parsed.values },
      });
    }
    // Soft-deleted product allowed (lingering deals can still be cleaned up).
    // Empty deal set → marked as a non-error skip in writeBatch with reason="no_active_deals".
  }

  return errors;
}
