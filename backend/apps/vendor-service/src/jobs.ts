import { config } from "@materialhub/config";
import { ExpirePendingInvitesJob } from "./jobs/expire-pending-invites.job.ts";

/** Background work owned by the vendor module. Called once by the monolith at boot. */
export function startVendorJobs(): void {
  if (config.bullmq?.redisUrl) {
    const expireInvitesJob = new ExpirePendingInvitesJob(config.bullmq.redisUrl);
    expireInvitesJob.start();
  }
}
