// internal-booking-payment.integration.test.ts
//
// Live DB + real Stripe TEST-mode calls (BOOKING_LIVE_DB=1). Mirrors the
// REELS_LIVE_DB pattern (see apps/reels-service/tests/integration/*): boots
// the real order-service `app`, seeds the minimal FK chain the `payments`
// table's `fk_payments_booking` constraint requires (user → vendor → staff
// member → service offering → staff_engagement → booking), and drives the
// 6 /internal/booking-payments/* routes end-to-end against real Stripe.
//
// SAFETY: refuses to run against a live Stripe key (see the guard below) —
// only ever exercises `sk_test_...`.
//
// A note on what "confirm" means here: completing a SetupIntent's 3D-Secure
// challenge, or an on-session PaymentIntent's SCA challenge, requires an
// actual browser (Stripe.js iframe) — this shared test Stripe account
// enforces it unconditionally, and that's genuine real-world Stripe behavior
// for customer-present confirmations, not a bug. Two things are irreducibly
// out of a backend test's reach: (a) completing the interactive SetupIntent
// 3DS challenge, and (b) completing an on-session PaymentIntent SCA
// challenge. Where the test needs a payment_method that's already "past"
// that step, it uses `stripe.paymentMethods.attach` directly — that models
// exactly what a completed frontend 3DS flow hands back (a payment_method
// usable off-session), without re-implementing a browser. Every
// order-service endpoint under test still runs for real against Stripe.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  Commission,
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
import jwt from "jsonwebtoken";
import Stripe from "stripe";
// Deliberately NOT a static import: `../app.ts` boots the real container,
// which dials Postgres at import time (`await ensureDatabase()`), so a
// static import would crash in the DB-less CI runner even though every
// test below is describe.skip'd without BOOKING_LIVE_DB=1. It also leaves
// the half-initialized module in bun's shared test process, cascading a
// TDZ ReferenceError into route-mounting.test.ts's mocked-container import.
// The gated beforeAll loads it lazily instead.
let app: { handle: (req: Request) => Promise<Response> };

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

if (LIVE_DB && !config.stripe.secretKey.startsWith("sk_test_")) {
  throw new Error(
    "BOOKING_LIVE_DB=1 requires a Stripe TEST secret key (sk_test_...) — refusing to run against a live key.",
  );
}

const unique = Date.now();
const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ?? "test-internal-secret-for-booking-pay";
process.env.INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
const internalToken = jwt.sign({ iss: "booking-service" }, INTERNAL_SECRET, { expiresIn: "5m" });

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: "2026-03-25.dahlia" });

// This shared Stripe TEST account requires name+address on the Customer for
// off-session (export/cross-border) charges to go through — see the
// createBookingSetupIntent `name`/`address` fields this exercises.
const COMPLIANT_CUSTOMER_FIELDS = {
  name: "Booking Pay Test Customer",
  address: { line1: "Marina Walk", city: "Dubai", country: "AE" },
};

async function post(path: string, body: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

let userId = "";
let vendorId = "";
let staffId = "";
let offeringId = "";
const bookingIds: Record<string, string> = {};
const createdEngagementIds: string[] = [];
const createdBookingIds: string[] = [];
const createdCommissionIds: string[] = [];

// Carries the authorized-but-not-yet-captured PI between the sequential
// authorize → capture → refund `it` blocks (bun test runs `it`s within a
// `describe` in file order).
let authorizedPI: { bookingId: string; paymentIntentId: string } | undefined;

let bookingSeq = 0;

async function seedBooking(
  label: string,
  paymentMode: ServicePaymentMode,
  startsAt: Date,
): Promise<string> {
  const engagementRepo = AppDataSource.getRepository(StaffEngagement);
  const bookingRepo = AppDataSource.getRepository(Booking);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  bookingSeq += 1;

  const engagement = await engagementRepo.save(
    engagementRepo.create({
      staff_member_id: staffId,
      vendor_id: vendorId,
      starts_at: startsAt,
      ends_at: endsAt,
      status: EngagementStatus.confirmed,
      kind: EngagementKind.marketplace_booking,
    }),
  );
  createdEngagementIds.push(engagement.id);

  const booking = await bookingRepo.save(
    bookingRepo.create({
      // varchar(30) — keep short: base36 timestamp + a sequence number.
      booking_number: `BK${unique.toString(36)}-${bookingSeq}`,
      customer_user_id: userId,
      vendor_id: vendorId,
      staff_member_id: staffId,
      engagement_id: engagement.id,
      service_offering_id: offeringId,
      service_name: "Test Blowout",
      duration_minutes: 30,
      price_fils: 10000,
      cancellation_window_hours: 24,
      reschedule_window_hours: 24,
      commission_rate: 0.15 as any,
      starts_at: startsAt,
      ends_at: endsAt,
      payment_mode: paymentMode,
      status: BookingStatus.pending_payment,
    }),
  );
  createdBookingIds.push(booking.id);
  bookingIds[label] = booking.id;
  return booking.id;
}

describeLive("POST /internal/booking-payments/* (live DB + Stripe test key)", () => {
  beforeAll(async () => {
    ({ app } = await import("../app.ts"));
    await ensureDatabase();

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);

    const user = await userRepo.save(
      userRepo.create({
        first_name: "Booking",
        last_name: "Payer",
        email: `booking-pay-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    userId = user.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Booking Pay Test Vendor ${unique}`,
        slug: `booking-pay-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `vendor-${unique}@test.local`,
        contact_phone: "+971500000000",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: "Test Stylist" }),
    );
    staffId = staff.id;

    const offering = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-pay-test-service-${unique}`,
        name: "Test Blowout",
        duration_minutes: 30,
        price_fils: 10000,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringId = offering.id;

    const base = Date.now() + 8 * 24 * 3_600_000; // 8 days out — distinct, non-overlapping slots
    await seedBooking("prepay-capture", ServicePaymentMode.prepay, new Date(base));
    await seedBooking("prepay-void", ServicePaymentMode.prepay, new Date(base + 3_600_000));
    await seedBooking("prepay-decline", ServicePaymentMode.prepay, new Date(base + 10_800_000));
    await seedBooking("deposit", ServicePaymentMode.deposit, new Date(base + 7_200_000));
  }, 30_000);

  afterAll(async () => {
    const paymentRepo = AppDataSource.getRepository(Payment);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const engagementRepo = AppDataSource.getRepository(StaffEngagement);
    const commissionRepo = AppDataSource.getRepository(Commission);
    try {
      if (createdCommissionIds.length) {
        // fk_commissions_booking has no ON DELETE — must go before bookings.
        await commissionRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdCommissionIds })
          .execute();
      }
      if (createdBookingIds.length) {
        await paymentRepo
          .createQueryBuilder()
          .delete()
          .where("booking_id IN (:...ids)", { ids: createdBookingIds })
          .execute();
        await bookingRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute();
      }
      if (createdEngagementIds.length) {
        await engagementRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdEngagementIds })
          .execute();
      }
    } catch (err) {
      console.error("[integration-test] cleanup failed", err);
    }
  }, 30_000);

  it("setup: creates a Stripe Customer + off-session SetupIntent, records a booking Payment row", async () => {
    const bookingId = bookingIds["prepay-capture"]!;
    const res = await post("/internal/booking-payments/setup", {
      booking_id: bookingId,
      user_id: userId,
      email: `booking-pay-${unique}@test.local`,
      ...COMPLIANT_CUSTOMER_FIELDS,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.client_secret).toMatch(/^seti_.*_secret_/);
    expect(body.data.setup_intent_id).toMatch(/^seti_/);
    expect(body.data.stripe_customer_id).toMatch(/^cus_/);

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({ where: { id: body.data.payment_id } as any });
    expect(payment).toBeTruthy();
    expect((payment as any).booking_id).toBe(bookingId);
    expect((payment as any).order_id).toBeNull();
    expect((payment as any).gateway_payment_id).toBe(body.data.setup_intent_id);

    // Confirm the SetupIntent's real Stripe object exists and is scoped to
    // this customer. Completing its 3D-Secure challenge needs a browser
    // (see file header) — the `authorize` test below picks up from a
    // payment_method attached directly to this same customer, which is what
    // that completed challenge would have produced.
    const setupIntent = await stripe.setupIntents.retrieve(body.data.setup_intent_id);
    expect(setupIntent.customer).toBe(body.data.stripe_customer_id);
    expect(setupIntent.metadata?.booking_id).toBe(bookingId);
  });

  it("authorize: creates an off-session manual-capture PaymentIntent on the saved card", async () => {
    const bookingId = bookingIds["prepay-capture"]!;
    const setupRes = await post("/internal/booking-payments/setup", {
      booking_id: bookingId,
      user_id: userId,
      email: `booking-pay-${unique}@test.local`,
      ...COMPLIANT_CUSTOMER_FIELDS,
    });
    const setupBody = (await setupRes.json()) as any;
    const customerId = setupBody.data.stripe_customer_id as string;

    // This is a genuine live-Stripe replay of the "setup" test above (same
    // booking_id + email + name/address as that earlier call) — the
    // booking-setup / booking-setup-customer idempotency keys mean Stripe
    // returns the exact same Customer + SetupIntent, so review Fix 1/2's
    // local dedup must have updated that first Payment row in place rather
    // than inserted a second one for the same (booking_id, gateway_payment_id).
    const paymentRepo = AppDataSource.getRepository(Payment);
    const setupRowsForBooking = await paymentRepo.find({
      where: {
        booking_id: bookingId,
        gateway_payment_id: setupBody.data.setup_intent_id,
      } as any,
    });
    expect(setupRowsForBooking).toHaveLength(1);

    // Stands in for "the customer completed the SetupIntent's 3DS challenge
    // in the browser" — the real, observable end state of that flow is a
    // payment_method attached to the customer, usable off-session.
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });

    const res = await post("/internal/booking-payments/authorize", {
      booking_id: bookingId,
      user_id: userId,
      stripe_customer_id: customerId,
      payment_method_id: pm.id,
      amount_fils: 10000,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe("requires_capture");
    expect(body.data.payment_intent_id).toMatch(/^pi_/);

    const payment = await paymentRepo.findOne({ where: { id: body.data.payment_id } as any });
    expect((payment as any).status).toBe("authorized");
    expect((payment as any).booking_id).toBe(bookingId);

    const pi = await stripe.paymentIntents.retrieve(body.data.payment_intent_id);
    expect(pi.status).toBe("requires_capture");
    expect(pi.metadata?.booking_id).toBe(bookingId);

    // capture + refund (below) chain off this authorization.
    authorizedPI = { bookingId, paymentIntentId: body.data.payment_intent_id };
  });

  it("authorize: records a failed Payment row (not a thrown error) when Stripe rejects the off-session charge", async () => {
    const bookingId = bookingIds["prepay-decline"]!;
    // Deliberately non-compliant customer (no name/address) — this account
    // rejects off-session cross-border charges for such customers. A card
    // decline or SCA requirement would surface the same way: a real Stripe
    // error, caught and recorded rather than thrown as a 500.
    const setupRes = await post("/internal/booking-payments/setup", {
      booking_id: bookingId,
      user_id: userId,
      email: `booking-pay-decline-${unique}@test.local`,
    });
    const setupBody = (await setupRes.json()) as any;
    const customerId = setupBody.data.stripe_customer_id as string;
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });

    const res = await post("/internal/booking-payments/authorize", {
      booking_id: bookingId,
      user_id: userId,
      stripe_customer_id: customerId,
      payment_method_id: pm.id,
      amount_fils: 10000,
    });
    expect(res.status).toBe(200); // not a 500 — a recorded business-level failure
    const body = (await res.json()) as any;
    expect(body.data.status).not.toBe("requires_capture");
    expect(body.data.failure_reason).toBeTruthy();

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
      where: { booking_id: bookingId, status: "failed" } as any,
    });
    expect(payment).toBeTruthy();
  });

  it("capture: captures the manual-capture PaymentIntent", async () => {
    expect(authorizedPI).toBeTruthy();
    const ctx = authorizedPI!;

    const res = await post("/internal/booking-payments/capture", {
      booking_id: ctx.bookingId,
      payment_intent_id: ctx.paymentIntentId,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe("succeeded");

    const pi = await stripe.paymentIntents.retrieve(ctx.paymentIntentId);
    expect(pi.status).toBe("succeeded");

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
      where: { booking_id: ctx.bookingId, gateway_payment_id: ctx.paymentIntentId } as any,
    });
    expect((payment as any).status).toBe("captured");
  });

  it("refund: refunds the now-captured booking payment", async () => {
    const ctx = authorizedPI!;
    const res = await post("/internal/booking-payments/refund", {
      booking_id: ctx.bookingId,
      amount_fils: 4000,
      reference_type: "cancellation",
      reference_id: ctx.bookingId,
      reason: "requested_by_customer",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.gateway).toBe("stripe");
    expect(body.data.gateway_refund_id).toMatch(/^re_/);
    expect(body.data.amount_fils).toBe(4000);
  });

  it("capture: 404s when no payment row matches the booking / PaymentIntent pair", async () => {
    const res = await post("/internal/booking-payments/capture", {
      booking_id: bookingIds["prepay-capture"],
      payment_intent_id: "pi_does_not_exist",
    });
    expect(res.status).toBe(404);
  });

  it("void: cancels an un-captured manual-capture PaymentIntent (separate booking)", async () => {
    const bookingId = bookingIds["prepay-void"]!;

    const setupRes = await post("/internal/booking-payments/setup", {
      booking_id: bookingId,
      user_id: userId,
      email: `booking-pay-${unique}@test.local`,
      ...COMPLIANT_CUSTOMER_FIELDS,
    });
    const setupBody = (await setupRes.json()) as any;
    const customerId = setupBody.data.stripe_customer_id as string;
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });

    const authRes = await post("/internal/booking-payments/authorize", {
      booking_id: bookingId,
      user_id: userId,
      stripe_customer_id: customerId,
      payment_method_id: pm.id,
      amount_fils: 10000,
    });
    const authBody = (await authRes.json()) as any;
    expect(authBody.data.status).toBe("requires_capture");

    const voidRes = await post("/internal/booking-payments/void", {
      booking_id: bookingId,
      payment_intent_id: authBody.data.payment_intent_id,
      reason: "booking_expired",
    });
    expect(voidRes.status).toBe(200);
    const voidBody = (await voidRes.json()) as any;
    expect(voidBody.data.status).toBe("canceled");

    const pi = await stripe.paymentIntents.retrieve(authBody.data.payment_intent_id);
    expect(pi.status).toBe("canceled");

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
      where: { booking_id: bookingId, gateway_payment_id: authBody.data.payment_intent_id } as any,
    });
    expect((payment as any).status).toBe("cancelled");
  }, 15_000);

  it("intent: deposit mode creates a capture-now (automatic capture) PaymentIntent that captures immediately once confirmed", async () => {
    const bookingId = bookingIds.deposit!;
    const res = await post("/internal/booking-payments/intent", {
      booking_id: bookingId,
      user_id: userId,
      amount_fils: 5000,
      ...COMPLIANT_CUSTOMER_FIELDS,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.client_secret).toMatch(/^pi_.*_secret_/);
    expect(body.data.payment_intent_id).toMatch(/^pi_/);

    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({ where: { id: body.data.payment_id } as any });
    expect((payment as any).booking_id).toBe(bookingId);
    expect((payment as any).order_id).toBeNull();
    expect((payment as any).status).toBe("pending");

    // Completing an on-session SCA challenge needs a browser (see file
    // header); confirming off-session here is a deterministic stand-in for
    // "the browser confirmation succeeded" that still proves the important
    // thing: capture_method defaults to automatic (unlike prepay's manual
    // capture) — the charge settles the instant it confirms, no /capture
    // call needed. This PI has no `customer` attached (deposit mode doesn't
    // create one), so confirm with the raw test token directly rather than
    // a customer-attached payment_method.
    const confirmed = await stripe.paymentIntents.confirm(body.data.payment_intent_id, {
      payment_method: "pm_card_visa",
      off_session: true,
    });
    expect(confirmed.status).toBe("succeeded");
    expect(confirmed.amount_received).toBe(5000);
  });

  // ── /complete (Phase 4 Task 9, spec §5.2 step 3 / §5.3 "On completed") ──
  describe("complete: capture-and-accrue on booking completion", () => {
    const COMMISSION = {
      commission_rate: 15,
      commission_fils: 1500,
      price_fils: 10000,
      vat_fils: 0,
    };

    it("prepay: captures the authorized PaymentIntent AND creates a pending commission row from the snapshot", async () => {
      const bookingId = await seedBooking(
        "complete-prepay",
        ServicePaymentMode.prepay,
        new Date(Date.now() + 9 * 24 * 3_600_000),
      );

      const setupRes = await post("/internal/booking-payments/setup", {
        booking_id: bookingId,
        user_id: userId,
        email: `booking-pay-${unique}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const setupBody = (await setupRes.json()) as any;
      const customerStripeId = setupBody.data.stripe_customer_id as string;
      const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerStripeId });

      const authRes = await post("/internal/booking-payments/authorize", {
        booking_id: bookingId,
        user_id: userId,
        stripe_customer_id: customerStripeId,
        payment_method_id: pm.id,
        amount_fils: 10000,
      });
      const authBody = (await authRes.json()) as any;
      expect(authBody.data.status).toBe("requires_capture");
      const paymentIntentId = authBody.data.payment_intent_id as string;

      const res = await post("/internal/booking-payments/complete", {
        booking_id: bookingId,
        payment_intent_id: paymentIntentId,
        vendor_id: vendorId,
        commission_rate: COMMISSION.commission_rate,
        commission_fils: COMMISSION.commission_fils,
        price_fils: COMMISSION.price_fils,
        vat_fils: COMMISSION.vat_fils,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.captured).toBe(true);
      expect(body.data.commission_created).toBe(true);
      expect(body.data.commission_id).toBeTruthy();

      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      expect(pi.status).toBe("succeeded");

      const paymentRepo = AppDataSource.getRepository(Payment);
      const payment = await paymentRepo.findOne({
        where: { booking_id: bookingId, gateway_payment_id: paymentIntentId } as any,
      });
      expect((payment as any).status).toBe("captured");

      const commissionRepo = AppDataSource.getRepository(Commission);
      const commission = await commissionRepo.findOne({ where: { id: body.data.commission_id } });
      expect(commission).toBeTruthy();
      expect((commission as any).booking_id).toBe(bookingId);
      expect((commission as any).order_id).toBeNull();
      expect((commission as any).vendor_order_id).toBeNull();
      expect((commission as any).order_item_id).toBeNull();
      expect((commission as any).vendor_id).toBe(vendorId);
      expect(Number((commission as any).commission_rate)).toBe(15);
      expect((commission as any).commission_amount).toBe(1500); // snapshot verbatim
      expect((commission as any).item_total).toBe(10000);
      expect((commission as any).tax_on_commission).toBe(75); // round(1500 * 0.05)
      expect((commission as any).vendor_earning).toBe(8425); // 10000 - 1500 - 75
      expect((commission as any).status).toBe("pending");

      // Feeds the existing payout pipeline unchanged — PayoutService.computePayoutTotals
      // batches `commissions WHERE vendor_id AND status='pending'` with no
      // dependency on order_id/vendor_order_id/order_item_id.
      const pendingForVendor = await commissionRepo.find({
        where: { vendor_id: vendorId, status: "pending" as any },
      });
      expect(pendingForVendor.some((c) => c.id === (commission as any).id)).toBe(true);

      createdCommissionIds.push((commission as any).id);
    }, 20_000);

    it("deposit: no capture attempted (already captured at booking time) — commission row still created", async () => {
      const bookingId = await seedBooking(
        "complete-deposit",
        ServicePaymentMode.deposit,
        new Date(Date.now() + 9 * 24 * 3_600_000 + 3_600_000),
      );

      const res = await post("/internal/booking-payments/complete", {
        booking_id: bookingId,
        payment_intent_id: null,
        vendor_id: vendorId,
        commission_rate: COMMISSION.commission_rate,
        commission_fils: COMMISSION.commission_fils,
        price_fils: COMMISSION.price_fils,
        vat_fils: COMMISSION.vat_fils,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.captured).toBe(false);
      expect(body.data.payment_intent_id).toBeNull();
      expect(body.data.commission_created).toBe(true);

      const commissionRepo = AppDataSource.getRepository(Commission);
      const commission = await commissionRepo.findOne({ where: { id: body.data.commission_id } });
      expect((commission as any)?.booking_id).toBe(bookingId);
      createdCommissionIds.push((commission as any).id);
    });

    it("pay_at_venue: no capture attempted (paid in person) — commission row still created", async () => {
      const bookingId = await seedBooking(
        "complete-venue",
        ServicePaymentMode.pay_at_venue,
        new Date(Date.now() + 9 * 24 * 3_600_000 + 7_200_000),
      );

      const res = await post("/internal/booking-payments/complete", {
        booking_id: bookingId,
        payment_intent_id: null,
        vendor_id: vendorId,
        commission_rate: COMMISSION.commission_rate,
        commission_fils: COMMISSION.commission_fils,
        price_fils: COMMISSION.price_fils,
        vat_fils: COMMISSION.vat_fils,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.captured).toBe(false);
      expect(body.data.commission_created).toBe(true);

      const commissionRepo = AppDataSource.getRepository(Commission);
      const commission = await commissionRepo.findOne({ where: { id: body.data.commission_id } });
      expect((commission as any)?.booking_id).toBe(bookingId);
      createdCommissionIds.push((commission as any).id);
    });

    it("idempotency: completing an already-completed booking twice does not double-capture or double-accrue", async () => {
      const bookingId = await seedBooking(
        "complete-idempotent",
        ServicePaymentMode.prepay,
        new Date(Date.now() + 9 * 24 * 3_600_000 + 10_800_000),
      );

      const setupRes = await post("/internal/booking-payments/setup", {
        booking_id: bookingId,
        user_id: userId,
        email: `booking-pay-${unique}@test.local`,
        ...COMPLIANT_CUSTOMER_FIELDS,
      });
      const setupBody = (await setupRes.json()) as any;
      const customerStripeId = setupBody.data.stripe_customer_id as string;
      const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerStripeId });

      const authRes = await post("/internal/booking-payments/authorize", {
        booking_id: bookingId,
        user_id: userId,
        stripe_customer_id: customerStripeId,
        payment_method_id: pm.id,
        amount_fils: 10000,
      });
      const authBody = (await authRes.json()) as any;
      const paymentIntentId = authBody.data.payment_intent_id as string;

      const completePayload = {
        booking_id: bookingId,
        payment_intent_id: paymentIntentId,
        vendor_id: vendorId,
        commission_rate: COMMISSION.commission_rate,
        commission_fils: COMMISSION.commission_fils,
        price_fils: COMMISSION.price_fils,
        vat_fils: COMMISSION.vat_fils,
      };

      const first = await post("/internal/booking-payments/complete", completePayload);
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as any;
      expect(firstBody.data.captured).toBe(true);
      expect(firstBody.data.commission_created).toBe(true);
      createdCommissionIds.push(firstBody.data.commission_id);

      // Retry: Stripe would reject a second literal capture call on an
      // already-succeeded PI — this must NOT surface that as an error, and
      // must NOT insert a second commission row for the same booking.
      const second = await post("/internal/booking-payments/complete", completePayload);
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as any;
      expect(secondBody.data.captured).toBe(false); // already captured — skipped, not re-attempted
      expect(secondBody.data.commission_created).toBe(false); // existing row reused
      expect(secondBody.data.commission_id).toBe(firstBody.data.commission_id);

      const commissionRepo = AppDataSource.getRepository(Commission);
      const rows = await commissionRepo.find({ where: { booking_id: bookingId } as any });
      expect(rows).toHaveLength(1);
    }, 20_000);

    // ── Review Fix 1 (money-safety BLOCKER): concurrency-idempotent at the
    // DB level. completeBooking() is deliberately designed so an admin-mark
    // can race Phase 5's auto-complete job and BOTH fire the completion hook
    // (see BookingStatusService.completeBooking's comment) — this proves the
    // DOUBLE-ACCRUAL failure mode that motivated the uq_commissions_booking
    // unique partial index is closed: two truly concurrent /complete calls
    // for the SAME booking must settle into exactly ONE commission row, with
    // neither call surfacing an error.
    it("concurrency: two simultaneous /complete calls for the SAME booking produce exactly ONE commission row (uq_commissions_booking)", async () => {
      const bookingId = await seedBooking(
        "complete-concurrent",
        ServicePaymentMode.pay_at_venue, // no capture dependency — isolates the accrual race
        new Date(Date.now() + 9 * 24 * 3_600_000 + 14_400_000),
      );

      const payload = {
        booking_id: bookingId,
        payment_intent_id: null,
        vendor_id: vendorId,
        commission_rate: COMMISSION.commission_rate,
        commission_fils: COMMISSION.commission_fils,
        price_fils: COMMISSION.price_fils,
        vat_fils: COMMISSION.vat_fils,
      };

      const [firstResult, secondResult] = await Promise.allSettled([
        post("/internal/booking-payments/complete", payload),
        post("/internal/booking-payments/complete", payload),
      ]);

      // Neither call is allowed to surface an error — the loser of the race
      // must see "already accrued", not a 500 / thrown 23505.
      expect(firstResult.status).toBe("fulfilled");
      expect(secondResult.status).toBe("fulfilled");
      const firstRes = (firstResult as PromiseFulfilledResult<Response>).value;
      const secondRes = (secondResult as PromiseFulfilledResult<Response>).value;
      expect(firstRes.status).toBe(200);
      expect(secondRes.status).toBe(200);

      const firstBody = (await firstRes.json()) as any;
      const secondBody = (await secondRes.json()) as any;
      // Exactly one of the two calls actually inserted; the other reused it.
      const createdFlags = [firstBody.data.commission_created, secondBody.data.commission_created];
      expect(createdFlags.filter(Boolean)).toHaveLength(1);
      expect(firstBody.data.commission_id).toBe(secondBody.data.commission_id);

      const commissionRepo = AppDataSource.getRepository(Commission);
      const rows = await commissionRepo.find({ where: { booking_id: bookingId } as any });
      expect(rows).toHaveLength(1); // RED before uq_commissions_booking: this was 2
      createdCommissionIds.push(...rows.map((r) => r.id));
    }, 20_000);

    // ── Review Fix 2: commission_type threading (end-to-end over HTTP) ────
    it("FIXED-commission vendor: the accrued row is labeled commission_type='fixed' (not 'percentage') with the correct cap amount", async () => {
      const bookingId = await seedBooking(
        "complete-fixed-type",
        ServicePaymentMode.pay_at_venue,
        new Date(Date.now() + 9 * 24 * 3_600_000 + 18_000_000),
      );

      const res = await post("/internal/booking-payments/complete", {
        booking_id: bookingId,
        payment_intent_id: null,
        vendor_id: vendorId,
        commission_rate: 500, // a fils CAP for a fixed-rate vendor, not a percent
        commission_fils: 500,
        commission_type: "fixed",
        price_fils: COMMISSION.price_fils,
        vat_fils: COMMISSION.vat_fils,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data.commission_created).toBe(true);

      const commissionRepo = AppDataSource.getRepository(Commission);
      const commission = await commissionRepo.findOne({ where: { id: body.data.commission_id } });
      expect((commission as any)?.commission_type).toBe("fixed");
      expect(Number((commission as any)?.commission_rate)).toBe(500);
      expect((commission as any)?.commission_amount).toBe(500); // AMOUNT math unchanged
      createdCommissionIds.push((commission as any).id);
    });
  });

  it("rejects requests without a valid internal token", async () => {
    const res = await app.handle(
      new Request("http://localhost/internal/booking-payments/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingIds["prepay-capture"],
          user_id: userId,
          email: "x@test.local",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
