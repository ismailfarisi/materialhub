import { config } from "@materialhub/config";
import { PartitionMaintenanceJob } from "./jobs/partition-maintenance.job.ts";

/** Background work owned by the CMS module. Called once by the monolith at boot. */
export function startCmsJobs(): void {
  const partitionJob = new PartitionMaintenanceJob(config.bullmq.redisUrl);
  partitionJob.start();
}
