// reschedule.service.test.ts
//
// Mocked-repo unit tests (no live DB / Redis / BullMQ) for the reschedule
// orchestration LOGIC — ownership scoping, the confirmed-only guard, the
// customer reschedule-window enforcement + admin bypass, and (happy path) the
// transition ordering + three-job re-timing + notification emission. The
// EXCLUDE-move-in-a-real-transaction behaviour (23P01 -> 409) is covered by
// the live-DB integration suite, not here.
import { describe, expect, it, mock } from "bun:test";
import {
  BookingStatus,
  NotificationType,
  ServiceLocationMode,
  ServiceOfferingStatus,
} from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { InvalidBookingTransitionError } from "./booking-status.service.ts";
import { RescheduleService, RescheduleWindowExpiredError } from "./reschedule.service.ts";

const HOUR_MS = 3_600_000;

function baseOffering(overrides: Record<string, any> = {}) {
  return {
    id: "offering-1",
    vendor_id: "vendor-1",
    status: ServiceOfferingStatus.published,
    location_mode: ServiceLocationMode.at_premises,
    duration_minutes: 30,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    ...overrides,
  };
}

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    booking_number: "BK-001",
    customer_user_id: "customer-1",
    vendor_id: "vendor-1",
    location_id: "location-1",
    customer_address: null,
    staff_member_id: "staff-1",
    engagement_id: "eng-1",
    service_offering_id: "offering-1",
    service_name: "Deep Tissue Massage",
    duration_minutes: 30,
    reschedule_window_hours: 24,
    payment_mode: "prepay",
    escrow_hold_id: null,
    status: BookingStatus.confirmed,
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
    ...overrides,
  };
}

// A fake transaction runner that hands the callback a manager whose
// getRepository() returns per-entity fakes: the StaffEngagement fake satisfies
// EngagementService.move (findOne old row + manager.query UPDATE returning a
// row), the Booking fake satisfies the bookings-row update.
function fakeManagerTransaction() {
  const engMoveRow = {
    id: "eng-1",
    staff_member_id: "staff-1",
    starts_at: new Date("2026-08-15T14:00:00Z"),
    ends_at: new Date("2026-08-15T14:30:00Z"),
  };
  const engRepo = {
    findOne: mock(async () => ({
      id: "eng-1",
      staff_member_id: "staff-1",
      starts_at: new Date("2026-08-10T10:00:00Z"),
      ends_at: new Date("2026-08-10T10:30:00Z"),
    })),
    manager: { query: mock(async () => [engMoveRow]) },
  };
  const bookingTxRepo = { update: mock(async () => ({ affected: 1 })) };
  const transaction = mock(async (cb: (m: any) => Promise<any>) =>
    cb({
      getRepository: (entity: any) => (entity?.name === "Booking" ? bookingTxRepo : engRepo),
    }),
  );
  return { transaction, engRepo, bookingTxRepo };
}

function makeService(
  opts: {
    booking?: Record<string, any> | null;
    offering?: Record<string, any>;
    availabilitySlots?: Array<{ start: string; end: string; staff_options: string[] }>;
    getAvailability?: any;
  } = {},
) {
  const booking = opts.booking === undefined ? baseBooking() : opts.booking;
  const offering = opts.offering ?? baseOffering();
  const { transaction, bookingTxRepo } = fakeManagerTransaction();

  const bookingRepo = {
    findOne: mock(async () => (booking ? { ...booking } : null)),
    manager: { transaction },
  };
  const offeringRepo = { findOne: mock(async () => offering) };
  const serviceAreaRepo = { findOne: mock(async () => ({ travel_buffer_minutes: 0 })) };

  const getAvailability =
    opts.getAvailability ?? mock(async () => ({ slots: opts.availabilitySlots ?? [] }));
  const availabilityService = { getAvailability };

  const holdService = {
    assertHeldFor: mock(async () => undefined),
    release: mock(async () => true),
  };

  // transition() returns the (now-updated) booking; the second call (->confirmed)
  // must reflect the new times so the re-timing hooks see them.
  const transition = mock(async (_id: string, to: any) => ({
    ...(booking as Record<string, any>),
    status: to,
    starts_at: new Date("2026-08-15T14:00:00Z"),
    ends_at: new Date("2026-08-15T14:30:00Z"),
  }));
  // PHASE 7 REVIEW FIX #1: the confirmed->rescheduled->confirmed pair is now a
  // SINGLE atomic call rather than two independent committed transactions.
  // Returns the booking already back on `confirmed` with the NEW times, so the
  // re-timing hooks below see them exactly as before.
  const transitionThroughRescheduled = mock(async () => ({
    ...(booking as Record<string, any>),
    status: BookingStatus.confirmed,
    starts_at: new Date("2026-08-15T14:00:00Z"),
    ends_at: new Date("2026-08-15T14:30:00Z"),
  }));
  const statusService = { transition, transitionThroughRescheduled };

  const reminderHook = { rescheduleReminderJobs: mock(async () => undefined) };
  const autoCompleteHook = { rescheduleAutoCompleteJob: mock(async () => undefined) };
  const authHook = { rescheduleBookingAuthJob: mock(async () => undefined) };
  const notificationQueue = { add: mock(async () => ({ id: "job-1" })) };

  const service = new RescheduleService(
    bookingRepo as any,
    offeringRepo as any,
    serviceAreaRepo as any,
    availabilityService as any,
    holdService as any,
    statusService as any,
    reminderHook as any,
    autoCompleteHook as any,
    authHook as any,
    notificationQueue as any,
  );

  return {
    service,
    bookingRepo,
    offeringRepo,
    availabilityService,
    holdService,
    statusService,
    transition,
    transitionThroughRescheduled,
    reminderHook,
    autoCompleteHook,
    authHook,
    notificationQueue,
    bookingTxRepo,
  };
}

const CUSTOMER = { id: "customer-1", role: "customer" as const };
const ADMIN = { id: "admin-1", role: "admin" as const };
const VENDOR = { id: "vendor-user-1", role: "vendor" as const };

// A slot far enough out to always be within any reasonable reschedule window
// when `now` is left to default — the flow-level tests inject `now` explicitly.
const NEW_SLOT = {
  startsAt: "2026-08-15T14:00:00Z",
  endsAt: "2026-08-15T14:30:00Z",
  holdToken: "tok-1",
};
const NOW_BEFORE = new Date("2026-08-01T00:00:00Z"); // well before both slots

describe("RescheduleService.reschedule — guards", () => {
  it("404 when the booking does not exist / is not owned by the customer", async () => {
    const { service } = makeService({ booking: null });
    let threw: unknown;
    try {
      await service.reschedule("missing", { ...NEW_SLOT, now: NOW_BEFORE }, CUSTOMER);
    } catch (err) {
      threw = err;
    }
    expect((threw as Error).message).toBe("Booking not found");
    expect((threw as HttpError).statusCode).toBe(404);
  });

  it("customer load is scoped by customer_user_id (ownership)", async () => {
    const { service, bookingRepo } = makeService();
    await service
      .reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, CUSTOMER)
      .catch(() => undefined);
    const where = ((bookingRepo.findOne.mock.calls as any[])[0][0] as any).where;
    expect(where.id).toBe("booking-1");
    expect(where.customer_user_id).toBe("customer-1");
  });

  it("admin load is by id only (no ownership scoping)", async () => {
    const { service, bookingRepo } = makeService();
    await service
      .reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, ADMIN)
      .catch(() => undefined);
    const where = ((bookingRepo.findOne.mock.calls as any[])[0][0] as any).where;
    expect(where.id).toBe("booking-1");
    expect(where.customer_user_id).toBeUndefined();
  });

  it("non-confirmed booking -> InvalidBookingTransitionError (422)", async () => {
    for (const status of [
      BookingStatus.pending_payment,
      BookingStatus.completed,
      BookingStatus.cancelled,
      BookingStatus.no_show,
      BookingStatus.expired,
    ]) {
      const { service } = makeService({ booking: baseBooking({ status }) });
      let threw: unknown;
      try {
        await service.reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, CUSTOMER);
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(InvalidBookingTransitionError);
      expect((threw as HttpError).statusCode).toBe(422);
    }
  });

  it("walk-in/phone booking (customer_user_id null) -> 422, and NO job is touched (review I1)", async () => {
    // An admin retiming a service-bearing walk-in must be rejected BEFORE the
    // engagement move / three-job re-timing, or the auto-complete job arms and
    // completes at commissionFils:0 -> inflated vendor payout.
    const booking = baseBooking({ customer_user_id: null, source: "walk_in" });
    const {
      service,
      availabilityService,
      bookingTxRepo,
      reminderHook,
      autoCompleteHook,
      authHook,
    } = makeService({ booking });
    let threw: unknown;
    try {
      await service.reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, ADMIN);
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(422);
    expect((threw as Error).message).toContain("Walk-in");
    // Bailed before touching availability, the tx, or ANY delayed job.
    expect(availabilityService.getAvailability).not.toHaveBeenCalled();
    expect(bookingTxRepo.update).not.toHaveBeenCalled();
    expect(reminderHook.rescheduleReminderJobs).not.toHaveBeenCalled();
    expect(autoCompleteHook.rescheduleAutoCompleteJob).not.toHaveBeenCalled();
    expect(authHook.rescheduleBookingAuthJob).not.toHaveBeenCalled();
  });

  it("customer out-of-window -> RescheduleWindowExpiredError (422)", async () => {
    // starts_at is 12h from `now`, window is 24h -> out of window.
    const booking = baseBooking({
      starts_at: new Date(NOW_BEFORE.getTime() + 12 * HOUR_MS),
      reschedule_window_hours: 24,
    });
    const { service, availabilityService } = makeService({ booking });
    let threw: unknown;
    try {
      await service.reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, CUSTOMER);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(RescheduleWindowExpiredError);
    expect((threw as HttpError).statusCode).toBe(422);
    expect((threw as HttpError).code).toBe("reschedule_window_expired");
    // Bailed BEFORE touching availability.
    expect(availabilityService.getAvailability).not.toHaveBeenCalled();
  });

  it("admin BYPASSES the window (proceeds past the window check even when out-of-window)", async () => {
    const booking = baseBooking({
      starts_at: new Date(NOW_BEFORE.getTime() + 12 * HOUR_MS),
      reschedule_window_hours: 24,
    });
    // Make availability throw a sentinel so we can prove the flow got PAST the
    // window check (which a customer would have failed) without needing the
    // full happy path.
    const getAvailability = mock(async () => {
      throw new Error("REACHED_AVAILABILITY");
    });
    const { service } = makeService({ booking, getAvailability });
    let threw: unknown;
    try {
      await service.reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, ADMIN);
    } catch (err) {
      threw = err;
    }
    expect((threw as Error).message).toBe("REACHED_AVAILABILITY");
  });
});

describe("RescheduleService.reschedule — happy path orchestration", () => {
  it("moves the slot: transitions rescheduled->confirmed, re-times all 3 jobs, emits customer notification, releases hold", async () => {
    const {
      service,
      transition,
      transitionThroughRescheduled,
      holdService,
      reminderHook,
      autoCompleteHook,
      authHook,
      notificationQueue,
      bookingTxRepo,
    } = makeService({
      availabilitySlots: [
        {
          start: new Date(NEW_SLOT.startsAt).toISOString(),
          end: new Date(NEW_SLOT.endsAt).toISOString(),
          staff_options: ["staff-1"],
        },
      ],
    });

    const result = await service.reschedule(
      "booking-1",
      { ...NEW_SLOT, staffMemberId: "staff-1", now: NOW_BEFORE },
      CUSTOMER,
    );

    // PHASE 7 REVIEW FIX #1 — BEHAVIOUR CHANGE. This used to assert TWO
    // separate `transition()` calls (confirmed->rescheduled, then
    // rescheduled->confirmed). Those were two independently committed
    // transactions with no compensation: a crash between them left the booking
    // durably `rescheduled`, a state no api and no job can act on (its only
    // outgoing edge was produced by the second call itself), with the delayed
    // jobs already torn down and the re-arm below never reached. The pair is
    // now ONE atomic call, so `rescheduled` is never committed.
    expect(transition).not.toHaveBeenCalled();
    expect(transitionThroughRescheduled).toHaveBeenCalledTimes(1);
    expect((transitionThroughRescheduled.mock.calls[0] as any[])[0]).toBe("booking-1");
    expect(result.booking.status).toBe(BookingStatus.confirmed);

    // The bookings row was updated with the new times inside the tx.
    expect(bookingTxRepo.update).toHaveBeenCalledTimes(1);

    // All three delayed jobs re-timed for the NEW slot.
    expect(reminderHook.rescheduleReminderJobs).toHaveBeenCalledTimes(1);
    expect(autoCompleteHook.rescheduleAutoCompleteJob).toHaveBeenCalledTimes(1);
    expect(authHook.rescheduleBookingAuthJob).toHaveBeenCalledTimes(1);

    // Customer booking_rescheduled event emitted.
    expect(notificationQueue.add).toHaveBeenCalled();
    const [name, payload] = notificationQueue.add.mock.calls[0] as any[];
    expect(name).toBe("notification-event");
    expect(payload.userId).toBe("customer-1");
    expect(payload.notificationType).toBe(NotificationType.booking_rescheduled);

    // Hold assert + release both happened.
    expect(holdService.assertHeldFor).toHaveBeenCalledTimes(1);
    expect(holdService.release).toHaveBeenCalled();
  });

  it("409 when the target slot resolves no staff, and releases nothing (fails before the tx/hold-consume)", async () => {
    const { service, holdService } = makeService({ availabilitySlots: [] });
    let threw: unknown;
    try {
      await service.reschedule("booking-1", { ...NEW_SLOT, now: NOW_BEFORE }, CUSTOMER);
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(409);
    // resolveStaffForSlot throws before assertHeldFor / the tx.
    expect(holdService.assertHeldFor).not.toHaveBeenCalled();
  });
});

// ─── Task 0B (Phase 7): the VENDOR entry point (rescheduleByVendor) ──────────
// Proves the vendor path skips the customer hold verification while running the
// EXACT same move + re-timing core, and that the customer-gating rules that are
// NOT actor-specific (state machine, manual-source) still stand. The customer
// path's hold verification is left provably unchanged: the customer happy-path
// test above asserts assertHeldFor is called once — nothing here weakens it.
describe("RescheduleService.rescheduleByVendor — vendor surface", () => {
  const SLOT = { startsAt: NEW_SLOT.startsAt, endsAt: NEW_SLOT.endsAt };

  it("does NOT require or verify a hold token, yet still moves + re-times all 3 jobs", async () => {
    const {
      service,
      transitionThroughRescheduled,
      holdService,
      reminderHook,
      autoCompleteHook,
      authHook,
      bookingTxRepo,
    } = makeService({
      availabilitySlots: [
        {
          start: new Date(SLOT.startsAt).toISOString(),
          end: new Date(SLOT.endsAt).toISOString(),
          staff_options: ["staff-1"],
        },
      ],
    });

    const result = await service.rescheduleByVendor(
      "booking-1",
      { ...SLOT, staffMemberId: "staff-1", now: NOW_BEFORE },
      VENDOR,
    );

    // No hold minted by a vendor JWT — the hold service is never touched.
    expect(holdService.assertHeldFor).not.toHaveBeenCalled();
    expect(holdService.release).not.toHaveBeenCalled();

    // But the SAME core still ran: the atomic status pair (fix #1) + the
    // bookings-row move.
    expect(transitionThroughRescheduled).toHaveBeenCalledTimes(1);
    expect(bookingTxRepo.update).toHaveBeenCalledTimes(1);
    expect(result.booking.status).toBe(BookingStatus.confirmed);

    // All three Phase 5 delayed jobs re-timed for the new slot, unchanged.
    expect(reminderHook.rescheduleReminderJobs).toHaveBeenCalledTimes(1);
    expect(autoCompleteHook.rescheduleAutoCompleteJob).toHaveBeenCalledTimes(1);
    expect(authHook.rescheduleBookingAuthJob).toHaveBeenCalledTimes(1);
  });

  it("bypasses the customer reschedule window (out-of-window booking still proceeds)", async () => {
    const booking = baseBooking({
      starts_at: new Date(NOW_BEFORE.getTime() + 12 * HOUR_MS),
      reschedule_window_hours: 24,
    });
    const getAvailability = mock(async () => {
      throw new Error("REACHED_AVAILABILITY");
    });
    const { service, holdService } = makeService({ booking, getAvailability });
    let threw: unknown;
    try {
      await service.rescheduleByVendor("booking-1", { ...SLOT, now: NOW_BEFORE }, VENDOR);
    } catch (err) {
      threw = err;
    }
    // Got PAST the window check (a customer would have failed) to availability.
    expect((threw as Error).message).toBe("REACHED_AVAILABILITY");
    expect(holdService.assertHeldFor).not.toHaveBeenCalled();
  });

  it("manual walk-in/phone booking (customer_user_id null) still 422 for the vendor path", async () => {
    const booking = baseBooking({ customer_user_id: null, source: "walk_in" });
    const { service, availabilityService, bookingTxRepo } = makeService({ booking });
    let threw: unknown;
    try {
      await service.rescheduleByVendor("booking-1", { ...SLOT, now: NOW_BEFORE }, VENDOR);
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(422);
    expect((threw as Error).message).toContain("Walk-in");
    expect(availabilityService.getAvailability).not.toHaveBeenCalled();
    expect(bookingTxRepo.update).not.toHaveBeenCalled();
  });

  it("non-confirmed booking still 422 (state machine stands for the vendor path)", async () => {
    const { service } = makeService({ booking: baseBooking({ status: BookingStatus.completed }) });
    let threw: unknown;
    try {
      await service.rescheduleByVendor("booking-1", { ...SLOT, now: NOW_BEFORE }, VENDOR);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(InvalidBookingTransitionError);
    expect((threw as HttpError).statusCode).toBe(422);
  });

  // ── M2 (Task 0B review): vendor path is vendor-scoped when an expected vendor
  // id is threaded in — a booking belonging to another vendor is a 404 (hide
  // existence), so the service is self-guarding for future callers. ────────────
  it("expected vendor id mismatch -> 404, never touches availability (self-guarding)", async () => {
    const booking = baseBooking({ vendor_id: "vendor-OTHER" });
    const { service, availabilityService, bookingTxRepo } = makeService({ booking });
    let threw: unknown;
    try {
      await service.rescheduleByVendor(
        "booking-1",
        { ...SLOT, now: NOW_BEFORE },
        VENDOR,
        "vendor-1", // the acting vendor — differs from the booking's vendor
      );
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(404);
    expect(availabilityService.getAvailability).not.toHaveBeenCalled();
    expect(bookingTxRepo.update).not.toHaveBeenCalled();
  });

  it("expected vendor id match -> proceeds through the normal move", async () => {
    const { service, transitionThroughRescheduled, bookingTxRepo } = makeService({
      availabilitySlots: [
        {
          start: new Date(SLOT.startsAt).toISOString(),
          end: new Date(SLOT.endsAt).toISOString(),
          staff_options: ["staff-1"],
        },
      ],
    });

    const result = await service.rescheduleByVendor(
      "booking-1",
      { ...SLOT, staffMemberId: "staff-1", now: NOW_BEFORE },
      VENDOR,
      "vendor-1", // matches baseBooking.vendor_id
    );

    expect(transitionThroughRescheduled).toHaveBeenCalledTimes(1);
    expect(bookingTxRepo.update).toHaveBeenCalledTimes(1);
    expect(result.booking.status).toBe(BookingStatus.confirmed);
  });
});
