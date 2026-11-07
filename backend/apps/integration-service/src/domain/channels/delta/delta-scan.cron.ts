import { config } from "@materialhub/config";
import type {
  ChannelCategoryMapping,
  ChannelListing,
  SalesChannel,
  SalesChannelCode,
} from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import type { Repository } from "typeorm";
import type { FeedBuilderService } from "../feed/feed-builder.service.ts";
import type { FeedItem } from "../feed/feed-item.ts";
import { diffEligibleVsExisting } from "../feed/listings-sync.ts";

export const DELTA_SCAN_QUEUE = "channel-delta-scan";
export const DELTA_PUSH_QUEUE = "channel-delta-push";

export interface DeltaScanJob {
  channelCode: SalesChannelCode;
}

export interface DeltaPushJob {
  channelId: string;
  offerId: string;
  action: "upsert" | "delete";
  item: FeedItem | null;
}

export interface DeltaScanDeps {
  salesChannelRepo: Repository<SalesChannel>;
  channelListingRepo: Repository<ChannelListing>;
  channelCategoryMapRepo: Repository<ChannelCategoryMapping>;
  feedBuilderService: FeedBuilderService;
  deltaPushQueue: Queue;
}

// ─── Queue singleton (scan side) ───
type QueueFactory = () => Queue;
let scanQueue: Queue | null = null;
const defaultScanFactory: QueueFactory = () =>
  new Queue(DELTA_SCAN_QUEUE, { connection: { url: config.bullmq.redisUrl } });
let scanFactory: QueueFactory = defaultScanFactory;

export function getDeltaScanQueue(): Queue {
  if (!scanQueue) scanQueue = scanFactory();
  return scanQueue;
}

export function __setDeltaScanQueueFactoryForTests(fn: QueueFactory | null): void {
  scanFactory = fn ?? defaultScanFactory;
  scanQueue = null;
}

// ─── Queue singleton (push side) ───
let pushQueue: Queue | null = null;
const defaultPushFactory: QueueFactory = () =>
  new Queue(DELTA_PUSH_QUEUE, {
    connection: { url: config.bullmq.redisUrl },
    defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 10_000 } },
  });
let pushFactory: QueueFactory = defaultPushFactory;

export function getDeltaPushQueue(): Queue {
  if (!pushQueue) pushQueue = pushFactory();
  return pushQueue;
}

export function __setDeltaPushQueueFactoryForTests(fn: QueueFactory | null): void {
  pushFactory = fn ?? defaultPushFactory;
  pushQueue = null;
}

export function createDeltaScanWorker(deps: DeltaScanDeps): Worker {
  return new Worker<DeltaScanJob>(
    DELTA_SCAN_QUEUE,
    async (job) => handleDeltaScan(job.data, deps),
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

/**
 * Delta scan cron: runs every 5 minutes against each enabled channel.
 * Phase 1a hard-coded the single google_merchant channel; Phase 2 adds
 * meta_catalog (Batch API push side mirrors Google). Phase 4 will iterate
 * over the full set of enabled channels and read interval overrides from
 * `sales_channels.config`.
 *
 * Stable `jobId` per channel prevents duplicate scheduling across deploy
 * restarts. `handleDeltaScan` is channel-code agnostic (it loads the right
 * channel row by `code` and the push side dispatches to the per-channel
 * adapter via `delta.worker.ts`).
 */
export async function scheduleDeltaScanCron(queue: Queue): Promise<void> {
  const channels: SalesChannelCode[] = [
    "google_merchant" as SalesChannelCode,
    "meta_catalog" as SalesChannelCode,
  ];
  for (const code of channels) {
    await queue.add(
      `delta-scan:${code}`,
      { channelCode: code },
      {
        repeat: { pattern: "*/5 * * * *" },
        jobId: `delta-scan:cron:${code}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }
}

/**
 * Stable push jobId per `(channelId, action, offerId)`. Joined with "_": BullMQ
 * reserves ":" in custom ids (it only tolerates exactly two, for legacy
 * repeatable jobs, and plans to reject any), so a ":" separator is one
 * offer-id format change away from every push failing to enqueue.
 */
export function deltaPushJobId(
  channelId: string,
  action: "upsert" | "delete",
  offerId: string,
): string {
  return `${channelId}_${action}_${offerId}`.replaceAll(":", "_");
}

/**
 * Pure handler — receives all deps as an argument so it can be unit-tested
 * without spinning up BullMQ or Redis. For each diff between newly-built feed
 * items and existing `channel_listings` rows, enqueues a push job onto the
 * `channel-delta-push` queue. Stable `jobId` per `(channelId, action, offerId)`
 * dedupes if the same change is observed across overlapping scan cycles.
 */
export async function handleDeltaScan(
  job: DeltaScanJob,
  deps: DeltaScanDeps,
): Promise<{ enqueued: number; status: "ok" | "skipped" | "degraded" }> {
  const channel = await deps.salesChannelRepo.findOne({
    where: { code: job.channelCode } as unknown as Record<string, unknown>,
  });
  if (!channel || !channel.is_enabled) return { enqueued: 0, status: "skipped" };
  if (channel.degraded_until && channel.degraded_until > new Date()) {
    return { enqueued: 0, status: "degraded" };
  }

  const scanStart = new Date();

  // Inputs (kept in sync with the full-feed cron — same eligibility rules).
  const mappings = await deps.channelCategoryMapRepo.find({
    where: { channel_id: channel.id } as unknown as Record<string, unknown>,
  });
  const categoryMap = new Map(
    mappings.map((m) => [
      m.category_id,
      { externalId: m.external_category_id, path: m.external_category_path },
    ]),
  );
  const excludedRows = await deps.channelListingRepo.find({
    where: { channel_id: channel.id, excluded: true } as unknown as Record<string, unknown>,
  });
  const excludedOfferIds = new Set(excludedRows.map((r) => r.offer_id));

  const built = await deps.feedBuilderService.build(channel, categoryMap, excludedOfferIds);
  // Diff against ONLY the non-excluded existing rows. Admin-excluded rows are
  // intentionally absent from `built.items`; if they were in `existing`, the
  // diff would treat them as removed and enqueue spurious delete jobs.
  const existing = await deps.channelListingRepo.find({
    where: { channel_id: channel.id, excluded: false } as unknown as Record<string, unknown>,
  });
  const diff = diffEligibleVsExisting(built.items, existing);

  for (const { item } of diff.upserts) {
    await deps.deltaPushQueue.add(
      "push",
      { channelId: channel.id, offerId: item.offer_id, action: "upsert", item },
      { jobId: deltaPushJobId(channel.id, "upsert", item.offer_id), removeOnComplete: 1000 },
    );
  }
  for (const stale of diff.removed) {
    await deps.deltaPushQueue.add(
      "push",
      { channelId: channel.id, offerId: stale.offer_id, action: "delete", item: null },
      { jobId: deltaPushJobId(channel.id, "delete", stale.offer_id), removeOnComplete: 1000 },
    );
  }

  // Watermark advance — see plan §"Watermark caveat" for the accepted race.
  channel.last_delta_success_at = scanStart;
  await deps.salesChannelRepo.save(channel);

  console.log(
    JSON.stringify({
      evt: "delta-scan.success",
      channel: channel.code,
      upserts: diff.upserts.length,
      removed: diff.removed.length,
      enqueued: diff.upserts.length + diff.removed.length,
    }),
  );

  return { enqueued: diff.upserts.length + diff.removed.length, status: "ok" };
}
