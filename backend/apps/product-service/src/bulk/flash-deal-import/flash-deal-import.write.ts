import type { BatchResult, WriteContext } from "@materialhub/bulk-jobs";
import { FlashDeal } from "@materialhub/database";
import { buildFlashDealEntity } from "../../domain/flash-deal/builder.ts";
import { scheduleIndexUpdatesBulk } from "../../domain/flash-deal/effects.ts";
import type { FlashDealImportCtx } from "./flash-deal-import.context.ts";
import type { CoercedFlashDealImportRow } from "./flash-deal-import.schema.ts";

export async function writeFlashDealImportBatch(
  rows: CoercedFlashDealImportRow[],
  ctx: FlashDealImportCtx,
  writeCtx: WriteContext,
): Promise<BatchResult<string>> {
  const succeeded: string[] = [];
  const skipped: Array<{ rowNumber: number; reason: string }> = [];

  if (rows.length === 0) return { succeeded, skipped };

  const repo = writeCtx.manager.getRepository(FlashDeal);
  const entities: ReturnType<typeof buildFlashDealEntity>[] = [];
  const rowMeta: Array<{
    rowNumber: number;
    productId: string;
    variantId: string | null;
    effectiveOriginal: number;
    row: CoercedFlashDealImportRow;
  }> = [];

  for (const row of rows) {
    const resolved =
      (row.external_id && ctx.byExternalId.get(row.external_id)) ||
      (row.sku && ctx.bySku.get(row.sku));
    if (!resolved) {
      skipped.push({ rowNumber: row.rowNumber, reason: "unresolved_in_batch" });
      continue;
    }
    const effectiveOriginal =
      row.original_price ??
      (resolved.variantId
        ? (ctx.variantPrices.get(resolved.variantId) ?? ctx.productPrices.get(resolved.productId))
        : ctx.productPrices.get(resolved.productId)) ??
      0;

    const entity = buildFlashDealEntity(
      {
        product_id: resolved.productId,
        variant_id: resolved.variantId,
        title: row.title,
        deal_price: row.deal_price,
        original_price: effectiveOriginal,
        quantity_limit: row.quantity_limit,
        starts_at: row.starts_at,
        expires_at: row.expires_at,
        is_active: row.is_active,
      },
      ctx.vendorId,
    );
    entities.push(entity);
    rowMeta.push({
      rowNumber: row.rowNumber,
      productId: resolved.productId,
      variantId: resolved.variantId,
      effectiveOriginal,
      row,
    });
  }

  if (entities.length === 0) return { succeeded, skipped };

  const saved = await repo.save(entities);

  for (let i = 0; i < saved.length; i++) {
    const dealId = saved[i]!.id;
    const meta = rowMeta[i]!;
    succeeded.push(dealId);
    writeCtx.logChange({
      rowNumber: meta.rowNumber,
      entityType: "flash_deal",
      entityId: dealId,
      field: "_created",
      oldValue: null,
      newValue: {
        product_id: meta.productId,
        variant_id: meta.variantId,
        title: meta.row.title,
        deal_price: meta.row.deal_price,
        original_price: meta.effectiveOriginal,
        starts_at: meta.row.starts_at.toISOString(),
        expires_at: meta.row.expires_at.toISOString(),
        quantity_limit: meta.row.quantity_limit,
        is_active: meta.row.is_active,
      },
    });
  }

  return { succeeded, skipped };
}

/** Read created (deal_id, product_id, expires_at) triples from the diff log and
 *  schedule deduped search-syncs. Called from postComplete. */
export async function postCompleteFlashDealImport(writeCtx: WriteContext): Promise<void> {
  const rows = await writeCtx.manager.query(
    `SELECT entity_id, new_value FROM bulk_import_job_row_changes
     WHERE job_id = $1 AND entity_type = 'flash_deal' AND field = '_created'`,
    [writeCtx.job.id],
  );
  if (rows.length === 0) return;

  const perProduct = new Map<string, Array<{ id: string; expiresAt: Date }>>();
  for (const r of rows) {
    const productId: string = r.new_value.product_id;
    const expiresAt = new Date(r.new_value.expires_at);
    const arr = perProduct.get(productId) ?? [];
    arr.push({ id: r.entity_id, expiresAt });
    perProduct.set(productId, arr);
  }

  await scheduleIndexUpdatesBulk(
    Array.from(perProduct.entries()).map(([productId, deals]) => ({ productId, deals })),
  );
}
