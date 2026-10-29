// booking-completion.service.integration.test.ts
//
// Live Postgres + real order-service HTTP + real Stripe TEST mode
// (BOOKING_LIVE_DB=1). Mirrors booking-auth.service.integration.test.ts's
// live-gate + order-service-reachability-skip + cleanup patterns — the
// end-to-end counterpart to booking-status.service.integration.test.ts's
// stub-hook orchestration tests: this suite exercises the REAL
// BookingCompletionService -> BookingPaymentClient.complete ->
// order-service's /internal/booking-payments/complete flow (Phase 4 Task 9,
// spec §5.2 step 3 / §5.3 "On completed").
//
// SAFETY: refuses to run against a live Stripe key — only ever exercises
// `sk_test_...`.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  BookingStatusHistory,
  Commission,
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
import { EngagementService } from "../engagement/engagement.service.ts";
import { getBookingAuthQueue } from "./booking-auth.job.ts";
import { BookingAuthService } from "./booking-auth.service.ts";
import { BookingCompletionService } from "./booking-completion.service.ts";
import { BookingPaymentClient } from "./booking-payment.client.ts";
import { BookingStatusService } from "./booking-status.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

if (LIVE_DB && !config.stripe.secretKey.startsWith("sk_test_")) {
  throw new Error(
    "BOOKING_LIVE_DB=1 requires a Stripe TEST secret key (sk_test_...) — refusing to run against a live key.",
  );
}

// --- order-service reachability probe (mirrors booking-auth.service.integration.test.ts) ---
const ORDER_SERVICE_BASE_URL =
  process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
let orderServiceReachable = false;
if (LIVE_DB) {
  try {
    await fetch(ORDER_SERVICE_BASE_URL, { signal: AbortSignal.timeout(2_000) });
    orderServiceReachable = true;
  } catch (err) {
    console.warn(
      `[skip] booking-completion tests require order-service running on ${ORDER_SERVICE_BASE_URL}; start it with: bun --env-file=.env apps/order-service/src/index.ts — probe error: ${(err as Error).message}`,
    );
  }
}
const itOrderService = orderServiceReachable ? it : it.skip;

const stripe = LIVE_DB
  ? new Stripe(config.stripe.secretKey, { apiVersion: "2026-03-25.dahlia" })
  : null;
const unique = Date.now();
const COMPLIANT_CUSTOMER_FIELDS = {
  name: "Booking Completion Test Customer",
  address: { line1: "Marina Walk", city: "Dubai", country: "AE" },
};

describeLive(
  "BookingStatusService.completeBooking (live DB + real order-service HTTP + Stripe test mode)",
  () => {
    let vendorId: string;
    let customerId: string;
    let staffId: string;
    let offeringPrepayId: string;
    let offeringVenueId: string;

    let bookingStatusService: BookingStatusService;
    let bookingAuthService: BookingAuthService;
    let engagementService: EngagementService;

    const bookingRepo = () => AppDataSource.getRepository(Booking);
    const paymentRepo = () => AppDataSource.getRepository(Payment);
    const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
    const historyRepo = () => AppDataSource.getRepository(BookingStatusHistory);
    const commissionRepo = () => AppDataSource.getRepository(Commission);
    const authQueue = getBookingAuthQueue();

    const createdBookingIds: string[] = [];
    const createdEngagementIds: string[] = [];
    const createdCommissionIds: string[] = [];
    let slotCursor = 0;

    function nextSlotStartsAt(daysOut: number): Date {
      slotCursor += 1;
      const d = new Date(Date.now() + daysOut * 24 * 3_600_000);
      d.setUTCHours(d.getUTCHours() + slotCursor * 2);
      return d;
    }

    async function seedSavedCard(): Promise<{ customerId: string; pmId: string }> {
      const cust = await stripe!.customers.create({
        email: `booking-complete-${unique}-${slotCursor}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const pm = await stripe!.paymentMethods.attach("pm_card_visa", { customer: cust.id });
      return { customerId: cust.id, pmId: pm.id };
    }

    async function seedBooking(opts: {
      daysOut: number;
      offeringId: string;
      paymentMode: ServicePaymentMode;
      commissionRate?: number;
      commissionFils?: number;
      priceFils?: number;
      vatFils?: number;
    }): Promise<Booking> {
      const startsAt = nextSlotStartsAt(opts.daysOut);
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
          booking_number: `BCM${unique}${slotCursor}`,
          customer_user_id: customerId,
          vendor_id: vendorId,
          location_id: null,
          staff_member_id: staffId,
          engagement_id: engagement.id,
          service_offering_id: opts.offeringId,
          service_name: "Booking Completion Test Service",
          duration_minutes: 30,
          price_fils: opts.priceFils ?? 10_000,
          vat_fils: opts.vatFils ?? 0,
          deposit_fils: 0,
          deposit_type: DepositType.none,
          cancellation_window_hours: 24,
          reschedule_window_hours: 24,
          commission_rate: opts.commissionRate ?? 15,
          commission_fils: opts.commissionFils ?? 1500,
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
          first_name: "Completion",
          last_name: "Customer",
          email: `booking-completion-svc-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      );
      customerId = customer.id;

      const vendor = await vendorRepo.save(
        vendorRepo.create({
          name: `Booking Completion Test Vendor ${unique}`,
          slug: `booking-completion-test-vendor-${unique}`,
          business_name: "Test Salon",
          business_type: "salon",
          contact_email: `booking-completion-vendor-${unique}@test.local`,
          contact_phone: "+971500000003",
          status: VendorStatus.approved,
        }),
      );
      vendorId = vendor.id;

      const staff = await staffRepo.save(
        staffRepo.create({ vendor_id: vendorId, name: `Completion Test Stylist ${unique}` }),
      );
      staffId = staff.id;

      const offeringPrepay = await offeringRepo.save(
        offeringRepo.create({
          vendor_id: vendorId,
          slug: `booking-completion-test-prepay-${unique}`,
          name: "Completion Test Prepay Offering",
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

      const offeringVenue = await offeringRepo.save(
        offeringRepo.create({
          vendor_id: vendorId,
          slug: `booking-completion-test-venue-${unique}`,
          name: "Completion Test Venue Offering",
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
          payment_mode: ServicePaymentMode.pay_at_venue,
          status: ServiceOfferingStatus.published,
        }),
      );
      offeringVenueId = offeringVenue.id;

      engagementService = new EngagementService(engagementRepo());
      const bookingPaymentClient = new BookingPaymentClient();
      const bookingCompletionService = new BookingCompletionService(
        paymentRepo(),
        bookingPaymentClient,
      );
      bookingStatusService = new BookingStatusService(
        bookingRepo(),
        undefined,
        undefined,
        bookingCompletionService,
      );
      bookingAuthService = new BookingAuthService(
        bookingRepo(),
        paymentRepo(),
        bookingPaymentClient,
        bookingStatusService,
        authQueue,
      );
    }, 30_000);

    afterAll(async () => {
      async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
          await fn();
        } catch (err) {
          console.error(
            `[booking-completion.service.integration.test] cleanup step "${label}" failed`,
            err,
          );
        }
      }

      if (createdCommissionIds.length) {
        await step("delete commissions", () =>
          commissionRepo()
            .createQueryBuilder()
            .delete()
            .where("id IN (:...ids)", { ids: createdCommissionIds })
            .execute(),
        );
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
      if (offeringPrepayId || offeringVenueId) {
        await step("delete offerings", () =>
          AppDataSource.getRepository(ServiceOffering)
            .createQueryBuilder()
            .delete()
            .where("id IN (:...ids)", { ids: [offeringPrepayId, offeringVenueId].filter(Boolean) })
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
      "PREPAY: completeBooking captures the authorized PI and creates a pending commission row that the payout pipeline can batch",
      async () => {
        const card = await seedSavedCard();
        const booking = await seedBooking({
          daysOut: 15,
          offeringId: offeringPrepayId,
          paymentMode: ServicePaymentMode.prepay,
          commissionRate: 12,
          commissionFils: 1200, // 12% of net-ex-VAT (10000 - 0)
        });

        // Get a REAL authorized (requires_capture) PaymentIntent recorded on
        // escrow_hold_id — the exact mechanism completeBooking's hook reads.
        // authorizeNow needs booking.payment_id pointing at a Payment row
        // carrying the saved-card gateway_response, mirroring
        // booking-auth.service.integration.test.ts's seedPrepayBooking.
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
            gateway_payment_id: `seti_completion_${unique}_${slotCursor}`,
            gateway_response: {
              kind: "setup_intent",
              stripe_customer_id: card.customerId,
              payment_method_id: card.pmId,
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
        expect(authPayment?.status).toBe("authorized" as any);

        // ── The actual thing under test ──
        const completed = await bookingStatusService.completeBooking(booking.id, {
          id: null,
          role: "admin",
        });
        expect(completed.status).toBe(BookingStatus.completed);

        const pi = await stripe!.paymentIntents.retrieve(authPayment!.gateway_payment_id as string);
        expect(pi.status).toBe("succeeded");

        const capturedPayment = await paymentRepo().findOne({
          where: { id: authorized!.escrow_hold_id as string },
        });
        expect(capturedPayment?.status).toBe("captured" as any);

        const commission = await commissionRepo().findOne({
          where: { booking_id: booking.id } as any,
        });
        expect(commission).toBeTruthy();
        if (commission) createdCommissionIds.push(commission.id);
        expect((commission as any).vendor_id).toBe(vendorId);
        expect(Number((commission as any).commission_rate)).toBeCloseTo(12);
        expect((commission as any).commission_amount).toBe(1200);
        expect((commission as any).status).toBe("pending");

        // Existing payout pipeline can batch it (PayoutService.computePayoutTotals's
        // query — no order_id/vendor_order_id dependency).
        const pendingForVendor = await commissionRepo().find({
          where: { vendor_id: vendorId, status: "pending" as any },
        });
        expect(pendingForVendor.some((c) => c.id === (commission as any).id)).toBe(true);
      },
      30_000,
    );

    itOrderService(
      "PAY_AT_VENUE: completeBooking does not attempt a capture, commission row is still created",
      async () => {
        const booking = await seedBooking({
          daysOut: 16,
          offeringId: offeringVenueId,
          paymentMode: ServicePaymentMode.pay_at_venue,
          commissionRate: 10,
          commissionFils: 1000,
        });
        expect(booking.escrow_hold_id).toBeNull();
        expect(booking.payment_id).toBeNull();

        const completed = await bookingStatusService.completeBooking(booking.id, {
          id: null,
          role: "admin",
        });
        expect(completed.status).toBe(BookingStatus.completed);

        const commission = await commissionRepo().findOne({
          where: { booking_id: booking.id } as any,
        });
        expect(commission).toBeTruthy();
        if (commission) createdCommissionIds.push(commission.id);
        expect((commission as any).commission_amount).toBe(1000);
      },
      20_000,
    );

    itOrderService(
      "idempotency: completing an already-completed booking twice creates exactly one commission row and surfaces no capture error",
      async () => {
        const booking = await seedBooking({
          daysOut: 17,
          offeringId: offeringVenueId,
          paymentMode: ServicePaymentMode.pay_at_venue,
          commissionRate: 8,
          commissionFils: 800,
        });

        const first = await bookingStatusService.completeBooking(booking.id, {
          id: null,
          role: "admin",
        });
        expect(first.status).toBe(BookingStatus.completed);

        // Second call must NOT throw (this is the whole point of
        // completeBooking's "already completed" branch) and must not create
        // a second commission row.
        const second = await bookingStatusService.completeBooking(booking.id, {
          id: null,
          role: "admin",
        });
        expect(second.status).toBe(BookingStatus.completed);

        const rows = await commissionRepo().find({ where: { booking_id: booking.id } as any });
        createdCommissionIds.push(...rows.map((r) => r.id));
        expect(rows).toHaveLength(1);

        const historyRows = await historyRepo().find({ where: { booking_id: booking.id } });
        expect(historyRows).toHaveLength(1); // only ONE real transition happened
      },
      20_000,
    );

    // ── Review Fix 1 (money-safety BLOCKER): the TRUE concurrent case, not
    // just sequential-retry. completeBooking() is deliberately designed so
    // an admin-mark racing Phase 5's auto-complete job can BOTH pass the
    // pre-tx `from` check and BOTH fire the completion hook (see
    // BookingStatusService.completeBooking's own comment) — this is the
    // exact scenario uq_commissions_booking exists to make safe.
    itOrderService(
      "concurrency: two SIMULTANEOUS completeBooking() calls for the same booking accrue exactly ONE commission row",
      async () => {
        const booking = await seedBooking({
          daysOut: 18,
          offeringId: offeringVenueId,
          paymentMode: ServicePaymentMode.pay_at_venue,
          commissionRate: 9,
          commissionFils: 900,
        });

        const results = await Promise.allSettled([
          bookingStatusService.completeBooking(booking.id, { id: null, role: "admin" }),
          bookingStatusService.completeBooking(booking.id, { id: null, role: "admin" }),
        ]);

        // Neither concurrent caller may see a thrown error — the loser of
        // the transition race still gets a valid `completed` booking back,
        // and the loser of the commission-insert race gets the winner's row
        // back (uq_commissions_booking + 23505 catch), never an exception.
        for (const r of results) {
          expect(r.status).toBe("fulfilled");
          if (r.status === "fulfilled") expect(r.value.status).toBe(BookingStatus.completed);
        }

        const rows = await commissionRepo().find({ where: { booking_id: booking.id } as any });
        createdCommissionIds.push(...rows.map((r) => r.id));
        expect(rows).toHaveLength(1); // RED before uq_commissions_booking: could be 2

        const historyRows = await historyRepo().find({ where: { booking_id: booking.id } });
        expect(historyRows).toHaveLength(1); // only ONE real transition won
      },
      20_000,
    );
  },
);
