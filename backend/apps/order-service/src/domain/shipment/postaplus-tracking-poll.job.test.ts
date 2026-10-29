import { describe, expect, it, mock } from "bun:test";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import {
  processPostaPlusTrackingPollJob,
  schedulePostaPlusTrackingPoll,
} from "./postaplus-tracking-poll.job.ts";

function makeAccount() {
  return {
    vendor_id: null,
    provider_id: "provider-postaplus",
    credentials_encrypted: "encrypted-creds",
    provider: { code: "postaplus", is_active: true },
  };
}

describe("processPostaPlusTrackingPollJob", () => {
  it("schedules PostaPlus tracking polling every 8 hours", async () => {
    const queue = {
      upsertJobScheduler: mock(async () => undefined),
    };

    await schedulePostaPlusTrackingPoll(queue as any);

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      "poll-postaplus-tracking",
      { pattern: "0 */8 * * *" },
      { name: "poll-postaplus-tracking" },
    );
  });

  it("polls pending PostaPlus shipments with no status update in the last 24 hours", async () => {
    const adapter = {
      pollTracking: mock(async () => ({
        external_shipment_id: "102300193527",
        external_event_id: "102300193527:FMA002:3/22/2023 9:06:56 PM",
        status: ShipmentStatus.in_transit,
        occurred_at: new Date("2023-03-22T17:06:56.000Z"),
        location: "DXB",
        description: "SIB",
        raw: { workflowActionCode: "FMA002" },
      })),
    };
    const shipmentService = { processWebhookEvent: mock(async () => undefined) };

    await processPostaPlusTrackingPollJob({
      shipmentRepo: {
        find: mock(async () => [
          {
            id: "shp-1",
            vendor_id: "vendor-1",
            carrier: "postaplus",
            tracking_number: "102300193527",
            status: ShipmentStatus.pending,
            events: [
              {
                occurred_at: new Date("2026-06-10T08:00:00.000Z"),
              },
            ],
          },
        ]),
      } as any,
      accountRepo: { find: mock(async () => [makeAccount()]) } as any,
      registry: { get: mock(() => adapter) } as any,
      encryption: { decryptObject: mock(() => ({ partner_key: "key" })) } as any,
      shipmentService: shipmentService as any,
      now: () => new Date("2026-06-11T09:00:00.000Z"),
    });

    expect(adapter.pollTracking).toHaveBeenCalledWith("102300193527", { partner_key: "key" });
    expect(shipmentService.processWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tracking_number: "102300193527",
        provider_id: "provider-postaplus",
        external_event_id: "102300193527:FMA002:3/22/2023 9:06:56 PM",
        status: ShipmentStatus.in_transit,
      }),
    );
  });

  it("skips PostaPlus shipments updated in the last 24 hours", async () => {
    const adapter = { pollTracking: mock(async () => null) };

    await processPostaPlusTrackingPollJob({
      shipmentRepo: {
        find: mock(async () => [
          {
            id: "shp-1",
            vendor_id: "vendor-1",
            carrier: "postaplus",
            tracking_number: "102300193527",
            status: ShipmentStatus.pending,
            events: [
              {
                occurred_at: new Date("2026-06-10T10:00:00.000Z"),
              },
            ],
          },
        ]),
      } as any,
      accountRepo: { find: mock(async () => [makeAccount()]) } as any,
      registry: { get: mock(() => adapter) } as any,
      encryption: { decryptObject: mock(() => ({ partner_key: "key" })) } as any,
      shipmentService: { processWebhookEvent: mock(async () => undefined) } as any,
      now: () => new Date("2026-06-11T09:00:00.000Z"),
    });

    expect(adapter.pollTracking).not.toHaveBeenCalled();
  });

  it("skips delivered PostaPlus shipments", async () => {
    const adapter = { pollTracking: mock(async () => null) };
    await processPostaPlusTrackingPollJob({
      shipmentRepo: {
        find: mock(async () => [
          {
            id: "shp-1",
            carrier: "postaplus",
            tracking_number: "102300193527",
            status: ShipmentStatus.delivered,
          },
        ]),
      } as any,
      accountRepo: { find: mock(async () => [makeAccount()]) } as any,
      registry: { get: mock(() => adapter) } as any,
      encryption: { decryptObject: mock(() => ({ partner_key: "key" })) } as any,
      shipmentService: { processWebhookEvent: mock(async () => undefined) } as any,
    });

    expect(adapter.pollTracking).not.toHaveBeenCalled();
  });
});
