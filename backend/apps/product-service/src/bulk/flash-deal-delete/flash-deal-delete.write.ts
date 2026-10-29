import type { BatchResult, WriteContext } from "@materialhub/bulk-jobs";
import { scheduleIndexUpdatesBulk } from "../../domain/flash-deal/effects.ts";
import type { CandidateDeal, FlashDealDeleteCtx } from "./flash-deal-delete.context.ts";
import type { CoercedFlashDealDeleteRow } from "./flash-deal-delete.schema.ts";

export async function writeFlashDealDeleteBatch(
  rows: CoercedFlashDealDeleteRow[],
  ctx: FlashDealDeleteCtx,
  writeCtx: WriteContext,
): Promise<BatchResult<string>> {
  const succeeded: string[] = [];
  const skipped: Array<{ rowNumber: number; reason: string }> = [];

  if (rows.length === 0) return { succeeded, skipped };

  const allTargetIds: string[] = [];
  const idToRow = new Map<string, { rowNumber: number; deal: CandidateDeal }>();

  for (const row of rows) {
    const resolved =
      (row.external_id && ctx.byExternalId.get(row.external_id)) ||
      (row.sku && ctx.bySku.get(row.sku));
    if (!resolved) {
      skipped.push({ rowNumber: row.rowNumber, reason: "unresolved_in_batch" });
      continue;
    }
    const key = `${resolved.productId}|${resolved.variantId ?? ""}`;
    const candidates = ctx.dealsByProductVariant.get(key) ?? [];
    if (candidates.length === 0) {
      skipped.push({ rowNumber: row.rowNumber, reason: "no_active_deals" });
      continue;
    }
    for (const c of candidates) {
      allTargetIds.push(c.id);
      idToRow.set(c.id, { rowNumber: row.rowNumber, deal: c });
    }
    succeeded.push(`row-${row.rowNumber}`);
  }

  if (allTargetIds.length === 0) return { succeeded, skipped };

  // TypeORM 0.3.28's manager.query() returns `[rows, rowCount]` for UPDATE/DELETE
  // (SELECT/INSERT return a flat rows array). Destructure the rows array.
  const [deletedRows] = (await writeCtx.manager.query(
    `UPDATE flash_deals
     SET deleted_at = now(), updated_at = now()
     WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
     RETURNING id, product_id`,
    [allTargetIds],
  )) as [Array<{ id: string; product_id: string }>, number];

  for (const r of deletedRows) {
    const meta = idToRow.get(r.id);
    if (!meta) continue;
    writeCtx.logChange({
      rowNumber: meta.rowNumber,
      entityType: "flash_deal",
      entityId: r.id,
      field: "_deleted",
      oldValue: {
        product_id: meta.deal.product_id,
        variant_id: meta.deal.variant_id,
        title: meta.deal.title,
        deal_price: meta.deal.deal_price,
        original_price: meta.deal.original_price,
        starts_at: meta.deal.starts_at.toISOString(),
        expires_at: meta.deal.expires_at.toISOString(),
        quantity_limit: meta.deal.quantity_limit,
      },
      newValue: null,
    });
    // Drain dealsByProductVariant so a subsequent batch (same job, repeated SKU)
    // skips with no_active_deals rather than silently no-oping.
    const key = `${meta.deal.product_id}|${meta.deal.variant_id ?? ""}`;
    const remaining = (ctx.dealsByProductVariant.get(key) ?? []).filter((d) => d.id !== r.id);
    if (remaining.length === 0) ctx.dealsByProductVariant.delete(key);
    else ctx.dealsByProductVariant.set(key, remaining);
  }

  return { succeeded, skipped };
}

export async function postCompleteFlashDealDelete(writeCtx: WriteContext): Promise<void> {
  const rows = await writeCtx.manager.query(
    `SELECT DISTINCT (old_value->>'product_id') AS product_id
     FROM bulk_import_job_row_changes
     WHERE job_id = $1 AND entity_type = 'flash_deal' AND field = '_deleted'`,
    [writeCtx.job.id],
  );
  if (rows.length === 0) return;

  await scheduleIndexUpdatesBulk(
    rows.map((r: { product_id: string }) => ({ productId: r.product_id, deals: [] })),
  );
}
