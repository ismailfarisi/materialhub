// booking-autocomplete.service.integration.test.ts
//
// Live Postgres + Redis + real order-service HTTP + real Stripe TEST mode
// (BOOKING_LIVE_DB=1). Mirrors booking-auth.service.integration.test.ts's /
// booking-completion.service.integration.test.ts's live-gate +
// order-service-reachability-skip + cleanup patterns.
//
// Exercises the REAL BookingAutoCompleteService wired the same way
// container.ts wires it (a late-binding BookingAutoCompleteHook into
// BookingStatusService, mirroring bookingAuthHook), against the real BullMQ
// queue and a real Postgres booking row. Job-firing itself is invoked
// directly (`runAutoCompleteJob`) rather than waiting on the job's real
// delay — the same shortcut booking-auth.service.integration.test.ts takes
// for `runAuthorizeJob`.
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
import Stripe from "stripe";
import { EngagementService } from "../engagement/engagement.service.ts";
import { getBookingAuthQueue } from "./booking-auth.job.ts";
import { BookingAuthService } from "./booking-auth.service.ts";
import { getBookingAutoCompleteQueue } from "./booking-autocomplete.job.ts";
import { BookingAutoCompleteService } from "./booking-autocomplete.service.ts";
import { BookingCompletionService } from "./booking-completion.service.ts";
import { BookingPaymentClient } from "./booking-payment.client.ts";
import type { BookingAuthHook, BookingAutoCompleteHook } from "./booking-status.service.ts";
import { BookingStatusService } from "./booking-status.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

if (LIVE_DB && !config.stripe.secretKey.startsWith("sk_test_")) {
  throw new Error(
    "BOOKING_LIVE_DB=1 requires a Stripe TEST secret key (sk_test_...) — refusing to run against a live key.",
  );
}

// --- order-service reachability probe (mirrors booking-auth/booking-completion .integration.test.ts) ---
const ORDER_SERVICE_BASE_URL =
  process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
let orderServiceReachable = false;
if (LIVE_DB) {
  try {
    await fetch(ORDER_SERVICE_BASE_URL, { signal: AbortSignal.timeout(2_000) });
    orderServiceReachable = true;
  } catch (err) {
    console.warn(
      `[skip] booking-autocomplete completion/capture tests require order-service running on ${ORDER_SERVICE_BASE_URL}; start it with: bun --env-file=.env apps/order-service/src/index.ts — probe error: ${(err as Error).message}`,
    );
  }
}
const itOrderService = orderServiceReachable ? it : it.skip;

const stripe = LIVE_DB
  ? new Stripe(config.stripe.secretKey, { apiVersion: "2026-03-25.dahlia" })
  : null;
const unique = Date.now();
const COMPLIANT_CUSTOMER_FIELDS = {
  name: "Booking Autocomplete Test Customer",
  address: { line1: "Marina Walk", city: "Dubai", country: "AE" },
};
const HOUR_MS = 3_600_000;

describeLive(
  "BookingAutoCompleteService (live DB + Redis + order-service HTTP + Stripe test mode)",
  () => {
    let vendorId: string;
    let customerId: string;
    let staffId: string;
    let offeringPrepayId: string;
    let offeringVenueId: string;

    let bookingStatusService: BookingStatusService;
    let bookingAuthService: BookingAuthService;
    let bookingAutoCompleteService: BookingAutoCompleteService;
    let engagementService: EngagementService;

    const bookingRepo = () => AppDataSource.getRepository(Booking);
    const paymentRepo = () => AppDataSource.getRepository(Payment);
    const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
    const historyRepo = () => AppDataSource.getRepository(BookingStatusHistory);
    const commissionRepo = () => AppDataSource.getRepository(Commission);
    const authQueue = getBookingAuthQueue();
    const autoCompleteQueue = getBookingAutoCompleteQueue();

    const createdBookingIds: string[] = [];
    const createdEngagementIds: string[] = [];
    const createdCommissionIds: string[] = [];
    const jobIdsToClean: string[] = [];
    let slotCursor = 0;

    function nextSlotStartsAt(daysOut: number): Date {
      slotCursor += 1;
      const d = new Date(Date.now() + daysOut * 24 * 3_600_000);
      d.setUTCHours(d.getUTCHours() + slotCursor * 2);
      return d;
    }

    async function seedSavedCard(): Promise<{ customerId: string; pmId: string }> {
      const cust = await stripe!.customers.create({
        email: `booking-autocomplete-${unique}-${slotCursor}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const pm = await stripe!.paymentMethods.attach("pm_card_visa", { customer: cust.id });
      return { customerId: cust.id, pmId: pm.id };
    }

    async function seedBooking(opts: {
      daysOut: number;
      offeringId: string;
      paymentMode: ServicePaymentMode;
      status?: BookingStatus;
      engagementStatus?: EngagementStatus;
      commissionRate?: number;
      commissionFils?: number;
    }): Promise<Booking> {
      const startsAt = nextSlotStartsAt(opts.daysOut);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

      const engagement = await engagementService.reserve({
        staffMemberId: staffId,
        vendorId,
        startsAt,
        endsAt,
        kind: EngagementKind.marketplace_booking,
        status: opts.engagementStatus ?? EngagementStatus.confirmed,
        createdBy: customerId,
      });
      createdEngagementIds.push(engagement.id);

      const booking = await bookingRepo().save(
        bookingRepo().create({
          booking_number: `BAC${unique}${slotCursor}`,
          customer_user_id: customerId,
          vendor_id: vendorId,
          location_id: null,
          staff_member_id: staffId,
          engagement_id: engagement.id,
          service_offering_id: opts.offeringId,
          service_name: "Booking Autocomplete Test Service",
          duration_minutes: 30,
          price_fils: 10_000,
          vat_fils: 0,
          deposit_fils: 0,
          deposit_type: DepositType.none,
          cancellation_window_hours: 24,
          reschedule_window_hours: 24,
          commission_rate: opts.commissionRate ?? 15,
          commission_fils: opts.commissionFils ?? 1500,
          starts_at: startsAt,
          ends_at: endsAt,
          status: opts.status ?? BookingStatus.confirmed,
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
          first_name: "Autocomplete",
          last_name: "Customer",
          email: `booking-autocomplete-svc-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      );
      customerId = customer.id;

      const vendor = await vendorRepo.save(
        vendorRepo.create({
          name: `Booking Autocomplete Test Vendor ${unique}`,
          slug: `booking-autocomplete-test-vendor-${unique}`,
          business_name: "Test Salon",
          business_type: "salon",
          contact_email: `booking-autocomplete-vendor-${unique}@test.local`,
          contact_phone: "+971500000004",
          status: VendorStatus.approved,
        }),
      );
      vendorId = vendor.id;

      const staff = await staffRepo.save(
        staffRepo.create({ vendor_id: vendorId, name: `Autocomplete Test Stylist ${unique}` }),
      );
      staffId = staff.id;

      const offeringPrepay = await offeringRepo.save(
        offeringRepo.create({
          vendor_id: vendorId,
          slug: `booking-autocomplete-test-prepay-${unique}`,
          name: "Autocomplete Test Prepay Offering",
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
          slug: `booking-autocomplete-test-venue-${unique}`,
          name: "Autocomplete Test Venue Offering",
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

      // Same late-binding hook technique as container.ts (see that file's
      // comment) for BOTH bookingAuthHook and autoCompleteHook — the closures
      // below only dereference `bookingAuthService`/`bookingAutoCompleteService`
      // (assigned via the outer `let`s a few lines down) when actually
      // called.
      const authHook: BookingAuthHook = {
        scheduleForConfirm: (b) => bookingAuthService.scheduleForConfirm(b),
        handleAsyncAuthFailure: (b, r) => bookingAuthService.handleAsyncAuthFailure(b, r),
        removeBookingAuthJob: (id) => bookingAuthService.removeBookingAuthJob(id),
      };
      const autoCompleteHook: BookingAutoCompleteHook = {
        scheduleForConfirm: (b) => bookingAutoCompleteService.scheduleForConfirm(b),
        removeAutoCompleteJob: (id) => bookingAutoCompleteService.removeAutoCompleteJob(id),
      };

      bookingStatusService = new BookingStatusService(
        bookingRepo(),
        undefined,
        authHook,
        bookingCompletionService,
        autoCompleteHook,
      );
      bookingAuthService = new BookingAuthService(
        bookingRepo(),
        paymentRepo(),
        bookingPaymentClient,
        bookingStatusService,
        authQueue,
      );
      bookingAutoCompleteService = new BookingAutoCompleteService(
        bookingRepo(),
        bookingStatusService,
        autoCompleteQueue,
        config.bookings.autoCompleteGraceHours,
      );
    }, 30_000);

    afterAll(async () => {
      async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
          await fn();
        } catch (err) {
          console.error(
            `[booking-autocomplete.service.integration.test] cleanup step "${label}" failed`,
            err,
          );
        }
      }

      for (const jobId of jobIdsToClean) {
        await step(`remove job ${jobId}`, () => autoCompleteQueue.remove(jobId));
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

    it("confirm(): schedules the delayed autocomplete_{id} job at ends_at + grace for a pay_at_venue booking", async () => {
      const startsAt = nextSlotStartsAt(15);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      const engagement = await engagementService.reserve({
        staffMemberId: staffId,
        vendorId,
        startsAt,
        endsAt,
        kind: EngagementKind.marketplace_booking,
        status: EngagementStatus.held,
        createdBy: customerId,
      });
      createdEngagementIds.push(engagement.id);

      const booking = await bookingRepo().save(
        bookingRepo().create({
          booking_number: `BACS${unique}`,
          customer_user_id: customerId,
          vendor_id: vendorId,
          location_id: null,
          staff_member_id: staffId,
          engagement_id: engagement.id,
          service_offering_id: offeringVenueId,
          service_name: "Autocomplete Schedule Test Service",
          duration_minutes: 30,
          price_fils: 10_000,
          vat_fils: 0,
          deposit_fils: 0,
          deposit_type: DepositType.none,
          cancellation_window_hours: 24,
          reschedule_window_hours: 24,
          commission_rate: 15,
          commission_fils: 1500,
          starts_at: startsAt,
          ends_at: endsAt,
          status: BookingStatus.pending_payment,
          source: "marketplace",
          payment_mode: ServicePaymentMode.pay_at_venue,
        }),
      );
      createdBookingIds.push(booking.id);
      jobIdsToClean.push(`autocomplete_${booking.id}`);

      const confirmed = await bookingStatusService.confirm(booking.id);
      expect(confirmed.status).toBe(BookingStatus.confirmed);

      const job = await autoCompleteQueue.getJob(`autocomplete_${booking.id}`);
      expect(job).toBeTruthy();
      expect(job?.name).toBe("auto-complete");
      const expectedFireAt = endsAt.getTime() + config.bookings.autoCompleteGraceHours * HOUR_MS;
      const actualFireAt = job!.timestamp + (job!.opts.delay ?? 0);
      expect(Math.abs(actualFireAt - expectedFireAt)).toBeLessThan(10_000);
    }, 15_000);

    it("runAutoCompleteJob: booking no longer confirmed (already cancelled) is a graceful no-op — does not complete or throw", async () => {
      const booking = await seedBooking({
        daysOut: 15,
        offeringId: offeringVenueId,
        paymentMode: ServicePaymentMode.pay_at_venue,
        status: BookingStatus.cancelled,
      });

      // Plain await (NOT `expect(...).resolves`) — bun 1.3.13's
      // expect(promise).resolves hung indefinitely in this live-DB suite
      // (never settled, test timed out) while the same promise resolves
      // instantly under a direct await. A throw here fails the test anyway.
      await bookingAutoCompleteService.runAutoCompleteJob(booking.id);

      const reloaded = await bookingRepo().findOne({ where: { id: booking.id } });
      expect(reloaded?.status).toBe(BookingStatus.cancelled);

      const commission = await commissionRepo().findOne({
        where: { booking_id: booking.id } as any,
      });
      expect(commission).toBeNull();
    }, 15_000);

    itOrderService(
      "runAutoCompleteJob: PAY_AT_VENUE confirmed booking completes and accrues commission (no capture attempted)",
      async () => {
        const booking = await seedBooking({
          daysOut: 15,
          offeringId: offeringVenueId,
          paymentMode: ServicePaymentMode.pay_at_venue,
          commissionRate: 10,
          commissionFils: 1000,
        });

        await bookingAutoCompleteService.runAutoCompleteJob(booking.id);

        const completed = await bookingRepo().findOne({ where: { id: booking.id } });
        expect(completed?.status).toBe(BookingStatus.completed);

        const history = await historyRepo().find({ where: { booking_id: booking.id } });
        const lastRow = history.find((h) => h.to_status === BookingStatus.completed);
        expect(lastRow?.actor_role).toBe("system");
        expect(lastRow?.actor_id).toBeNull();

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
      "runAutoCompleteJob: PREPAY confirmed booking with an authorized escrow_hold_id captures the PI + accrues commission",
      async () => {
        const card = await seedSavedCard();
        const booking = await seedBooking({
          daysOut: 16,
          offeringId: offeringPrepayId,
          paymentMode: ServicePaymentMode.prepay,
          commissionRate: 12,
          commissionFils: 1200,
        });

        const setupPayment = await paymentRepo().save(
          paymentRepo().create({
            booking_id: booking.id,
            order_id: null,
            user_id: customerId,
            status: PaymentStatus.authorized,
            payment_method: PaymentMethod.stripe,
            amount: 0,
            currency: "AED",
            gateway: "stripe",
            gateway_payment_id: `seti_autocomplete_${unique}_${slotCursor}`,
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

        // ── The actual thing under test ──
        await bookingAutoCompleteService.runAutoCompleteJob(booking.id);

        const completed = await bookingRepo().findOne({ where: { id: booking.id } });
        expect(completed?.status).toBe(BookingStatus.completed);

        const authPayment = await paymentRepo().findOne({
          where: { id: authorized!.escrow_hold_id as string },
        });
        expect(authPayment?.status).toBe(PaymentStatus.captured);

        const pi = await stripe!.paymentIntents.retrieve(authPayment!.gateway_payment_id as string);
        expect(pi.status).toBe("succeeded");

        const commission = await commissionRepo().findOne({
          where: { booking_id: booking.id } as any,
        });
        expect(commission).toBeTruthy();
        if (commission) createdCommissionIds.push(commission.id);
        expect((commission as any).commission_amount).toBe(1200);
      },
      30_000,
    );

    it("rescheduleAutoCompleteJob: removes the existing job and re-times it against the NEW ends_at", async () => {
      const booking = await seedBooking({
        daysOut: 17,
        offeringId: offeringVenueId,
        paymentMode: ServicePaymentMode.pay_at_venue,
      });
      jobIdsToClean.push(`autocomplete_${booking.id}`);

      const now = new Date();
      await bookingAutoCompleteService.scheduleForConfirm(booking, now);
      const original = await autoCompleteQueue.getJob(`autocomplete_${booking.id}`);
      expect(original).toBeTruthy();

      const newEndsAt = new Date(booking.ends_at.getTime() + 5 * 24 * HOUR_MS);
      const rescheduledBookingSnapshot = { ...booking, ends_at: newEndsAt } as Booking;
      await bookingAutoCompleteService.rescheduleAutoCompleteJob(rescheduledBookingSnapshot, now);

      const rescheduled = await autoCompleteQueue.getJob(`autocomplete_${booking.id}`);
      expect(rescheduled).toBeTruthy();
      const expectedFireAt = newEndsAt.getTime() + config.bookings.autoCompleteGraceHours * HOUR_MS;
      const actualFireAt = rescheduled!.timestamp + (rescheduled!.opts.delay ?? 0);
      expect(Math.abs(actualFireAt - expectedFireAt)).toBeLessThan(10_000);

      const originalFireAt = original!.timestamp + (original!.opts.delay ?? 0);
      expect(actualFireAt).not.toBe(originalFireAt);
    }, 15_000);

    it("cancel transition removes the auto-complete job (defensive cleanup)", async () => {
      const booking = await seedBooking({
        daysOut: 18,
        offeringId: offeringVenueId,
        paymentMode: ServicePaymentMode.pay_at_venue,
      });

      await autoCompleteQueue.add(
        "auto-complete",
        { bookingId: booking.id },
        { jobId: `autocomplete_${booking.id}`, delay: 10 * 24 * HOUR_MS },
      );
      jobIdsToClean.push(`autocomplete_${booking.id}`);

      await bookingStatusService.transition(booking.id, BookingStatus.cancelled, {
        id: customerId,
        role: "customer",
      });

      // removeAutoCompleteJob is fired-and-forgotten (best-effort, outside
      // the transaction) — poll briefly rather than assuming same-tick
      // completion, mirrors booking-auth.service.integration.test.ts's own
      // cancel-removes-jobs test.
      let job = await autoCompleteQueue.getJob(`autocomplete_${booking.id}`);
      for (let i = 0; i < 20 && job; i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = await autoCompleteQueue.getJob(`autocomplete_${booking.id}`);
      }
      expect(job).toBeFalsy();
    }, 10_000);
  },
);
