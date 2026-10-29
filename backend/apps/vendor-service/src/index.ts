import { config } from "@materialhub/config";
import { ensureDatabase } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { app } from "./app.ts";
import { affiliateCommerceEventJobs, transitionAffiliatePendingToEarnedJob } from "./container.ts";
import { ExpirePendingInvitesJob } from "./jobs/expire-pending-invites.job.ts";

await ensureDatabase();
await permissionMatrix.load();
permissionMatrix.startPolling();

app.listen(config.port.vendor);

console.log(`[vendor-service] running at http://${app.server?.hostname}:${app.server?.port}`);

if (config.bullmq?.redisUrl) {
  const expireInvitesJob = new ExpirePendingInvitesJob(config.bullmq.redisUrl);
  expireInvitesJob.start();

  affiliateCommerceEventJobs.start();
  transitionAffiliatePendingToEarnedJob.start();
}

export type App = typeof app;
