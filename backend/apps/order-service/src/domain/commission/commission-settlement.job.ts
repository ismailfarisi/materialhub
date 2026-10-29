import { config } from "@materialhub/config";
import type { Commission } from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import type { Repository } from "typeorm";

export const COMMISSION_SETTLEMENT_QUEUE = "commission-settlement";

export interface CommissionSettlementDeps {
  commissionRepo: Repository<Commission>;
}

/**
 * Promotes matured `held` commissions to `pending` (payable).
 *
 * Deliberately joinless: eligibility is a timestamp on the row itself,
 * stamped at delivery (or gift-hub fulfilment), so this never has to reason
 * about order state. `payout_id IS NULL` is belt-and-braces — a held row
 * should never be claimed by a draft, and if one ever is, we do not want to
 * quietly make it payable a second time.
 */
export async function runCommissionSettlement(
  deps: CommissionSettlementDeps,
): Promise<{ settled: number }> {
  // TypeORM returns [rows, affected] for UPDATE.
  const [, affected] = await deps.commissionRepo.manager.query(
    `UPDATE commissions
        SET status = 'pending', updated_at = now()
      WHERE status = 'held'
        AND settle_after IS NOT NULL
        AND settle_after <= now()
        AND payout_id IS NULL
        AND deleted_at IS NULL`,
  );
  return { settled: Number(affected ?? 0) };
}

let settlementQueue: Queue | null = null;

export function getCommissionSettlementQueue(): Queue {
  if (!settlementQueue) {
    settlementQueue = new Queue(COMMISSION_SETTLEMENT_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
    });
  }
  return settlementQueue;
}

export async function scheduleCommissionSettlement(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    "settle-commissions",
    { pattern: "5 * * * *" },
    { name: "settle-commissions" },
  );
}

export function createCommissionSettlementWorker(commissionRepo: Repository<Commission>): Worker {
  return new Worker(
    COMMISSION_SETTLEMENT_QUEUE,
    async () => {
      const { settled } = await runCommissionSettlement({ commissionRepo });
      if (settled > 0) console.log(`[commission-settlement] promoted ${settled} to pending`);
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}
