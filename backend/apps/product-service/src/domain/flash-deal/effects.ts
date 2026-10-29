import { enqueueSearchSync } from "../search/search-sync.job.ts";

/**
 * Per-deal: immediate upsert so the deal appears in listings now, plus a delayed
 * job at expires_at to re-upsert (and naturally drop the deal). Job IDs key off
 * `deal-expiry:<dealId>` so updating a deal overwrites its previous expiry job
 * rather than queueing a duplicate. Errors are swallowed and logged: a Redis
 * outage shouldn't block deal CRUD. Admin can re-run `bun run search:reindex`.
 */
export async function scheduleIndexUpdates(
  productId: string,
  dealId: string,
  expiresAt: Date,
): Promise<void> {
  try {
    await enqueueSearchSync({ type: "upsert_by_product_id", productId });
    const delay = expiresAt.getTime() - Date.now();
    if (delay > 0) {
      await enqueueSearchSync(
        { type: "upsert_by_product_id", productId },
        { delay, jobId: `deal-expiry:${dealId}` },
      );
    }
  } catch (err) {
    console.error("[flash-deal] search-sync enqueue failed", {
      productId,
      dealId,
      error: String(err),
    });
  }
}

export interface BulkScheduleEntry {
  productId: string;
  deals: Array<{ id: string; expiresAt: Date }>;
}

/**
 * Bulk variant for use by flash_deal_import.postComplete and the revert endpoint.
 * Emits ONE immediate upsert per product (deduped, regardless of how many deals
 * the product has). Each deal still gets its own delayed expiry job (unique jobId).
 * Errors are swallowed and logged per-product so one bad enqueue doesn't block the rest.
 */
export async function scheduleIndexUpdatesBulk(perProduct: BulkScheduleEntry[]): Promise<void> {
  const seenProducts = new Set<string>();
  for (const entry of perProduct) {
    try {
      if (!seenProducts.has(entry.productId)) {
        seenProducts.add(entry.productId);
        await enqueueSearchSync({ type: "upsert_by_product_id", productId: entry.productId });
      }
      const now = Date.now();
      for (const deal of entry.deals) {
        const delay = deal.expiresAt.getTime() - now;
        if (delay > 0) {
          await enqueueSearchSync(
            { type: "upsert_by_product_id", productId: entry.productId },
            { delay, jobId: `deal-expiry:${deal.id}` },
          );
        }
      }
    } catch (err) {
      console.error("[flash-deal] bulk search-sync enqueue failed", {
        productId: entry.productId,
        error: String(err),
      });
    }
  }
}
