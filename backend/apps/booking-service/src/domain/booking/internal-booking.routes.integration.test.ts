// internal-booking.routes.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1) — mirrors
// internal-booking-payment.integration.test.ts's shape (order-service): boots
// the real booking-service `app`, seeds the minimal FK chain a `bookings` row
// needs, and drives the two /internal/bookings/:id/* routes end-to-end with a
// real internal-service JWT (iss=order-service — the caller per the Task 3
// brief) so BOTH the internalServiceAuth guard AND the route -> controller ->
// BookingStatusService wiring are exercised for real, not mocked.
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
import jwt from "jsonwebtoken";
import { app } from "../../app.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

const INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ?? "test-internal-secret-for-booking-webhook-routing";
process.env.INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
// The caller for these two routes is order-service's WebhookService (via
// BookingLifecycleClient) — sign with that issuer, exactly what the guard's
// ALLOWED_ISSUERS allowlist (libs/guards/src/internal-service-auth.ts)
// expects for this boundary.
const orderServiceToken = jwt.sign({ iss: "order-service" }, INTERNAL_SECRET, {
  expiresIn: "5m",
});
const wrongIssuerToken = jwt.sign({ iss: "not-a-real-service" }, INTERNAL_SECRET, {
  expiresIn: "5m",
});

async function post(path: string, body: unknown, token = orderServiceToken) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

let vendorId = "";
let customerId = "";
let staffId = "";
let offeringId = "";
const createdBookingIds: string[] = [];
const createdEngagementIds: string[] = [];

const BASE_DAY = new Date(Date.now() + 11 * 24 * 3_600_000);
let slotCursor = 0;
function nextSlot(): { start: Date; end: Date } {
  slotCursor += 45;
  const start = new Date(
    Date.UTC(
      BASE_DAY.getUTCFullYear(),
      BASE_DAY.getUTCMonth(),
      BASE_DAY.getUTCDate(),
      9,
      slotCursor,
      0,
    ),
  );
  return { start, end: new Date(start.getTime() + 30 * 60_000) };
}

async function seedBooking(status: BookingStatus): Promise<string> {
  const engagementRepo = AppDataSource.getRepository(StaffEngagement);
  const bookingRepo = AppDataSource.getRepository(Booking);
  const slot = nextSlot();

  const engagement = await engagementRepo.save(
    engagementRepo.create({
      staff_member_id: staffId,
      vendor_id: vendorId,
      starts_at: slot.start,
      ends_at: slot.end,
      status:
        status === BookingStatus.pending_payment
          ? EngagementStatus.held
          : EngagementStatus.confirmed,
      kind: EngagementKind.marketplace_booking,
    }),
  );
  createdEngagementIds.push(engagement.id);

  const booking = await bookingRepo.save(
    bookingRepo.create({
      booking_number: `WHR${unique.toString(36)}${slotCursor}`,
      customer_user_id: customerId,
      vendor_id: vendorId,
      staff_member_id: staffId,
      engagement_id: engagement.id,
      service_offering_id: offeringId,
      service_name: "Webhook Routing Test Service",
      duration_minutes: 30,
      price_fils: 15_000,
      vat_fils: 0,
      deposit_fils: 0,
      deposit_type: DepositType.none,
      cancellation_window_hours: 24,
      cancellation_refund_policy: CancellationRefundPolicy.full,
      cancellation_penalty_percent: 100,
      reschedule_window_hours: 24,
      commission_rate: 10,
      commission_fils: 1500,
      starts_at: slot.start,
      ends_at: slot.end,
      status,
      source: "marketplace",
      payment_mode: ServicePaymentMode.deposit,
    }),
  );
  createdBookingIds.push(booking.id);
  return booking.id;
}

describeLive("POST /internal/bookings/:id/{confirm,payment-failed} (live DB)", () => {
  beforeAll(async () => {
    await ensureDatabase();

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Webhook",
        last_name: "Customer",
        email: `webhook-routing-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Webhook Routing Test Vendor ${unique}`,
        slug: `webhook-routing-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `webhook-routing-vendor-${unique}@test.local`,
        contact_phone: "+971500000002",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Webhook Routing Stylist ${unique}` }),
    );
    staffId = staff.id;

    const offering = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `webhook-routing-test-service-${unique}`,
        name: "Webhook Routing Test Service",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 90,
        price_fils: 15_000,
        vat_rate: 5 as unknown as number,
        deposit_type: DepositType.none,
        deposit_value: 0,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: ServicePaymentMode.deposit,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringId = offering.id;
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[internal-booking.routes.integration.test] cleanup "${label}" failed`, err);
      }
    }

    if (createdBookingIds.length) {
      await step("delete booking_status_history", () =>
        AppDataSource.getRepository(BookingStatusHistory)
          .createQueryBuilder()
          .delete()
          .where("booking_id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
      await step("delete bookings", () =>
        AppDataSource.getRepository(Booking)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
    }
    if (createdEngagementIds.length) {
      await step("delete engagements", () =>
        AppDataSource.getRepository(StaffEngagement)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdEngagementIds })
          .execute(),
      );
    }
    if (offeringId) {
      await step("delete offering", () =>
        AppDataSource.getRepository(ServiceOffering)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: offeringId })
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

  it("POST /:id/confirm delegates to BookingStatusService.confirm — flips pending_payment -> confirmed", async () => {
    const bookingId = await seedBooking(BookingStatus.pending_payment);

    const res = await post(`/internal/bookings/${bookingId}/confirm`, {});
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.data.status).toBe(BookingStatus.confirmed);

    const dbBooking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    expect(dbBooking?.status).toBe(BookingStatus.confirmed);
  });

  it("POST /:id/confirm is idempotent on a retried delivery (already-confirmed booking)", async () => {
    const bookingId = await seedBooking(BookingStatus.pending_payment);

    const first = await post(`/internal/bookings/${bookingId}/confirm`, {});
    expect(first.status).toBe(200);

    const second = await post(`/internal/bookings/${bookingId}/confirm`, {});
    expect(second.status).toBe(200);
    const json = (await second.json()) as any;
    expect(json.data.status).toBe(BookingStatus.confirmed);
  });

  it("POST /:id/payment-failed delegates to BookingStatusService.handlePaymentFailed — does NOT transition a pending_payment booking", async () => {
    const bookingId = await seedBooking(BookingStatus.pending_payment);

    const res = await post(`/internal/bookings/${bookingId}/payment-failed`, {
      reason: "card_declined",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.data.status).toBe(BookingStatus.pending_payment);

    const dbBooking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    expect(dbBooking?.status).toBe(BookingStatus.pending_payment);
  });

  it("rejects a caller that isn't in the internal-service issuer allowlist", async () => {
    const bookingId = await seedBooking(BookingStatus.pending_payment);

    const res = await post(`/internal/bookings/${bookingId}/confirm`, {}, wrongIssuerToken);
    expect(res.status).toBe(401);
  });

  it("rejects a request with no bearer token", async () => {
    const bookingId = await seedBooking(BookingStatus.pending_payment);

    const res = await app.handle(
      new Request(`http://localhost/internal/bookings/${bookingId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });
});
