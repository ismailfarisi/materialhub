import { config } from "@materialhub/config";
import { AppDataSource, Product } from "@materialhub/database";
import { Queue, Worker } from "bullmq";
import type { SearchService } from "./search.interface.ts";

export const SEARCH_SYNC_QUEUE = "search-sync";

export type SearchSyncData =
  | { type: "upsert"; product: any }
  // Pass the productId only — the worker re-loads the product fresh (with
  // all relations) at process time, keeping the queue payload small.
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
  "price_tiers",
  "inventoryRecords",
  "images",
  "attributeValues",
  "attributeValues.attribute",
  "attributeValues.attributeValue",
  "ecoDeclaration",
];

export interface SearchSyncDeps {
  loadProduct: (productId: string) => Promise<any | null>;
}

const defaultDeps: SearchSyncDeps = {
  loadProduct: async (productId: string) =>
    AppDataSource.getRepository(Product).findOne({
      where: { id: productId },
      relations: PRODUCT_RELATIONS,
    }),
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
      await this.searchService.indexProduct(data.product);
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
      await this.searchService.indexProduct(product);
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
