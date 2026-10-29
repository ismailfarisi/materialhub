// booking-status.service.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1). Per the Task 6 brief: the transition
// tests seed a `pending_payment`/`confirmed` booking + engagement fixture
// DIRECTLY (bypassing BookingService.create's hold->availability->pay flow),
// so this suite needs neither Redis nor a running order-service — only
// docker-compose's postgres (`docker compose up -d postgres`).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  BookingStatusHistory,
  CancellationRefundPolicy,
  DepositType,
  EngagementKind,
  EngagementStatus,
  ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
  StaffEngagement,
  StaffMember,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { EngagementService } from "../engagement/engagement.service.ts";
import { BookingStatusService, InvalidBookingTransitionError } from "./booking-status.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

// Fixed base day, far enough out to be inert to any reaper/other job logic;
// each scenario gets its own offset slot so engagement ranges never overlap
// on the shared staff member (no GiST EXCLUDE collisions between scenarios).
const BASE_DAY = new Date(Date.now() + 10 * 24 * 3_600_000);
function slotAt(offsetMinutes: number): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(
      BASE_DAY.getUTCFullYear(),
      BASE_DAY.getUTCMonth(),
      BASE_DAY.getUTCDate(),
      10,
      0 + offsetMinutes,
      0,
    ),
  );
  return { start, end: new Date(start.getTime() + 30 * 60_000) };
}

describeLive("BookingStatusService (live DB)", () => {
  let statusService: BookingStatusService;
  let engagementService: EngagementService;
  let vendorId: string;
  let customerId: string;
  let adminId: string;
  let staffId: string;
  let offeringVenueId: string;
  let offeringPrepayId: string;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
  const historyRepo = () => AppDataSource.getRepository(BookingStatusHistory);

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  let slotCursor = 0;

  function nextSlot() {
    slotCursor += 45;
    return slotAt(slotCursor);
  }

  async function seedFixture(opts: {
    bookingStatus: BookingStatus;
    engagementStatus: EngagementStatus;
    offeringId?: string;
    paymentMode?: ServicePaymentMode;
  }): Promise<{ booking: Booking; engagement: StaffEngagement }> {
    const slot = nextSlot();
    const engagement = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: slot.start,
      endsAt: slot.end,
      kind: EngagementKind.marketplace_booking,
      status: opts.engagementStatus,
      createdBy: customerId,
    });
    createdEngagementIds.push(engagement.id);

    const booking = await bookingRepo().save(
      bookingRepo().create({
        booking_number: `BST${unique}${slotCursor}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        location_id: null,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: opts.offeringId ?? offeringVenueId,
        service_name: "Status Machine Test Service",
        duration_minutes: 30,
        price_fils: 20_000,
        vat_fils: 952,
        deposit_fils: 0,
        deposit_type: DepositType.none,
        cancellation_window_hours: 24,
        cancellation_refund_policy: CancellationRefundPolicy.full,
        cancellation_penalty_percent: 100,
        reschedule_window_hours: 24,
        commission_rate: 10,
        commission_fils: 1900,
        starts_at: slot.start,
        ends_at: slot.end,
        status: opts.bookingStatus,
        source: "marketplace",
        payment_mode: opts.paymentMode ?? ServicePaymentMode.pay_at_venue,
      }),
    );
    createdBookingIds.push(booking.id);
    return { booking, engagement };
  }

  async function latestHistory(bookingId: string): Promise<BookingStatusHistory | null> {
    return historyRepo().findOne({
      where: { booking_id: bookingId },
      order: { created_at: "DESC" },
    });
  }

  beforeAll(async () => {
    await ensureDatabase();

    statusService = new BookingStatusService(bookingRepo());
    engagementService = new EngagementService(engagementRepo());

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Status",
        last_name: "Customer",
        email: `booking-status-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const admin = await userRepo.save(
      userRepo.create({
        first_name: "Status",
        last_name: "Admin",
        email: `booking-status-svc-admin-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.admin,
        status: UserStatus.active,
      }),
    );
    adminId = admin.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Booking Status Test Vendor ${unique}`,
        slug: `booking-status-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `booking-status-vendor-${unique}@test.local`,
        contact_phone: "+971500000001",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Status Test Stylist ${unique}` }),
    );
    staffId = staff.id;

    const offeringVenue = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-status-test-venue-${unique}`,
        name: "Status Test Venue Offering",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 90,
        price_fils: 20_000,
        vat_rate: 5 as unknown as number,
        deposit_type: DepositType.none,
        deposit_value: 0,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: ServicePaymentMode.pay_at_venue,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringVenueId = offeringVenue.id;

    const offeringPrepay = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-status-test-prepay-${unique}`,
        name: "Status Test Prepay Offering",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 90,
        price_fils: 20_000,
        vat_rate: 5 as unknown as number,
        deposit_type: DepositType.none,
        deposit_value: 0,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: ServicePaymentMode.prepay,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringPrepayId = offeringPrepay.id;
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(
          `[booking-status.service.integration.test] cleanup step "${label}" failed`,
          err,
        );
      }
    }

    if (createdBookingIds.length) {
      await step("delete booking_status_history", () =>
        historyRepo()
          .createQueryBuilder()
          .delete()
          .where("booking_id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
      await step("delete bookings", () =>
        bookingRepo()
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
    }
    if (createdEngagementIds.length) {
      await step("delete engagements", () =>
        engagementRepo()
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdEngagementIds })
          .execute(),
      );
    }
    if (staffId) {
      await step("delete staff", () =>
        AppDataSource.getRepository(StaffMember)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: staffId })
          .execute(),
      );
    }
    if (offeringVenueId || offeringPrepayId) {
      await step("delete offerings", () =>
        AppDataSource.getRepository(ServiceOffering)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: [offeringVenueId, offeringPrepayId].filter(Boolean) })
          .execute(),
      );
    }
    if (vendorId) {
      await step("delete vendor", () =>
        AppDataSource.getRepository(Vendor)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: vendorId })
          .execute(),
      );
    }
    if (customerId) {
      await step("delete customer", () =>
        AppDataSource.getRepository(User)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: customerId })
          .execute(),
      );
    }
    if (adminId) {
      await step("delete admin", () =>
        AppDataSource.getRepository(User)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: adminId })
          .execute(),
      );
    }
  }, 30_000);

  it("pending_payment -> confirmed: legal, confirms the engagement, writes history", async () => {
    const { booking, engagement } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
    });

    const updated = await statusService.transition(
      booking.id,
      BookingStatus.confirmed,
      { id: customerId, role: "customer" },
      "test: pay_at_venue confirm",
    );
    expect(updated.status).toBe(BookingStatus.confirmed);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);

    const history = await latestHistory(booking.id);
    expect(history?.from_status).toBe(BookingStatus.pending_payment);
    expect(history?.to_status).toBe(BookingStatus.confirmed);
    expect(history?.actor_id).toBe(customerId);
    expect(history?.actor_role).toBe("customer");
    expect(history?.reason).toBe("test: pay_at_venue confirm");
  });

  it("pending_payment -> expired: legal, releases the engagement (frees the slot)", async () => {
    const { booking, engagement } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
    });

    const updated = await statusService.transition(booking.id, BookingStatus.expired, {
      id: null,
      role: "system",
    });
    expect(updated.status).toBe(BookingStatus.expired);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.released);

    const history = await latestHistory(booking.id);
    expect(history?.from_status).toBe(BookingStatus.pending_payment);
    expect(history?.to_status).toBe(BookingStatus.expired);
    expect(history?.actor_role).toBe("system");
  });

  it("confirmed -> cancelled: legal, releases the engagement (frees the slot)", async () => {
    const { booking, engagement } = await seedFixture({
      bookingStatus: BookingStatus.confirmed,
      engagementStatus: EngagementStatus.confirmed,
    });

    const updated = await statusService.transition(
      booking.id,
      BookingStatus.cancelled,
      { id: customerId, role: "customer" },
      "customer changed their mind",
    );
    expect(updated.status).toBe(BookingStatus.cancelled);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.released);
  });

  it("confirmed -> completed: legal, engagement is NOT released (slot already consumed)", async () => {
    const { booking, engagement } = await seedFixture({
      bookingStatus: BookingStatus.confirmed,
      engagementStatus: EngagementStatus.confirmed,
    });

    const updated = await statusService.transition(booking.id, BookingStatus.completed, {
      id: null,
      role: "system",
    });
    expect(updated.status).toBe(BookingStatus.completed);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);
  });

  it("confirmed -> no_show: legal, engagement is NOT released (slot already consumed)", async () => {
    const { booking, engagement } = await seedFixture({
      bookingStatus: BookingStatus.confirmed,
      engagementStatus: EngagementStatus.confirmed,
    });

    const updated = await statusService.transition(
      booking.id,
      BookingStatus.no_show,
      { id: adminId, role: "admin" },
      "customer never arrived",
    );
    expect(updated.status).toBe(BookingStatus.no_show);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);
  });

  // ── completeBooking (Phase 4 Task 9) ────────────────────────────────────
  // Live DB, but a STUB completionHook (not the real order-service call) —
  // this suite proves the state-machine/idempotency orchestration
  // (transition + hook firing) works against real Postgres without needing
  // order-service running; the real end-to-end capture+accrual over HTTP is
  // covered separately by booking-completion.service.integration.test.ts.
  describe("completeBooking", () => {
    function makeHook() {
      const calls: string[] = [];
      let failNext = false;
      return {
        hook: {
          onCompleted: async (booking: Booking) => {
            calls.push(booking.id);
            if (failNext) {
              failNext = false;
              throw new Error("simulated order-service failure");
            }
          },
        },
        calls,
        setFailNext: (v: boolean) => {
          failNext = v;
        },
      };
    }

    it("confirmed -> completed: transitions and fires the completion hook exactly once", async () => {
      const { hook, calls } = makeHook();
      const service = new BookingStatusService(bookingRepo(), undefined, undefined, hook);
      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.confirmed,
        engagementStatus: EngagementStatus.confirmed,
      });

      const completed = await service.completeBooking(booking.id, { id: adminId, role: "admin" });
      expect(completed.status).toBe(BookingStatus.completed);
      expect(calls).toEqual([booking.id]);

      const history = await latestHistory(booking.id);
      expect(history?.to_status).toBe(BookingStatus.completed);
    });

    it("idempotency: completing an already-completed booking re-fires the hook without writing a second history row", async () => {
      const { hook, calls } = makeHook();
      const service = new BookingStatusService(bookingRepo(), undefined, undefined, hook);
      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.confirmed,
        engagementStatus: EngagementStatus.confirmed,
      });

      await service.completeBooking(booking.id, { id: adminId, role: "admin" });
      const retried = await service.completeBooking(booking.id, { id: adminId, role: "admin" });
      expect(retried.status).toBe(BookingStatus.completed);

      // Hook fired on BOTH calls (idempotent server-side; the retry is what
      // Task 9's brief requires — a failed capture/accrual must be
      // retryable) ...
      expect(calls).toEqual([booking.id, booking.id]);
      // ... but the state machine only wrote ONE history row — the second
      // call took the "already completed" branch, not a second real
      // transition.
      const historyRows = await historyRepo().find({ where: { booking_id: booking.id } });
      expect(historyRows).toHaveLength(1);
    });

    it("propagates a completionHook failure to the caller (so it can retry) without un-completing the booking", async () => {
      const { hook, setFailNext } = makeHook();
      const service = new BookingStatusService(bookingRepo(), undefined, undefined, hook);
      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.confirmed,
        engagementStatus: EngagementStatus.confirmed,
      });

      setFailNext(true);
      let threw: unknown;
      try {
        await service.completeBooking(booking.id, { id: adminId, role: "admin" });
      } catch (err) {
        threw = err;
      }
      expect((threw as Error)?.message).toBe("simulated order-service failure");

      // The transition itself already committed durably despite the hook
      // throwing — completeBooking() is retryable from here.
      const afterFailure = await bookingRepo().findOne({ where: { id: booking.id } });
      expect(afterFailure?.status).toBe(BookingStatus.completed);
    });

    it("illegal state (pending_payment): throws InvalidBookingTransitionError, hook never fires", async () => {
      const { hook, calls } = makeHook();
      const service = new BookingStatusService(bookingRepo(), undefined, undefined, hook);
      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.pending_payment,
        engagementStatus: EngagementStatus.held,
      });

      let threw: unknown;
      try {
        await service.completeBooking(booking.id, { id: adminId, role: "admin" });
      } catch (err) {
        threw = err;
      }
      expect((threw as HttpError)?.statusCode).toBe(422);
      expect(calls).toEqual([]);
    });

    it("with no completionHook wired, completeBooking still transitions (money side is a documented no-op)", async () => {
      const service = new BookingStatusService(bookingRepo()); // no hook
      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.confirmed,
        engagementStatus: EngagementStatus.confirmed,
      });

      const completed = await service.completeBooking(booking.id, { id: adminId, role: "admin" });
      expect(completed.status).toBe(BookingStatus.completed);
    });
  });

  it("confirmed -> rescheduled -> confirmed: both edges legal, history written for each", async () => {
    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.confirmed,
      engagementStatus: EngagementStatus.confirmed,
    });

    const rescheduled = await statusService.transition(
      booking.id,
      BookingStatus.rescheduled,
      { id: customerId, role: "customer" },
      "moving to a new slot",
    );
    expect(rescheduled.status).toBe(BookingStatus.rescheduled);

    const reconfirmed = await statusService.transition(booking.id, BookingStatus.confirmed, {
      id: customerId,
      role: "customer",
    });
    expect(reconfirmed.status).toBe(BookingStatus.confirmed);

    const historyRows = await historyRepo().find({
      where: { booking_id: booking.id },
      order: { created_at: "ASC" },
    });
    expect(historyRows).toHaveLength(2);
    expect(historyRows[0]?.to_status).toBe(BookingStatus.rescheduled);
    expect(historyRows[1]?.to_status).toBe(BookingStatus.confirmed);
  });

  it("illegal transitions throw InvalidBookingTransitionError (422, invalid_booking_transition)", async () => {
    const scenarios: Array<{ from: BookingStatus; to: BookingStatus }> = [
      { from: BookingStatus.expired, to: BookingStatus.confirmed },
      { from: BookingStatus.completed, to: BookingStatus.cancelled },
      { from: BookingStatus.pending_payment, to: BookingStatus.completed },
    ];

    for (const { from, to } of scenarios) {
      const { booking } = await seedFixture({
        bookingStatus: from,
        engagementStatus: EngagementStatus.confirmed,
      });

      let threw: unknown;
      try {
        await statusService.transition(booking.id, to, { id: null, role: "system" });
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(InvalidBookingTransitionError);
      expect((threw as HttpError).statusCode).toBe(422);
      expect((threw as HttpError).code).toBe("invalid_booking_transition");

      // No history row and no status mutation on the illegal attempt.
      const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(from);
      const history = await latestHistory(booking.id);
      expect(history).toBeNull();
    }
  });

  it("confirm(): pending_payment -> confirmed via the webhook entry point (system actor)", async () => {
    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
      offeringId: offeringVenueId,
      paymentMode: ServicePaymentMode.pay_at_venue,
    });

    const confirmed = await statusService.confirm(booking.id);
    expect(confirmed.status).toBe(BookingStatus.confirmed);

    const history = await latestHistory(booking.id);
    expect(history?.actor_role).toBe("system");
    expect(history?.actor_id).toBeNull();
  });

  it("confirm(): is idempotent — calling it again on an already-confirmed booking is a safe no-op", async () => {
    // Spy on the post-confirm seams — a retried confirm() must not just skip
    // the history write, it must not refire scheduleBookingAuthJob /
    // enqueuePostConfirmHooks either (the exact webhook-retry failure mode
    // this fix closes: a duplicate Stripe delivery must not double-schedule
    // the booking-auth job or double-enqueue post-confirm hooks).
    const authCalls: string[] = [];
    const hookCalls: string[] = [];
    const idempotentService = new BookingStatusService(bookingRepo());
    idempotentService.scheduleBookingAuthJob = async (b) => {
      authCalls.push(b.id);
    };
    idempotentService.enqueuePostConfirmHooks = async (b) => {
      hookCalls.push(b.id);
    };

    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
      offeringId: offeringPrepayId,
      paymentMode: ServicePaymentMode.prepay,
    });

    const first = await idempotentService.confirm(booking.id);
    expect(first.status).toBe(BookingStatus.confirmed);

    const historyAfterFirst = await historyRepo().find({ where: { booking_id: booking.id } });
    expect(historyAfterFirst).toHaveLength(1);
    expect(authCalls).toEqual([booking.id]);
    expect(hookCalls).toEqual([booking.id]);

    // Second call (simulating a Stripe webhook retry) must NOT throw and
    // must NOT write a second history row, and must NOT refire either seam.
    const second = await idempotentService.confirm(booking.id);
    expect(second.status).toBe(BookingStatus.confirmed);

    const historyAfterSecond = await historyRepo().find({ where: { booking_id: booking.id } });
    expect(historyAfterSecond).toHaveLength(1);
    expect(authCalls).toEqual([booking.id]);
    expect(hookCalls).toEqual([booking.id]);
  });

  it("confirm(): TWO true-concurrent calls on the same pending_payment booking — atomic guard lets exactly one write history and confirm the engagement", async () => {
    const { booking, engagement } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
    });

    // Two separate service instances (their own repo handles, same
    // underlying AppDataSource pool) racing confirm() on the SAME booking id
    // — simulates two concurrent Stripe webhook deliveries. Both must
    // resolve (never throw — confirm() is idempotent by contract), but the
    // guarded conditional UPDATE (`WHERE id = :id AND status = :from`) must
    // let only one of them actually flip the row and write history; the
    // loser re-reads under its own transaction, sees the row already
    // `confirmed`, and no-ops.
    const serviceA = new BookingStatusService(bookingRepo());
    const serviceB = new BookingStatusService(bookingRepo());

    const results = await Promise.allSettled([
      serviceA.confirm(booking.id),
      serviceB.confirm(booking.id),
    ]);

    for (const result of results) {
      expect(result.status).toBe("fulfilled");
      if (result.status === "fulfilled") {
        expect(result.value.status).toBe(BookingStatus.confirmed);
      }
    }

    const historyRows = await historyRepo().find({ where: { booking_id: booking.id } });
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.from_status).toBe(BookingStatus.pending_payment);
    expect(historyRows[0]?.to_status).toBe(BookingStatus.confirmed);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.confirmed);
  });

  it("confirm(): fires scheduleBookingAuthJob for prepay, not for pay_at_venue", async () => {
    const prepayCalls: string[] = [];
    const venueCalls: string[] = [];

    const prepayService = new BookingStatusService(bookingRepo());
    prepayService.scheduleBookingAuthJob = async (b) => {
      prepayCalls.push(b.id);
    };
    const venueService = new BookingStatusService(bookingRepo());
    venueService.scheduleBookingAuthJob = async (b) => {
      venueCalls.push(b.id);
    };

    const prepayFixture = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
      offeringId: offeringPrepayId,
      paymentMode: ServicePaymentMode.prepay,
    });
    const venueFixture = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
      offeringId: offeringVenueId,
      paymentMode: ServicePaymentMode.pay_at_venue,
    });

    await prepayService.confirm(prepayFixture.booking.id);
    await venueService.confirm(venueFixture.booking.id);

    expect(prepayCalls).toEqual([prepayFixture.booking.id]);
    expect(venueCalls).toEqual([]);
  });

  // ── Phase 5 Task 8: confirm-time notification emission ─────────────────
  describe("confirm(): notification emission (booking_confirmed / vendor_new_booking)", () => {
    function fakeNotificationQueue() {
      const calls: Array<[string, any]> = [];
      return {
        add: async (name: string, data: unknown) => {
          calls.push([name, data]);
          return { id: "notif-job" };
        },
        calls,
      };
    }

    it("emits booking_confirmed to the customer and vendor_new_booking to the vendor owner", async () => {
      const notificationQueue = fakeNotificationQueue();
      const vendorOwnerLookup = { findOwnerUserId: async (_vendorId: string) => "vendor-owner-1" };
      const service = new BookingStatusService(
        bookingRepo(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        notificationQueue as any,
        vendorOwnerLookup as any,
      );

      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.pending_payment,
        engagementStatus: EngagementStatus.held,
        offeringId: offeringVenueId,
        paymentMode: ServicePaymentMode.pay_at_venue,
      });

      await service.confirm(booking.id);

      const customerEvt = notificationQueue.calls.find((c) => c[1].userId === customerId);
      const vendorEvt = notificationQueue.calls.find((c) => c[1].userId === "vendor-owner-1");
      expect(customerEvt?.[1].notificationType).toBe("booking_confirmed");
      expect(vendorEvt?.[1].notificationType).toBe("vendor_new_booking");
      expect(customerEvt?.[1].data.bookingId).toBe(booking.id);
    });

    it("no vendorOwnerLookup wired: only the customer notification fires, no throw", async () => {
      const notificationQueue = fakeNotificationQueue();
      const service = new BookingStatusService(
        bookingRepo(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        notificationQueue as any,
        // vendorOwnerLookup intentionally omitted
      );

      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.pending_payment,
        engagementStatus: EngagementStatus.held,
      });

      const confirmed = await service.confirm(booking.id);
      expect(confirmed.status).toBe(BookingStatus.confirmed);

      const types = notificationQueue.calls.map((c) => c[1].notificationType);
      expect(types).toEqual(["booking_confirmed"]);
    });

    it("idempotent retry does not double-emit either notification", async () => {
      const notificationQueue = fakeNotificationQueue();
      const vendorOwnerLookup = { findOwnerUserId: async (_vendorId: string) => "vendor-owner-1" };
      const service = new BookingStatusService(
        bookingRepo(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        notificationQueue as any,
        vendorOwnerLookup as any,
      );

      const { booking } = await seedFixture({
        bookingStatus: BookingStatus.pending_payment,
        engagementStatus: EngagementStatus.held,
      });

      await service.confirm(booking.id);
      await service.confirm(booking.id); // simulated webhook retry — safe no-op

      const confirmedEvents = notificationQueue.calls.filter(
        (c) => c[1].notificationType === "booking_confirmed",
      );
      const vendorEvents = notificationQueue.calls.filter(
        (c) => c[1].notificationType === "vendor_new_booking",
      );
      expect(confirmedEvents).toHaveLength(1);
      expect(vendorEvents).toHaveLength(1);
    });
  });

  // ── FINAL REVIEW FIX 1 regression tests ─────────────────────────────────
  // confirm() must idempotently no-op against ANY non-pending_payment
  // status, not just "already confirmed". Both scenarios below reproduce a
  // real cross-task race where a late Stripe event (metadata.booking_id)
  // reaches confirm() after the booking has already moved on to a
  // DIFFERENT terminal status — before the fix, both threw
  // InvalidBookingTransitionError (422) because ALLOWED_TRANSITIONS has no
  // outgoing edge from a terminal state, which the webhook handler would
  // have marked `failed`, causing Stripe to retry forever.
  it("confirm(): booking already completed (Task 9 prepay-completion capture race) — safe no-op, no throw, no history rewrite, no seam refire", async () => {
    const authCalls: string[] = [];
    const hookCalls: string[] = [];
    const service = new BookingStatusService(bookingRepo());
    service.scheduleBookingAuthJob = async (b) => {
      authCalls.push(b.id);
    };
    service.enqueuePostConfirmHooks = async (b) => {
      hookCalls.push(b.id);
    };

    // Seeded directly as `completed` (bypassing the legal transition path)
    // — this reproduces the exact state confirm() sees when the capture PI
    // for an already-completed prepay booking fires its
    // payment_intent.succeeded webhook late.
    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.completed,
      engagementStatus: EngagementStatus.confirmed,
      offeringId: offeringPrepayId,
      paymentMode: ServicePaymentMode.prepay,
    });

    let threw: unknown;
    let result: Booking | undefined;
    try {
      result = await service.confirm(booking.id);
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeUndefined();
    expect(result?.status).toBe(BookingStatus.completed);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.completed);

    // No history row written by the no-op (seedFixture itself never writes
    // one either — booking_status_history stays empty).
    const history = await latestHistory(booking.id);
    expect(history).toBeNull();

    // Neither confirm-seam refired.
    expect(authCalls).toEqual([]);
    expect(hookCalls).toEqual([]);
  });

  it("confirm(): booking already expired (reaper-vs-late-webhook race) — safe no-op, no throw", async () => {
    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
    });

    // Simulates the reaper expiring the booking before its late
    // setup_intent/payment_intent.succeeded webhook arrives.
    const expired = await statusService.transition(booking.id, BookingStatus.expired, {
      id: null,
      role: "system",
    });
    expect(expired.status).toBe(BookingStatus.expired);

    const historyAfterExpiry = await historyRepo().find({ where: { booking_id: booking.id } });
    expect(historyAfterExpiry).toHaveLength(1);

    let threw: unknown;
    let result: Booking | undefined;
    try {
      result = await statusService.confirm(booking.id);
    } catch (err) {
      threw = err;
    }

    expect(threw).toBeUndefined();
    expect(result?.status).toBe(BookingStatus.expired);

    // Still exactly the ONE history row from the reaper's real expiry
    // transition — confirm()'s no-op did not write a second row.
    const historyAfterConfirm = await historyRepo().find({ where: { booking_id: booking.id } });
    expect(historyAfterConfirm).toHaveLength(1);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.expired);
  });

  // Phase 4 Task 3 — the webhook-failure entry point order-service's
  // WebhookService calls via BookingLifecycleClient.paymentFailed() /
  // internal-booking.routes.ts's POST /:id/payment-failed. Thin by design
  // (see the method's docstring): it must NOT transition the booking —
  // that's left to the Task 7 reaper (pending_payment) / Task 7b (confirmed
  // prepay re-auth failure).
  it("handlePaymentFailed(): does not transition a pending_payment booking, leaves it for the reaper", async () => {
    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.pending_payment,
      engagementStatus: EngagementStatus.held,
      offeringId: offeringVenueId,
      paymentMode: ServicePaymentMode.deposit,
    });

    const result = await statusService.handlePaymentFailed(booking.id, "card_declined");
    expect(result.status).toBe(BookingStatus.pending_payment);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.pending_payment);

    // No history row written — handlePaymentFailed is not a transition.
    const history = await latestHistory(booking.id);
    expect(history).toBeNull();
  });

  it("handlePaymentFailed(): does not transition an already-confirmed prepay booking either (Task 7b's territory)", async () => {
    const { booking } = await seedFixture({
      bookingStatus: BookingStatus.confirmed,
      engagementStatus: EngagementStatus.confirmed,
      offeringId: offeringPrepayId,
      paymentMode: ServicePaymentMode.prepay,
    });

    const result = await statusService.handlePaymentFailed(booking.id, "off_session_auth_failed");
    expect(result.status).toBe(BookingStatus.confirmed);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.confirmed);
  });

  it("handlePaymentFailed(): throws NotFoundError for an unknown booking id", async () => {
    await expect(
      statusService.handlePaymentFailed("00000000-0000-0000-0000-000000000000", "unknown"),
    ).rejects.toThrow("Booking not found");
  });
});
