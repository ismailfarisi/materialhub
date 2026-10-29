import { BulkErrorCodes, type ParsedRow, type RowError } from "@materialhub/bulk-jobs";
import { parseFlashDealDate } from "./date-parser.ts";
import type { CoercedFlashDealImportRow } from "./flash-deal-import.schema.ts";

const TRUTHY = new Set(["true", "yes", "1", "y", "t"]);
const FALSY = new Set(["false", "no", "0", "n", "f"]);

function parseInt0(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function parseBool(s: string): boolean | null {
  const v = s.trim().toLowerCase();
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return null;
}

export function coerceFlashDealImportRow(
  row: ParsedRow,
): { ok: true; value: CoercedFlashDealImportRow } | { ok: false; errors: RowError[] } {
  const errors: RowError[] = [];
  const sku = (row.values.sku ?? "").trim() || null;
  const external_id = (row.values.external_id ?? "").trim() || null;
  const title = (row.values.title ?? "").trim();
  const dealPriceRaw = (row.values.deal_price ?? "").trim();
  const originalPriceRaw = (row.values.original_price ?? "").trim();
  const quantityLimitRaw = (row.values.quantity_limit ?? "").trim();
  const startsAtRaw = row.values.starts_at;
  const expiresAtRaw = row.values.expires_at;
  const isActiveRaw = (row.values.is_active ?? "").trim();

  if (!sku && !external_id) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: BulkErrorCodes.MISSING_REQUIRED_FIELD,
      errorMessage: "either sku or external_id is required",
      field: "sku",
      rowSnapshot: { ...row.values },
    });
  }
  if (!title) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: BulkErrorCodes.MISSING_REQUIRED_FIELD,
      errorMessage: "title is required",
      field: "title",
      rowSnapshot: { ...row.values },
    });
  }

  let dealPrice: number | null = null;
  if (!dealPriceRaw) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: BulkErrorCodes.MISSING_REQUIRED_FIELD,
      errorMessage: "deal_price is required",
      field: "deal_price",
      rowSnapshot: { ...row.values },
    });
  } else {
    dealPrice = parseInt0(dealPriceRaw);
    if (dealPrice === null) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.INVALID_VALUE,
        errorMessage: "deal_price must be an integer (fils)",
        field: "deal_price",
        rowSnapshot: { ...row.values },
      });
    }
  }

  let originalPrice: number | null = null;
  if (originalPriceRaw) {
    originalPrice = parseInt0(originalPriceRaw);
    if (originalPrice === null) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.INVALID_VALUE,
        errorMessage: "original_price must be an integer (fils) or blank",
        field: "original_price",
        rowSnapshot: { ...row.values },
      });
    }
  }

  let quantityLimit: number | null = null;
  if (quantityLimitRaw) {
    quantityLimit = parseInt0(quantityLimitRaw);
    if (quantityLimit === null || quantityLimit < 1) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.INVALID_VALUE,
        errorMessage: "quantity_limit must be a positive integer or blank",
        field: "quantity_limit",
        rowSnapshot: { ...row.values },
      });
      quantityLimit = null;
    }
  }

  const startsParse = parseFlashDealDate(startsAtRaw);
  let startsAt: Date | null = null;
  if (!startsParse.ok) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: "invalid_date_format",
      errorMessage: "starts_at could not be parsed (try ISO-8601 or YYYY-MM-DD HH:mm)",
      field: "starts_at",
      rowSnapshot: { ...row.values },
    });
  } else {
    startsAt = startsParse.value;
  }

  const expiresParse = parseFlashDealDate(expiresAtRaw);
  let expiresAt: Date | null = null;
  if (!expiresParse.ok) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: "invalid_date_format",
      errorMessage: "expires_at could not be parsed (try ISO-8601 or YYYY-MM-DD HH:mm)",
      field: "expires_at",
      rowSnapshot: { ...row.values },
    });
  } else {
    expiresAt = expiresParse.value;
  }

  if (startsAt && expiresAt && expiresAt <= startsAt) {
    errors.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: "invalid_date_range",
      errorMessage: "expires_at must be after starts_at",
      field: "expires_at",
      rowSnapshot: { ...row.values },
    });
  }

  let isActive = true;
  if (isActiveRaw) {
    const b = parseBool(isActiveRaw);
    if (b === null) {
      errors.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.INVALID_VALUE,
        errorMessage: "is_active must be true/false/yes/no/1/0",
        field: "is_active",
        rowSnapshot: { ...row.values },
      });
    } else {
      isActive = b;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      rowNumber: row.rowNumber,
      sku,
      external_id,
      title,
      deal_price: dealPrice as number,
      original_price: originalPrice,
      quantity_limit: quantityLimit,
      starts_at: startsAt as Date,
      expires_at: expiresAt as Date,
      is_active: isActive,
    },
  };
}
