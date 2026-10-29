import { MediaService } from "@materialhub/utils";
import { Elysia } from "elysia";
import { AiEnhanceService } from "./domain/media/ai-enhance.service.ts";
import { AiSettingsRepository } from "./domain/media/ai-settings.repository.ts";
import { LayoutVideoController } from "./domain/media/layout-video.controller.ts";
import { MediaController } from "./domain/media/media.controller.ts";
import { ProductImageRepository } from "./domain/media/product-image.repository.ts";
import { ProductVideoRepository } from "./domain/media/product-video.repository.ts";
import { VendorAiUsageRepository } from "./domain/media/vendor-ai-usage.repository.ts";
import { VendorLookupService } from "./domain/media/vendor-lookup.service.ts";
import { TaggableProductsLookupService } from "./domain/product/taggable-products-lookup.service.ts";

import { CategoryCacheService } from "./domain/category/category-cache.service.ts";
import { CategoryController } from "./domain/category/category.controller.ts";
// Domain services
import { CategoryService } from "./domain/category/category.service.ts";

import { BrandSpotlightService } from "./domain/brand/brand-spotlight.service.ts";
import { BrandController } from "./domain/brand/brand.controller.ts";
import { BrandService } from "./domain/brand/brand.service.ts";

import { AttributeController } from "./domain/attribute/attribute.controller.ts";
import { AttributeService } from "./domain/attribute/attribute.service.ts";

import {
  createMembershipRefreshWorker,
  enqueueMembershipRefresh,
  getMembershipRefreshQueue,
  scheduleMembershipRefresh,
} from "./domain/collection/collection-membership.job.ts";
import { CollectionMembershipService } from "./domain/collection/collection-membership.service.ts";
import { CollectionResolver } from "./domain/collection/collection-resolver.service.ts";
import { CollectionSkuResolverService } from "./domain/collection/collection-sku-resolver.service.ts";
import { CollectionController } from "./domain/collection/collection.controller.ts";
import { CollectionService } from "./domain/collection/collection.service.ts";

import { GiftBoxService } from "./domain/gifting/gift-box.service.ts";
import { GiftCatalogService } from "./domain/gifting/gift-catalog.service.ts";
import { GiftController } from "./domain/gifting/gift.controller.ts";

import {
  createSearchReindexWorker,
  getSearchReindexQueue,
} from "./domain/search/search-reindex.job.ts";
import { SearchReindexService } from "./domain/search/search-reindex.service.ts";
import { TrendingSearchService } from "./domain/search/trending.service.ts";
import { TypesenseSearchAdapter } from "./domain/search/typesense-search.adapter.ts";

import { ProductAiEnhanceService } from "./domain/product/product-ai-enhance.service.ts";
import { ProductAiSettingsRepository } from "./domain/product/product-ai-settings.repository.ts";
import { ProductBundleService } from "./domain/product/product-bundle.service.ts";
import { ProductGroupService } from "./domain/product/product-group.service.ts";
import { ProductQuestionService } from "./domain/product/product-question.service.ts";
import { ProductRelationService } from "./domain/product/product-relation.service.ts";
import { ProductVariantService } from "./domain/product/product-variant.service.ts";
import { ProductController } from "./domain/product/product.controller.ts";
import { ProductService } from "./domain/product/product.service.ts";
import { SuggestService } from "./domain/product/suggest.service.ts";

import { InventoryReservationService } from "./domain/inventory/inventory-reservation.service.ts";
import { InventoryController } from "./domain/inventory/inventory.controller.ts";
import { InventoryService } from "./domain/inventory/inventory.service.ts";

import { FlashDealController } from "./domain/flash-deal/flash-deal.controller.ts";
import { FlashDealService } from "./domain/flash-deal/flash-deal.service.ts";

import { WishlistController } from "./domain/wishlist/wishlist.controller.ts";
import { WishlistService } from "./domain/wishlist/wishlist.service.ts";

import {
  createRecentlyViewedPurgeWorker,
  getRecentlyViewedPurgeQueue,
  scheduleRecentlyViewedPurge,
} from "./domain/recently-viewed/recently-viewed-purge.job.ts";
import { RecentlyViewedController } from "./domain/recently-viewed/recently-viewed.controller.ts";
import { RecentlyViewedService } from "./domain/recently-viewed/recently-viewed.service.ts";

import {
  createSavedSearchNotifyWorker,
  getSavedSearchNotifyQueue,
  scheduleSavedSearchNotify,
} from "./domain/saved-search/saved-search-notify.job.ts";
import { SavedSearchController } from "./domain/saved-search/saved-search.controller.ts";
import { SavedSearchService } from "./domain/saved-search/saved-search.service.ts";

import { RecentSearchService } from "./domain/recent-search/recent-search.service.ts";

import { RecommendationController } from "./domain/recommendation/recommendation.controller.ts";
import { RecommendationService } from "./domain/recommendation/recommendation.service.ts";

import { ServiceOfferingController } from "./domain/service-offering/service-offering.controller.ts";
import { ServiceOfferingService } from "./domain/service-offering/service-offering.service.ts";
import { ServiceSearchAdapter } from "./domain/service-search/service-search.adapter.ts";

import { registerTemplate } from "@materialhub/bulk-jobs";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Brand,
  Category,
  Product,
  RecentSearch,
  ServiceOffering,
  ServiceOfferingTranslation,
  Vendor,
} from "@materialhub/database";
import { getS3Client } from "@materialhub/utils";
import { Queue } from "bullmq";
import { createClient as createRedisClient } from "redis";
import { startBulkDispatcherWorker } from "./bulk/bulk-dispatcher.worker.ts";
import { BulkService } from "./bulk/bulk.service.ts";
import { catalogImportJobType } from "./bulk/catalog-import/catalog-import.job-type.ts";
import { catalogImportTemplate } from "./bulk/catalog-import/catalog-import.template.ts";
import { flashDealDeleteJobType } from "./bulk/flash-deal-delete/flash-deal-delete.job-type.ts";
import { flashDealImportJobType } from "./bulk/flash-deal-import/flash-deal-import.job-type.ts";
import { startImageFetchWorker } from "./bulk/image-fetch/image-fetch.worker.ts";
import { registerJobType } from "./bulk/index.ts";
import { inventoryUpdateJobType } from "./bulk/inventory-update/inventory-update.job-type.ts";
import { inventoryUpdateTemplate } from "./bulk/inventory-update/inventory-update.template.ts";
import { ProductExportService } from "./bulk/product-export/product-export.service.ts";
import { startProductExportWorker } from "./bulk/product-export/product-export.worker.ts";
import { getBulkParentQueue, getProductExportQueue } from "./bulk/queues.ts";
import { startVideoTranscodeWorker } from "./domain/media/video-transcode.worker.ts";

// ─── Trending Search (Redis sorted sets) ──────────────────────────────
// We use node-redis (already a direct dep) via a thin adapter that presents
// the RedisLike API (zincrby / zunionstore / zrevrange) expected by
// TrendingSearchService.
function makeTrendingRedisAdapter() {
  const client = createRedisClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: 2000,
    },
    password: config.redis.password,
  });
  // Fire-and-forget connect — if Redis is down, recording is silently skipped.
  client.connect().catch(() => {});

  return {
    multi() {
      const pipeline = client.multi();
      const self = {
        zincrby(key: string, by: number, member: string) {
          pipeline.zIncrBy(key, by, member);
          return self;
        },
        expire(key: string, seconds: number) {
          pipeline.expire(key, seconds);
          return self;
        },
        async exec() {
          await pipeline.exec();
        },
      };
      return self;
    },
    async zunionstore(dest: string, _numkeys: number, ...keys: string[]) {
      // redis v5 requires a non-empty tuple for ZKeys; we cast since we always
      // pass at least 2 keys (current week + previous week).
      await client.zUnionStore(dest, keys as [string, ...string[]]);
    },
    async expire(key: string, seconds: number) {
      await client.expire(key, seconds);
    },
    async zrevrange(key: string, start: number, stop: number, _withScores: string) {
      const results = await client.zRangeWithScores(key, start, stop, {
        REV: true,
      });
      const out: string[] = [];
      for (const { value, score } of results) {
        out.push(value, String(score));
      }
      return out;
    },
  };
}

const trendingSearchService = new TrendingSearchService(makeTrendingRedisAdapter() as any);

// ─── Media ────────────────────────────────────────────────────────────
const imageRepo = new ProductImageRepository();
const videoRepo = new ProductVideoRepository();
const mediaService = new MediaService();
const vendorLookupService = new VendorLookupService();
// BullMQ rejects colons in queue names — keep this hyphenated and in sync with
// the worker in video-transcode.worker.ts.
const videoQueue = new Queue("media-video", {
  connection: { url: config.bullmq.redisUrl },
});
const aiEnhance = new AiEnhanceService(mediaService);
const aiSettings = new AiSettingsRepository();
const aiUsage = new VendorAiUsageRepository();
const mediaController = new MediaController(
  mediaService,
  imageRepo,
  vendorLookupService,
  videoRepo,
  videoQueue,
  aiEnhance,
  aiSettings,
  aiUsage,
);
const layoutVideoController = new LayoutVideoController(
  videoRepo,
  vendorLookupService,
  mediaService,
  videoQueue,
);

// ─── Category ─────────────────────────────────────────────────────────
const categoryService = new CategoryService();
const categoryCacheService = new CategoryCacheService(categoryService);
const categoryController = new CategoryController(categoryService, categoryCacheService);

// ─── Brand ────────────────────────────────────────────────────────────
const brandService = new BrandService();
const brandController = new BrandController(brandService);
const brandSpotlightService = new BrandSpotlightService();

// ─── Attribute ────────────────────────────────────────────────────────
const attributeService = new AttributeService();
const attributeController = new AttributeController(attributeService);

// ─── Search ───────────────────────────────────────────────────────────
const searchService = new TypesenseSearchAdapter();
const suggestService = new SuggestService(
  searchService,
  AppDataSource.getRepository(Category),
  AppDataSource.getRepository(Brand),
  trendingSearchService,
);
const searchReindexService = new SearchReindexService();

// BullMQ: admin-triggered Typesense full reindex. Queue instance is kept
// so the admin route can enqueue jobs and look up their status.
const searchReindexQueue = getSearchReindexQueue();
const _searchReindexWorker = createSearchReindexWorker(searchReindexService);

// ─── Collections ──────────────────────────────────────────────────────
const membershipRefreshQueue = getMembershipRefreshQueue();
const collectionService = new CollectionService((collectionId) => {
  // Fire-and-forget: a failed enqueue must never break the mutation response.
  enqueueMembershipRefresh(membershipRefreshQueue, collectionId).catch((e) =>
    console.error("[collection] membership refresh enqueue failed", e),
  );
});
const collectionMembershipService = new CollectionMembershipService(
  searchService,
  collectionService,
);
const _membershipRefreshWorker = createMembershipRefreshWorker(collectionMembershipService);
void scheduleMembershipRefresh(membershipRefreshQueue);
const collectionResolver = new CollectionResolver(searchService, collectionService);
const collectionSkuResolver = new CollectionSkuResolverService();
const collectionController = new CollectionController(
  collectionService,
  collectionResolver,
  collectionSkuResolver,
);

// ─── Gifting ──────────────────────────────────────────────────────────
const giftCatalogService = new GiftCatalogService();
const giftBoxService = new GiftBoxService();
const giftController = new GiftController(giftCatalogService, giftBoxService);

// ─── Inventory ────────────────────────────────────────────────────────
const inventoryService = new InventoryService();
const reservationService = new InventoryReservationService();
const inventoryController = new InventoryController(inventoryService, reservationService);

// ─── Product ──────────────────────────────────────────────────────────
const productService = new ProductService(searchService, trendingSearchService);
const productAiSettings = new ProductAiSettingsRepository();
const productAiEnhance = new ProductAiEnhanceService(productAiSettings);
const productVariantService = new ProductVariantService(attributeService, inventoryService);
const productRelationService = new ProductRelationService();
const productQuestionService = new ProductQuestionService();
const productBundleService = new ProductBundleService();
const productGroupService = new ProductGroupService({
  reindexProduct: (productId: string) => productService.reindexProduct(productId),
});
const productController = new ProductController(
  productService,
  productVariantService,
  productRelationService,
  productQuestionService,
  productBundleService,
  productGroupService,
);
const productRepo = AppDataSource.getRepository(Product);
const taggableProductsLookupService = new TaggableProductsLookupService(productRepo as any);

// ─── Flash Deal ───────────────────────────────────────────────────────
const flashDealService = new FlashDealService();
const flashDealController = new FlashDealController(flashDealService);

// ─── Wishlist ────────────────────────────────────────────────────────
const wishlistService = new WishlistService();
const wishlistController = new WishlistController(wishlistService);

// ─── Recently Viewed ─────────────────────────────────────────────────
const recentlyViewedService = new RecentlyViewedService();
const recentlyViewedController = new RecentlyViewedController(recentlyViewedService);

// BullMQ: Recently Viewed Purge (daily at 3 AM)
const recentlyViewedPurgeQueue = getRecentlyViewedPurgeQueue();
const _recentlyViewedPurgeWorker = createRecentlyViewedPurgeWorker(recentlyViewedService);
scheduleRecentlyViewedPurge(recentlyViewedPurgeQueue);

// ─── Saved Search ────────────────────────────────────────────────────
const savedSearchService = new SavedSearchService();
const savedSearchController = new SavedSearchController(savedSearchService);

// BullMQ: Saved Search Notify (every 6 hours)
const notificationEventsQueue = new Queue("notification-events", {
  connection: { url: config.bullmq.redisUrl },
});
const savedSearchNotifyQueue = getSavedSearchNotifyQueue();
const _savedSearchNotifyWorker = createSavedSearchNotifyWorker(notificationEventsQueue);
scheduleSavedSearchNotify(savedSearchNotifyQueue);

// ─── Recent Search ───────────────────────────────────────────────────
const recentSearchService = new RecentSearchService(AppDataSource.getRepository(RecentSearch));

// ─── Recommendation ──────────────────────────────────────────────────
const recommendationService = new RecommendationService();
const recommendationController = new RecommendationController(recommendationService);

// ─── Service Offerings (bookings catalog) ────────────────────────────
const serviceOfferingService = new ServiceOfferingService(
  AppDataSource.getRepository(ServiceOffering),
  AppDataSource.getRepository(ServiceOfferingTranslation),
  AppDataSource.getRepository(Vendor),
);
const serviceSearchAdapter = new ServiceSearchAdapter();
const serviceOfferingController = new ServiceOfferingController(
  serviceOfferingService,
  serviceSearchAdapter,
);

// ─── Bulk Jobs ────────────────────────────────────────────────────────
const bulkParentQueue = getBulkParentQueue();
export const bulkService = new BulkService(AppDataSource, getS3Client(), bulkParentQueue);
const productExportQueue = getProductExportQueue();
export const productExportService = new ProductExportService(
  AppDataSource,
  getS3Client(),
  productExportQueue,
);

registerJobType(inventoryUpdateJobType as never);
registerTemplate(inventoryUpdateTemplate);

registerJobType(catalogImportJobType as never);
registerTemplate(catalogImportTemplate);

registerJobType(flashDealImportJobType as never);
registerJobType(flashDealDeleteJobType as never);

// Inline publisher: forwards bulk-job completion events into the already-existing
// notification-events queue so notification-service can pick them up.
const bulkJobPublisher: import("@materialhub/bulk-jobs").BulkJobEventPublisher = async (
  eventType,
  payload,
) => {
  await notificationEventsQueue.add(eventType, payload);
};

const _bulkDispatcherWorker = startBulkDispatcherWorker({
  publisher: bulkJobPublisher,
}).catch((e) => console.error("[bulk-dispatcher-worker] failed to start", e));

const _bulkImageFetchWorker = startImageFetchWorker({ mediaService }).catch((e) =>
  console.error("[bulk-image-fetch-worker] failed to start", e),
);
const _productExportWorker = startProductExportWorker(productExportService).catch((e) =>
  console.error("[product-export-worker] failed to start", e),
);

const _videoTranscodeWorker = startVideoTranscodeWorker({ mediaService }).catch((e) =>
  console.error("[video-transcode-worker] failed to start", e),
);

// Export for BullMQ job wiring in index.ts
export { reservationService, searchService, flashDealService, recentlyViewedService };

export const container = new Elysia({ name: "product-service-container" })
  .decorate("mediaController", mediaController)
  .decorate("layoutVideoController", layoutVideoController)
  .decorate("aiSettings", aiSettings)
  .decorate("aiEnhance", aiEnhance)
  .decorate("categoryController", categoryController)
  .decorate("brandController", brandController)
  .decorate("brandSpotlightService", brandSpotlightService)
  .decorate("attributeController", attributeController)
  .decorate("productController", productController)
  .decorate("inventoryController", inventoryController)
  .decorate("suggestService", suggestService)
  .decorate("searchReindexQueue", searchReindexQueue)
  .decorate("flashDealController", flashDealController)
  .decorate("flashDealService", flashDealService)
  .decorate("wishlistController", wishlistController)
  .decorate("recentlyViewedController", recentlyViewedController)
  .decorate("savedSearchController", savedSearchController)
  .decorate("recentSearchService", recentSearchService)
  .decorate("recommendationController", recommendationController)
  .decorate("taggableProductsLookupService", taggableProductsLookupService)
  .decorate("inventoryService", inventoryService)
  .decorate("productRepo", productRepo)
  .decorate("productService", productService)
  .decorate("productAiSettings", productAiSettings)
  .decorate("productAiEnhance", productAiEnhance)
  .decorate("trendingService", trendingSearchService)
  .decorate("collectionController", collectionController)
  .decorate("giftController", giftController)
  .decorate("serviceOfferingController", serviceOfferingController);
