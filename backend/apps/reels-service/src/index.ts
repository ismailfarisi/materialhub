import { config } from "@materialhub/config";
import { ensureDatabase } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { app } from "./app.ts";
import {
  cloudflareStreamRecoveryJob,
  cohortJob,
  collabRemindersJob,
  commerceEventJobs,
  expireBriefsJob,
  expireCollabsJob,
  expireOffersJob,
  invalidateCategoryCohortJob,
  nudgeEventJobs,
  rankingJob,
  recomputeDailyRollupsJob,
  refreshHotCategoriesJob,
  transitionPendingToEarnedJob,
} from "./container.ts";

await ensureDatabase();
await permissionMatrix.load();
permissionMatrix.startPolling();

app.listen(config.port.reels);

// Start scheduled BullMQ workers after DB is ready and HTTP is listening.
// The cohort job recomputes Redis ZSET feeds every 10 min.
cohortJob.start();
// The ranking job recomputes a single reel's score on engagement events,
// debounced per-reel at 2 min.
rankingJob.start();
// Hourly refresh of the reel_hot_categories driver table — drives which
// categories get precomputed cohorts in the 10-min cohort job.
refreshHotCategoriesJob.start();
// Consumes reels-cache-invalidation events published when reels are
// moderated or soft-deleted, flushing the exact affected cohort keys.
invalidateCategoryCohortJob.start();
// Commerce event workers: order-service publishes to `reels-commissions`
// (see M3 Task 7); one Worker dispatches on job.name to create / set
// eligibility / void commissions.
commerceEventJobs.start();
// Daily cron (22:00 UTC == 02:00 UAE) transitioning eligible pending
// commissions into `earned` and crediting the creator wallet.
transitionPendingToEarnedJob.start();
// Post-delivery reels nudge worker: consumes `reels-nudges` queue
// `sendPostDeliveryReelNudge` jobs published by order-service when a master
// order transitions to delivered.
nudgeEventJobs.start();
// Daily rollup recompute (03:00 UTC): rebuilds the last 14 days of
// `reel_daily_rollups` from source event tables so admin + vendor
// analytics queries return fast aggregate reads.
recomputeDailyRollupsJob.start();
// Fallback for missed Cloudflare Stream webhooks. The job is delayed 60s
// after direct-upload URL creation, then retries twice more at 60s intervals.
cloudflareStreamRecoveryJob.start();
// Sweeps expired license offers (TTL elapsed): releases each escrow hold via
// the funding rail and marks the offer `expired`. Runs on a repeatable cron.
expireOffersJob.start();
// Sweeps stale briefs (bidding window closed, no award) and lapsed deliveries
// (delivery deadline elapsed): releases any escrow hold and marks them expired.
expireBriefsJob.start();
// Sweeps collabs that ran out of time: unanswered invitations, applications on
// an opportunity that closed without them, opportunities nobody took, and work
// past its deadline (which also releases the vendor's escrow hold). Also expires
// seeded product that was shipped but never confirmed received.
expireCollabsJob.start();
// Nudges creators 3 days and 1 day before a collab deadline.
collabRemindersJob.start();

console.log(`[reels-service] running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
