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
import { ServiceSearchAdapter } from "./service-search.adapter.ts";

const BATCH_SIZE = 100;

export interface ReindexDeps {
  loadPublishedBatch: (offset: number, limit: number) => Promise<ServiceOfferingForIndexing[]>;
  resolveAreasForVendors: (vendorIds: string[]) => Promise<Map<string, VendorAreaSets>>;
  loadRatings: (offeringIds: string[]) => Promise<Map<string, { avg: number; count: number }>>;
  filterStillPublished: (offeringIds: string[]) => Promise<Set<string>>;
}

// Regression guard (see hydrate-offering-refs.test.ts): `vendor`/`category`
// are NOT TypeORM relations on ServiceOffering — see the note in
// service-search-sync.job.ts. This loader hydrates the same refs in ONE
// batched pair of queries per page, not per row.
export const defaultDeps: ReindexDeps = {
  loadPublishedBatch: async (offset: number, limit: number) => {
    const { AppDataSource, ServiceOffering } = await import("@materialhub/database");
    const rows = await AppDataSource.getRepository(ServiceOffering).find({
      where: { status: "published" as any },
      // `id` is a tiebreaker: rows sharing a `created_at` timestamp have no
      // deterministic order between offset/limit pages on `created_at` alone,
      // which can skip or double-index a row across page boundaries.
      order: { created_at: "ASC", id: "ASC" },
      skip: offset,
      take: limit,
    });
    const hydrated: ServiceOfferingForIndexing[] = rows;
    await hydrateOfferingRefs(hydrated);
    return hydrated;
  },
  resolveAreasForVendors: (vendorIds: string[]) => resolveVendorAreas(vendorIds),
  // Shared with the incremental sync path — see service-ratings.ts (Task 4).
  loadRatings,
  filterStillPublished: async (offeringIds: string[]) => {
    const { AppDataSource } = await import("@materialhub/database");
    const rows: Array<{ id: string }> = await AppDataSource.query(
      `SELECT id FROM service_offerings
        WHERE id = ANY($1) AND status = 'published' AND deleted_at IS NULL`,
      [offeringIds],
    );
    return new Set(rows.map((r) => r.id));
  },
};

export class ServiceSearchReindexService {
  private deps: ReindexDeps;

  constructor(
    private adapter: Pick<
      ServiceSearchAdapter,
      "ensureCollection" | "indexOffering" | "listIndexedIds" | "removeOffering"
    >,
    deps?: Partial<ReindexDeps>,
  ) {
    this.deps = { ...defaultDeps, ...(deps ?? {}) };
  }

  /**
   * Upsert-in-place reconcile. Deliberately does NOT drop the collection —
   * that would make `/services` error with "collection not found" for the
   * duration of the rebuild. `ensureCollection` only creates it if absent
   * (first boot); an existing collection is left as-is and reconciled via
   * upsert + prune instead. A deliberate schema-change rebuild still goes
   * through `recreateCollection()` via the CLI's opt-in `--recreate` flag —
   * never from this nightly path.
   */
  async reindexAll(): Promise<{ indexed: number; pruned: number }> {
    await this.adapter.ensureCollection();

    let offset = 0;
    let indexed = 0;
    const indexedIds = new Set<string>();

    for (;;) {
      const batch = await this.deps.loadPublishedBatch(offset, BATCH_SIZE);
      if (batch.length === 0) break;

      // One area lookup per BATCH, not per offering — a salon with 40
      // services would otherwise issue 40 identical pairs of queries.
      const vendorIds = [...new Set(batch.map((o) => o.vendor_id))];
      const [areaMap, ratings] = await Promise.all([
        this.deps.resolveAreasForVendors(vendorIds),
        this.deps.loadRatings(batch.map((o) => o.id)),
      ]);

      for (const offering of batch) {
        const areas = areaMap.get(offering.vendor_id) ?? { premises: [], homeVisit: [] };
        await this.adapter.indexOffering(
          serviceOfferingToDocument(offering, areas, ratings.get(offering.id)),
        );
        indexed += 1;
        indexedIds.add(offering.id);
      }

      offset += batch.length;
    }

    // Prune: anything Typesense still has that wasn't just (re)indexed was
    // unpublished, paused, archived or deleted while the incremental sync
    // was failing to catch up — this is what makes the pass a true reconcile
    // rather than an additive one.
    const existingIds = await this.adapter.listIndexedIds();
    const candidateIds = existingIds.filter((id) => !indexedIds.has(id));

    // A candidate here is only a SNAPSHOT mismatch, not proof of staleness:
    // the concurrent incremental-sync worker (Task 6) can publish and index
    // an offering into Typesense after this pass's DB scan has already moved
    // past its page but before listIndexedIds() runs above. Without this
    // re-check against Postgres — the source of truth — that race would
    // delete a service that is genuinely, currently published, making it
    // vanish from search for up to 24h until the next nightly run.
    let pruned = 0;
    if (candidateIds.length > 0) {
      const stillPublished = await this.deps.filterStillPublished(candidateIds);
      for (const id of candidateIds) {
        if (stillPublished.has(id)) continue;
        await this.adapter.removeOffering(id);
        pruned += 1;
      }
    }

    return { indexed, pruned };
  }
}

const RECONCILE_QUEUE = "service-search-reconcile";

/**
 * Nightly full rebuild. The fan-out in Task 6 is best-effort (a Redis blip is
 * swallowed so a vendor's branch edit never fails), so this is what guarantees
 * a missed re-index self-heals rather than leaving a service permanently
 * invisible in an area it serves.
 */
export function createServiceReconcileWorker(): Worker {
  const worker = new Worker(
    RECONCILE_QUEUE,
    async () => {
      const service = new ServiceSearchReindexService(new ServiceSearchAdapter());
      const { indexed, pruned } = await service.reindexAll();
      console.log(
        `[service-search] nightly reconcile indexed ${indexed} offering(s), pruned ${pruned} stale document(s)`,
      );
    },
    { connection: { url: config.bullmq.redisUrl } },
  );

  const queue = new Queue(RECONCILE_QUEUE, { connection: { url: config.bullmq.redisUrl } });
  // 03:15 Asia/Dubai — off-peak, and after any late-evening vendor edits.
  // Fire-and-forget (void + .catch): registration happens at module-load
  // time, not inside an async boot sequence, so there is nothing to await
  // here — but an unreachable Redis at boot must be logged, not left as an
  // unhandled rejection that silently drops the nightly backstop.
  void queue
    .add(
      "reconcile",
      {},
      { repeat: { pattern: "15 3 * * *", tz: "Asia/Dubai" }, jobId: "service-search-reconcile" },
    )
    .catch((err) => {
      console.error("[service-search] failed to schedule nightly reconcile job:", err);
    });

  return worker;
}
