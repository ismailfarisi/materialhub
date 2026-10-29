import ExcelJS from "exceljs";
import { BulkErrorCodes } from "../types/error-codes.ts";
import type { ParseResult, ParsedRow, RowError } from "../types/parsed-row.ts";

export interface XlsxParseOptions {
  sheetsToRead: string[];
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "text" in (v as object))
    return String((v as { text: unknown }).text ?? "");
  if (typeof v === "object" && "result" in (v as object))
    return String((v as { result: unknown }).result ?? "");
  return String(v);
}

export async function parseXlsx(buffer: Buffer, opts: XlsxParseOptions): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS declares `interface Buffer extends ArrayBuffer {}` at ambient scope,
    // which conflicts with @types/node's generic Buffer<T>. Cast through unknown to satisfy tsc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as unknown as any);
  } catch (err) {
    return {
      rows: [],
      fileLevelErrors: [
        {
          rowNumber: 0,
          sheetName: null,
          errorCode: BulkErrorCodes.MALFORMED_FILE,
          errorMessage: err instanceof Error ? err.message : "could not open workbook",
          field: null,
          rowSnapshot: {},
        },
      ],
    };
  }

  const fileLevelErrors: RowError[] = [];
  const rows: ParsedRow[] = [];

  for (const expected of opts.sheetsToRead) {
    const sheet = wb.worksheets.find(
      (s) => s.name === expected && s.state !== "hidden" && s.state !== "veryHidden",
    );
    if (!sheet) {
      fileLevelErrors.push({
        rowNumber: 0,
        sheetName: null,
        errorCode: BulkErrorCodes.MISSING_SHEET,
        errorMessage: `expected sheet "${expected}" not found`,
        field: null,
        rowSnapshot: {},
      });
      continue;
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = cellToString(cell.value).trim();
    });

    const rowCount = sheet.actualRowCount;
    for (let i = 2; i <= rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.hasValues) continue;
      const values: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = headers[col - 1];
        if (key) values[key] = cellToString(cell.value);
      });
      if (Object.values(values).every((v) => String(v).trim() === "")) continue;
      rows.push({
        rowNumber: i - 1,
        sheetName: sheet.name,
        values,
      });
    }
  }

  return { rows, fileLevelErrors };
}
