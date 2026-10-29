import { config } from "@materialhub/config";
import {
  AppDataSource,
  AuditLog,
  ChannelCategoryMapping,
  ChannelDelivery,
  ChannelFeedRun,
  ChannelListing,
  Order,
  Product,
  SalesChannel,
  SiteSetting,
  User,
  Vendor,
  VendorIntegration,
  VendorIntegrationDelivery,
  VendorIntegrationMapping,
  VendorIntegrationPendingWrite,
  ensureDatabase,
} from "@materialhub/database";
import { getIntegrationEventsQueue } from "@materialhub/integration-events";
import { EncryptionService, getS3Client } from "@materialhub/utils";
import { Elysia } from "elysia";
import { type RedisClientType, createClient } from "redis";
import { GoogleAdsAdapter } from "./domain/channels/adapters/google-ads.adapter.ts";
import { GoogleAdapter } from "./domain/channels/adapters/google.adapter.ts";
import { MetaAdapter } from "./domain/channels/adapters/meta.adapter.ts";
import { TiktokAdapter } from "./domain/channels/adapters/tiktok.adapter.ts";
import { CategoryMapService } from "./domain/channels/category-map.service.ts";
import { ChannelController } from "./domain/channels/channel.controller.ts";
import { ChannelService } from "./domain/channels/channel.service.ts";
import { getFeedBuildQueue } from "./domain/channels/feed/feed-build.cron.ts";
import { FeedBuilderService } from "./domain/channels/feed/feed-builder.service.ts";
import { FeedUploaderService } from "./domain/channels/feed/feed-uploader.service.ts";
import { DispatcherService } from "./domain/dispatcher/dispatcher.service.ts";
import { createDispatcherWorker } from "./domain/dispatcher/dispatcher.worker.ts";
import { DomainDispatch } from "./domain/inbound/domain-dispatch.ts";
import { InboundService } from "./domain/inbound/inbound.service.ts";
import { IntegrationController } from "./domain/integration/integration.controller.ts";
import { IntegrationService } from "./domain/integration/integration.service.ts";
import { MappingService } from "./domain/mapping/mapping.service.ts";
import { PendingWritesService } from "./domain/pending-writes/pending-writes.service.ts";

await ensureDatabase();

const siteSettingRepo = AppDataSource.getRepository(SiteSetting);
const vendorRepo = AppDataSource.getRepository(Vendor);
const integrationRepo = AppDataSource.getRepository(VendorIntegration);
const mappingRepo = AppDataSource.getRepository(VendorIntegrationMapping);
const deliveryRepo = AppDataSource.getRepository(VendorIntegrationDelivery);
const pendingWriteRepo = AppDataSource.getRepository(VendorIntegrationPendingWrite);
const auditLogRepo = AppDataSource.getRepository(AuditLog);
const salesChannelRepo = AppDataSource.getRepository(SalesChannel);
const channelCategoryMapRepo = AppDataSource.getRepository(ChannelCategoryMapping);
const channelListingRepo = AppDataSource.getRepository(ChannelListing);
const channelFeedRunRepo = AppDataSource.getRepository(ChannelFeedRun);
const channelDeliveryRepo = AppDataSource.getRepository(ChannelDelivery);
const orderRepo = AppDataSource.getRepository(Order);
const userRepo = AppDataSource.getRepository(User);

const encryption = new EncryptionService(config.encryption.key);
const eventsQueue = getIntegrationEventsQueue();

const integrationService = new IntegrationService(integrationRepo, encryption, auditLogRepo);
const integrationController = new IntegrationController(integrationService);
const mappingService = new MappingService(mappingRepo, auditLogRepo);
const pendingWritesService = new PendingWritesService(pendingWriteRepo);
const domainDispatch = new DomainDispatch({
  orderHost: process.env.ORDER_HOST ?? "http://order-service:3003",
  productHost: process.env.PRODUCT_HOST ?? "http://product-service:3002",
});
const inboundService = new InboundService({
  integrationRepo,
  mappingRepo,
  deliveryRepo,
  pendingWrites: pendingWritesService,
  domainDispatch,
  encryption,
});

const channelService = new ChannelService(salesChannelRepo, encryption);
const categoryMapService = new CategoryMapService(channelCategoryMapRepo);
const channelController = new ChannelController(channelService, categoryMapService);

const productRepo = AppDataSource.getRepository(Product);
const feedBuilderService = new FeedBuilderService(
  productRepo,
  process.env.WEB_BASE_URL ?? "https://www.materialhubuae.com",
);

// Env vars provisioned via SSM (see scripts/refresh-env-from-ssm.sh +
// terraform/production/ssm.tf). Defaults match the prod CloudFront/S3 names.
const feedUploader = new FeedUploaderService(
  getS3Client(),
  process.env.INTEGRATION_FEED_BUCKET ?? "materialhub-channel-feeds-prod",
  process.env.INTEGRATION_FEED_BASE_URL ?? "https://feeds.materialhubuae.com",
);

const feedBuildQueue = getFeedBuildQueue();

const googleAdapter = new GoogleAdapter();
// Phase 1b Task 9 wires this stub. Task 10 replaces the adapter body with the
// real OAuth2 + Enhanced Conversions Adjustment REST POST; the class shape
// (constructor + method signature) is the contract the worker tests rely on.
const googleAdsAdapter = new GoogleAdsAdapter();
const metaAdapter = new MetaAdapter();
const tiktokAdapter = new TiktokAdapter();

export const container = new Elysia({ name: "integration-service-container" })
  .decorate("vendorRepo", vendorRepo)
  .decorate("integrationRepo", integrationRepo)
  .decorate("mappingRepo", mappingRepo)
  .decorate("deliveryRepo", deliveryRepo)
  .decorate("pendingWriteRepo", pendingWriteRepo)
  .decorate("encryption", encryption)
  .decorate("eventsQueue", eventsQueue)
  .decorate("integrationService", integrationService)
  .decorate("integrationController", integrationController)
  .decorate("mappingService", mappingService)
  .decorate("pendingWritesService", pendingWritesService)
  .decorate("domainDispatch", domainDispatch)
  .decorate("inboundService", inboundService)
  .decorate("siteSettingRepo", siteSettingRepo)
  .decorate("salesChannelRepo", salesChannelRepo)
  .decorate("channelCategoryMapRepo", channelCategoryMapRepo)
  .decorate("channelListingRepo", channelListingRepo)
  .decorate("channelFeedRunRepo", channelFeedRunRepo)
  .decorate("channelDeliveryRepo", channelDeliveryRepo)
  .decorate("orderRepo", orderRepo)
  .decorate("userRepo", userRepo)
  .decorate("channelService", channelService)
  .decorate("categoryMapService", categoryMapService)
  .decorate("channelController", channelController)
  .decorate("feedBuilderService", feedBuilderService)
  .decorate("feedUploader", feedUploader)
  .decorate("feedBuildQueue", feedBuildQueue)
  .decorate("googleAdapter", googleAdapter)
  .decorate("googleAdsAdapter", googleAdsAdapter)
  .decorate("metaAdapter", metaAdapter)
  .decorate("tiktokAdapter", tiktokAdapter);

const dispatcherRedis: RedisClientType = createClient({
  socket: { host: config.redis.host, port: config.redis.port },
  password: config.redis.password,
}) as RedisClientType;
dispatcherRedis
  .connect()
  .catch((err: any) => console.error("Dispatcher redis connect error:", err));

const dispatcherService = new DispatcherService();
const _dispatcherWorker = createDispatcherWorker({
  integrationRepo,
  mappingRepo,
  deliveryRepo,
  encryption,
  service: dispatcherService,
  redis: dispatcherRedis,
});
