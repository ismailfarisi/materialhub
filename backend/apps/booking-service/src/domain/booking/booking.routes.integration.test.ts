// booking.routes.integration.test.ts
//
// Live Postgres + Redis (BOOKING_LIVE_DB=1) — boots the real booking-service
// `app` and drives the customer-facing booking APIs (Phase 4 Task 8: hold,
// create, list-own, get-own) end-to-end with real signed customer JWTs, so
// jwtAuth + requireRole + BookingController + BookingService/BookingQueryService
// are all exercised for real, not mocked. Mirrors
// internal-booking.routes.integration.test.ts's shape (imports `app`
// directly, ensureDatabase() in beforeAll, jsonwebtoken to sign tokens) and
// booking.service.integration.test.ts's seeding/cleanup pattern and
// order-service reachability probe (deposit-mode create() calls order-service
// over HTTP; pay_at_venue does not).
//
// Requires: `docker compose up -d postgres redis`. order-service is OPTIONAL
// — only the deposit-mode assertion is gated on it being reachable
// (config.serviceHost.order:config.port.order, override via ORDER_SERVICE_URL).
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
  ServiceArea,
  ServiceLocationMode,
  ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
  StaffEngagement,
  StaffLocation,
  StaffMember,
  StaffService as StaffServiceEntity,
  StaffWorkingHours,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorLocation,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import jwt from "jsonwebtoken";
import { app } from "../../app.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

// --- order-service reachability probe (mirrors booking.service.integration.test.ts) ---
const ORDER_SERVICE_BASE_URL =
  process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
let orderServiceReachable = false;
if (LIVE_DB) {
  try {
    await fetch(ORDER_SERVICE_BASE_URL, { signal: AbortSignal.timeout(2_000) });
    orderServiceReachable = true;
  } catch (err) {
    console.warn(
      `[skip] deposit-mode create() requires order-service running on ${ORDER_SERVICE_BASE_URL} (set ORDER_SERVICE_URL) — probe error: ${(err as Error).message}`,
    );
  }
}
const itOrderService = orderServiceReachable ? it : it.skip;

const unique = Date.now();
// Review Fix 1 — service_areas.area_id has no FK to a real "areas" table
// (just a uuid + unique(vendor_id, area_id) index), so any UUID works as
// long as it's the same one seeded below and sent by the home-visit tests.
const HOME_VISIT_AREA_ID = "00000000-0000-4000-8000-0000000000aa";

// Standard customer JWT — sub/email/role only (no `tv`), so jwtAuth's
// token-version revocation check is skipped entirely, same as
// vendor-invites.integration.test.ts's signCustomer helper.
function signCustomer(id: string, email: string): string {
  return jwt.sign({ sub: id, email, role: "customer" }, config.jwt.accessSecret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

async function req(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

// 6 days out — booking.service.integration.test.ts uses +5,
// internal-booking.routes.integration.test.ts uses +11; staying clear of
// both avoids any incidental slot overlap on a shared dev DB.
const BASE_DAY = new Date(Date.now() + 6 * 24 * 3_600_000);
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

describeLive(
  "Customer booking APIs (live DB + Redis) — POST /bookings/hold, POST /bookings, GET /me/bookings, GET /bookings/:id",
  () => {
    let vendorId = "";
    let locationId = "";
    let staffId = "";
    let offeringVenueId = "";
    let offeringDepositId = "";
    let offeringHomeVisitId = "";
    let customerId = "";
    let customerToken = "";
    let otherCustomerId = "";
    let otherCustomerToken = "";
    let otherBookingId = "";

    const createdBookingIds: string[] = [];
    const createdEngagementIds: string[] = [];

    // Directly inserts a booking (+ its 1:1 engagement) owned by `custId`,
    // bypassing BookingService.create() — used to seed a booking for the
    // OTHER customer without going through hold/create for it, mirroring
    // internal-booking.routes.integration.test.ts's seedBooking helper.
    async function seedBookingFor(custId: string, status: BookingStatus): Promise<string> {
      const engagementRepo = AppDataSource.getRepository(StaffEngagement);
      const bookingRepo = AppDataSource.getRepository(Booking);
      const slot = nextSlot();

      const engagement = await engagementRepo.save(
        engagementRepo.create({
          staff_member_id: staffId,
          vendor_id: vendorId,
          starts_at: slot.start,
          ends_at: slot.end,
          status: EngagementStatus.confirmed,
          kind: EngagementKind.marketplace_booking,
        }),
      );
      createdEngagementIds.push(engagement.id);

      const booking = await bookingRepo.save(
        bookingRepo.create({
          booking_number: `RT${unique.toString(36)}${slotCursor}`,
          customer_user_id: custId,
          vendor_id: vendorId,
          staff_member_id: staffId,
          engagement_id: engagement.id,
          service_offering_id: offeringVenueId,
          service_name: "Routes Test Direct-Seeded Booking",
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
          commission_fils: 0,
          starts_at: slot.start,
          ends_at: slot.end,
          status,
          source: "marketplace",
          payment_mode: ServicePaymentMode.pay_at_venue,
        }),
      );
      createdBookingIds.push(booking.id);
      return booking.id;
    }

    beforeAll(async () => {
      await ensureDatabase();

      const userRepo = AppDataSource.getRepository(User);
      const vendorRepo = AppDataSource.getRepository(Vendor);
      const locationRepo = AppDataSource.getRepository(VendorLocation);
      const staffRepo = AppDataSource.getRepository(StaffMember);
      const staffLocationRepo = AppDataSource.getRepository(StaffLocation);
      const staffServiceRepo = AppDataSource.getRepository(StaffServiceEntity);
      const workingHoursRepo = AppDataSource.getRepository(StaffWorkingHours);
      const offeringRepo = AppDataSource.getRepository(ServiceOffering);

      const customer = await userRepo.save(
        userRepo.create({
          first_name: "Routes",
          last_name: "Customer",
          email: `booking-routes-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      );
      customerId = customer.id;
      customerToken = signCustomer(customerId, customer.email);

      const otherCustomer = await userRepo.save(
        userRepo.create({
          first_name: "Other",
          last_name: "Customer",
          email: `booking-routes-other-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      );
      otherCustomerId = otherCustomer.id;
      otherCustomerToken = signCustomer(otherCustomerId, otherCustomer.email);

      const vendor = await vendorRepo.save(
        vendorRepo.create({
          name: `Booking Routes Test Vendor ${unique}`,
          slug: `booking-routes-test-vendor-${unique}`,
          business_name: "Test Salon",
          business_type: "salon",
          contact_email: `booking-routes-vendor-${unique}@test.local`,
          contact_phone: "+971500000001",
          status: VendorStatus.approved,
        }),
      );
      vendorId = vendor.id;

      const location = await locationRepo.save(
        locationRepo.create({ vendor_id: vendorId, name: "Main Branch", timezone: "Asia/Dubai" }),
      );
      locationId = location.id;

      const offeringVenue = await offeringRepo.save(
        offeringRepo.create({
          vendor_id: vendorId,
          slug: `booking-routes-venue-${unique}`,
          name: "Routes Test Service (pay at venue)",
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
          slug: `booking-routes-deposit-${unique}`,
          name: "Routes Test Service (deposit)",
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

      // Review Fix 1 — a home_visit-ONLY offering (the other two above are
      // both at_premises, the default). pay_at_venue so its tests don't need
      // order-service reachable.
      const offeringHomeVisit = await offeringRepo.save(
        offeringRepo.create({
          vendor_id: vendorId,
          slug: `booking-routes-home-visit-${unique}`,
          name: "Routes Test Service (home visit)",
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
          location_mode: ServiceLocationMode.home_visit,
          status: ServiceOfferingStatus.published,
        }),
      );
      offeringHomeVisitId = offeringHomeVisit.id;

      const staff = await staffRepo.save(
        staffRepo.create({ vendor_id: vendorId, name: `Routes Test Stylist ${unique}` }),
      );
      staffId = staff.id;
      await staffLocationRepo.save(
        staffLocationRepo.create({ staff_member_id: staffId, vendor_location_id: locationId }),
      );
      await staffServiceRepo.save(
        staffServiceRepo.create({
          staff_member_id: staffId,
          service_offering_id: offeringVenueId,
        }),
      );
      await staffServiceRepo.save(
        staffServiceRepo.create({
          staff_member_id: staffId,
          service_offering_id: offeringDepositId,
        }),
      );
      await staffServiceRepo.save(
        staffServiceRepo.create({
          staff_member_id: staffId,
          service_offering_id: offeringHomeVisitId,
        }),
      );
      await AppDataSource.getRepository(ServiceArea).save(
        AppDataSource.getRepository(ServiceArea).create({
          vendor_id: vendorId,
          area_id: HOME_VISIT_AREA_ID,
          travel_buffer_minutes: 15,
        }),
      );
      for (let dow = 0; dow <= 6; dow++) {
        await workingHoursRepo.save(
          workingHoursRepo.create({
            staff_member_id: staffId,
            location_id: locationId,
            day_of_week: dow,
            start_time: "08:00",
            end_time: "20:00",
          }),
        );
      }
    }, 30_000);

    afterAll(async () => {
      async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
        try {
          await fn();
        } catch (err) {
          console.error(`[booking.routes.integration.test] cleanup "${label}" failed`, err);
        }
      }

      const bookingRepo = AppDataSource.getRepository(Booking);
      const paymentRepo = AppDataSource.getRepository(Payment);
      const engagementRepo = AppDataSource.getRepository(StaffEngagement);

      // Sweep by vendor_id too — create()'s deposit path can strand a
      // booking row if order-service throws AFTER the transaction commits
      // (same rationale as booking.service.integration.test.ts).
      let bookingIds = [...createdBookingIds];
      if (vendorId) {
        await step("resolve stray bookings by vendor_id", async () => {
          const stray = await bookingRepo
            .createQueryBuilder("b")
            .withDeleted()
            .select("b.id", "id")
            .where("b.vendor_id = :vendorId", { vendorId })
            .getRawMany<{ id: string }>();
          bookingIds = Array.from(new Set([...bookingIds, ...stray.map((r) => r.id)]));
        });
      }

      if (bookingIds.length) {
        await step("null out bookings.payment_id", () =>
          bookingRepo
            .createQueryBuilder()
            .update()
            .set({ payment_id: null })
            .where("id IN (:...ids)", { ids: bookingIds })
            .execute(),
        );
        await step("delete payments", () =>
          paymentRepo
            .createQueryBuilder()
            .delete()
            .where("booking_id IN (:...ids)", { ids: bookingIds })
            .execute(),
        );
        await step("delete booking_status_history", () =>
          AppDataSource.getRepository(BookingStatusHistory)
            .createQueryBuilder()
            .delete()
            .where("booking_id IN (:...ids)", { ids: bookingIds })
            .execute(),
        );
        await step("delete bookings", () =>
          bookingRepo
            .createQueryBuilder()
            .delete()
            .where("id IN (:...ids)", { ids: bookingIds })
            .execute(),
        );
      }

      if (staffId) {
        await step("delete engagements by staff", () =>
          engagementRepo
            .createQueryBuilder()
            .delete()
            .where("staff_member_id = :staffId", { staffId })
            .execute(),
        );
        await step("delete staff", () =>
          AppDataSource.getRepository(StaffMember)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id: staffId })
            .execute(),
        );
      }
      if (offeringVenueId) {
        await step("delete offering (venue)", () =>
          AppDataSource.getRepository(ServiceOffering)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id: offeringVenueId })
            .execute(),
        );
      }
      if (offeringDepositId) {
        await step("delete offering (deposit)", () =>
          AppDataSource.getRepository(ServiceOffering)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id: offeringDepositId })
            .execute(),
        );
      }
      if (offeringHomeVisitId) {
        await step("delete offering (home visit)", () =>
          AppDataSource.getRepository(ServiceOffering)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id: offeringHomeVisitId })
            .execute(),
        );
      }
      if (vendorId) {
        await step("delete service areas", () =>
          AppDataSource.getRepository(ServiceArea)
            .createQueryBuilder()
            .delete()
            .where("vendor_id = :vendorId", { vendorId })
            .execute(),
        );
      }
      if (locationId) {
        await step("delete location", () =>
          AppDataSource.getRepository(VendorLocation)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id: locationId })
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
      if (otherCustomerId) {
        await step("delete other customer", () =>
          AppDataSource.getRepository(User)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id: otherCustomerId })
            .execute(),
        );
      }
    }, 30_000);

    it("rejects unauthenticated requests with 401", async () => {
      const resHold = await req("POST", "/bookings/hold", undefined, {});
      expect(resHold.status).toBe(401);

      const resCreate = await req("POST", "/bookings", undefined, {});
      expect(resCreate.status).toBe(401);

      const resMine = await req("GET", "/me/bookings");
      expect(resMine.status).toBe(401);

      const resById = await req("GET", "/bookings/00000000-0000-4000-8000-000000000000");
      expect(resById.status).toBe(401);
    });

    it("POST /bookings/hold returns a hold token + allowed_payment_modes for a pay_at_venue offering", async () => {
      const slot = nextSlot();
      const res = await req("POST", "/bookings/hold", customerToken, {
        offering_id: offeringVenueId,
        staff_member_id: staffId,
        location_id: locationId,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
      });
      expect(res.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const json = (await res.json()) as any;
      expect(typeof json.data.hold_token).toBe("string");
      expect(json.data.staff_member_id).toBe(staffId);
      expect(json.data.allowed_payment_modes).toEqual(["pay_at_venue"]);
    });

    it("POST /bookings (pay_at_venue) with a valid hold_token confirms the booking, client_secret null", async () => {
      const slot = nextSlot();
      const holdRes = await req("POST", "/bookings/hold", customerToken, {
        offering_id: offeringVenueId,
        staff_member_id: staffId,
        location_id: locationId,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
      });
      expect(holdRes.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const holdJson = (await holdRes.json()) as any;

      const createRes = await req("POST", "/bookings", customerToken, {
        offering_id: offeringVenueId,
        staff_member_id: staffId,
        location_id: locationId,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        hold_token: holdJson.data.hold_token,
      });
      expect(createRes.status).toBe(201);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const createJson = (await createRes.json()) as any;
      expect(createJson.data.booking.status).toBe(BookingStatus.confirmed);
      expect(createJson.data.booking.customer_user_id).toBe(customerId);
      expect(createJson.data.client_secret).toBeNull();
      createdBookingIds.push(createJson.data.booking.id);
    });

    // ── Review Fix 1: key the home-visit address requirement on the
    // OFFERING's location_mode, not the client-supplied customer_area_id ──
    it("POST /bookings for a home_visit-only offering WITHOUT customer_address returns 422, not a false 400/409", async () => {
      const slot = nextSlot();
      const res = await req("POST", "/bookings", customerToken, {
        offering_id: offeringHomeVisitId,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        // Deliberately bogus — the location_mode/address check runs BEFORE
        // hold verification/staff resolution in BookingService.create(), so
        // this 422 fires without ever touching the hold.
        hold_token: "irrelevant-address-check-runs-first",
      });
      expect(res.status).toBe(422);
      // Before the fix, omitting customer_area_id on a home_visit-only
      // offering made the service misread it as "not home-visit" and (since
      // no location_id was sent either, as here) threw a 400 "locationId is
      // required" instead — proven via a RED run against the pre-fix code
      // (see task-8-report.md's Review Fixes section). Had a location_id
      // been sent too, that same misread would instead fall through to the
      // availability engine (0 slots for the location_mode mismatch) and
      // surface as a 409.
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(409);
    });

    it("POST /bookings for a home_visit-only offering WITH customer_area_id + customer_address succeeds", async () => {
      const slot = nextSlot();
      const holdRes = await req("POST", "/bookings/hold", customerToken, {
        offering_id: offeringHomeVisitId,
        staff_member_id: staffId,
        customer_area_id: HOME_VISIT_AREA_ID,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
      });
      expect(holdRes.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const holdJson = (await holdRes.json()) as any;

      const createRes = await req("POST", "/bookings", customerToken, {
        offering_id: offeringHomeVisitId,
        staff_member_id: staffId,
        customer_area_id: HOME_VISIT_AREA_ID,
        customer_address: { line1: "Marina Walk", city: "Dubai", country: "AE" },
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        hold_token: holdJson.data.hold_token,
      });
      expect(createRes.status).toBe(201);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const createJson = (await createRes.json()) as any;
      expect(createJson.data.booking.status).toBe(BookingStatus.confirmed);
      createdBookingIds.push(createJson.data.booking.id);
    });

    it("POST /bookings for an at_premises offering with a STRAY customer_area_id (no address) does NOT throw the home-visit 422 — booking still succeeds", async () => {
      const slot = nextSlot();
      const holdRes = await req("POST", "/bookings/hold", customerToken, {
        offering_id: offeringVenueId,
        staff_member_id: staffId,
        location_id: locationId,
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
      });
      expect(holdRes.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const holdJson = (await holdRes.json()) as any;

      const createRes = await req("POST", "/bookings", customerToken, {
        offering_id: offeringVenueId, // at_premises (default)
        staff_member_id: staffId,
        location_id: locationId,
        // Stray/erroneous — offeringVenueId is at_premises, so this must be
        // ignored, not treated as "opting into home visit" (the reverse
        // false-positive review Fix 1 also flagged).
        customer_area_id: "00000000-0000-4000-8000-000000000099",
        starts_at: slot.start.toISOString(),
        ends_at: slot.end.toISOString(),
        hold_token: holdJson.data.hold_token,
      });
      expect(createRes.status).toBe(201);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const createJson = (await createRes.json()) as any;
      expect(createJson.data.booking.status).toBe(BookingStatus.confirmed);
      createdBookingIds.push(createJson.data.booking.id);
    });

    it("GET /me/bookings lists only the caller's own bookings", async () => {
      otherBookingId = await seedBookingFor(otherCustomerId, BookingStatus.confirmed);

      const res = await req("GET", "/me/bookings", customerToken);
      expect(res.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const json = (await res.json()) as any;
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const ids: string[] = json.data.map((b: any) => b.id);
      expect(ids).not.toContain(otherBookingId);
      expect(ids.length).toBeGreaterThan(0);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      for (const b of json.data as any[]) {
        expect(b.customer_user_id).toBe(customerId);
      }
    });

    it("GET /me/bookings as the other customer returns only their own booking", async () => {
      const res = await req("GET", "/me/bookings", otherCustomerToken);
      expect(res.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const json = (await res.json()) as any;
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const ids: string[] = json.data.map((b: any) => b.id);
      expect(ids).toContain(otherBookingId);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      for (const b of json.data as any[]) {
        expect(b.customer_user_id).toBe(otherCustomerId);
      }
    });

    // ── Review Fix 2: MyBookingsQuery.status is now a constrained enum ──────
    it("GET /me/bookings?status=bogus returns 400 (invalid status enum, not a silent empty result)", async () => {
      const res = await req("GET", "/me/bookings?status=bogus", customerToken);
      expect(res.status).toBe(400);
    });

    it("GET /me/bookings?status=confirmed returns only the caller's confirmed bookings", async () => {
      const res = await req("GET", "/me/bookings?status=confirmed", customerToken);
      expect(res.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const json = (await res.json()) as any;
      expect(json.data.length).toBeGreaterThan(0);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      for (const b of json.data as any[]) {
        expect(b.status).toBe(BookingStatus.confirmed);
        expect(b.customer_user_id).toBe(customerId);
      }
    });

    it("GET /bookings/:id returns the caller's own booking", async () => {
      const ownId = createdBookingIds.find((id) => id !== otherBookingId) as string;
      const res = await req("GET", `/bookings/${ownId}`, customerToken);
      expect(res.status).toBe(200);
      // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
      const json = (await res.json()) as any;
      expect(json.data.id).toBe(ownId);
      expect(json.data.customer_user_id).toBe(customerId);
    });

    it("GET /bookings/:id for another customer's booking returns 404 (not 403 — matches OrderQueryService convention)", async () => {
      const res = await req("GET", `/bookings/${otherBookingId}`, customerToken);
      expect(res.status).toBe(404);
    });

    it("GET /bookings/:id for a nonexistent id returns 404", async () => {
      const res = await req("GET", "/bookings/00000000-0000-4000-8000-000000000000", customerToken);
      expect(res.status).toBe(404);
    });

    itOrderService(
      "POST /bookings (deposit) with order-service reachable returns pending_payment + client_secret",
      async () => {
        const slot = nextSlot();
        const holdRes = await req("POST", "/bookings/hold", customerToken, {
          offering_id: offeringDepositId,
          staff_member_id: staffId,
          location_id: locationId,
          starts_at: slot.start.toISOString(),
          ends_at: slot.end.toISOString(),
        });
        expect(holdRes.status).toBe(200);
        // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
        const holdJson = (await holdRes.json()) as any;

        const createRes = await req("POST", "/bookings", customerToken, {
          offering_id: offeringDepositId,
          staff_member_id: staffId,
          location_id: locationId,
          starts_at: slot.start.toISOString(),
          ends_at: slot.end.toISOString(),
          hold_token: holdJson.data.hold_token,
        });
        expect(createRes.status).toBe(201);
        // biome-ignore lint/suspicious/noExplicitAny: test-only response shape
        const createJson = (await createRes.json()) as any;
        expect(createJson.data.booking.status).toBe(BookingStatus.pending_payment);
        expect(typeof createJson.data.client_secret).toBe("string");
        createdBookingIds.push(createJson.data.booking.id);
      },
    );
  },
);
