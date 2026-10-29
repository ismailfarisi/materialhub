import { config } from "@materialhub/config";
import { ensureDatabase } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { app } from "./app.ts";
import { reservationService, searchService } from "./container.ts";
import { LowStockAlertJob } from "./domain/inventory/jobs/low-stock-alert.job.ts";
import { ReservationExpiryJob } from "./domain/inventory/jobs/reservation-expiry.job.ts";
import { createSearchSyncWorker } from "./domain/search/search-sync.job.ts";
import { createServiceReconcileWorker } from "./domain/service-search/service-search-reindex.service.ts";
import { createServiceSearchSyncWorker } from "./domain/service-search/service-search-sync.job.ts";
import { ServiceSearchAdapter } from "./domain/service-search/service-search.adapter.ts";

await ensureDatabase();
await permissionMatrix.load();
permissionMatrix.startPolling();

app.listen({
  port: config.port.product,
  idleTimeout: 255,
});

console.log(`[product-service] running at http://${app.server?.hostname}:${app.server?.port}`);

const reservationExpiry = new ReservationExpiryJob(config.bullmq.redisUrl, reservationService);
reservationExpiry.start();

const lowStockAlert = new LowStockAlertJob(config.bullmq.redisUrl);
lowStockAlert.start();

const searchSyncWorker = createSearchSyncWorker(searchService);
searchSyncWorker.on("failed", (job, err) => {
  console.error(`Search sync job ${job?.id} failed:`, err.message);
});

const serviceSearchAdapter = new ServiceSearchAdapter();
try {
  await serviceSearchAdapter.ensureCollection();
} catch (err) {
  // A Typesense outage (or even just a transient retrieve() timeout when the
  // collection already exists, which then makes create() come back 409
  // already-exists) must never take the whole product-service process down
  // with it — this call only exists to create the collection on first boot.
  // The incremental sync worker below does NOT self-heal this: indexOffering
  // upserts directly into the collection and never calls ensureCollection, so
  // with removeOnFail: true those jobs just fail once and drop silently. The
  // actual recovery path is the nightly reconcile (createServiceReconcileWorker
  // -> reindexAll, which does call ensureCollection) at 03:15 Asia/Dubai — so a
  // cold first boot with Typesense down can leave /services empty for up to
  // ~24h until that job runs.
  console.error("[product-service] ensureCollection failed at boot:", (err as Error).message);
}

const serviceSearchWorker = createServiceSearchSyncWorker(serviceSearchAdapter);
serviceSearchWorker.on("failed", (job, err) => {
  console.error(`Service search sync job ${job?.id} failed:`, err.message);
});

const serviceReconcileWorker = createServiceReconcileWorker();
serviceReconcileWorker.on("failed", (job, err) => {
  console.error(`Service search reconcile job ${job?.id} failed:`, err.message);
});

export type App = typeof app;
