// booking.service.integration.test.ts
//
// Live Postgres + Redis + real order-service HTTP (BOOKING_LIVE_DB=1).
// Mirrors the live-gate pattern used across the codebase (REELS_LIVE_DB,
// order-service's internal-booking-payment.integration.test.ts,
// booking-hold.service.live.test.ts): boots real clients against
// docker-compose's postgres/redis and a REAL running order-service process
// (BookingPaymentClient talks HTTP, not in-process — see booking-payment
// .client.ts's header comment on why: booking-service and order-service are
// separate Elysia apps, the same boundary a production deploy would cross).
//
// Requires: `docker compose up -d postgres redis` AND order-service running
// (`bun run --cwd apps/order-service dev`, or docker-compose's order-service
// container) on config.serviceHost.order:config.port.order (localhost:3003
// by default) with the SAME INTERNAL_SERVICE_SECRET this process loads via
// --env-file=.env.
//
// SAFETY: refuses to run against a live Stripe key — only ever exercises
// `sk_test_...` (deposit/prepay scenarios hit real Stripe TEST mode via
// order-service, same as internal-booking-payment.integration.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  BookingStatusHistory,
  Category,
  CommissionType,
  DepositType,
  EngagementStatus,
  Payment,
  ServiceArea,
  ServiceLocationMode,
  ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
  SiteSetting,
  StaffEngagement,
  StaffLocation,
  StaffMember,
  StaffService as StaffServiceEntity,
  StaffTimeOff,
  StaffWorkingHours,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorHoliday,
  VendorLocation,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { ConflictError, UnprocessableEntityError } from "@materialhub/plugins";
import { type RedisClientType, createClient } from "redis";
import { AvailabilityCache } from "../availability/availability-cache.ts";
import { AvailabilityService } from "../availability/availability.service.ts";
import { BookingHoldService, type RedisLike } from "./booking-hold.service.ts";
import { BookingPaymentClient } from "./booking-payment.client.ts";
import { BookingService, PayAtVenueUnavailableError } from "./booking.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

if (LIVE_DB && !config.stripe.secretKey.startsWith("sk_test_")) {
  throw new Error(
    "BOOKING_LIVE_DB=1 requires a Stripe TEST secret key (sk_test_...) — refusing to run against a live key.",
  );
}

// --- order-service reachability probe --------------------------------------
// Only the deposit/prepay `create()` calls make a REAL HTTP call to
// order-service's `/internal/booking-payments/*` routes via
// BookingPaymentClient (see that file's header comment). If order-service
// isn't running, `create()` throws `ServiceUnavailableError` AFTER the
// booking transaction has already committed, leaving a stranded `booking`
// row that (before this fix) got left untracked and later blew up `afterAll`
// with a confusing FK "cleanup failed" error that masked the real
// "order-service unreachable" cause. Probe once, synchronously, before test
// registration (bun:test registers `it(...)` bodies at file-load time, so
// this can't happen inside `beforeAll`), and skip ONLY the two tests that
// actually need order-service — the other 5 tests have no dependency on it.
const ORDER_SERVICE_BASE_URL =
  process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
let orderServiceReachable = false;
if (LIVE_DB) {
  try {
    await fetch(ORDER_SERVICE_BASE_URL, { signal: AbortSignal.timeout(2_000) });
    orderServiceReachable = true;
  } catch (err) {
    console.warn(
      `[skip] deposit/prepay require order-service running on ${ORDER_SERVICE_BASE_URL} (set ORDER_SERVICE_URL); start it with: bun --env-file=.env apps/order-service/src/index.ts — probe error: ${(err as Error).message}`,
    );
  }
}
// bun:test's `it.skipIf` renders as a distinct SKIP status (not a silent
// pass) when order-service isn't reachable.
const itOrderService = orderServiceReachable ? it : it.skip;

const unique = Date.now();
const COMPLIANT_ADDRESS = { line1: "Marina Walk", city: "Dubai", country: "AE" };
// Review Fix 1 — service_areas.area_id has no FK to a real "areas" table
// (just a uuid + unique(vendor_id, area_id) index; see service-area.entity.ts),
// so any UUID works as long as it's the SAME one seeded below and sent by
// the home-visit test requests.
const HOME_VISIT_AREA_ID = crypto.randomUUID();

// 5 days out, fixed at 10:00 UTC (14:00 Asia/Dubai) — comfortably inside the
// 08:00-20:00 Dubai working-hours window seeded below, far enough out to
// clear min_notice_minutes=0/max_advance_days generously, and avoids any
// local-midnight edge cases in expandWorkingHours.
const BASE_DAY = new Date(Date.now() + 5 * 24 * 3_600_000);
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

describeLive("BookingService.create (live DB + Redis + order-service HTTP)", () => {
  let redis: RedisClientType;
  let holdService: BookingHoldService;
  let availabilityService: AvailabilityService;
  let bookingService: BookingService;
  let vendorId: string;
  let locationId: string;
  let customerId: string;

  const offerings: Record<string, string> = {};
  const staff: Record<string, string> = {};

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  const createdStaffIds: string[] = [];
  const createdOfferingIds: string[] = [];
  const createdServiceAreaIds: string[] = [];
  const holdKeysToClean: string[] = [];

  async function seedStaffFor(label: string, offeringId: string): Promise<string> {
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const staffLocationRepo = AppDataSource.getRepository(StaffLocation);
    const staffServiceRepo = AppDataSource.getRepository(StaffServiceEntity);
    const workingHoursRepo = AppDataSource.getRepository(StaffWorkingHours);

    const member = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Booking Test Stylist ${label}` }),
    );
    createdStaffIds.push(member.id);
    staff[label] = member.id;

    await staffLocationRepo.save(
      staffLocationRepo.create({ staff_member_id: member.id, vendor_location_id: locationId }),
    );
    await staffServiceRepo.save(
      staffServiceRepo.create({ staff_member_id: member.id, service_offering_id: offeringId }),
    );

    for (let dow = 0; dow <= 6; dow++) {
      await workingHoursRepo.save(
        workingHoursRepo.create({
          staff_member_id: member.id,
          location_id: locationId,
          day_of_week: dow,
          start_time: "08:00",
          end_time: "20:00",
        }),
      );
    }
    return member.id;
  }

  async function seedOffering(
    label: string,
    paymentMode: ServicePaymentMode,
    locationMode: ServiceLocationMode = ServiceLocationMode.at_premises,
  ): Promise<string> {
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);
    const offering = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `booking-svc-test-${label}-${unique}`,
        name: `Booking Svc Test ${label}`,
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 90,
        price_fils: 20_000,
        vat_rate: 5 as any,
        deposit_type: DepositType.percent,
        deposit_value: 20,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: paymentMode,
        location_mode: locationMode,
        status: ServiceOfferingStatus.published,
      }),
    );
    createdOfferingIds.push(offering.id);
    offerings[label] = offering.id;
    return offering.id;
  }

  beforeAll(async () => {
    await ensureDatabase();

    redis = createClient({
      socket: { host: config.redis.host, port: config.redis.port },
      password: config.redis.password,
    });
    await redis.connect();
    holdService = new BookingHoldService(redis as unknown as RedisLike);

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const locationRepo = AppDataSource.getRepository(VendorLocation);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Booking",
        last_name: "Customer",
        email: `booking-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Booking Svc Test Vendor ${unique}`,
        slug: `booking-svc-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `booking-svc-vendor-${unique}@test.local`,
        contact_phone: "+971500000000",
        status: VendorStatus.approved,
        // Deterministic commission so the snapshot assertion isn't at the
        // mercy of whatever global_commission_rate happens to be seeded in
        // this shared dev DB.
        commission_type: CommissionType.percentage,
        commission_value: 12 as any,
      }),
    );
    vendorId = vendor.id;

    const location = await locationRepo.save(
      locationRepo.create({
        vendor_id: vendorId,
        name: "Main Branch",
        timezone: "Asia/Dubai",
      }),
    );
    locationId = location.id;

    await seedOffering("venue", ServicePaymentMode.pay_at_venue);
    await seedOffering("deposit", ServicePaymentMode.deposit);
    await seedOffering("prepay", ServicePaymentMode.prepay);
    await seedOffering("conflict", ServicePaymentMode.pay_at_venue);
    // Review Fix 1 — a home_visit-ONLY offering (existing offerings above are
    // all at_premises, the default). pay_at_venue so these tests don't need
    // order-service reachable.
    await seedOffering(
      "home-visit",
      ServicePaymentMode.pay_at_venue,
      ServiceLocationMode.home_visit,
    );

    await seedStaffFor("venue", offerings.venue as string);
    // A second staff member eligible for the SAME "venue" offering/location —
    // used by the hold-binding test below so a hold token minted for `venue`
    // can be presented (and must be rejected) against a genuinely different,
    // also-eligible staff member rather than a staff id that would fail
    // availability for an unrelated reason.
    await seedStaffFor("venue2", offerings.venue as string);
    await seedStaffFor("deposit", offerings.deposit as string);
    await seedStaffFor("prepay", offerings.prepay as string);
    await seedStaffFor("conflict", offerings.conflict as string);
    await seedStaffFor("home-visit", offerings["home-visit"] as string);

    const serviceAreaRepo = AppDataSource.getRepository(ServiceArea);
    const homeVisitArea = await serviceAreaRepo.save(
      serviceAreaRepo.create({
        vendor_id: vendorId,
        area_id: HOME_VISIT_AREA_ID,
        travel_buffer_minutes: 15,
      }),
    );
    createdServiceAreaIds.push(homeVisitArea.id);

    availabilityService = new AvailabilityService(
      AppDataSource.getRepository(ServiceOffering),
      AppDataSource.getRepository(StaffMember),
      AppDataSource.getRepository(StaffWorkingHours),
      AppDataSource.getRepository(StaffTimeOff),
      AppDataSource.getRepository(StaffEngagement),
      AppDataSource.getRepository(VendorLocation),
      AppDataSource.getRepository(VendorHoliday),
      AppDataSource.getRepository(ServiceArea),
      new AvailabilityCache(),
    );

    bookingService = new BookingService(
      AppDataSource.getRepository(ServiceOffering),
      AppDataSource.getRepository(Booking),
      AppDataSource.getRepository(ServiceArea),
      AppDataSource.getRepository(User),
      AppDataSource.getRepository(Vendor),
      AppDataSource.getRepository(Category),
      AppDataSource.getRepository(SiteSetting),
      availabilityService,
      holdService,
      new BookingPaymentClient(),
    );
  }, 30_000);

  afterAll(async () => {
    try {
      if (holdKeysToClean.length) await redis.del(holdKeysToClean);
    } catch {
      // best-effort cleanup
    }
    await redis.quit();

    const paymentRepo = AppDataSource.getRepository(Payment);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const engagementRepo = AppDataSource.getRepository(StaffEngagement);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);
    const staffRepo = AppDataSource.getRepository(StaffMember);

    // Run each cleanup step independently: one failing delete (e.g. an FK
    // violation) logs a clear, labeled error but does NOT abort the rest of
    // cleanup or mask an earlier test failure — this replaces the old
    // single try/catch where a `staff_engagements` FK violation (caused by
    // a stranded booking row — see below) produced one opaque "cleanup
    // failed" line that hid the real root cause.
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[booking.service.integration.test] cleanup step "${label}" failed`, err);
      }
    }

    // Resolve every booking scoped to THIS test run's vendor (a fresh row
    // created in beforeAll with a Date.now()-unique slug — safe, not a
    // blanket delete), not just `createdBookingIds`. `bookingService.create`
    // commits the booking transaction BEFORE the deposit/prepay
    // order-service HTTP call; if that call throws (e.g. order-service is
    // down), the test never reaches its `createdBookingIds.push(...)` line,
    // yet the booking row still exists and still holds a FK into
    // `staff_engagements` (fk_bookings_engagement). Sweeping by vendor_id
    // catches that stranded row too, so the engagement/staff deletes below
    // don't 23503.
    let bookingIds = [...createdBookingIds];
    if (vendorId) {
      await step("resolve stray bookings by vendor_id", async () => {
        const strayBookings = await bookingRepo
          .createQueryBuilder("b")
          .withDeleted()
          .select("b.id", "id")
          .where("b.vendor_id = :vendorId", { vendorId })
          .getRawMany<{ id: string }>();
        bookingIds = Array.from(new Set([...bookingIds, ...strayBookings.map((r) => r.id)]));
      });
    }

    if (bookingIds.length) {
      // bookings.payment_id -> payments.id (fk_bookings_payment) AND
      // payments.booking_id -> bookings.id (fk_payments_booking) is a
      // mutual FK pair — null out bookings.payment_id first so neither
      // delete below violates the other's constraint.
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

    if (createdEngagementIds.length) {
      await step("delete tracked engagements", () =>
        engagementRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdEngagementIds })
          .execute(),
      );
    }
    // Also sweep any engagement created by a booking (booking delete above
    // doesn't cascade) keyed by staff, since we know the staff ids.
    if (createdStaffIds.length) {
      await step("delete staff engagements", () =>
        engagementRepo
          .createQueryBuilder()
          .delete()
          .where("staff_member_id IN (:...ids)", { ids: createdStaffIds })
          .execute(),
      );
      await step("delete staff members", () =>
        staffRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdStaffIds })
          .execute(),
      );
    }
    if (createdOfferingIds.length) {
      await step("delete offerings", () =>
        offeringRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdOfferingIds })
          .execute(),
      );
    }
    if (createdServiceAreaIds.length) {
      await step("delete service areas", () =>
        AppDataSource.getRepository(ServiceArea)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdServiceAreaIds })
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
  }, 30_000);

  it("pay_at_venue: confirms the booking and the engagement immediately, no payment call", async () => {
    const slot = slotAt(0);
    const staffId = staff.venue as string;
    const token = await holdService.hold(staffId, slot);
    expect(token).not.toBeNull();
    holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

    const result = await bookingService.create(customerId, {
      offeringId: offerings.venue as string,
      staffMemberId: staffId,
      locationId,
      startsAt: slot.start,
      endsAt: slot.end,
      holdToken: token as string,
    });
    createdBookingIds.push(result.booking.id);
    createdEngagementIds.push(result.engagement.id);

    expect(result.booking.status).toBe(BookingStatus.confirmed);
    expect(result.engagement.status).toBe(EngagementStatus.confirmed);
    expect(result.clientSecret).toBeNull();
    expect(result.booking.commission_fils).toBeGreaterThan(0);
    // netExVat = round(20000 / 1.05) = 19048; 12% of that = 2286.
    expect(Number(result.booking.commission_rate)).toBe(12);
    expect(result.booking.commission_fils).toBe(2286);

    const dbBooking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: result.booking.id },
    });
    expect(dbBooking?.status).toBe(BookingStatus.confirmed);
    const dbEngagement = await AppDataSource.getRepository(StaffEngagement).findOne({
      where: { id: result.engagement.id },
    });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);

    // The hold was released once the booking durably existed.
    const stillHeld = await redis.get(holdService.key(staffId, slot));
    expect(stillHeld).toBeNull();
  });

  it("pay_at_venue: throws PayAtVenueUnavailableError (422) when the strike gate blocks the customer", async () => {
    const blockedService = new BookingService(
      AppDataSource.getRepository(ServiceOffering),
      AppDataSource.getRepository(Booking),
      AppDataSource.getRepository(ServiceArea),
      AppDataSource.getRepository(User),
      AppDataSource.getRepository(Vendor),
      AppDataSource.getRepository(Category),
      AppDataSource.getRepository(SiteSetting),
      availabilityService,
      holdService,
      new BookingPaymentClient(),
    );
    // Override the seam to simulate Phase 5's strike gate blocking.
    (blockedService as any).checkPayAtVenueAllowed = async () => ({ allowed: false });

    const slot = slotAt(600); // far from other scenarios' slots
    const staffId = staff.venue as string;
    const token = await holdService.hold(staffId, slot);
    expect(token).not.toBeNull();
    holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

    let threw: unknown;
    try {
      await blockedService.create(customerId, {
        offeringId: offerings.venue as string,
        staffMemberId: staffId,
        locationId,
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(PayAtVenueUnavailableError);
    expect((threw as PayAtVenueUnavailableError).statusCode).toBe(422);
    expect((threw as PayAtVenueUnavailableError).code).toBe("pay_at_venue_unavailable");

    // No booking/engagement row should exist for this slot — the gate fired
    // before the DB transaction, and the hold is still live (untouched) so
    // the customer can retry with a different payment mode.
    const stillHeld = await redis.get(holdService.key(staffId, slot));
    expect(stillHeld).toBe(token);
  });

  // ── Review Fix 1: key the home-visit address requirement on the
  // OFFERING's location_mode, not the client-supplied customerAreaId ──────
  describe("home-visit address requirement (review Fix 1)", () => {
    it("create(): a home_visit-only offering WITHOUT customer_area_id/customer_address throws 422, not a false 400/409", async () => {
      const slot = slotAt(720);

      let threw: unknown;
      try {
        // No holdToken verification is ever reached — the location_mode
        // check now runs before assertHeldFor, so a bogus token is fine
        // here (mirrors the DTO-level route test's rationale).
        await bookingService.create(customerId, {
          offeringId: offerings["home-visit"] as string,
          startsAt: slot.start,
          endsAt: slot.end,
          holdToken: "irrelevant-address-check-runs-first",
        });
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(UnprocessableEntityError);
      expect((threw as UnprocessableEntityError).statusCode).toBe(422);
      expect((threw as Error).message).toMatch(/customerAddress is required for home-visit/);

      // Before the fix, wantsHomeVisit was derived from `!!customerAreaId`
      // (client-supplied), not the offering — so omitting customerAreaId
      // here misread this home_visit-ONLY offering as "not home-visit" and
      // threw a 400 "locationId is required" instead (proven via a RED run
      // against the pre-fix code — see task-8-report.md's Review Fixes
      // section). Had a locationId been sent too, that same misread would
      // instead fall through to the availability engine (0 slots for the
      // location_mode mismatch) and surface as a 409 — see the sibling
      // "at_premises...STRAY customer_area_id" test below for the mirror
      // case of the OLD code's false-positive 422.
      expect((threw as { statusCode?: number }).statusCode).not.toBe(400);
      expect((threw as { statusCode?: number }).statusCode).not.toBe(409);
    });

    it("create(): a home_visit-only offering WITH customer_area_id + customer_address succeeds", async () => {
      // A fresh, never-booked staff member ("home-visit"), so any in-window
      // offset works — chosen well clear of the 08:00-20:00 Dubai boundary
      // (BASE_DAY 10:00 UTC = 14:00 Dubai; +/-360min keeps it in-window).
      const slot = slotAt(30);
      const staffId = staff["home-visit"] as string;
      const token = await holdService.hold(staffId, slot);
      expect(token).not.toBeNull();
      holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

      const result = await bookingService.create(customerId, {
        offeringId: offerings["home-visit"] as string,
        staffMemberId: staffId,
        customerAreaId: HOME_VISIT_AREA_ID,
        customerAddress: COMPLIANT_ADDRESS,
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
      createdBookingIds.push(result.booking.id);
      createdEngagementIds.push(result.engagement.id);

      expect(result.booking.status).toBe(BookingStatus.confirmed);
      expect(result.booking.customer_address).toEqual(COMPLIANT_ADDRESS);
      expect(result.booking.location_id).toBeNull();
    });

    it("create(): an at_premises offering with a STRAY customer_area_id but no address does NOT throw the home-visit 422 (reverse false-positive)", async () => {
      // staff.venue's other slots: 0 (booked+confirmed), 270 (rolled back,
      // free), 300 (booked+confirmed), 600 (hold only, never a real
      // booking) — 90 is untouched by any of those.
      const slot = slotAt(90);
      const staffId = staff.venue as string;
      const token = await holdService.hold(staffId, slot);
      expect(token).not.toBeNull();
      holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

      const result = await bookingService.create(customerId, {
        offeringId: offerings.venue as string, // at_premises (default)
        staffMemberId: staffId,
        locationId,
        // Stray/erroneous — offering.location_mode is at_premises, so this
        // must be ignored rather than triggering the home-visit 422.
        customerAreaId: "00000000-0000-4000-8000-000000000099",
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
      createdBookingIds.push(result.booking.id);
      createdEngagementIds.push(result.engagement.id);
      expect(result.booking.status).toBe(BookingStatus.confirmed);
    });

    it("hold(): a home_visit-only offering WITHOUT customer_area_id throws 422 (not a 400 or a false 409)", async () => {
      const slot = slotAt(810);

      let threw: unknown;
      try {
        await bookingService.hold(customerId, {
          offeringId: offerings["home-visit"] as string,
          startsAt: slot.start,
          endsAt: slot.end,
        });
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(UnprocessableEntityError);
      expect((threw as UnprocessableEntityError).statusCode).toBe(422);
    });

    it("hold(): a home_visit-only offering WITH customer_area_id returns a hold token", async () => {
      const slot = slotAt(150);
      const result = await bookingService.hold(customerId, {
        offeringId: offerings["home-visit"] as string,
        customerAreaId: HOME_VISIT_AREA_ID,
        startsAt: slot.start,
        endsAt: slot.end,
      });
      expect(typeof result.holdToken).toBe("string");
      holdKeysToClean.push(
        holdService.key(result.staffMemberId, slot),
        `holdrev:${result.holdToken}`,
      );
      expect(result.staffMemberId).toBe(staff["home-visit"] as string);
    });
  });

  itOrderService(
    "deposit: stays pending_payment and returns a capture-now intent client_secret",
    async () => {
      const slot = slotAt(60);
      const staffId = staff.deposit as string;
      const token = await holdService.hold(staffId, slot);
      expect(token).not.toBeNull();
      holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

      const result = await bookingService.create(customerId, {
        offeringId: offerings.deposit as string,
        staffMemberId: staffId,
        locationId,
        customerAddress: COMPLIANT_ADDRESS,
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
      createdBookingIds.push(result.booking.id);
      createdEngagementIds.push(result.engagement.id);

      expect(result.booking.status).toBe(BookingStatus.pending_payment);
      expect(result.clientSecret).toMatch(/^pi_.*_secret_/);
      expect(result.paymentIntentId).toMatch(/^pi_/);
      expect(result.booking.deposit_fils).toBe(4_000); // 20% of 20000
      expect(result.booking.payment_id).toBeTruthy();

      const payment = await AppDataSource.getRepository(Payment).findOne({
        where: { id: result.booking.payment_id as string } as any,
      });
      expect((payment as any)?.booking_id).toBe(result.booking.id);
    },
    20_000,
  );

  itOrderService(
    "prepay: stays pending_payment and returns a SetupIntent client_secret",
    async () => {
      const slot = slotAt(120);
      const staffId = staff.prepay as string;
      const token = await holdService.hold(staffId, slot);
      expect(token).not.toBeNull();
      holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

      const result = await bookingService.create(customerId, {
        offeringId: offerings.prepay as string,
        staffMemberId: staffId,
        locationId,
        customerAddress: COMPLIANT_ADDRESS,
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
      createdBookingIds.push(result.booking.id);
      createdEngagementIds.push(result.engagement.id);

      expect(result.booking.status).toBe(BookingStatus.pending_payment);
      expect(result.clientSecret).toMatch(/^seti_.*_secret_/);
      expect(result.setupIntentId).toMatch(/^seti_/);
      expect(result.booking.payment_id).toBeTruthy();
    },
    20_000,
  );

  it("concurrent create on overlapping slots for the same staff: exactly one succeeds, the other 409s", async () => {
    const staffId = staff.conflict as string;
    const slotA = slotAt(180); // [+180, +210)
    const slotB = {
      start: new Date(slotAt(180).start.getTime() + 15 * 60_000),
      end: new Date(slotAt(180).end.getTime() + 15 * 60_000),
    }; // [+195, +225) — overlaps A

    const tokenA = await holdService.hold(staffId, slotA);
    const tokenB = await holdService.hold(staffId, slotB);
    expect(tokenA).not.toBeNull();
    expect(tokenB).not.toBeNull();
    holdKeysToClean.push(
      holdService.key(staffId, slotA),
      `holdrev:${tokenA}`,
      holdService.key(staffId, slotB),
      `holdrev:${tokenB}`,
    );

    const [resA, resB] = await Promise.allSettled([
      bookingService.create(customerId, {
        offeringId: offerings.conflict as string,
        staffMemberId: staffId,
        locationId,
        startsAt: slotA.start,
        endsAt: slotA.end,
        holdToken: tokenA as string,
      }),
      bookingService.create(customerId, {
        offeringId: offerings.conflict as string,
        staffMemberId: staffId,
        locationId,
        startsAt: slotB.start,
        endsAt: slotB.end,
        holdToken: tokenB as string,
      }),
    ]);

    const results = [resA, resB];
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const won = fulfilled[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof bookingService.create>>
    >;
    createdBookingIds.push(won.value.booking.id);
    createdEngagementIds.push(won.value.engagement.id);
    expect(won.value.booking.status).toBe(BookingStatus.confirmed);

    const lost = rejected[0] as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(Error);
    expect((lost.reason as any).statusCode).toBe(409);
  }, 20_000);

  it("a hold token for one staff/slot cannot be used to book a DIFFERENT staff member — 409, no booking created — but the same token still books the staff/slot it was actually issued for", async () => {
    const slot = slotAt(300); // 14:00 + 300min = 19:00 Dubai — inside the 08:00-20:00 window
    const staffA = staff.venue as string;
    const staffB = staff.venue2 as string;

    const token = await holdService.hold(staffA, slot);
    expect(token).not.toBeNull();
    holdKeysToClean.push(holdService.key(staffA, slot), `holdrev:${token}`);

    // staffA's token, presented for staffB at the SAME slot, must be
    // rejected — assertHeldFor binds the token to `hold:{staffA}:{range}`,
    // not merely "some live hold".
    let threw: unknown;
    try {
      await bookingService.create(customerId, {
        offeringId: offerings.venue as string,
        staffMemberId: staffB,
        locationId,
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(ConflictError);
    expect((threw as ConflictError).statusCode).toBe(409);

    // No booking exists for staffB at this slot — assertHeldFor threw before
    // the DB transaction ever ran.
    const mismatchCount = await AppDataSource.getRepository(Booking)
      .createQueryBuilder("b")
      .where("b.staff_member_id = :staffId", { staffId: staffB })
      .andWhere("b.starts_at = :start", { start: slot.start })
      .getCount();
    expect(mismatchCount).toBe(0);

    // staffA's original hold is untouched by the rejected staffB attempt —
    // the rejection happens before any release/transaction logic runs.
    const stillHeld = await redis.get(holdService.key(staffA, slot));
    expect(stillHeld).toBe(token);

    // Happy path: the SAME token, presented for the exact staff/slot it was
    // issued for, still succeeds.
    const result = await bookingService.create(customerId, {
      offeringId: offerings.venue as string,
      staffMemberId: staffA,
      locationId,
      startsAt: slot.start,
      endsAt: slot.end,
      holdToken: token as string,
    });
    createdBookingIds.push(result.booking.id);
    createdEngagementIds.push(result.engagement.id);
    expect(result.booking.status).toBe(BookingStatus.confirmed);
    expect(result.booking.staff_member_id).toBe(staffA);
  });

  it("a non-conflict transaction failure (FK violation on customer_user_id) still releases the hold", async () => {
    const slot = slotAt(270); // 14:00 + 270min = 18:30 Dubai — inside the 08:00-20:00 window
    const staffId = staff.venue as string;
    const token = await holdService.hold(staffId, slot);
    expect(token).not.toBeNull();
    holdKeysToClean.push(holdService.key(staffId, slot), `holdrev:${token}`);

    // A syntactically-valid UUID that doesn't exist in `users` — pay_at_venue
    // skips the pre-transaction customer lookup (only deposit/prepay fetch
    // the user), so this reaches `bookingRepoTx.save` inside the transaction
    // and trips `fk_bookings_customer`, a real Postgres error that is NOT a
    // ConflictError. Fix 2 requires the hold to be released on this path too.
    const bogusCustomerId = "00000000-0000-4000-8000-000000000000";

    let threw: unknown;
    try {
      await bookingService.create(bogusCustomerId, {
        offeringId: offerings.venue as string,
        staffMemberId: staffId,
        locationId,
        startsAt: slot.start,
        endsAt: slot.end,
        holdToken: token as string,
      });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(Error);
    expect(threw).not.toBeInstanceOf(ConflictError);
    expect((threw as { statusCode?: number }).statusCode).not.toBe(409);

    // No stray booking/engagement should have been left behind (the whole
    // transaction rolled back on the FK violation).
    const strayCount = await AppDataSource.getRepository(Booking)
      .createQueryBuilder("b")
      .where("b.staff_member_id = :staffId", { staffId })
      .andWhere("b.starts_at = :start", { start: slot.start })
      .getCount();
    expect(strayCount).toBe(0);

    // The hold must have been released despite the non-Conflict failure —
    // this is the behavior Fix 2 adds (previously only ConflictError
    // released the hold, stranding it for the full 10-minute TTL).
    const stillHeld = await redis.get(holdService.key(staffId, slot));
    expect(stillHeld).toBeNull();
  });
});
