import { BulkJobFileFormat } from "@materialhub/database";
import { BulkErrorCodes } from "../types/error-codes.ts";
import type { ParseResult, RowError } from "../types/parsed-row.ts";
import { parseCsv } from "./csv-parser.ts";
import { parseXlsx } from "./xlsx-parser.ts";

export interface ParseFileArgs {
  buffer: Buffer;
  format: BulkJobFileFormat;
  parseOptions: {
    expectedSheets: string[];
    requiredColumnsPerSheet: Record<string, string[]>;
  };
}

export async function parseFile(args: ParseFileArgs): Promise<ParseResult> {
  const base =
    args.format === BulkJobFileFormat.Csv
      ? await parseCsv(args.buffer)
      : await parseXlsx(args.buffer, { sheetsToRead: args.parseOptions.expectedSheets });

  if (base.fileLevelErrors.length > 0) return base;

  const requiredErrors: RowError[] = [];
  const { requiredColumnsPerSheet } = args.parseOptions;

  // CSV = single pseudo-sheet keyed by "".
  const sheetKeys = args.format === BulkJobFileFormat.Csv ? [""] : args.parseOptions.expectedSheets;

  for (const sheet of sheetKeys) {
    const required = requiredColumnsPerSheet[sheet] ?? [];
    if (required.length === 0) continue;
    const rowsForSheet = base.rows.filter((r) => (r.sheetName ?? "") === sheet);
    if (rowsForSheet.length === 0) continue;
    const headers = Object.keys(rowsForSheet[0]?.values ?? {});
    const missing = required.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      requiredErrors.push({
        rowNumber: 0,
        sheetName: sheet || null,
        errorCode: BulkErrorCodes.MISSING_REQUIRED_COLUMN,
        errorMessage: `missing required column(s): ${missing.join(", ")}`,
        field: null,
        rowSnapshot: { availableColumns: headers },
      });
    }
  }

  if (requiredErrors.length > 0) {
    return { rows: [], fileLevelErrors: requiredErrors };
  }
  return base;
}
