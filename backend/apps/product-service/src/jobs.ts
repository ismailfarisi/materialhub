import { config } from "@materialhub/config";
import { reservationService, searchService } from "./container.ts";
import { LowStockAlertJob } from "./domain/inventory/jobs/low-stock-alert.job.ts";
import { ReservationExpiryJob } from "./domain/inventory/jobs/reservation-expiry.job.ts";
import { createSearchSyncWorker } from "./domain/search/search-sync.job.ts";

/** Background work owned by the product module. Called once by the monolith at boot. */
export function startProductJobs(): void {
  const reservationExpiry = new ReservationExpiryJob(config.bullmq.redisUrl, reservationService);
  reservationExpiry.start();

  const lowStockAlert = new LowStockAlertJob(config.bullmq.redisUrl);
  lowStockAlert.start();

  const searchSyncWorker = createSearchSyncWorker(searchService);
  searchSyncWorker.on("failed", (job, err) => {
    console.error(`Search sync job ${job?.id} failed:`, err.message);
  });
}
