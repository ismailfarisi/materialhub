import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import { hydrateOfferingRefs } from "./hydrate-offering-refs.ts";
import { resolveVendorAreas } from "./resolve-vendor-areas.ts";
import {
  type ServiceOfferingForIndexing,
  type VendorAreaSets,
  serviceOfferingToDocument,
} from "./service-offering.collection.ts";
import { loadRatings } from "./service-ratings.ts";
import type { ServiceSearchAdapter } from "./service-search.adapter.ts";

export const SERVICE_SEARCH_SYNC_QUEUE = "service-search-sync";

export type ServiceSearchSyncData =
  | { type: "upsert_offering"; offeringId: string }
  | { type: "delete_offering"; offeringId: string }
  // Vendor-level fan-out: a branch or service-area change in booking-service
  // invalidates the area_ids of EVERY offering that vendor publishes.
  | { type: "resync_vendor"; vendorId: string };

let queue: Queue | null = null;

export function getServiceSearchSyncQueue(): Queue {
  if (!queue) {
    queue = new Queue(SERVICE_SEARCH_SYNC_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    });
  }
  return queue;
}

export async function enqueueServiceSearchSync(
  data: ServiceSearchSyncData,
  opts?: { jobId?: string; queue?: Pick<Queue, "add"> },
): Promise<void> {
  // Dedup key: rapid successive edits to the same vendor or offering collapse
  // into one job instead of a fan-out storm. BullMQ ignores an add() whose
  // jobId already exists and is still waiting.
  const jobId =
    opts?.jobId ??
    (data.type === "resync_vendor" ? `vendor:${data.vendorId}` : `offering:${data.offeringId}`);
  try {
    // getServiceSearchSyncQueue() is INSIDE the try too: a malformed
    // redisUrl (or any other `new Queue(...)` construction failure) must be
    // just as non-fatal as a failed .add() — otherwise the "Redis blip can't
    // 500 the caller" guarantee below only covers half the enqueue path.
    const queue = opts?.queue ?? getServiceSearchSyncQueue();
    // removeOnComplete/removeOnFail MUST be `true` (delete-on-settle), not a
    // retention count. The dedup key above is the job's Redis key: as long as
    // it exists, BullMQ's addStandardJob dedup path returns the *existing*
    // jobId and silently skips re-queueing (see handleDuplicatedJob in
    // bullmq's addStandardJob-9.lua). A retention count (e.g. keep the last
    // 100 completed) keeps that key alive long after the job settles, so every
    // later event for the same vendor/offering — including a vendor pausing a
    // service — gets dropped and the search index goes stale. Freeing the key
    // immediately on settle keeps the dedup window scoped to "still
    // waiting/active", which is its only intended purpose.
    await queue.add("sync", data, {
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    });
  } catch (err) {
    // Minor-3: this is awaited by ServiceOfferingService's create/update/
    // approve/reject AFTER the offering row is already saved (and, for
    // approve(), after services_trusted is already flipped). A transient
    // Redis blip must not turn an already-committed write into a 500 for the
    // vendor/admin caller — same posture as booking-service's
    // notifyVendorAreasChanged (service-search-notify.ts). The nightly
    // reconcile (createServiceReconcileWorker) is the backstop that repairs a
    // missed index update.
    console.error("[service-search] enqueue failed", {
      data,
      error: (err as Error).message,
    });
  }
}

export interface ServiceSyncDeps {
  loadOffering: (offeringId: string) => Promise<ServiceOfferingForIndexing | null>;
  loadPublishedOfferingIdsForVendor: (vendorId: string) => Promise<string[]>;
  resolveAreasForVendors: (vendorIds: string[]) => Promise<Map<string, VendorAreaSets>>;
  loadRatings: (offeringIds: string[]) => Promise<Map<string, { avg: number; count: number }>>;
}

// Regression guard (see hydrate-offering-refs.test.ts): `vendor`/`category`
// are NOT TypeORM relations on ServiceOffering — only raw vendor_id /
// category_id columns. Asking findOne() for them throws
// EntityPropertyNotFoundError, which silently emptied `/services` forever.
// Refs are hydrated separately via hydrateOfferingRefs below.
export const defaultDeps: ServiceSyncDeps = {
  loadOffering: async (offeringId: string) => {
    const { AppDataSource, ServiceOffering } = await import("@materialhub/database");
    const offering = await AppDataSource.getRepository(ServiceOffering).findOne({
      where: { id: offeringId },
    });
    if (!offering) return null;
    const hydrated: ServiceOfferingForIndexing = offering;
    await hydrateOfferingRefs([hydrated]);
    return hydrated;
  },
  loadPublishedOfferingIdsForVendor: async (vendorId: string) => {
    const { AppDataSource } = await import("@materialhub/database");
    const rows: Array<{ id: string }> = await AppDataSource.query(
      `SELECT id FROM service_offerings
        WHERE vendor_id = $1 AND status = 'published' AND deleted_at IS NULL`,
      [vendorId],
    );
    return rows.map((r) => r.id);
  },
  resolveAreasForVendors: (vendorIds: string[]) => resolveVendorAreas(vendorIds),
  loadRatings,
};

export class ServiceSearchSyncProcessor {
  private deps: ServiceSyncDeps;

  constructor(
    private adapter: Pick<ServiceSearchAdapter, "indexOffering" | "removeOffering">,
    deps?: Partial<ServiceSyncDeps>,
  ) {
    this.deps = { ...defaultDeps, ...(deps ?? {}) };
  }

  /**
   * Index a single offering, or remove it if it is not (or no longer)
   * publicly bookable. "paused" is the one that matters: it is a state a live
   * vendor moves in and out of, so it must DELETE the document rather than
   * simply skip re-indexing a stale one.
   */
  private async syncOne(offeringId: string): Promise<void> {
    const offering = await this.deps.loadOffering(offeringId);
    if (!offering || offering.status !== "published") {
      await this.adapter.removeOffering(offeringId);
      return;
    }
    const [areaMap, ratings] = await Promise.all([
      this.deps.resolveAreasForVendors([offering.vendor_id]),
      this.deps.loadRatings([offeringId]),
    ]);
    const areas = areaMap.get(offering.vendor_id) ?? { premises: [], homeVisit: [] };
    await this.adapter.indexOffering(
      serviceOfferingToDocument(offering, areas, ratings.get(offeringId)),
    );
  }

  async process(job: { data: ServiceSearchSyncData }): Promise<void> {
    const { data } = job;

    if (data.type === "delete_offering") {
      await this.adapter.removeOffering(data.offeringId);
      return;
    }

    if (data.type === "upsert_offering") {
      await this.syncOne(data.offeringId);
      return;
    }

    if (data.type === "resync_vendor") {
      const ids = await this.deps.loadPublishedOfferingIdsForVendor(data.vendorId);
      for (const id of ids) {
        await this.syncOne(id);
      }
      return;
    }
  }
}

export function createServiceSearchSyncWorker(adapter: ServiceSearchAdapter): Worker {
  const processor = new ServiceSearchSyncProcessor(adapter);
  return new Worker(SERVICE_SEARCH_SYNC_QUEUE, async (job) => processor.process(job), {
    connection: { url: config.bullmq.redisUrl },
    concurrency: 5,
  });
}
