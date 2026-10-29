import { config } from "@materialhub/config";
import "./container.ts";
import {
  AppDataSource,
  ChannelCategoryMapping,
  ChannelDelivery,
  ChannelFeedRun,
  ChannelListing,
  Order,
  Product,
  SalesChannel,
  User,
} from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { EncryptionService, getS3Client } from "@materialhub/utils";
import { type RedisClientType, createClient } from "redis";
import { app } from "./app.ts";
import { GoogleAdsAdapter } from "./domain/channels/adapters/google-ads.adapter.ts";
import { GoogleAdapter } from "./domain/channels/adapters/google.adapter.ts";
import { MetaAdapter } from "./domain/channels/adapters/meta.adapter.ts";
import { TiktokAdapter } from "./domain/channels/adapters/tiktok.adapter.ts";
import { createConversionWorker } from "./domain/channels/conversions/conversion.worker.ts";
import {
  createDeltaScanWorker,
  getDeltaPushQueue,
  getDeltaScanQueue,
  scheduleDeltaScanCron,
} from "./domain/channels/delta/delta-scan.cron.ts";
import { createDeltaPushWorker } from "./domain/channels/delta/delta.worker.ts";
import {
  createFeedBuildWorker,
  getFeedBuildQueue,
  scheduleFeedBuildCron,
} from "./domain/channels/feed/feed-build.cron.ts";
import { FeedBuilderService } from "./domain/channels/feed/feed-builder.service.ts";
import { FeedUploaderService } from "./domain/channels/feed/feed-uploader.service.ts";
import {
  createRetentionDeleteWorker,
  getRetentionDeleteQueue,
  scheduleRetentionDeleteCron,
} from "./domain/retention/retention-delete.cron.ts";
import {
  createScrubPiiWorker,
  getScrubPiiQueue,
  scheduleScrubPiiCron,
} from "./domain/retention/scrub-pii.cron.ts";

const _retentionDeleteQueue = getRetentionDeleteQueue();
const _retentionDeleteWorker = createRetentionDeleteWorker();
await scheduleRetentionDeleteCron(_retentionDeleteQueue);

const _scrubPiiQueue = getScrubPiiQueue();
const _scrubPiiWorker = createScrubPiiWorker();
await scheduleScrubPiiCron(_scrubPiiQueue);

// Sales-channel feed-build cron (every 2h). FeedBuilderService and
// FeedUploaderService are stateless and the underlying S3 client + AppDataSource
// repos are singletons, so constructing fresh instances here is safe.
// TODO Phase 4: deduplicate cron deps with container.ts (expose the already-
// constructed instances via named exports or a shared service-locator).
const _webBaseUrl = process.env.WEB_BASE_URL ?? "https://www.materialhubuae.com";
const _feedBuildQueue = getFeedBuildQueue();
const _feedBuildWorker = createFeedBuildWorker({
  salesChannelRepo: AppDataSource.getRepository(SalesChannel),
  channelListingRepo: AppDataSource.getRepository(ChannelListing),
  channelFeedRunRepo: AppDataSource.getRepository(ChannelFeedRun),
  channelCategoryMapRepo: AppDataSource.getRepository(ChannelCategoryMapping),
  feedBuilderService: new FeedBuilderService(AppDataSource.getRepository(Product), _webBaseUrl),
  feedUploader: new FeedUploaderService(
    getS3Client(),
    process.env.INTEGRATION_FEED_BUCKET ?? "materialhub-channel-feeds-prod",
    process.env.INTEGRATION_FEED_BASE_URL ?? "https://feeds.materialhubuae.com",
  ),
  webBaseUrl: _webBaseUrl,
});
await scheduleFeedBuildCron(_feedBuildQueue);

// Sales-channel delta-scan cron (every 5min) + per-item push worker.
// The push worker needs its own Redis client for the circuit-breaker ZSET; we
// construct one here following the dispatcher.worker.ts pattern (a second
// connection is cheap, and shared client state across workers would couple
// otherwise-independent failure-tracking namespaces).
// TODO Phase 4: deduplicate cron deps with container.ts (same TODO as above).
const _deltaScanQueue = getDeltaScanQueue();
const _deltaPushQueue = getDeltaPushQueue();
const _deltaWorkerRedis: RedisClientType = createClient({
  socket: { host: config.redis.host, port: config.redis.port },
  password: config.redis.password,
}) as RedisClientType;
_deltaWorkerRedis
  .connect()
  // biome-ignore lint/suspicious/noConsole: connection error needs to surface
  .catch((err: unknown) => console.error("[delta-push] redis connect error:", err));

const _deltaScanWorker = createDeltaScanWorker({
  salesChannelRepo: AppDataSource.getRepository(SalesChannel),
  channelListingRepo: AppDataSource.getRepository(ChannelListing),
  channelCategoryMapRepo: AppDataSource.getRepository(ChannelCategoryMapping),
  feedBuilderService: new FeedBuilderService(AppDataSource.getRepository(Product), _webBaseUrl),
  deltaPushQueue: _deltaPushQueue,
});

const _deltaPushWorker = createDeltaPushWorker({
  salesChannelRepo: AppDataSource.getRepository(SalesChannel),
  channelListingRepo: AppDataSource.getRepository(ChannelListing),
  channelDeliveryRepo: AppDataSource.getRepository(ChannelDelivery),
  encryption: new EncryptionService(config.encryption.key),
  googleAdapter: new GoogleAdapter(),
  metaAdapter: new MetaAdapter(),
  redis: _deltaWorkerRedis,
});

await scheduleDeltaScanCron(_deltaScanQueue);

// Sales-channel conversion worker — event-driven (consumes
// `channel-conversion-events` from order-service::publishOrderPaidForChannels).
// No scheduler call: BullMQ delivers each `order.paid` job as the queue
// receives it. The GoogleAdsAdapter is currently a stub (Task 9); Task 10
// replaces the body with the real OAuth2 + Enhanced Conversions Adjustment
// REST POST. The worker silently skips channels without `googleAds`
// credentials, so wiring it now is safe even before Task 10 lands.
const _conversionWorker = createConversionWorker({
  orderRepo: AppDataSource.getRepository(Order),
  userRepo: AppDataSource.getRepository(User),
  salesChannelRepo: AppDataSource.getRepository(SalesChannel),
  channelDeliveryRepo: AppDataSource.getRepository(ChannelDelivery),
  encryption: new EncryptionService(config.encryption.key),
  googleAdsAdapter: new GoogleAdsAdapter(),
  metaAdapter: new MetaAdapter(),
  tiktokAdapter: new TiktokAdapter(),
});

await permissionMatrix.load();
permissionMatrix.startPolling();

app.listen(config.port.integration);

// biome-ignore lint/suspicious/noConsole: bootstrap log
console.log(`[integration-service] running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
