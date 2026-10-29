// notification-preference.service.test.ts
//
// Mocked-repo unit tests for getPreferences()'s absent-row defaults. The bug:
// the matrix used to pre-fill every missing {type, channel} cell with a hard
// `false`, so any NotificationType added to the enum AFTER a user's preference
// rows were seeded had its in-app notifications silently disabled — the
// dispatcher's `typePrefs?.in_app ?? true` default-enabled intent can only
// fire on `undefined`, never on a real `false`. An absent row must now
// surface the dispatcher-intent default per channel; explicit DB rows still
// overlay.
//
// The `in_app: true` default is scoped to the post-seed types only
// (vendor_new_order today); pre-existing types are asserted below to keep
// their historical `false` so nothing switches on silently for users who
// never expressed a preference.
import { describe, expect, it, mock } from "bun:test";
import { NotificationChannel, NotificationType } from "@materialhub/database";
import { NotificationPreferenceService } from "./notification-preference.service.ts";

function makeService(rows: any[] = []) {
  const preferenceRepo = {
    findByUserId: mock(async (_userId: string) => rows),
    findOne: mock(async () => null),
    save: mock(async (d: any) => d),
    saveBatch: mock(async (items: any[]) => items),
    upsertBatch: mock(async () => undefined),
  };
  return { service: new NotificationPreferenceService(preferenceRepo as any), preferenceRepo };
}

describe("NotificationPreferenceService.getPreferences — absent-row defaults", () => {
  // Types added to the enum after users' preference rows were seeded. These
  // are the ones an absent row means "never asked" for, so they default
  // in-app ON.
  const POST_SEED_TYPES = [NotificationType.vendor_new_order];

  it("a user with ZERO rows gets in_app=true for the POST-SEED types only; email/push/sms=false for every type", async () => {
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    for (const type of Object.values(NotificationType)) {
      expect(matrix[type][NotificationChannel.email]).toBe(false);
      expect(matrix[type][NotificationChannel.push]).toBe(false);
      expect(matrix[type][NotificationChannel.sms]).toBe(false);
    }
    for (const type of POST_SEED_TYPES) {
      expect(matrix[type][NotificationChannel.in_app]).toBe(true);
    }
  });

  it("vendor_new_order defaults in_app-enabled for an existing vendor member", async () => {
    // It post-dates every existing user's seeded rows, so without it in the
    // post-seed set the absent row resolves to false and the per-member
    // dispatch reaches nobody who registered before this deploy.
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.in_app]).toBe(true);
    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.email]).toBe(false);
  });

  it("pre-existing types keep their in_app=false default (no silent behaviour change for order_*/dispute_*)", async () => {
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    const postSeed = new Set<string>(POST_SEED_TYPES);
    const preExisting = Object.values(NotificationType).filter((t) => !postSeed.has(t));
    expect(preExisting.length).toBeGreaterThan(0);
    expect(preExisting).toContain(NotificationType.order_shipped);
    expect(preExisting).toContain(NotificationType.dispute_opened);

    for (const type of preExisting) {
      expect(matrix[type][NotificationChannel.in_app]).toBe(false);
    }
  });

  it("post-seed types default in_app-enabled for a user seeded before they existed, while seeded rows still overlay", async () => {
    // A realistic pre-existing user: seeded rows for the order-era types only
    // (registration-time seed sets everything true), nothing for the newer type.
    const orderEraRows = [
      { notification_type: NotificationType.order_confirmed, channel: "in_app", enabled: true },
      { notification_type: NotificationType.order_confirmed, channel: "email", enabled: true },
      { notification_type: NotificationType.order_shipped, channel: "in_app", enabled: true },
    ];
    const { service } = makeService(orderEraRows);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.in_app]).toBe(true);
    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.email]).toBe(false);
    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.push]).toBe(false);
    // Seeded rows still overlay as before.
    expect(matrix[NotificationType.order_confirmed][NotificationChannel.email]).toBe(true);
    expect(matrix[NotificationType.order_shipped][NotificationChannel.in_app]).toBe(true);
  });

  it("an explicit in_app=false row (real opt-out) overlays the default and stays false", async () => {
    const { service } = makeService([
      {
        notification_type: NotificationType.vendor_new_order,
        channel: NotificationChannel.in_app,
        enabled: false,
      },
    ]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.in_app]).toBe(false);
  });

  it("an explicit email=true row overlays the false default", async () => {
    const { service } = makeService([
      {
        notification_type: NotificationType.payout_sent,
        channel: NotificationChannel.email,
        enabled: true,
      },
    ]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.payout_sent][NotificationChannel.email]).toBe(true);
    expect(matrix[NotificationType.payout_sent][NotificationChannel.in_app]).toBe(false);
  });
});

describe("whatsapp channel — strictly opt-in", () => {
  it("defaults to false for every type when the user has no rows", async () => {
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    for (const type of Object.values(NotificationType)) {
      expect(matrix[type][NotificationChannel.whatsapp]).toBe(false);
    }
  });

  it("an explicit whatsapp=true row (real opt-in) overlays the false default", async () => {
    const { service } = makeService([
      {
        notification_type: NotificationType.order_confirmed,
        channel: NotificationChannel.whatsapp,
        enabled: true,
      },
    ]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.order_confirmed][NotificationChannel.whatsapp]).toBe(true);
    expect(matrix[NotificationType.order_shipped][NotificationChannel.whatsapp]).toBe(false);
  });

  it("seedDefaultPreferences never creates whatsapp rows (the blanket enabled:true seed must not opt users in)", async () => {
    const { service, preferenceRepo } = makeService([]);

    await service.seedDefaultPreferences("user-1");

    expect(preferenceRepo.saveBatch).toHaveBeenCalledTimes(1);
    const seeded = preferenceRepo.saveBatch.mock.calls[0]![0] as any[];
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((row) => row.channel !== NotificationChannel.whatsapp)).toBe(true);
    // Every seeded row for other channels is still the historical enabled:true.
    expect(seeded.every((row) => row.enabled === true)).toBe(true);
  });
});
