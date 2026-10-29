// no-show.service.integration.test.ts
//
// Live Postgres (+ real order-service HTTP + Stripe TEST mode for the money leg)
// under BOOKING_LIVE_DB=1. Mirrors cancel.service.integration.test.ts's
// live-gate / order-service-reachability-skip / cleanup patterns. Covers the
// brief's five named cases:
//   (1) mark no-show CAPTURES the penalty (partial-capture a prepay auth) —
//       needs order-service + Stripe (itOrderService).
//   (2) per-vendor strike count INCREMENTS with each no_show.
//   (3) over-threshold customer is forced off pay_at_venue AT that vendor but
//       NOT at another vendor.
//   (4) the platform backstop forces deposit EVERYWHERE (even at a vendor with
//       zero strikes) once the platform count is reached.
//   (5) no-show AFTER the auto-complete moment -> 422.
// Cases 2-5 are pure DB (no order-service) so they run on a plain live `it`.
// Kept lean; awaits are plain (never `expect(promise).resolves`, which hangs
// live suites — see the bun shared-pg-pool guidance).
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
import Stripe from "stripe";
import { AvailabilityCache } from "../availability/availability-cache.ts";
import { EngagementService } from "../engagement/engagement.service.ts";
import { BookingPaymentClient } from "./booking-payment.client.ts";
import { BookingStatusService } from "./booking-status.service.ts";
import { NoShowService } from "./no-show.service.ts";
import { StrikeService } from "./strike.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;
const GRACE_HOURS = 24;
const HOUR_MS = 3_600_000;

if (LIVE_DB && !config.stripe.secretKey.startsWith("sk_test_")) {
  throw new Error(
    "BOOKING_LIVE_DB=1 requires a Stripe TEST secret key (sk_test_...) — refusing to run against a live key.",
  );
}

const ORDER_SERVICE_BASE_URL =
  process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
let orderServiceReachable = false;
if (LIVE_DB) {
  try {
    await fetch(ORDER_SERVICE_BASE_URL, { signal: AbortSignal.timeout(2_000) });
    orderServiceReachable = true;
  } catch (err) {
    console.warn(
      `[skip] no-show money test requires order-service on ${ORDER_SERVICE_BASE_URL}; start it with: bun --env-file=.env apps/order-service/src/index.ts — probe error: ${(err as Error).message}`,
    );
  }
}
const itOrderService = orderServiceReachable ? it : it.skip;

const stripe = LIVE_DB
  ? new Stripe(config.stripe.secretKey, { apiVersion: "2026-03-25.dahlia" })
  : null;
const unique = Date.now();
const COMPLIANT_CUSTOMER_FIELDS = {
  name: "Booking No-Show Test Customer",
  address: { line1: "Marina Walk", city: "Dubai", country: "AE" },
};

function fakeNotificationQueue() {
  const events: Array<{ name: string; data: any }> = [];
  return {
    events,
    add: async (name: string, data: any) => {
      events.push({ name, data });
      return { id: "job-1" };
    },
  };
}

describeLive("NoShowService (live DB; money leg needs order-service + Stripe test mode)", () => {
  let customerId: string;
  let adminId: string;
  let vendorAId: string;
  let vendorBId: string;
  let staffAId: string;
  let staffBId: string;
  let offeringAId: string;
  let offeringBId: string;

  let noShowService: NoShowService;
  let engagementService: EngagementService;
  let notificationQueue: ReturnType<typeof fakeNotificationQueue>;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const paymentRepo = () => AppDataSource.getRepository(Payment);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
  const historyRepo = () => AppDataSource.getRepository(BookingStatusHistory);

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  const createdUserIds: string[] = [];
  let slotCursor = 0;

  // Seeds a booking in a given status directly (with its own non-overlapping
  // engagement). Used both for confirmed bookings (money/window cases) and for
  // pre-existing no_show rows (strike-count cases).
  async function seedBooking(opts: {
    customerUserId: string;
    vendorId: string;
    staffId: string;
    offeringId: string;
    status: BookingStatus;
    paymentMode: ServicePaymentMode;
    startsAt: Date;
    priceFils: number;
    depositFils?: number;
    refundPolicy?: CancellationRefundPolicy;
    penaltyPercent?: number;
  }): Promise<Booking> {
    slotCursor += 1;
    const startsAt = opts.startsAt;
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    const engagement = await engagementService.reserve({
      staffMemberId: opts.staffId,
      vendorId: opts.vendorId,
      startsAt,
      endsAt,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: opts.customerUserId,
    });
    createdEngagementIds.push(engagement.id);

    const booking = await bookingRepo().save(
      bookingRepo().create({
        booking_number: `BNS${unique}${slotCursor}`,
        customer_user_id: opts.customerUserId,
        vendor_id: opts.vendorId,
        location_id: null,
        staff_member_id: opts.staffId,
        engagement_id: engagement.id,
        service_offering_id: opts.offeringId,
        service_name: "Booking No-Show Test Service",
        duration_minutes: 30,
        price_fils: opts.priceFils,
        vat_fils: 0,
        deposit_fils: opts.depositFils ?? 0,
        deposit_type: opts.depositFils ? DepositType.fixed : DepositType.none,
        cancellation_window_hours: 24,
        cancellation_refund_policy: opts.refundPolicy ?? CancellationRefundPolicy.full,
        cancellation_penalty_percent: opts.penaltyPercent ?? 100,
        reschedule_window_hours: 24,
        commission_rate: 10,
        commission_fils: 1000,
        starts_at: startsAt,
        ends_at: endsAt,
        status: opts.status,
        source: "marketplace",
        payment_mode: opts.paymentMode,
      }),
    );
    createdBookingIds.push(booking.id);
    return booking;
  }

  // A distinct throwaway customer per strike scenario, so absolute counts are
  // independent between tests.
  async function makeCustomer(tag: string): Promise<string> {
    const u = await AppDataSource.getRepository(User).save(
      AppDataSource.getRepository(User).create({
        first_name: "NoShow",
        last_name: tag,
        email: `booking-noshow-${tag}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    createdUserIds.push(u.id);
    return u.id;
  }

  // A no_show seed helper (slots stepped an hour apart per call to dodge the
  // per-staff EXCLUDE overlap constraint). Uses far-future slots so they never
  // collide with the money/window cases' near-now slots.
  let farFutureCursor = 0;
  async function seedNoShow(
    customerUserId: string,
    vendorId: string,
    staffId: string,
    offeringId: string,
  ) {
    farFutureCursor += 1;
    await seedBooking({
      customerUserId,
      vendorId,
      staffId,
      offeringId,
      status: BookingStatus.no_show,
      paymentMode: ServicePaymentMode.pay_at_venue,
      startsAt: new Date(Date.now() + (1000 + farFutureCursor) * HOUR_MS),
      priceFils: 10_000,
    });
  }

  beforeAll(async () => {
    await ensureDatabase();

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "NoShow",
        last_name: "Customer",
        email: `booking-noshow-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;
    createdUserIds.push(customerId);

    // A real admin user so the status-history actor_id (a uuid column) is valid.
    const admin = await userRepo.save(
      userRepo.create({
        first_name: "NoShow",
        last_name: "Admin",
        email: `booking-noshow-admin-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.admin,
        status: UserStatus.active,
      }),
    );
    adminId = admin.id;
    createdUserIds.push(adminId);

    async function makeVendor(
      tag: string,
    ): Promise<{ vendorId: string; staffId: string; offeringId: string }> {
      const vendor = await vendorRepo.save(
        vendorRepo.create({
          name: `Booking No-Show Vendor ${tag} ${unique}`,
          slug: `booking-noshow-vendor-${tag}-${unique}`,
          business_name: "Test Salon",
          business_type: "salon",
          contact_email: `booking-noshow-vendor-${tag}-${unique}@test.local`,
          contact_phone: "+971500000005",
          status: VendorStatus.approved,
        }),
      );
      const staff = await staffRepo.save(
        staffRepo.create({ vendor_id: vendor.id, name: `No-Show Stylist ${tag} ${unique}` }),
      );
      const offering = await offeringRepo.save(
        offeringRepo.create({
          vendor_id: vendor.id,
          slug: `booking-noshow-offering-${tag}-${unique}`,
          name: `No-Show Offering ${tag}`,
          duration_minutes: 30,
          buffer_before_minutes: 0,
          buffer_after_minutes: 0,
          slot_step_minutes: 15,
          min_notice_minutes: 0,
          max_advance_days: 3650,
          price_fils: 10_000,
          vat_rate: 5 as unknown as number,
          deposit_type: DepositType.none,
          deposit_value: 0,
          cancellation_window_hours: 24,
          reschedule_window_hours: 24,
          payment_mode: ServicePaymentMode.prepay,
          status: ServiceOfferingStatus.published,
        }),
      );
      return { vendorId: vendor.id, staffId: staff.id, offeringId: offering.id };
    }

    const a = await makeVendor("a");
    const b = await makeVendor("b");
    vendorAId = a.vendorId;
    staffAId = a.staffId;
    offeringAId = a.offeringId;
    vendorBId = b.vendorId;
    staffBId = b.staffId;
    offeringBId = b.offeringId;

    const availabilityCache = new AvailabilityCache();
    engagementService = new EngagementService(engagementRepo(), availabilityCache);
    const bookingPaymentClient = new BookingPaymentClient();
    const bookingStatusService = new BookingStatusService(bookingRepo(), availabilityCache);
    notificationQueue = fakeNotificationQueue();
    noShowService = new NoShowService(
      bookingRepo(),
      paymentRepo(),
      bookingStatusService,
      bookingPaymentClient,
      notificationQueue as any,
      GRACE_HOURS,
      "https://materialhubuae.com",
    );
  }, 60_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[no-show.service.integration.test] cleanup step "${label}" failed`, err);
      }
    }

    if (createdBookingIds.length) {
      await step("null out bookings.payment_id/escrow_hold_id", () =>
        bookingRepo()
          .createQueryBuilder()
          .update()
          .set({ payment_id: null, escrow_hold_id: null })
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
      await step("delete payments (by booking_id)", () =>
        paymentRepo()
          .createQueryBuilder()
          .delete()
          .where("booking_id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
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
    for (const [label, repo, ids] of [
      ["staff", AppDataSource.getRepository(StaffMember), [staffAId, staffBId]],
      ["offerings", AppDataSource.getRepository(ServiceOffering), [offeringAId, offeringBId]],
      ["vendors", AppDataSource.getRepository(Vendor), [vendorAId, vendorBId]],
      ["users", AppDataSource.getRepository(User), createdUserIds],
    ] as const) {
      const filtered = (ids as string[]).filter(Boolean);
      if (filtered.length) {
        await step(`delete ${label}`, () =>
          (repo as any)
            .createQueryBuilder()
            .delete()
            .where("id IN (:...ids)", { ids: filtered })
            .execute(),
        );
      }
    }
  }, 60_000);

  // ── (1) penalty capture (money) ──────────────────────────────────────────
  itOrderService(
    "(1) marking no-show partial-captures the policy penalty from a prepay authorization",
    async () => {
      // Booking started 1h ago, ended 30m ago -> inside [starts, ends+24h).
      const startsAt = new Date(Date.now() - 1 * HOUR_MS);
      const booking = await seedBooking({
        customerUserId: customerId,
        vendorId: vendorAId,
        staffId: staffAId,
        offeringId: offeringAId,
        status: BookingStatus.confirmed,
        paymentMode: ServicePaymentMode.prepay,
        startsAt,
        priceFils: 10_000,
        refundPolicy: CancellationRefundPolicy.percent,
        penaltyPercent: 40,
      });

      // Mint a REAL manual-capture authorization (requires_capture PI) and hang
      // it on escrow_hold_id, exactly the shape the booking-auth job leaves.
      const cust = await stripe!.customers.create({
        email: `booking-noshow-1-${unique}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const pm = await stripe!.paymentMethods.attach("pm_card_visa", { customer: cust.id });
      const authPi = await stripe!.paymentIntents.create({
        amount: 10_000,
        currency: "aed",
        customer: cust.id,
        payment_method: pm.id,
        payment_method_types: ["card"],
        capture_method: "manual",
        confirm: true,
        off_session: true,
        description: `MaterialHub booking no-show test auth ${unique}`,
      });
      expect(authPi.status).toBe("requires_capture");
      const authPayment = await paymentRepo().save(
        paymentRepo().create({
          booking_id: booking.id,
          order_id: null,
          user_id: customerId,
          status: "authorized" as any,
          payment_method: "stripe" as any,
          amount: 10_000,
          currency: "AED",
          gateway: "stripe",
          gateway_payment_id: authPi.id,
          gateway_response: { kind: "payment_intent" },
        }),
      );
      await bookingRepo().update({ id: booking.id }, { escrow_hold_id: authPayment.id });

      // ── The actual thing under test ──
      const result = await noShowService.markNoShow(booking.id, { id: adminId, role: "admin" });

      expect(result.action).toBe("partial_capture");
      expect(result.forfeitFils).toBe(4_000); // 40% of 10_000
      expect(result.refundFils).toBe(6_000);
      expect(result.booking.status).toBe(BookingStatus.no_show);

      // Stripe captured ONLY the penalty; the remainder auto-released.
      const afterPi = await stripe!.paymentIntents.retrieve(authPi.id);
      expect(afterPi.status).toBe("succeeded");
      expect(afterPi.amount_received).toBe(4_000);

      // Engagement is NOT released on no_show (slot time already passed).
      const dbEng = await engagementRepo().findOne({ where: { id: booking.engagement_id } });
      expect(dbEng!.status).toBe(EngagementStatus.confirmed);

      // Customer notification carries the penalty breakdown + dispute link.
      const evt = notificationQueue.events.find((e) => e.data?.data?.bookingId === booking.id);
      expect(evt?.data.userId).toBe(customerId);
      expect(evt?.data.data.penalty.forfeitFils).toBe(4_000);
      expect(evt?.data.data.disputeUrl).toContain(`/support/bookings/${booking.id}`);

      // Forfeit recorded in the single status-history row.
      const history = await historyRepo().find({ where: { booking_id: booking.id } });
      expect(history).toHaveLength(1);
      expect(history[0]!.to_status).toBe(BookingStatus.no_show);
      expect(history[0]!.reason).toContain("forfeit=4000 fils");
    },
    45_000,
  );

  // ── (2) per-vendor strike increment ──────────────────────────────────────
  it("(2) per-vendor no-show count increments with each no_show", async () => {
    const cust = await makeCustomer("increment");
    const strikes = new StrikeService(bookingRepo(), 3, 8);

    expect(await strikes.customerNoShowCount(cust, vendorAId)).toBe(0);
    await seedNoShow(cust, vendorAId, staffAId, offeringAId);
    expect(await strikes.customerNoShowCount(cust, vendorAId)).toBe(1);
    await seedNoShow(cust, vendorAId, staffAId, offeringAId);
    expect(await strikes.customerNoShowCount(cust, vendorAId)).toBe(2);
    // Platform-wide count matches (all at one vendor so far).
    expect(await strikes.customerNoShowCount(cust)).toBe(2);
  });

  // ── (3) over per-vendor threshold: blocked at THAT vendor, not another ────
  it("(3) at/over the per-vendor threshold, pay_at_venue is blocked at that vendor but NOT another", async () => {
    const cust = await makeCustomer("pervendor");
    // Per-vendor threshold 3; platform threshold high so ONLY the per-vendor
    // rule can fire here.
    const strikes = new StrikeService(bookingRepo(), 3, 1000);

    for (let i = 0; i < 3; i++) await seedNoShow(cust, vendorAId, staffAId, offeringAId);

    const atA = await strikes.checkPayAtVenue(cust, vendorAId);
    expect(atA.blocked).toBe(true);
    expect(atA.vendorCount).toBe(3);

    const atB = await strikes.checkPayAtVenue(cust, vendorBId);
    expect(atB.blocked).toBe(false);
    expect(atB.vendorCount).toBe(0);
  });

  // ── (4) platform backstop forces deposit everywhere ──────────────────────
  it("(4) at/over the platform threshold, pay_at_venue is blocked EVERYWHERE (even a zero-strike vendor)", async () => {
    const cust = await makeCustomer("platform");
    // Per-vendor threshold set unreachably high so the per-vendor rule can NEVER
    // fire — only the platform backstop can. 8 no_shows all at vendorA.
    const strikes = new StrikeService(bookingRepo(), 1000, 8);

    for (let i = 0; i < 8; i++) await seedNoShow(cust, vendorAId, staffAId, offeringAId);

    // Blocked at vendorA...
    const atA = await strikes.checkPayAtVenue(cust, vendorAId);
    expect(atA.blocked).toBe(true);
    expect(atA.platformCount).toBe(8);
    // ...and at vendorB, where this customer has ZERO strikes — the platform
    // backstop catches the serial no-shower everywhere.
    const atB = await strikes.checkPayAtVenue(cust, vendorBId);
    expect(atB.blocked).toBe(true);
    expect(atB.vendorCount).toBe(0);
    expect(atB.reason).toContain("platform");
  });

  // ── (5) no-show after the auto-complete moment -> 422 ─────────────────────
  it("(5) marking no-show after ends_at + grace is rejected (422)", async () => {
    // Ended 25h ago, grace 24h -> auto-complete moment was 1h ago -> too late.
    const startsAt = new Date(Date.now() - 26 * HOUR_MS);
    const booking = await seedBooking({
      customerUserId: customerId,
      vendorId: vendorAId,
      staffId: staffAId,
      offeringId: offeringAId,
      status: BookingStatus.confirmed,
      paymentMode: ServicePaymentMode.pay_at_venue,
      startsAt,
      priceFils: 10_000,
    });

    let threw: any;
    try {
      await noShowService.markNoShow(booking.id, { id: adminId, role: "admin" });
    } catch (err) {
      threw = err;
    }
    expect(threw?.statusCode).toBe(422);
    expect(threw?.code).toBe("no_show_window");

    // Booking stays confirmed (unchanged).
    const after = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(after!.status).toBe(BookingStatus.confirmed);
  });
});
