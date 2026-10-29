import { config } from "@materialhub/config";
import { AppDataSource, FlashDeal, Product } from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import type { SearchService } from "./search.interface.ts";

export const SEARCH_SYNC_QUEUE = "search-sync";

export type SearchSyncData =
  | { type: "upsert"; product: any }
  // For flash-deal-driven syncs we pass the productId only — the worker
  // re-loads the product fresh (with all relations) plus the current active
  // deal at process time. This keeps the queue payload small and makes
  // delayed jobs (fired at expires_at) read the up-to-the-moment state.
  | { type: "upsert_by_product_id"; productId: string }
  | { type: "delete"; productId: string };

let searchSyncQueue: Queue | null = null;

export function getSearchSyncQueue(): Queue {
  if (!searchSyncQueue) {
    searchSyncQueue = new Queue(SEARCH_SYNC_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    });
  }
  return searchSyncQueue;
}

export async function enqueueSearchSync(
  data: SearchSyncData,
  opts?: { delay?: number; jobId?: string },
): Promise<void> {
  const queue = getSearchSyncQueue();
  await queue.add("sync", data, {
    removeOnComplete: 100,
    removeOnFail: 500,
    ...(opts?.delay !== undefined ? { delay: opts.delay } : {}),
    ...(opts?.jobId ? { jobId: opts.jobId } : {}),
  });
}

const PRODUCT_RELATIONS = [
  "category",
  "brand",
  "vendor",
  "variants",
  "inventoryRecords",
  "images",
  "attributeValues",
  "attributeValues.attribute",
  "attributeValues.attributeValue",
];

export type ActiveDealLite = {
  id: string;
  deal_price: number;
  original_price: number;
  expires_at: Date | string;
} | null;

export interface SearchSyncDeps {
  loadProduct: (productId: string) => Promise<any | null>;
  loadActiveDeal: (productId: string) => Promise<ActiveDealLite>;
}

const defaultDeps: SearchSyncDeps = {
  loadProduct: async (productId: string) =>
    AppDataSource.getRepository(Product).findOne({
      where: { id: productId },
      relations: PRODUCT_RELATIONS,
    }),
  loadActiveDeal: async (productId: string) => {
    const deal = await AppDataSource.getRepository(FlashDeal)
      .createQueryBuilder("fd")
      .where("fd.product_id = :productId", { productId })
      .andWhere("fd.is_active = true")
      .andWhere("fd.starts_at <= NOW()")
      .andWhere("fd.expires_at > NOW()")
      .andWhere("fd.deleted_at IS NULL")
      .andWhere("(fd.quantity_limit IS NULL OR fd.quantity_sold < fd.quantity_limit)")
      .orderBy("fd.variant_id", "DESC", "NULLS LAST")
      .addOrderBy("fd.starts_at", "DESC")
      .getOne();
    return deal
      ? {
          id: deal.id,
          deal_price: deal.deal_price,
          original_price: deal.original_price,
          expires_at: deal.expires_at,
        }
      : null;
  },
};

export class SearchSyncProcessor {
  private deps: SearchSyncDeps;

  constructor(
    private searchService: SearchService,
    deps?: Partial<SearchSyncDeps>,
  ) {
    this.deps = { ...defaultDeps, ...(deps ?? {}) };
  }

  async process(job: { data: SearchSyncData }): Promise<void> {
    const { data } = job;

    if (data.type === "delete") {
      await this.searchService.removeProduct(data.productId);
      return;
    }

    if (data.type === "upsert") {
      if (data.product.status !== "published") {
        await this.searchService.removeProduct(data.product.id);
        return;
      }
      const activeDeal = await this.deps.loadActiveDeal(data.product.id);
      await this.searchService.indexProduct(data.product, activeDeal);
      return;
    }

    if (data.type === "upsert_by_product_id") {
      const product = await this.deps.loadProduct(data.productId);
      if (!product) {
        await this.searchService.removeProduct(data.productId);
        return;
      }
      if (product.status !== "published") {
        await this.searchService.removeProduct(data.productId);
        return;
      }
      const activeDeal = await this.deps.loadActiveDeal(data.productId);
      await this.searchService.indexProduct(product, activeDeal);
      return;
    }
  }
}

export function createSearchSyncWorker(searchService: SearchService): Worker {
  const processor = new SearchSyncProcessor(searchService);
  return new Worker(SEARCH_SYNC_QUEUE, async (job) => processor.process(job), {
    connection: { url: config.bullmq.redisUrl },
    concurrency: 5,
  });
}
