import type { BatchResult, JobType, ParsedRow, RowError, WriteContext } from "@materialhub/bulk-jobs";
import { BulkJobStrictness } from "@materialhub/database";
import { coerceFlashDealDeleteRow } from "./flash-deal-delete.coerce.ts";
import {
  type FlashDealDeleteCtx,
  buildFlashDealDeleteContext,
} from "./flash-deal-delete.context.ts";
import {
  type CoercedFlashDealDeleteRow,
  FlashDealDeleteRowSchema,
} from "./flash-deal-delete.schema.ts";
import { flashDealDeleteTemplate } from "./flash-deal-delete.template.ts";
import { validateFlashDealDelete } from "./flash-deal-delete.validate.ts";
import {
  postCompleteFlashDealDelete,
  writeFlashDealDeleteBatch,
} from "./flash-deal-delete.write.ts";

function getCtx(writeCtx: WriteContext): FlashDealDeleteCtx {
  const summary = writeCtx.job.summary as { context?: FlashDealDeleteCtx } | null;
  if (!summary?.context) throw new Error("flash_deal_delete: context not preloaded");
  return summary.context;
}

export const flashDealDeleteJobType: JobType<
  CoercedFlashDealDeleteRow,
  string,
  FlashDealDeleteCtx
> = {
  key: "flash_deal_delete",
  defaultStrictness: BulkJobStrictness.BestEffort,
  template: flashDealDeleteTemplate,
  parseOptions: {
    expectedSheets: ["Delete"],
    requiredColumnsPerSheet: { Delete: [], "": [] },
  },
  rowSchema: FlashDealDeleteRowSchema,

  async buildValidationContext({ dataSource, vendorId }) {
    return buildFlashDealDeleteContext({ dataSource, vendorId });
  },

  coerceRow(
    row: ParsedRow,
    _ctx: FlashDealDeleteCtx,
  ): { ok: true; value: CoercedFlashDealDeleteRow } | { ok: false; errors: RowError[] } {
    return coerceFlashDealDeleteRow(row);
  },

  preValidate(rows, ctx) {
    return validateFlashDealDelete(rows, ctx);
  },

  async writeBatch(rows, writeCtx): Promise<BatchResult<string>> {
    const ctx = getCtx(writeCtx);
    return writeFlashDealDeleteBatch(rows, ctx, writeCtx);
  },

  async postComplete(writeCtx) {
    await postCompleteFlashDealDelete(writeCtx);
  },
};
