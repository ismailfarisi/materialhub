import { config } from "@materialhub/config";
import type {
  ChannelCategoryMapping,
  ChannelFeedRun,
  ChannelListing,
  SalesChannel,
  SalesChannelCode,
} from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import type { Repository } from "typeorm";
import { feedItemsToGoogleRss } from "../serializers/google.serializer.ts";
import { feedItemsToMetaXml } from "../serializers/meta.serializer.ts";
import { feedItemsToTiktokXml } from "../serializers/tiktok.serializer.ts";
import type { FeedBuilderService } from "./feed-builder.service.ts";
import type { FeedItem } from "./feed-item.ts";
import type { FeedUploaderService } from "./feed-uploader.service.ts";
import { diffEligibleVsExisting } from "./listings-sync.ts";

export const FEED_BUILD_QUEUE = "channel-feed-build";

export interface FeedBuildJob {
  channelCode: SalesChannelCode;
  trigger: "cron" | "manual";
}

export interface FeedBuildDeps {
  salesChannelRepo: Repository<SalesChannel>;
  channelListingRepo: Repository<ChannelListing>;
  channelFeedRunRepo: Repository<ChannelFeedRun>;
  channelCategoryMapRepo: Repository<ChannelCategoryMapping>;
  feedBuilderService: FeedBuilderService;
  feedUploader: FeedUploaderService;
  webBaseUrl: string;
}

type QueueFactory = () => Queue;
let queueSingleton: Queue | null = null;
const defaultFactory: QueueFactory = () =>
  new Queue(FEED_BUILD_QUEUE, { connection: { url: config.bullmq.redisUrl } });
let factory: QueueFactory = defaultFactory;

export function getFeedBuildQueue(): Queue {
  if (!queueSingleton) queueSingleton = factory();
  return queueSingleton;
}

export function __setFeedBuildQueueFactoryForTests(fn: QueueFactory | null): void {
  factory = fn ?? defaultFactory;
  queueSingleton = null;
}

export function createFeedBuildWorker(deps: FeedBuildDeps): Worker {
  return new Worker<FeedBuildJob>(
    FEED_BUILD_QUEUE,
    async (job) => handleFeedBuildJob(job.data, deps),
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

/**
 * Default cron: every 2 hours on the hour. Overridable per channel via
 * `sales_channels.config.feedIntervalCron` (Phase 4). Phase 1a hard-codes the
 * default for the google_merchant channel only.
 *
 * Stable `jobId` prevents duplicate scheduling if the bootstrap runs more than
 * once (e.g. across deploy restarts).
 */
export async function scheduleFeedBuildCron(queue: Queue): Promise<void> {
  const channels: SalesChannelCode[] = [
    "google_merchant" as SalesChannelCode,
    "meta_catalog" as SalesChannelCode,
    "tiktok" as SalesChannelCode,
  ];
  for (const code of channels) {
    await queue.add(
      `feed-build:${code}`,
      { channelCode: code, trigger: "cron" },
      {
        repeat: { pattern: "0 */2 * * *" },
        jobId: `feed-build:cron:${code}`,
        removeOnComplete: 100,
        removeOnFail: 100,
        // Transient S3 5xx / DB blip shouldn't make the channel wait 2h for a retry.
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    );
  }
}

/**
 * Map channel code → XML serializer. All current SalesChannelCode values have
 * a serializer entry; `Record<...>` (not `Partial<...>`) means TypeScript
 * fails to compile if a future code is added without a serializer. The
 * runtime guard below remains as belt-and-suspenders for the brief window
 * where a new DB enum row may exist before the code that handles it ships.
 */
const SERIALIZERS: Record<
  SalesChannelCode,
  (items: FeedItem[], ch: { title: string; link: string; description: string }) => string
> = {
  google_merchant: feedItemsToGoogleRss,
  meta_catalog: feedItemsToMetaXml,
  tiktok: feedItemsToTiktokXml,
};

/**
 * Pure handler — receives all deps as an argument, so it can be unit-tested
 * without spinning up BullMQ or Redis. Returns the run outcome; throws on the
 * unrecoverable error path so BullMQ records the failure.
 */
export async function handleFeedBuildJob(
  job: FeedBuildJob,
  deps: FeedBuildDeps,
): Promise<{ status: "success" | "skipped" | "failed"; runId?: string }> {
  const channel = await deps.salesChannelRepo.findOne({
    where: { code: job.channelCode } as unknown as Record<string, unknown>,
  });
  if (!channel) {
    return { status: "skipped" };
  }
  if (!channel.is_enabled) {
    return { status: "skipped" };
  }

  const run = deps.channelFeedRunRepo.create({
    channel_id: channel.id,
    started_at: new Date(),
    status: "running",
    item_count: 0,
    excluded_count: 0,
    error_count: 0,
    trigger: job.trigger,
  });
  await deps.channelFeedRunRepo.save(run);

  try {
    // Inputs — same eligibility rules as the delta-scan cron (Task 7).
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

    // Build feed items
    const built = await deps.feedBuilderService.build(channel, categoryMap, excludedOfferIds);

    // Serialize + upload
    const serializer = SERIALIZERS[channel.code];
    if (!serializer) {
      throw new Error(`no_serializer_for_channel:${channel.code}`);
    }
    const xml = serializer(built.items, {
      title: channel.display_name,
      link: deps.webBaseUrl,
      description: "MaterialHub marketplace catalog",
    });
    const upload = await deps.feedUploader.upload({
      channelCode: channel.code,
      format: "xml",
      body: xml,
    });

    // Sync channel_listings
    // Diff against ONLY the non-excluded existing rows. Admin-excluded rows are
    // intentionally absent from `built.items` (the builder filters them out via
    // `excludedOfferIds`); if they were in `existing`, the diff would treat them
    // as removed and soft-delete them — losing the exclusion on the next cron
    // run (the soft-deleted row no longer matches the `excluded: true` query).
    const existing = await deps.channelListingRepo.find({
      where: { channel_id: channel.id, excluded: false } as unknown as Record<string, unknown>,
    });
    const diff = diffEligibleVsExisting(built.items, existing);

    for (const { item, hash } of diff.upserts) {
      // For variants: item_group_id is the product id, offer_id is the variant id.
      // For base products: offer_id is the product id, no variant.
      const productId = item.item_group_id ?? item.offer_id;
      const variantId = item.item_group_id ? item.offer_id : null;
      const existingRow = existing.find((r) => r.offer_id === item.offer_id);
      if (existingRow) {
        existingRow.content_hash = hash;
        existingRow.sync_status = "synced" as ChannelListing["sync_status"];
        existingRow.last_synced_at = new Date();
        existingRow.product_id = productId;
        existingRow.variant_id = variantId;
        existingRow.deleted_at = null;
        await deps.channelListingRepo.save(existingRow);
      } else {
        const created = deps.channelListingRepo.create({
          channel_id: channel.id,
          product_id: productId,
          variant_id: variantId,
          offer_id: item.offer_id,
          sync_status: "synced" as ChannelListing["sync_status"],
          content_hash: hash,
          last_synced_at: new Date(),
        } as unknown as ChannelListing);
        await deps.channelListingRepo.save(created);
      }
    }
    for (const stale of diff.removed) {
      await deps.channelListingRepo.softDelete(stale.id);
    }

    // Finalize run + channel
    run.status = "success";
    run.finished_at = new Date();
    run.item_count = built.itemCount;
    run.excluded_count = built.excludedCount;
    run.error_count = built.skippedCount;
    run.file_url = upload.url;
    run.file_size_bytes = upload.bytes;
    await deps.channelFeedRunRepo.save(run);

    channel.last_full_feed_at = new Date();
    channel.last_full_feed_status = "success";
    channel.feed_url = upload.url;
    await deps.salesChannelRepo.save(channel);

    // biome-ignore lint/suspicious/noConsole: structured run summary for ops
    console.log(
      JSON.stringify({
        evt: "feed-build.success",
        channel: channel.code,
        runId: run.id,
        itemCount: built.itemCount,
        excludedCount: built.excludedCount,
        errorCount: built.skippedCount,
        fileUrl: upload.url,
        fileSizeBytes: upload.bytes,
      }),
    );

    return { status: "success", runId: run.id };
  } catch (err) {
    const errMsg = String(err instanceof Error ? (err.stack ?? err.message) : err);
    run.status = "failed";
    run.finished_at = new Date();
    run.error_message = errMsg;
    // Best-effort: don't let one save failure mask the other so the audit trail
    // ends up consistent. Both should succeed; either failing is itself a bug.
    try {
      await deps.channelFeedRunRepo.save(run);
    } catch (saveErr) {
      // biome-ignore lint/suspicious/noConsole: fallback save failure
      console.error("[feed-build] run-row failure-save failed", saveErr);
    }
    channel.last_full_feed_status = "failed";
    try {
      await deps.salesChannelRepo.save(channel);
    } catch (saveErr) {
      // biome-ignore lint/suspicious/noConsole: fallback save failure
      console.error("[feed-build] channel failure-save failed", saveErr);
    }

    // biome-ignore lint/suspicious/noConsole: structured run failure for ops
    console.error(
      JSON.stringify({
        evt: "feed-build.failed",
        channel: channel.code,
        runId: run.id,
        trigger: job.trigger,
        error: errMsg,
      }),
    );

    throw err;
  }
}
