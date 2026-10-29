// booking-reaper.service.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1). Mirrors booking-status.service
// .integration.test.ts's fixture pattern: seeds `pending_payment` bookings +
// engagements DIRECTLY (bypassing BookingService.create's
// hold->availability->pay flow), so the core reap-and-free-slot behavior
// (Task 7 brief bullets 1 and 2) needs neither Redis nor a running
// order-service — only docker-compose's postgres.
//
// The "payment-void failure doesn't block expiry" scenario (bullet 3) is
// tested with an INJECTED FAKE BookingPaymentClient whose void() throws —
// this deliberately avoids depending on a live order-service for the
// required assertion (booking still expires; the void failure is
// best-effort). A REAL end-to-end void through order-service's
// /internal/booking-payments/void is exercised separately, gated behind an
// order-service reachability probe (same itOrderService pattern as
// booking.service.integration.test.ts), and skipped with a clear message if
// order-service isn't running.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  BookingStatusHistory,
  CancellationRefundPolicy,
  DepositType,
  EngagementKind,
  EngagementStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
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
import { EngagementService } from "../engagement/engagement.service.ts";
import type { BookingPaymentClient } from "./booking-payment.client.ts";
import { BookingReaperService } from "./booking-reaper.service.ts";
import { BookingStatusService } from "./booking-status.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

// order-service reachability probe (mirrors booking.service.integration
// .test.ts) — only the real-void end-to-end test needs it.
const ORDER_SERVICE_BASE_URL =
  process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
let orderServiceReachable = false;
if (LIVE_DB) {
  try {
    await fetch(ORDER_SERVICE_BASE_URL, { signal: AbortSignal.timeout(2_000) });
    orderServiceReachable = true;
  } catch (err) {
    console.warn(
      `[skip] the real-void reaper test requires order-service running on ${ORDER_SERVICE_BASE_URL} (set ORDER_SERVICE_URL); start it with: bun --env-file=.env apps/order-service/src/index.ts — probe error: ${(err as Error).message}`,
    );
  }
}
const itOrderService = orderServiceReachable ? it : it.skip;

// Fixed base day, far enough out to be inert to any OTHER reaper/job logic;
// each scenario gets its own offset slot so engagement ranges never overlap
// on the shared staff member (no GiST EXCLUDE collisions between scenarios).
const BASE_DAY = new Date(Date.now() + 11 * 24 * 3_600_000);
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

describeLive("BookingReaperService (live DB)", () => {
  let statusService: BookingStatusService;
  let engagementService: EngagementService;
  let vendorId: string;
  let customerId: string;
  let staffId: string;
  let offeringVenueId: string;
  let offeringDepositId: string;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
  const historyRepo = () => AppDataSource.getRepository(BookingStatusHistory);
  const paymentRepo = () => AppDataSource.getRepository(Payment);

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  const createdPaymentIds: string[] = [];
  let slotCursor = 0;

  function nextSlot() {
    slotCursor += 45;
    return slotAt(slotCursor);
  }

  // Backdates a row's created_at directly in Postgres (CreateDateColumn
  // always stamps NOW() on insert — this is the only way to simulate an
  // "aged" pending booking without sleeping the test for real minutes).
  async function backdateCreatedAt(bookingId: string, minutesAgo: number): Promise<void> {
    await bookingRepo()
      .createQueryBuilder()
      .update()
      .set({ created_at: () => `NOW() - INTERVAL '${minutesAgo} minutes'` })
      .where("id = :id", { id: bookingId })
      .execute();
  }

  async function seedPendingBooking(opts: {
    offeringId: string;
    paymentMode: ServicePaymentMode;
    paymentId?: string | null;
    ageMinutes: number; // how far in the past to backdate created_at
  }): Promise<{ booking: Booking; engagement: StaffEngagement }> {
    const slot = nextSlot();
    const engagement = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: slot.start,
      endsAt: slot.end,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.held,
      createdBy: customerId,
    });
    createdEngagementIds.push(engagement.id);

    const booking = await bookingRepo().save(
      bookingRepo().create({
        booking_number: `BRP${unique}${slotCursor}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        location_id: null,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: opts.offeringId,
        service_name: "Reaper Test Service",
        duration_minutes: 30,
        price_fils: 20_000,
        vat_fils: 952,
        deposit_fils: opts.paymentMode === ServicePaymentMode.deposit ? 4_000 : 0,
        deposit_type: DepositType.none,
        cancellation_window_hours: 24,
        cancellation_refund_policy: CancellationRefundPolicy.full,
        cancellation_penalty_percent: 100,
        reschedule_window_hours: 24,
        commission_rate: 10,
        commission_fils: 1900,
        starts_at: slot.start,
        ends_at: slot.end,
        status: BookingStatus.pending_payment,
        source: "marketplace",
        payment_mode: opts.paymentMode,
        payment_id: opts.paymentId ?? null,
      }),
    );
    createdBookingIds.push(booking.id);

    if (opts.ageMinutes > 0) {
      await backdateCreatedAt(booking.id, opts.ageMinutes);
      booking.created_at = new Date(Date.now() - opts.ageMinutes * 60_000);
    }

    return { booking, engagement };
  }

  // chk_payments_order_or_booking requires exactly one of order_id/booking_id
  // to be non-null, so the Payment row can only be inserted once a booking id
  // exists — mirrors booking.service.ts's real create-then-link order (booking
  // row first, then the payment intent call, then bookings.payment_id UPDATE).
  async function seedFakePaymentFor(bookingId: string, gatewayPaymentId: string): Promise<string> {
    const payment = await paymentRepo().save(
      paymentRepo().create({
        order_id: null,
        booking_id: bookingId,
        user_id: customerId,
        status: PaymentStatus.pending,
        payment_method: PaymentMethod.stripe,
        amount: 4_000,
        currency: "AED",
        gateway: "stripe",
        gateway_payment_id: gatewayPaymentId,
      }),
    );
    createdPaymentIds.push(payment.id);
    await bookingRepo()
      .createQueryBuilder()
      .update()
      .set({ payment_id: payment.id })
      .where("id = :id", { id: bookingId })
      .execute();
    return payment.id;
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
        first_name: "Reaper",
        last_name: "Customer",
        email: `booking-reaper-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Booking Reaper Test Vendor ${unique}`,
        slug: `booking-reaper-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `booking-reaper-vendor-${unique}@test.local`,
        contact_phone: "+971500000002",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Reaper Test Stylist ${unique}` }),
    );
    staffId = staff.id;

    const offeringVenue = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-reaper-test-venue-${unique}`,
        name: "Reaper Test Venue Offering",
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

    const offeringDeposit = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-reaper-test-deposit-${unique}`,
        name: "Reaper Test Deposit Offering",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 90,
        price_fils: 20_000,
        vat_rate: 5 as unknown as number,
        deposit_type: DepositType.percent,
        deposit_value: 20,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: ServicePaymentMode.deposit,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringDepositId = offeringDeposit.id;
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(
          `[booking-reaper.service.integration.test] cleanup step "${label}" failed`,
          err,
        );
      }
    }

    if (createdBookingIds.length) {
      await step("null out bookings.payment_id", () =>
        bookingRepo()
          .createQueryBuilder()
          .update()
          .set({ payment_id: null })
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
    }
    if (createdPaymentIds.length) {
      await step("delete payments", () =>
        paymentRepo()
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdPaymentIds })
          .execute(),
      );
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
    if (offeringVenueId || offeringDepositId) {
      await step("delete offerings", () =>
        AppDataSource.getRepository(ServiceOffering)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: [offeringVenueId, offeringDepositId].filter(Boolean) })
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
  }, 30_000);

  it("expires an aged pending_payment booking, releases the engagement (frees the slot), and writes a status-history row", async () => {
    const { booking, engagement } = await seedPendingBooking({
      offeringId: offeringVenueId,
      paymentMode: ServicePaymentMode.pay_at_venue,
      ageMinutes: 5,
    });

    // 1-minute window: the 5-minutes-old booking above is aged past it.
    const fakeClient = { void: async () => ({ paymentIntentId: "unused", status: "canceled" }) };
    const reaper = new BookingReaperService(
      bookingRepo(),
      paymentRepo(),
      statusService,
      fakeClient as unknown as BookingPaymentClient,
      1,
    );

    const summary = await reaper.reapExpired();

    expect(summary.expired).toBeGreaterThanOrEqual(1);
    expect(summary.errored).toBe(0);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.expired);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.released);

    const history = await historyRepo().findOne({
      where: { booking_id: booking.id },
      order: { created_at: "DESC" },
    });
    expect(history?.from_status).toBe(BookingStatus.pending_payment);
    expect(history?.to_status).toBe(BookingStatus.expired);
    expect(history?.actor_role).toBe("system");
    expect(history?.actor_id).toBeNull();
  });

  it("leaves a NON-aged pending_payment booking untouched", async () => {
    const { booking, engagement } = await seedPendingBooking({
      offeringId: offeringVenueId,
      paymentMode: ServicePaymentMode.pay_at_venue,
      ageMinutes: 0, // just created — well inside the 60-minute default window
    });

    const fakeClient = { void: async () => ({ paymentIntentId: "unused", status: "canceled" }) };
    const reaper = new BookingReaperService(
      bookingRepo(),
      paymentRepo(),
      statusService,
      fakeClient as unknown as BookingPaymentClient,
      60,
    );

    await reaper.reapExpired();

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.pending_payment);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.held);
  });

  it("a payment-void failure does not block expiry: booking still expires + slot still frees, errored is counted", async () => {
    const { booking, engagement } = await seedPendingBooking({
      offeringId: offeringDepositId,
      paymentMode: ServicePaymentMode.deposit,
      ageMinutes: 5,
    });
    await seedFakePaymentFor(booking.id, `pi_fake_${unique}_1`);

    const throwingClient = {
      void: async () => {
        throw new Error("order-service unreachable (simulated)");
      },
    };
    const reaper = new BookingReaperService(
      bookingRepo(),
      paymentRepo(),
      statusService,
      throwingClient as unknown as BookingPaymentClient,
      1,
    );

    const summary = await reaper.reapExpired();

    expect(summary.expired).toBeGreaterThanOrEqual(1);
    expect(summary.errored).toBeGreaterThanOrEqual(1);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(dbBooking?.status).toBe(BookingStatus.expired);

    const dbEngagement = await engagementRepo().findOne({ where: { id: engagement.id } });
    expect(dbEngagement?.status).toBe(EngagementStatus.released);
  });

  // Real end-to-end void through order-service's
  // /internal/booking-payments/void — requires a running order-service
  // (BOOKING_LIVE_DB=1 + `bun --env-file=.env apps/order-service/src/index.ts`).
  // Skipped with a clear message (via itOrderService) when it isn't reachable.
  itOrderService(
    "voids a real (fake-gateway-id) deposit PaymentIntent through order-service on expiry",
    async () => {
      const { BookingPaymentClient: RealClient } = await import("./booking-payment.client.ts");
      const { booking } = await seedPendingBooking({
        offeringId: offeringDepositId,
        paymentMode: ServicePaymentMode.deposit,
        ageMinutes: 5,
      });
      await seedFakePaymentFor(booking.id, `pi_nonexistent_${unique}_2`);

      const reaper = new BookingReaperService(
        bookingRepo(),
        paymentRepo(),
        statusService,
        new RealClient(),
        1,
      );

      // The gateway_payment_id is a fake pi_ that never existed at Stripe, so
      // order-service's paymentIntents.cancel call will itself fail — this
      // still proves the wiring (client -> order-service -> Stripe call
      // attempted) without needing a genuine live PaymentIntent fixture, and
      // exercises the exact best-effort catch path this task requires.
      const summary = await reaper.reapExpired();
      expect(summary.expired).toBeGreaterThanOrEqual(1);

      const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(BookingStatus.expired);
    },
    20_000,
  );
});
