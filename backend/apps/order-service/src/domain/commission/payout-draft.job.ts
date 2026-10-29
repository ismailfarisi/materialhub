import { config } from "@materialhub/config";
import { type Vendor, VendorStatus } from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import type { Repository } from "typeorm";
import { closedPeriodFor, isSupportedPayoutSchedule } from "./payout-period.ts";
import type { PayoutService } from "./payout.service.ts";

export const PAYOUT_DRAFT_QUEUE = "payout-draft-generation";
const SCHEDULER_ID = "generate-payout-drafts";

export interface PayoutDraftDeps {
  vendorRepo: Repository<Vendor>;
  // R4-I4: `executeCreateAndAudit`, not `createDraft`. Both produce the same
  // draft and neither moves money, but only the former writes a
  // `payout.draft_creation_failed` audit row — and this job's failures were
  // the ONLY ones with no trace beyond a console.warn on a box nobody reads.
  // `writeAudit` is used directly for the schedule-level refusals this job
  // decides on its own, which never reach the service at all.
  payoutService: Pick<PayoutService, "executeCreateAndAudit" | "writeAudit">;
  now?: () => Date;
}

/**
 * Generates draft payouts on each vendor's schedule. Never transfers — an
 * admin approves. One vendor failing (no bank account, below minimum) must
 * not stop the rest, so every vendor is isolated.
 *
 * NOTE: the Vendor entity has no `is_active` boolean column — it has a
 * `status` enum instead. `VendorStatus.approved` is this codebase's
 * established "active vendor" predicate (see vendor-service). Filtering on a
 * nonexistent `is_active` column would make this query error against the real
 * database every run, so this deviates from the brief's literal
 * `{ is_active: true }` filter.
 */
export async function runPayoutDraftGeneration(
  deps: PayoutDraftDeps,
): Promise<{ drafted: number; skipped: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const vendors = await deps.vendorRepo.find({
    where: { status: VendorStatus.approved } as any,
  });

  let drafted = 0;
  let skipped = 0;
  let failed = 0;
  for (const vendor of vendors) {
    const schedule = (vendor as any).payout_schedule ?? "biweekly";
    // MINOR (round 4): an unrecognised schedule string is not "today is not
    // a closing day" — that vendor can never be drafted by this job at all,
    // and used to be indistinguishable from the ordinary daily skip. Audit
    // it (entity_type "vendor", so /admin/audit-log can find it) so
    // "vendor X has not been paid for three cycles" is diagnosable.
    if (!isSupportedPayoutSchedule(schedule)) {
      failed++;
      console.error("[payout-draft] vendor has an unsupported payout_schedule", {
        vendorId: (vendor as any).id,
        schedule,
      });
      try {
        await deps.payoutService.writeAudit({
          action: "payout.draft_creation_failed",
          actor_id: null,
          actor_role: "system",
          entity_type: "vendor",
          entity_id: (vendor as any).id,
          metadata: {
            vendor_id: (vendor as any).id,
            error: `Unsupported payout_schedule "${schedule}" — this vendor is never drafted`,
          },
        });
      } catch (auditErr: any) {
        console.error("[payout-draft] could not write audit row", {
          vendorId: (vendor as any).id,
          error: auditErr?.message ?? String(auditErr),
        });
      }
      continue;
    }
    const period = closedPeriodFor(schedule, now);
    if (!period) {
      skipped++;
      continue;
    }
    try {
      const draft = await deps.payoutService.executeCreateAndAudit({
        vendorId: (vendor as any).id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        adminUserId: null,
        force: false,
      });
      if (draft) drafted++;
      else skipped++;
    } catch (err: any) {
      // Expected and benign in ordinary operation (below minimum, no bank
      // account, duplicate period) — but every one of them is now also an
      // audit row written by executeCreateAndAudit, so a vendor that keeps
      // being "benignly" skipped is visible. One vendor failing must never
      // stop the rest, so the loop continues.
      failed++;
      console.warn("[payout-draft] skipped vendor", {
        vendorId: (vendor as any).id,
        reason: err?.message ?? String(err),
      });
    }
  }
  if (failed > 0) {
    console.error(`[payout-draft] ${failed} vendor(s) could not be drafted — see audit log`);
  }
  return { drafted, skipped: skipped + failed };
}

let payoutDraftQueue: Queue | null = null;

export function getPayoutDraftQueue(): Queue {
  if (!payoutDraftQueue) {
    payoutDraftQueue = new Queue(PAYOUT_DRAFT_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return payoutDraftQueue;
}

export async function schedulePayoutDraftGeneration(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(SCHEDULER_ID, { pattern: "30 2 * * *" }, { name: SCHEDULER_ID });
}

export function createPayoutDraftWorker(deps: PayoutDraftDeps): Worker {
  return new Worker(
    PAYOUT_DRAFT_QUEUE,
    async () => {
      const { drafted, skipped } = await runPayoutDraftGeneration(deps);
      console.log(`[payout-draft] drafted ${drafted}, skipped ${skipped}`);
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}
