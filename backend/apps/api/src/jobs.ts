import { startAuthJobs } from "../../auth-service/src/jobs.ts";
import { startCmsJobs } from "../../cms-service/src/jobs.ts";
import { startIntegrationJobs } from "../../integration-service/src/jobs.ts";
import { startNotificationJobs } from "../../notification-service/src/jobs.ts";
import { startProductJobs } from "../../product-service/src/jobs.ts";
import { startVendorJobs } from "../../vendor-service/src/jobs.ts";

/**
 * Start every module's boot-time background work (timers, BullMQ workers and
 * repeatable jobs). BullMQ workers that modules create at import time
 * (order, notification, product bulk, integration dispatcher) are already
 * running once ./modules.ts has been imported.
 */
export async function startAllJobs(): Promise<void> {
  startAuthJobs();
  startProductJobs();
  startVendorJobs();
  startNotificationJobs();
  startCmsJobs();
  await startIntegrationJobs();
}
