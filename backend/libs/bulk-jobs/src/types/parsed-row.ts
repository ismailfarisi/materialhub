export interface ParsedRow {
  /** 1-indexed, excluding header row. */
  rowNumber: number;
  /** XLSX only; null for CSV. */
  sheetName: string | null;
  /** Column name → cell value (strings; callers coerce). */
  values: Record<string, string>;
}

export interface RowError {
  rowNumber: number;
  sheetName: string | null;
  errorCode: string;
  errorMessage: string;
  field: string | null;
  rowSnapshot: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedRow[];
  fileLevelErrors: RowError[];
}
