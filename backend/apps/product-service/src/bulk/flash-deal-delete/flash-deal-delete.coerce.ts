import { BulkErrorCodes, type ParsedRow, type RowError } from "@materialhub/bulk-jobs";
import type { CoercedFlashDealDeleteRow } from "./flash-deal-delete.schema.ts";

export function coerceFlashDealDeleteRow(
  row: ParsedRow,
): { ok: true; value: CoercedFlashDealDeleteRow } | { ok: false; errors: RowError[] } {
  const sku = (row.values.sku ?? "").trim() || null;
  const external_id = (row.values.external_id ?? "").trim() || null;
  const note = (row.values.note ?? "").trim() || null;

  if (!sku && !external_id) {
    return {
      ok: false,
      errors: [
        {
          rowNumber: row.rowNumber,
          sheetName: row.sheetName,
          errorCode: BulkErrorCodes.MISSING_REQUIRED_FIELD,
          errorMessage: "either sku or external_id is required",
          field: "sku",
          rowSnapshot: { ...row.values },
        },
      ],
    };
  }

  return { ok: true, value: { rowNumber: row.rowNumber, sku, external_id, note } };
}
