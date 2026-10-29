// notification-preference.service.test.ts
//
// Mocked-repo unit tests for getPreferences()'s absent-row defaults (Phase 5
// Task 8 fix). The bug: the matrix used to pre-fill every missing
// {type, channel} cell with a hard `false`, so any NotificationType added to
// the enum AFTER a user's preference rows were seeded (e.g. all 11 booking
// types for every pre-existing user) had its in-app notifications silently
// disabled — the dispatcher's `typePrefs?.in_app ?? true` default-enabled
// intent can only fire on `undefined`, never on a real `false`. An absent row
// must now surface the dispatcher-intent default per channel; explicit DB rows
// still overlay.
//
// Phase 7 review (finding 1): that fix originally applied `in_app: true` to
// EVERY NotificationType, silently switching on in-app notifications for
// pre-existing types (order_shipped, dispute_*, ...) for every user without
// explicit rows — no migration, no flag. The default is now scoped to the 11
// booking types only, and the pre-existing types are asserted below to keep
// their historical `false`.
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
  const BOOKING_TYPES = [
    NotificationType.booking_confirmed,
    NotificationType.booking_reminder,
    NotificationType.booking_rescheduled,
    NotificationType.booking_cancelled,
    NotificationType.booking_no_show,
    NotificationType.booking_completed,
    NotificationType.booking_review_request,
    NotificationType.booking_payment_failed,
    NotificationType.vendor_new_booking,
    NotificationType.vendor_booking_cancelled,
    NotificationType.vendor_booking_conflict,
  ];

  // Types added to the enum after users' preference rows were seeded — the
  // booking set plus vendor_new_order. These are the ones an absent row means
  // "never asked" for, so they default in-app ON.
  const POST_SEED_TYPES = [...BOOKING_TYPES, NotificationType.vendor_new_order];

  it("a user with ZERO rows gets in_app=true for the BOOKING types only; email/push/sms=false for every type", async () => {
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    for (const type of Object.values(NotificationType)) {
      expect(matrix[type][NotificationChannel.email]).toBe(false);
      expect(matrix[type][NotificationChannel.push]).toBe(false);
      expect(matrix[type][NotificationChannel.sms]).toBe(false);
    }
    for (const type of BOOKING_TYPES) {
      expect(matrix[type][NotificationChannel.in_app]).toBe(true);
    }
  });

  it("vendor_new_order defaults in_app-enabled for an existing vendor member", async () => {
    // It post-dates every existing user's seeded rows, so without it in the
    // post-seed set the absent row resolves to false and the new per-member
    // dispatch reaches nobody who registered before this deploy.
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.in_app]).toBe(true);
    expect(matrix[NotificationType.vendor_new_order][NotificationChannel.email]).toBe(false);
  });

  it("NON-booking types keep their pre-existing in_app=false default (finding 1: no silent behaviour change for order_*/dispute_*)", async () => {
    const { service } = makeService([]);

    const matrix = await service.getPreferences("user-1");

    const postSeed = new Set<string>(POST_SEED_TYPES);
    const preExisting = Object.values(NotificationType).filter((t) => !postSeed.has(t));
    // Sanity: the non-booking set is non-empty and covers the types called out
    // in the review (an in-app notification for these must NOT switch on for a
    // user who never expressed a preference).
    expect(preExisting.length).toBeGreaterThan(0);
    expect(preExisting).toContain(NotificationType.order_shipped);
    expect(preExisting).toContain(NotificationType.dispute_opened);

    for (const type of preExisting) {
      expect(matrix[type][NotificationChannel.in_app]).toBe(false);
    }
  });

  it("booking types specifically default in_app-enabled for a pre-booking-era user (the regression this fix closes)", async () => {
    // A realistic pre-existing user: seeded rows for the ORDER-era types only
    // (registration-time seed sets everything true), nothing for booking types.
    const orderEraRows = [
      { notification_type: NotificationType.order_confirmed, channel: "in_app", enabled: true },
      { notification_type: NotificationType.order_confirmed, channel: "email", enabled: true },
      { notification_type: NotificationType.order_shipped, channel: "in_app", enabled: true },
    ];
    const { service } = makeService(orderEraRows);

    const matrix = await service.getPreferences("user-1");

    const bookingTypes = [
      NotificationType.booking_confirmed,
      NotificationType.booking_reminder,
      NotificationType.booking_rescheduled,
      NotificationType.booking_cancelled,
      NotificationType.booking_no_show,
      NotificationType.booking_completed,
      NotificationType.booking_review_request,
      NotificationType.booking_payment_failed,
      NotificationType.vendor_new_booking,
      NotificationType.vendor_booking_cancelled,
      NotificationType.vendor_booking_conflict,
    ];
    for (const type of bookingTypes) {
      expect(matrix[type][NotificationChannel.in_app]).toBe(true);
      expect(matrix[type][NotificationChannel.email]).toBe(false);
      expect(matrix[type][NotificationChannel.push]).toBe(false);
    }
    // Seeded rows still overlay as before.
    expect(matrix[NotificationType.order_confirmed][NotificationChannel.email]).toBe(true);
  });

  it("an explicit in_app=false row (real opt-out) overlays the default and stays false", async () => {
    const { service } = makeService([
      {
        notification_type: NotificationType.booking_confirmed,
        channel: NotificationChannel.in_app,
        enabled: false,
      },
    ]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.booking_confirmed][NotificationChannel.in_app]).toBe(false);
    // Other types keep the default.
    expect(matrix[NotificationType.booking_cancelled][NotificationChannel.in_app]).toBe(true);
  });

  it("an explicit email=true row overlays the false default", async () => {
    const { service } = makeService([
      {
        notification_type: NotificationType.booking_reminder,
        channel: NotificationChannel.email,
        enabled: true,
      },
    ]);

    const matrix = await service.getPreferences("user-1");

    expect(matrix[NotificationType.booking_reminder][NotificationChannel.email]).toBe(true);
    expect(matrix[NotificationType.booking_reminder][NotificationChannel.in_app]).toBe(true);
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
