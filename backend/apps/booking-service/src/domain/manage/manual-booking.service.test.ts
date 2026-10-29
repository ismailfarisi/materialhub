// manual-booking.service.test.ts
//
// Mocked-repo unit tests (no live DB) for ManualBookingService (Phase 6 Task
// 1). Mirrors booking-status.service.test.ts's fake-transactional-manager
// pattern: `bookingRepo.manager.transaction` runs the callback against
// in-memory Booking/BookingStatusHistory/StaffEngagement repos, and the
// StaffEngagement repo exposes `.manager.query` (not create/save) because
// EngagementService.reserve does a raw INSERT ... RETURNING *, mirroring
// engagement.service.test.ts's own fake shape. Live-DB overlap/403 coverage
// lives in manual-booking.routes.integration.test.ts.
import { describe, expect, it, mock } from "bun:test";
import { Booking, BookingStatusHistory, EngagementKind, StaffEngagement } from "@materialhub/database";
import { BadRequestError, ConflictError, NotFoundError } from "@materialhub/plugins";
import { ManualBookingService } from "./manual-booking.service.ts";

const ACTOR = { userId: "user-1", vendorId: "vendor-1", role: "manager" };
// Fixed reference "now" matching baseInput()'s fixture dates below — create()
// defaults `now` to the real wall clock, and MAX_BLOCK_PAST_DAYS/FUTURE_DAYS
// bound startsAt relative to it, so a hardcoded startsAt drifts out of range
// as real time passes unless every create() call pins `now` alongside it.
const NOW = new Date("2026-08-10T09:00:00Z");

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    staffMemberId: "staff-1",
    vendorLocationId: "loc-1",
    serviceId: null as string | null,
    startsAt: "2026-08-10T10:00:00Z",
    endsAt: "2026-08-10T10:30:00Z",
    kind: EngagementKind.walk_in,
    customerName: null as string | null,
    customerPhone: null as string | null,
    notes: null as string | null,
    ...overrides,
  };
}

function makeHarness(opts: {
  staff?: Record<string, unknown> | null;
  staffLocation?: Record<string, unknown> | null;
  offering?: Record<string, unknown> | null;
  engagementQuery?: () => Promise<unknown[]>;
}) {
  const staff = opts.staff === undefined ? { id: "staff-1", vendor_id: "vendor-1" } : opts.staff;
  const staffLocation =
    opts.staffLocation === undefined
      ? { id: "link-1", staff_member_id: "staff-1", vendor_location_id: "loc-1" }
      : opts.staffLocation;
  const offering = opts.offering ?? null;

  const savedBookings: Record<string, unknown>[] = [];
  const savedHistory: Record<string, unknown>[] = [];

  const engagementRepo = {
    manager: {
      query:
        opts.engagementQuery ??
        (async () => [
          {
            id: "eng-1",
            staff_member_id: "staff-1",
            vendor_id: "vendor-1",
            starts_at: new Date("2026-08-10T10:00:00Z"),
            ends_at: new Date("2026-08-10T10:30:00Z"),
            status: "confirmed",
            kind: "walk_in",
          },
        ]),
    },
  };
  const bookingRepoTx = {
    create: (x: Record<string, unknown>) => x,
    save: mock(async (x: Record<string, unknown>) => {
      const saved = { id: "booking-1", ...x };
      savedBookings.push(saved);
      return saved;
    }),
  };
  const historyRepo = {
    create: (x: Record<string, unknown>) => x,
    save: mock(async (x: Record<string, unknown>) => {
      savedHistory.push(x);
      return x;
    }),
  };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === StaffEngagement) return engagementRepo;
      if (entity === Booking) return bookingRepoTx;
      if (entity === BookingStatusHistory) return historyRepo;
      throw new Error("unexpected entity in fake manager");
    },
  };

  const staffRepo = { findOne: mock(async () => staff) };
  const staffLocationRepo = { findOne: mock(async () => staffLocation) };
  const offeringRepo = { findOne: mock(async () => offering) };
  const bookingRepo = {
    manager: {
      transaction: async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
    },
  };

  const svc = new ManualBookingService(
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    staffRepo as any,
    staffLocationRepo as any,
    offeringRepo as any,
    bookingRepo as any,
  );

  return { svc, staffRepo, staffLocationRepo, offeringRepo, savedBookings, savedHistory };
}

describe("ManualBookingService.create", () => {
  it("walk-in with customer details, no service: engagement confirmed + a minimal booking row (source=walk_in, no commission, pay_at_venue)", async () => {
    const { svc, savedBookings, savedHistory } = makeHarness({});

    const result = await svc.create(
      ACTOR,
      baseInput({ customerName: "Fatima Al Sayed", customerPhone: "+971501234567" }),
      NOW,
    );

    expect(result.engagement.id).toBe("eng-1");
    expect(result.booking).toBeTruthy();
    const booking = result.booking as unknown as Record<string, unknown>;
    expect(booking.customer_user_id).toBeNull();
    expect(booking.customer_name).toBe("Fatima Al Sayed");
    expect(booking.customer_phone).toBe("+971501234567");
    expect(booking.source).toBe("walk_in");
    expect(booking.status).toBe("confirmed");
    expect(booking.payment_mode).toBe("pay_at_venue");
    expect(booking.service_offering_id).toBeNull();
    expect(booking.price_fils).toBe(0);
    expect(booking.commission_fils).toBe(0);
    expect(booking.commission_rate).toBe(0);
    expect(booking.service_name).toBe("Walk-in");
    // Duration derived from the slot itself (30 min).
    expect(booking.duration_minutes).toBe(30);
    expect(savedBookings.length).toBe(1);
    expect(savedHistory.length).toBe(1);
    expect(savedHistory[0]).toMatchObject({
      booking_id: "booking-1",
      from_status: null,
      to_status: "confirmed",
      actor_id: "user-1",
      actor_role: "vendor",
    });
  });

  it("phone booking with a service_id: snapshots price/vat/deposit/duration/name from the offering", async () => {
    const offering = {
      id: "svc-1",
      vendor_id: "vendor-1",
      name: "Classic Manicure",
      duration_minutes: 45,
      price_fils: 10_500,
      vat_rate: 5,
      deposit_type: "percent",
      deposit_value: 20,
      cancellation_window_hours: 24,
      cancellation_refund_policy: "full",
      cancellation_penalty_percent: 100,
      reschedule_window_hours: 24,
    };
    const { svc, savedBookings } = makeHarness({ offering });

    const result = await svc.create(
      ACTOR,
      baseInput({ kind: EngagementKind.phone, serviceId: "svc-1", customerPhone: "+971500000000" }),
      NOW,
    );

    const booking = result.booking as unknown as Record<string, unknown>;
    expect(booking.source).toBe("phone");
    expect(booking.service_offering_id).toBe("svc-1");
    expect(booking.service_name).toBe("Classic Manicure");
    expect(booking.duration_minutes).toBe(45);
    expect(booking.price_fils).toBe(10_500);
    // vat_rate=5% VAT-inclusive: net = round(10500 / 1.05) = 10000, vat = 500.
    expect(booking.vat_fils).toBe(500);
    // deposit_type=percent, 20% of 10500 = 2100.
    expect(booking.deposit_fils).toBe(2_100);
    expect(booking.commission_fils).toBe(0);
    expect(savedBookings.length).toBe(1);
  });

  it("bare walk-in (no customer details, no service): STILL writes a minimal booking row so it is cancelable (review I3)", async () => {
    const { svc, savedBookings, savedHistory } = makeHarness({});

    const result = await svc.create(ACTOR, baseInput(), NOW);

    // A row is always written now — an engagement-only walk-in would be
    // irrevocable (no booking id for admin cancel to reach).
    expect(result.booking).toBeTruthy();
    const booking = result.booking as unknown as Record<string, unknown>;
    expect(booking.customer_user_id).toBeNull();
    expect(booking.customer_name).toBeNull();
    expect(booking.customer_phone).toBeNull();
    expect(booking.service_offering_id).toBeNull();
    expect(booking.source).toBe("walk_in");
    expect(booking.service_name).toBe("Walk-in");
    expect(booking.price_fils).toBe(0);
    expect(savedBookings.length).toBe(1);
    expect(savedHistory.length).toBe(1);
  });

  it("notes-only call: writes the booking row and persists the note (review I3 / former Task-1 minor)", async () => {
    const { svc, savedBookings } = makeHarness({});

    const result = await svc.create(ACTOR, baseInput({ notes: "Prefers window seat" }), NOW);

    expect(result.booking).toBeTruthy();
    expect((result.booking as unknown as Record<string, unknown>).notes).toBe(
      "Prefers window seat",
    );
    expect(savedBookings.length).toBe(1);
  });

  it("startsAt >= endsAt: BadRequestError, before any repo lookups", async () => {
    const { svc, staffRepo } = makeHarness({});

    await expect(
      svc.create(
        ACTOR,
        baseInput({ startsAt: "2026-08-10T10:30:00Z", endsAt: "2026-08-10T10:00:00Z" }),
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(staffRepo.findOne).not.toHaveBeenCalled();
  });

  it("staff member not found (or not this vendor's): NotFoundError", async () => {
    const { svc } = makeHarness({ staff: null });
    await expect(svc.create(ACTOR, baseInput(), NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("staff member not linked to the target location: BadRequestError", async () => {
    const { svc } = makeHarness({ staffLocation: null });
    await expect(svc.create(ACTOR, baseInput(), NOW)).rejects.toBeInstanceOf(BadRequestError);
  });

  it("service_id given but no matching offering for this vendor: NotFoundError", async () => {
    const { svc } = makeHarness({ offering: null });
    await expect(
      svc.create(ACTOR, baseInput({ serviceId: "missing-svc" }), NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("overlapping slot: the ConflictError from EngagementService.reserve propagates, no booking row written", async () => {
    const { svc, savedBookings } = makeHarness({
      engagementQuery: () =>
        Promise.reject(Object.assign(new Error("exclusion"), { code: "23P01" })),
    });

    await expect(
      svc.create(ACTOR, baseInput({ customerName: "Walk-in Customer" }), NOW),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(savedBookings.length).toBe(0);
  });
});
