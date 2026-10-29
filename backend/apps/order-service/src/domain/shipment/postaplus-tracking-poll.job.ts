import { config } from "@materialhub/config";
import type { Shipment, VendorCarrierAccount } from "@materialhub/database";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type { EncryptionService } from "@materialhub/utils";
import { Queue, Worker } from "bullmq";
import { IsNull, type Repository } from "typeorm";
import type { ShipmentTrackingService } from "./shipment-tracking.service.ts";
import type { ShippingProviderRegistry } from "./shipping-provider-adapter.ts";

export const POSTAPLUS_TRACKING_POLL_QUEUE = "postaplus-tracking-poll";

const TERMINAL_STATUSES = new Set([
  ShipmentStatus.delivered,
  ShipmentStatus.failed_delivery,
  ShipmentStatus.returned,
]);
const STATUS_INACTIVITY_MS = 24 * 60 * 60 * 1000;

export interface PostaPlusTrackingPollDeps {
  shipmentRepo: Repository<Shipment>;
  accountRepo: Repository<VendorCarrierAccount>;
  registry: ShippingProviderRegistry;
  encryption: EncryptionService;
  shipmentService: ShipmentTrackingService;
  now?: () => Date;
}

let postaPlusTrackingPollQueue: Queue | null = null;

export function getPostaPlusTrackingPollQueue(): Queue {
  if (!postaPlusTrackingPollQueue) {
    postaPlusTrackingPollQueue = new Queue(POSTAPLUS_TRACKING_POLL_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return postaPlusTrackingPollQueue;
}

export async function schedulePostaPlusTrackingPoll(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    "poll-postaplus-tracking",
    { pattern: "0 */8 * * *" },
    { name: "poll-postaplus-tracking" },
  );
}

export function createPostaPlusTrackingPollWorker(
  shipmentRepo: Repository<Shipment>,
  accountRepo: Repository<VendorCarrierAccount>,
  registry: ShippingProviderRegistry,
  encryption: EncryptionService,
  shipmentService: ShipmentTrackingService,
): Worker {
  const deps: PostaPlusTrackingPollDeps = {
    shipmentRepo,
    accountRepo,
    registry,
    encryption,
    shipmentService,
  };
  return new Worker(
    POSTAPLUS_TRACKING_POLL_QUEUE,
    async () => processPostaPlusTrackingPollJob(deps),
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
}

export async function processPostaPlusTrackingPollJob(
  deps: PostaPlusTrackingPollDeps,
): Promise<void> {
  const adapter = deps.registry.get("postaplus");
  if (!adapter?.pollTracking) return;

  const shipments = await deps.shipmentRepo.find({
    where: { carrier: "postaplus" } as any,
    relations: ["events"],
  });
  const now = deps.now?.() ?? new Date();

  for (const shipment of shipments) {
    if (TERMINAL_STATUSES.has(shipment.status)) continue;
    if (wasStatusUpdatedRecently(shipment, now)) continue;

    const trackingNumber = shipment.tracking_number ?? shipment.external_shipment_id;
    if (!trackingNumber) continue;

    const account = await resolvePostaPlusAccount(deps.accountRepo, shipment.vendor_id);
    if (!account) continue;

    const creds = deps.encryption.decryptObject<Record<string, string>>(
      account.credentials_encrypted,
    );
    const event = await adapter.pollTracking(trackingNumber, creds);
    if (!event || event.status === ShipmentStatus.pending) continue;

    await deps.shipmentService.processWebhookEvent({
      tracking_number: trackingNumber,
      provider_id: account.provider_id,
      external_event_id: event.external_event_id,
      status: event.status,
      location: event.location ?? undefined,
      description: event.description ?? undefined,
      occurred_at: event.occurred_at.toISOString(),
      raw_payload: event.raw as Record<string, unknown>,
    });
  }
}

function wasStatusUpdatedRecently(shipment: Shipment, now: Date): boolean {
  const latestStatusUpdate = latestStatusUpdateAt(shipment);
  if (!latestStatusUpdate) return false;
  return now.getTime() - latestStatusUpdate.getTime() < STATUS_INACTIVITY_MS;
}

function latestStatusUpdateAt(shipment: Shipment): Date | null {
  const eventDates = ((shipment as any).events ?? [])
    .map((event: { occurred_at?: Date | string | null }) =>
      event.occurred_at ? new Date(event.occurred_at) : null,
    )
    .filter((date: Date | null): date is Date => Boolean(date && !Number.isNaN(date.getTime())));
  if (eventDates.length) {
    return eventDates.reduce((latest: Date, current: Date) =>
      current.getTime() > latest.getTime() ? current : latest,
    );
  }
  const fallback = (shipment as any).updated_at ?? (shipment as any).created_at;
  if (!fallback) return null;
  const fallbackDate = new Date(fallback);
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

async function resolvePostaPlusAccount(
  accountRepo: Repository<VendorCarrierAccount>,
  vendorId: string,
): Promise<VendorCarrierAccount | null> {
  const accounts = await accountRepo.find({
    where: [
      { vendor_id: vendorId, is_active: true, is_verified: true },
      { vendor_id: IsNull(), is_active: true, is_verified: true },
    ] as any,
    relations: ["provider"],
    order: { verified_at: "DESC" } as any,
  });
  return (
    accounts.find(
      (account) => account.provider?.code === "postaplus" && account.vendor_id === vendorId,
    ) ??
    accounts.find(
      (account) => account.provider?.code === "postaplus" && account.vendor_id === null,
    ) ??
    null
  );
}
