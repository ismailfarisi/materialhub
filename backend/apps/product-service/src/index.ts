import { config } from "@materialhub/config";
import { ensureDatabase } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { app } from "./app.ts";
import { reservationService, searchService } from "./container.ts";
import { LowStockAlertJob } from "./domain/inventory/jobs/low-stock-alert.job.ts";
import { ReservationExpiryJob } from "./domain/inventory/jobs/reservation-expiry.job.ts";
import { createSearchSyncWorker } from "./domain/search/search-sync.job.ts";

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

export type App = typeof app;
