import type { BulkImportJob, BulkImportMode, BulkJobStrictness } from "@materialhub/database";
import type { TSchema } from "@sinclair/typebox";
import type { DataSource } from "typeorm";

import type { ParsedRow, RowError } from "./parsed-row.ts";
import type { BatchResult, WriteContext } from "./write-context.ts";

export interface TemplateColumn {
  key: string;
  label: string;
  required: boolean;
  example: string;
  help?: string;
  /** For XLSX, optional data validation (e.g. list of enum values). */
  xlsxValidation?: { type: "list"; allowBlank?: boolean; formulae: string[] };
}

export interface TemplateDescriptor {
  jobType: string;
  sheets: Array<{
    name: string;
    columns: TemplateColumn[];
    exampleRows?: string[][];
  }>;
  readme: string[];
}

export interface ParseOptions {
  /** For XLSX, the sheet names to read (other sheets ignored). */
  expectedSheets: string[];
  /** Per-sheet required columns. Absence → MISSING_REQUIRED_COLUMN. */
  requiredColumnsPerSheet: Record<string, string[]>;
}

export interface ValidationContextBase {
  vendorId: string | null;
}

export interface JobType<
  TRow,
  TResult = unknown,
  TValCtx extends ValidationContextBase = ValidationContextBase,
> {
  key: string;
  defaultStrictness: BulkJobStrictness;
  template: TemplateDescriptor;
  parseOptions: ParseOptions;
  /**
   * Per-job override of parseOptions (e.g. relaxed required columns in update
   * mode). Falls back to the static `parseOptions` when absent.
   */
  resolveParseOptions?: (job: BulkImportJob) => ParseOptions;
  rowSchema: TSchema;

  buildValidationContext: (args: {
    dataSource: DataSource;
    vendorId: string | null;
    importMode?: BulkImportMode;
  }) => Promise<TValCtx>;

  preValidate?: (rows: ParsedRow[], ctx: TValCtx) => RowError[];

  coerceRow: (
    row: ParsedRow,
    ctx: TValCtx,
  ) => { ok: true; value: TRow } | { ok: false; errors: RowError[] };

  writeBatch: (rows: TRow[], ctx: WriteContext) => Promise<BatchResult<TResult>>;

  postComplete?: (ctx: WriteContext) => Promise<void>;
}
