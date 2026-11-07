import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { CollectionMembershipService } from "./collection-membership.service.ts";

const QUEUE_NAME = "collection-membership-refresh";
const connection = { url: config.bullmq.redisUrl };

let membershipRefreshQueue: Queue | null = null;

export function getMembershipRefreshQueue(): Queue {
  if (!membershipRefreshQueue) {
    membershipRefreshQueue = new Queue(QUEUE_NAME, { connection });
  }
  return membershipRefreshQueue;
}

/**
 * Stable jobId for a single-collection refresh: one id per collection, so a
 * burst of edits collapses into one queued job. BullMQ rejects custom ids that
 * contain ":" (it reserves the separator for its own keys), so use "_".
 */
export function membershipRefreshJobId(collectionId: string): string {
  return `refresh_${collectionId}`;
}

/** Enqueue a single-collection refresh (deduped by jobId). */
export async function enqueueMembershipRefresh(queue: Queue, collectionId: string): Promise<void> {
  await queue.add(
    "refresh",
    { collectionId },
    {
      jobId: membershipRefreshJobId(collectionId),
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
}

export function createMembershipRefreshWorker(service: CollectionMembershipService): Worker {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "refresh") {
        const count = await service.refresh(job.data.collectionId);
        return { count };
      }
      if (job.name === "refresh-all") {
        const { AppDataSource, ProductCollection } = await import("@materialhub/database");
        const rows = await AppDataSource.getRepository(ProductCollection).find({
          where: { is_active: true },
          select: ["id"],
        });
        for (const r of rows) await service.refresh(r.id);
        return { count: rows.length };
      }
    },
    { connection },
  );
}

/** Hourly safety-net full refresh. */
export async function scheduleMembershipRefresh(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    "membership-refresh-all",
    { pattern: "0 * * * *" },
    { name: "refresh-all" },
  );
}
