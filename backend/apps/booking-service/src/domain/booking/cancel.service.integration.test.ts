// cancel.service.integration.test.ts
//
// Live Postgres + real order-service HTTP + real Stripe TEST mode
// (BOOKING_LIVE_DB=1). Mirrors booking-completion.service.integration.test.ts's
// live-gate + order-service-reachability-skip + cleanup patterns. Exercises the
// REAL CancelService -> BookingPaymentClient (void / refund) ->
// order-service's /internal/booking-payments/* flow (Phase 5 Task 4, spec §5.3)
// for the brief's two named money cases:
//   (a) in-window prepay  -> the authorization PaymentIntent is VOIDED (Stripe
//       status "canceled"), booking cancelled, slot freed.
//   (b) out-of-window deposit (percent policy) -> the penalty is kept and the
//       REMAINDER is refunded (Stripe refund created, payments.refunded_amount
//       set), forfeit/refund recorded in the status-history reason.
//
// SAFETY: refuses to run against a live Stripe key — only ever exercises
// `sk_test_...`. Kept lean (2 live tests) per the bun shared-pg-pool guidance;
// awaits are plain (never `expect(promise).resolves`, which hangs live suites).
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
import { getBookingAuthQueue } from "./booking-auth.job.ts";
import { BookingAuthService } from "./booking-auth.service.ts";
import { BookingPaymentClient } from "./booking-payment.client.ts";
import { BookingStatusService } from "./booking-status.service.ts";
import { CancelService } from "./cancel.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

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
      `[skip] cancel tests require order-service running on ${ORDER_SERVICE_BASE_URL}; start it with: bun --env-file=.env apps/order-service/src/index.ts — probe error: ${(err as Error).message}`,
    );
  }
}
const itOrderService = orderServiceReachable ? it : it.skip;

const stripe = LIVE_DB
  ? new Stripe(config.stripe.secretKey, { apiVersion: "2026-03-25.dahlia" })
  : null;
const unique = Date.now();
const COMPLIANT_CUSTOMER_FIELDS = {
  name: "Booking Cancel Test Customer",
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

describeLive("CancelService (live DB + real order-service HTTP + Stripe test mode)", () => {
  let vendorId: string;
  let customerId: string;
  let staffId: string;
  let offeringPrepayId: string;
  let offeringDepositId: string;

  let cancelService: CancelService;
  let bookingAuthService: BookingAuthService;
  let engagementService: EngagementService;
  let notificationQueue: ReturnType<typeof fakeNotificationQueue>;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const paymentRepo = () => AppDataSource.getRepository(Payment);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
  const historyRepo = () => AppDataSource.getRepository(BookingStatusHistory);
  const authQueue = getBookingAuthQueue();

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  let slotCursor = 0;

  async function seedBooking(opts: {
    startsAt: Date;
    offeringId: string;
    paymentMode: ServicePaymentMode;
    priceFils: number;
    depositFils?: number;
    refundPolicy?: CancellationRefundPolicy;
    penaltyPercent?: number;
  }): Promise<Booking> {
    slotCursor += 1;
    const startsAt = opts.startsAt;
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    const engagement = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt,
      endsAt,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: customerId,
    });
    createdEngagementIds.push(engagement.id);

    const booking = await bookingRepo().save(
      bookingRepo().create({
        booking_number: `BCX${unique}${slotCursor}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        location_id: null,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: opts.offeringId,
        service_name: "Booking Cancel Test Service",
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
        status: BookingStatus.confirmed,
        source: "marketplace",
        payment_mode: opts.paymentMode,
      }),
    );
    createdBookingIds.push(booking.id);
    return booking;
  }

  beforeAll(async () => {
    await ensureDatabase();

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Cancel",
        last_name: "Customer",
        email: `booking-cancel-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Booking Cancel Test Vendor ${unique}`,
        slug: `booking-cancel-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `booking-cancel-vendor-${unique}@test.local`,
        contact_phone: "+971500000004",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Cancel Test Stylist ${unique}` }),
    );
    staffId = staff.id;

    const offeringPrepay = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-cancel-test-prepay-${unique}`,
        name: "Cancel Test Prepay Offering",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 365,
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
    offeringPrepayId = offeringPrepay.id;

    const offeringDeposit = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-cancel-test-deposit-${unique}`,
        name: "Cancel Test Deposit Offering",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 365,
        price_fils: 20_000,
        vat_rate: 5 as unknown as number,
        deposit_type: DepositType.fixed,
        deposit_value: 5_000,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: ServicePaymentMode.deposit,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringDepositId = offeringDeposit.id;

    const availabilityCache = new AvailabilityCache();
    engagementService = new EngagementService(engagementRepo(), availabilityCache);
    const bookingPaymentClient = new BookingPaymentClient();
    const bookingStatusService = new BookingStatusService(bookingRepo(), availabilityCache);
    bookingAuthService = new BookingAuthService(
      bookingRepo(),
      paymentRepo(),
      bookingPaymentClient,
      bookingStatusService,
      authQueue,
    );
    notificationQueue = fakeNotificationQueue();
    cancelService = new CancelService(
      bookingRepo(),
      paymentRepo(),
      bookingStatusService,
      bookingPaymentClient,
      notificationQueue as any,
    );
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[cancel.service.integration.test] cleanup step "${label}" failed`, err);
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
    if (staffId) {
      await step("delete staff", () =>
        AppDataSource.getRepository(StaffMember)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: staffId })
          .execute(),
      );
    }
    if (offeringPrepayId || offeringDepositId) {
      await step("delete offerings", () =>
        AppDataSource.getRepository(ServiceOffering)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: [offeringPrepayId, offeringDepositId].filter(Boolean) })
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

  itOrderService(
    "(a) in-window PREPAY: cancel VOIDS the authorization (Stripe canceled), booking cancelled, slot freed",
    async () => {
      // 15 days out -> comfortably in-window (24h cancellation window).
      const booking = await seedBooking({
        startsAt: new Date(Date.now() + 15 * 24 * 3_600_000),
        offeringId: offeringPrepayId,
        paymentMode: ServicePaymentMode.prepay,
        priceFils: 10_000,
      });

      // Mint a REAL off-session authorization (requires_capture PI on
      // escrow_hold_id) via the auth job, mirroring the completion suite.
      const cust = await stripe!.customers.create({
        email: `booking-cancel-a-${unique}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const pm = await stripe!.paymentMethods.attach("pm_card_visa", { customer: cust.id });
      const setupPayment = await paymentRepo().save(
        paymentRepo().create({
          booking_id: booking.id,
          order_id: null,
          user_id: customerId,
          status: "authorized" as any,
          payment_method: "stripe" as any,
          amount: 0,
          currency: "AED",
          gateway: "stripe",
          gateway_payment_id: `seti_cancel_${unique}`,
          gateway_response: {
            kind: "setup_intent",
            stripe_customer_id: cust.id,
            payment_method_id: pm.id,
          },
        }),
      );
      await bookingRepo().update({ id: booking.id }, { payment_id: setupPayment.id });

      await bookingAuthService.runAuthorizeJob(booking.id);
      const authorized = await bookingRepo().findOne({ where: { id: booking.id } });
      expect(authorized?.escrow_hold_id).toBeTruthy();
      const authPayment = await paymentRepo().findOne({
        where: { id: authorized!.escrow_hold_id as string },
      });
      const authPi = authPayment!.gateway_payment_id as string;
      const beforePi = await stripe!.paymentIntents.retrieve(authPi);
      expect(beforePi.status).toBe("requires_capture");

      // ── The actual thing under test ──
      const result = await cancelService.cancel(booking.id, { id: customerId, role: "customer" });

      expect(result.withinWindow).toBe(true);
      expect(result.action).toBe("void");
      expect(result.forfeitFils).toBe(0);
      expect(result.refundFils).toBe(10_000);
      expect(result.booking.status).toBe(BookingStatus.cancelled);

      // Stripe authorization is released.
      const afterPi = await stripe!.paymentIntents.retrieve(authPi);
      expect(afterPi.status).toBe("canceled");

      // Slot freed (engagement released).
      const dbEng = await engagementRepo().findOne({ where: { id: booking.engagement_id } });
      expect(dbEng!.status).toBe(EngagementStatus.released);

      // Customer notification emitted.
      const evt = notificationQueue.events.find((e) => e.data?.data?.bookingId === booking.id);
      expect(evt?.data.userId).toBe(customerId);
    },
    30_000,
  );

  itOrderService(
    "(b) out-of-window DEPOSIT (percent 40%): keeps the penalty, refunds the remainder, records forfeit/refund in history",
    async () => {
      // ~5h out -> out-of-window (24h cancellation window).
      const booking = await seedBooking({
        startsAt: new Date(Date.now() + 5 * 3_600_000),
        offeringId: offeringDepositId,
        paymentMode: ServicePaymentMode.deposit,
        priceFils: 20_000,
        depositFils: 5_000,
        refundPolicy: CancellationRefundPolicy.percent,
        penaltyPercent: 40,
      });

      // A REAL captured deposit PaymentIntent so RefundService has something to
      // refund (it resolves the captured Payment row by booking_id).
      // off_session: true + pm_card_visa captures immediately in test mode with
      // no 3DS challenge (a merchant-initiated charge), unlike
      // automatic_payment_methods which can return "requires_action".
      // The connected Stripe account is India-regulated — off-session (export)
      // charges require a description + a customer with name & address (same
      // compliance fields order-service's own createBookingDepositIntent sets).
      const depCust = await stripe!.customers.create({
        email: `booking-cancel-b-${unique}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const depPm = await stripe!.paymentMethods.attach("pm_card_visa", { customer: depCust.id });
      const pi = await stripe!.paymentIntents.create({
        amount: 5_000,
        currency: "aed",
        customer: depCust.id,
        payment_method: depPm.id,
        payment_method_types: ["card"],
        confirm: true,
        off_session: true,
        description: `MaterialHub booking cancel test deposit ${unique}`,
      });
      expect(pi.status).toBe("succeeded");
      await paymentRepo().save(
        paymentRepo().create({
          booking_id: booking.id,
          order_id: null,
          user_id: customerId,
          status: "captured" as any,
          payment_method: "stripe" as any,
          amount: 5_000,
          currency: "AED",
          gateway: "stripe",
          gateway_payment_id: pi.id,
          gateway_response: { kind: "payment_intent" },
        }),
      );

      // ── The actual thing under test ──
      const result = await cancelService.cancel(booking.id, { id: customerId, role: "customer" });

      expect(result.withinWindow).toBe(false);
      expect(result.forfeitFils).toBe(2_000); // 40% of the 5_000 deposit
      expect(result.refundFils).toBe(3_000);
      expect(result.action).toBe("refund");
      expect(result.booking.status).toBe(BookingStatus.cancelled);

      // Stripe refund created; payments.refunded_amount reflects the remainder.
      const refundedPayment = await paymentRepo().findOne({
        where: { booking_id: booking.id } as any,
      });
      expect((refundedPayment as any).refunded_amount).toBe(3_000);
      const refunds = await stripe!.refunds.list({ payment_intent: pi.id });
      expect(refunds.data.length).toBeGreaterThan(0);
      expect(refunds.data[0]!.amount).toBe(3_000);

      // Forfeit/refund recorded in the single status-history row's reason.
      const history = await historyRepo().find({ where: { booking_id: booking.id } });
      expect(history).toHaveLength(1);
      expect(history[0]!.to_status).toBe(BookingStatus.cancelled);
      expect(history[0]!.reason).toContain("forfeit=2000 fils");
      expect(history[0]!.reason).toContain("refund=3000 fils");
      expect(history[0]!.reason).toContain("out-of-window");
    },
    30_000,
  );
});
