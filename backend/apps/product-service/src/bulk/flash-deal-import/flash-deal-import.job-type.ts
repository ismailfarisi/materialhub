import type { BatchResult, JobType, ParsedRow, RowError, WriteContext } from "@materialhub/bulk-jobs";
import { BulkJobStrictness } from "@materialhub/database";
import { coerceFlashDealImportRow } from "./flash-deal-import.coerce.ts";
import {
  type FlashDealImportCtx,
  buildFlashDealImportContext,
} from "./flash-deal-import.context.ts";
import {
  type CoercedFlashDealImportRow,
  FlashDealImportRowSchema,
} from "./flash-deal-import.schema.ts";
import { flashDealImportTemplate } from "./flash-deal-import.template.ts";
import { validateFlashDealImport } from "./flash-deal-import.validate.ts";
import {
  postCompleteFlashDealImport,
  writeFlashDealImportBatch,
} from "./flash-deal-import.write.ts";

function getCtx(writeCtx: WriteContext): FlashDealImportCtx {
  const summary = writeCtx.job.summary as { context?: FlashDealImportCtx } | null;
  if (!summary?.context) throw new Error("flash_deal_import: context not preloaded");
  return summary.context;
}

export const flashDealImportJobType: JobType<
  CoercedFlashDealImportRow,
  string,
  FlashDealImportCtx
> = {
  key: "flash_deal_import",
  defaultStrictness: BulkJobStrictness.BestEffort,
  template: flashDealImportTemplate,
  parseOptions: {
    expectedSheets: ["FlashDeals"],
    requiredColumnsPerSheet: {
      FlashDeals: ["title", "deal_price", "starts_at", "expires_at"],
      "": ["title", "deal_price", "starts_at", "expires_at"],
    },
  },
  rowSchema: FlashDealImportRowSchema,

  async buildValidationContext({ dataSource, vendorId }) {
    return buildFlashDealImportContext({ dataSource, vendorId });
  },

  coerceRow(
    row: ParsedRow,
    _ctx: FlashDealImportCtx,
  ): { ok: true; value: CoercedFlashDealImportRow } | { ok: false; errors: RowError[] } {
    return coerceFlashDealImportRow(row);
  },

  preValidate(rows, ctx) {
    return validateFlashDealImport(rows, ctx);
  },

  async writeBatch(rows, writeCtx): Promise<BatchResult<string>> {
    const ctx = getCtx(writeCtx);
    return writeFlashDealImportBatch(rows, ctx, writeCtx);
  },

  async postComplete(writeCtx) {
    await postCompleteFlashDealImport(writeCtx);
  },
};
