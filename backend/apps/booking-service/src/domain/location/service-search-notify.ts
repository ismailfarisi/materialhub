import { config } from "@materialhub/config";
import { Queue } from "bullmq";

/**
 * Producer-only handle on product-service's service-search-sync queue.
 *
 * booking-service owns vendor_locations and service_areas, but the Typesense
 * index that depends on them lives in product-service. Rather than an HTTP
 * call, we enqueue on the shared Redis and let product-service's worker do
 * the re-index — the same producer-only pattern as
 * `getNotificationEventsQueue()` in domain/reminders/booking-reminder.job.ts,
 * which feeds notification-service.
 *
 * The queue name and payload shape are duplicated from product-service on
 * purpose: the two services are separate deployables and must not import each
 * other. If either changes, both sides change together.
 */
const SERVICE_SEARCH_SYNC_QUEUE = "service-search-sync";

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    // defaultJobOptions MUST stay in sync with product-service's
    // getServiceSearchSyncQueue(). Both services enqueue to the same queue,
    // and BullMQ applies defaults at .add() time (client-side). Without these,
    // jobs from booking-service land with attempts: 1 (no retry) while
    // product-service jobs retry 3 times with exponential backoff, causing
    // transient worker failures to permanently drop vendors' indices.
    queue = new Queue(SERVICE_SEARCH_SYNC_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    });
  }
  return queue;
}

export async function notifyVendorAreasChanged(vendorId: string): Promise<void> {
  try {
    await getQueue().add(
      "sync",
      { type: "resync_vendor", vendorId },
      // Same dedup key product-service uses, so a burst of branch edits
      // collapses into one re-index instead of a fan-out storm.
      // removeOnComplete/removeOnFail MUST be `true`, not a retention count.
      // BullMQ's handleDuplicatedJob silently drops an .add() whose jobId key
      // still exists, so a retained completed/failed job would permanently
      // swallow every later fan-out for that vendor. Verified against the
      // bullmq Lua scripts; see the same fix in service-search-sync.job.ts.
      { jobId: `vendor:${vendorId}`, removeOnComplete: true, removeOnFail: true },
    );
  } catch (err) {
    // A Redis blip must not fail the vendor's branch edit. The nightly
    // reconcile (product-service) is the backstop that repairs a missed
    // fan-out.
    console.error("[location] service-search fan-out enqueue failed", {
      vendorId,
      error: (err as Error).message,
    });
  }
}
