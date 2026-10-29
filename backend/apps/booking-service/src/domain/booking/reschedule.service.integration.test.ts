// reschedule.service.integration.test.ts
//
// Live Postgres + Redis (BOOKING_LIVE_DB=1). No order-service needed —
// reschedule carries payment over unchanged, so nothing here crosses the
// money boundary (the delayed-job schedulers + notification queue are stubbed
// with in-memory fakes; the DB-level engagement move / status transitions /
// booking-time update run against real Postgres, and the hold flow against
// real Redis).
//
// Covers the Task 3 brief's three cases:
//   1. in-window reschedule moves the slot (engagement slot_range + booking
//      times updated; customer notification emitted; jobs re-timed),
//   2. overlapping target -> 409,
//   3. out-of-window customer -> 422,
// plus a direct EngagementService.move EXCLUDE (23P01 -> 409) check.
//
// Requires: `docker compose up -d postgres redis`.
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
  NotificationType,
  ServiceArea,
  ServiceLocationMode,
  ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
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
import type { HttpError } from "@materialhub/plugins";
import { type RedisClientType, createClient } from "redis";
import { AvailabilityCache } from "../availability/availability-cache.ts";
import { AvailabilityService } from "../availability/availability.service.ts";
import { EngagementService } from "../engagement/engagement.service.ts";
import { BookingHoldService, type RedisLike } from "./booking-hold.service.ts";
import { BookingStatusService } from "./booking-status.service.ts";
import { RescheduleService, RescheduleWindowExpiredError } from "./reschedule.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

// 10 days out, 10:00 UTC (14:00 Asia/Dubai) — inside the 08:00-20:00 Dubai
// working-hours window seeded below and far past min_notice.
const BASE_DAY = new Date(Date.now() + 10 * 24 * 3_600_000);
function slotAt(offsetMinutes: number): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(
      BASE_DAY.getUTCFullYear(),
      BASE_DAY.getUTCMonth(),
      BASE_DAY.getUTCDate(),
      10,
      offsetMinutes,
      0,
    ),
  );
  return { start, end: new Date(start.getTime() + 30 * 60_000) };
}

// A fake delayed-job scheduler that just records the calls (we assert the
// reschedule flow re-times all three jobs, not the BullMQ mechanics).
function fakeJobHooks() {
  const calls = { reminder: 0, autoComplete: 0, auth: 0 };
  return {
    calls,
    reminderHook: {
      rescheduleReminderJobs: async () => {
        calls.reminder++;
      },
    },
    autoCompleteHook: {
      rescheduleAutoCompleteJob: async () => {
        calls.autoComplete++;
      },
    },
    authHook: {
      rescheduleBookingAuthJob: async () => {
        calls.auth++;
      },
    },
  };
}

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

describeLive("RescheduleService (live DB + Redis)", () => {
  let redis: RedisClientType;
  let holdService: BookingHoldService;
  let availabilityCache: AvailabilityCache;
  let engagementService: EngagementService;
  let reschedule: RescheduleService;
  let jobHooks: ReturnType<typeof fakeJobHooks>;
  let notificationQueue: ReturnType<typeof fakeNotificationQueue>;

  let vendorId: string;
  let locationId: string;
  let customerId: string;
  let otherCustomerId: string;
  let staffId: string;
  let offeringId: string;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  const holdKeysToClean: string[] = [];

  async function seedConfirmedBooking(
    slot: { start: Date; end: Date },
    overrides: Partial<Booking> = {},
  ): Promise<Booking> {
    const engagement = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: slot.start,
      endsAt: slot.end,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: customerId,
    });
    createdEngagementIds.push(engagement.id);

    const booking = await bookingRepo().save(
      bookingRepo().create({
        booking_number: `RS${unique}${Math.floor(Math.random() * 1e6)}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        location_id: locationId,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: offeringId,
        service_name: "Reschedule Test Service",
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
        status: BookingStatus.confirmed,
        source: "marketplace",
        payment_mode: ServicePaymentMode.pay_at_venue,
        ...overrides,
      }),
    );
    createdBookingIds.push(booking.id);
    return booking;
  }

  beforeAll(async () => {
    await ensureDatabase();

    redis = createClient({
      socket: { host: config.redis.host, port: config.redis.port },
      password: config.redis.password,
    });
    await redis.connect();
    holdService = new BookingHoldService(redis as unknown as RedisLike);
    availabilityCache = new AvailabilityCache();
    engagementService = new EngagementService(engagementRepo(), availabilityCache);

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const locationRepo = AppDataSource.getRepository(VendorLocation);
    const offeringRepo = AppDataSource.getRepository(ServiceOffering);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const staffLocationRepo = AppDataSource.getRepository(StaffLocation);
    const staffServiceRepo = AppDataSource.getRepository(StaffServiceEntity);
    const workingHoursRepo = AppDataSource.getRepository(StaffWorkingHours);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Resched",
        last_name: "Customer",
        email: `reschedule-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const otherCustomer = await userRepo.save(
      userRepo.create({
        first_name: "Other",
        last_name: "Customer",
        email: `reschedule-svc-other-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    otherCustomerId = otherCustomer.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Reschedule Test Vendor ${unique}`,
        slug: `reschedule-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `reschedule-vendor-${unique}@test.local`,
        contact_phone: "+971500000002",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const location = await locationRepo.save(
      locationRepo.create({ vendor_id: vendorId, name: "Main Branch", timezone: "Asia/Dubai" }),
    );
    locationId = location.id;

    const offering = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `reschedule-test-offering-${unique}`,
        name: "Reschedule Test Offering",
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
        location_mode: ServiceLocationMode.at_premises,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringId = offering.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Reschedule Test Stylist ${unique}` }),
    );
    staffId = staff.id;
    await staffLocationRepo.save(
      staffLocationRepo.create({ staff_member_id: staffId, vendor_location_id: locationId }),
    );
    await staffServiceRepo.save(
      staffServiceRepo.create({ staff_member_id: staffId, service_offering_id: offeringId }),
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

    const availabilityService = new AvailabilityService(
      AppDataSource.getRepository(ServiceOffering),
      AppDataSource.getRepository(StaffMember),
      AppDataSource.getRepository(StaffWorkingHours),
      AppDataSource.getRepository(StaffTimeOff),
      AppDataSource.getRepository(StaffEngagement),
      AppDataSource.getRepository(VendorLocation),
      AppDataSource.getRepository(VendorHoliday),
      AppDataSource.getRepository(ServiceArea),
      availabilityCache,
    );
    const statusService = new BookingStatusService(bookingRepo(), availabilityCache);

    jobHooks = fakeJobHooks();
    notificationQueue = fakeNotificationQueue();
    reschedule = new RescheduleService(
      bookingRepo(),
      AppDataSource.getRepository(ServiceOffering),
      AppDataSource.getRepository(ServiceArea),
      availabilityService,
      holdService,
      statusService,
      jobHooks.reminderHook as any,
      jobHooks.autoCompleteHook as any,
      jobHooks.authHook as any,
      notificationQueue as any,
      availabilityCache,
    );
  }, 30_000);

  afterAll(async () => {
    try {
      if (holdKeysToClean.length) await redis.del(holdKeysToClean);
    } catch {
      // best-effort
    }
    await redis.quit();

    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[reschedule.service.integration.test] cleanup "${label}" failed`, err);
      }
    }

    if (createdBookingIds.length) {
      await step("delete history", () =>
        AppDataSource.getRepository(BookingStatusHistory)
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
      await step("delete staff-service", () =>
        AppDataSource.getRepository(StaffServiceEntity)
          .createQueryBuilder()
          .delete()
          .where("staff_member_id = :id", { id: staffId })
          .execute(),
      );
      await step("delete staff-location", () =>
        AppDataSource.getRepository(StaffLocation)
          .createQueryBuilder()
          .delete()
          .where("staff_member_id = :id", { id: staffId })
          .execute(),
      );
      await step("delete working hours", () =>
        AppDataSource.getRepository(StaffWorkingHours)
          .createQueryBuilder()
          .delete()
          .where("staff_member_id = :id", { id: staffId })
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
    if (offeringId) {
      await step("delete offering", () =>
        AppDataSource.getRepository(ServiceOffering)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: offeringId })
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
    for (const [label, id] of [
      ["customer", customerId],
      ["other customer", otherCustomerId],
    ] as const) {
      if (id) {
        await step(`delete ${label}`, () =>
          AppDataSource.getRepository(User)
            .createQueryBuilder()
            .delete()
            .where("id = :id", { id })
            .execute(),
        );
      }
    }
  }, 30_000);

  it("in-window: moves the engagement + booking to the new slot, re-times all 3 jobs, emits customer notification", async () => {
    const from = slotAt(0);
    const to = slotAt(60);
    const booking = await seedConfirmedBooking(from);

    const token = await holdService.hold(staffId, to);
    expect(token).not.toBeNull();
    holdKeysToClean.push(holdService.key(staffId, to), `holdrev:${token}`);

    const before = jobHooks.calls.reminder;
    const result = await reschedule.reschedule(
      booking.id,
      {
        startsAt: to.start,
        endsAt: to.end,
        staffMemberId: staffId,
        holdToken: token as string,
      },
      { id: customerId, role: "customer" },
    );

    expect(result.booking.status).toBe(BookingStatus.confirmed);
    expect(new Date(result.booking.starts_at).getTime()).toBe(to.start.getTime());
    expect(new Date(result.booking.ends_at).getTime()).toBe(to.end.getTime());

    // DB reflects the move (booking + its engagement).
    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(new Date(dbBooking!.starts_at).getTime()).toBe(to.start.getTime());
    const dbEngagement = await engagementRepo().findOne({ where: { id: booking.engagement_id } });
    expect(new Date(dbEngagement!.starts_at).getTime()).toBe(to.start.getTime());
    expect(new Date(dbEngagement!.ends_at).getTime()).toBe(to.end.getTime());
    expect(dbEngagement!.status).toBe(EngagementStatus.confirmed);

    // History: confirmed -> rescheduled -> confirmed (2 rows).
    const history = await AppDataSource.getRepository(BookingStatusHistory).find({
      where: { booking_id: booking.id },
      order: { created_at: "ASC" },
    });
    expect(history.map((h) => h.to_status)).toEqual([
      BookingStatus.rescheduled,
      BookingStatus.confirmed,
    ]);

    // All three jobs re-timed.
    expect(jobHooks.calls.reminder).toBe(before + 1);
    expect(jobHooks.calls.autoComplete).toBeGreaterThan(0);
    expect(jobHooks.calls.auth).toBeGreaterThan(0);

    // Customer booking_rescheduled event.
    const evt = notificationQueue.events.find(
      (e) => e.data?.notificationType === NotificationType.booking_rescheduled,
    );
    expect(evt?.data.userId).toBe(customerId);

    // Hold released.
    const stillHeld = await redis.get(holdService.key(staffId, to));
    expect(stillHeld).toBeNull();
  });

  it("overlapping target: 409, booking left on its original slot", async () => {
    const from = slotAt(120);
    const blocked = slotAt(180);
    const booking = await seedConfirmedBooking(from);

    // A blocker confirmed engagement occupying the target slot on the same staff.
    const blocker = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: blocked.start,
      endsAt: blocked.end,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: customerId,
    });
    createdEngagementIds.push(blocker.id);

    const token = await holdService.hold(staffId, blocked);
    // The blocker doesn't stop the Redis hold (holds are separate from
    // engagements), so this succeeds — the conflict surfaces when the flow
    // resolves availability / attempts the EXCLUDE move.
    holdKeysToClean.push(holdService.key(staffId, blocked), `holdrev:${token}`);

    let threw: unknown;
    try {
      await reschedule.reschedule(
        booking.id,
        {
          startsAt: blocked.start,
          endsAt: blocked.end,
          staffMemberId: staffId,
          holdToken: token as string,
        },
        { id: customerId, role: "customer" },
      );
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(409);

    // Booking + its engagement untouched (still on the original slot).
    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(new Date(dbBooking!.starts_at).getTime()).toBe(from.start.getTime());
    expect(dbBooking!.status).toBe(BookingStatus.confirmed);
    const dbEngagement = await engagementRepo().findOne({ where: { id: booking.engagement_id } });
    expect(new Date(dbEngagement!.starts_at).getTime()).toBe(from.start.getTime());
  });

  it("out-of-window customer: 422, booking untouched (window checked before availability/hold)", async () => {
    // starts_at only 1h from now, window is 24h -> out of window.
    const soon = new Date(Date.now() + 60 * 60_000);
    const from = { start: soon, end: new Date(soon.getTime() + 30 * 60_000) };
    const to = slotAt(300);
    const booking = await seedConfirmedBooking(from);

    let threw: unknown;
    try {
      await reschedule.reschedule(
        booking.id,
        { startsAt: to.start, endsAt: to.end, staffMemberId: staffId, holdToken: "irrelevant" },
        { id: customerId, role: "customer" },
      );
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(RescheduleWindowExpiredError);
    expect((threw as HttpError).statusCode).toBe(422);

    const dbBooking = await bookingRepo().findOne({ where: { id: booking.id } });
    expect(new Date(dbBooking!.starts_at).getTime()).toBe(from.start.getTime());
  });

  it("not-owned booking: 404 for a different customer", async () => {
    const from = slotAt(360);
    const to = slotAt(420);
    const booking = await seedConfirmedBooking(from);
    const token = await holdService.hold(staffId, to);
    holdKeysToClean.push(holdService.key(staffId, to), `holdrev:${token}`);

    await expect(
      reschedule.reschedule(
        booking.id,
        { startsAt: to.start, endsAt: to.end, staffMemberId: staffId, holdToken: token as string },
        { id: otherCustomerId, role: "customer" },
      ),
    ).rejects.toThrow("Booking not found");
  });

  it("EngagementService.move: EXCLUDE 23P01 surfaces as 409 when the target overlaps another engagement", async () => {
    const a = slotAt(480);
    const b = slotAt(540);
    const engA = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: a.start,
      endsAt: a.end,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: customerId,
    });
    createdEngagementIds.push(engA.id);
    const engB = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: b.start,
      endsAt: b.end,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: customerId,
    });
    createdEngagementIds.push(engB.id);

    // Move A onto B's range -> EXCLUDE violation -> 409.
    let threw: unknown;
    try {
      await engagementService.move({
        engagementId: engA.id,
        staffMemberId: staffId,
        startsAt: b.start,
        endsAt: b.end,
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(409);

    // A is unchanged (rolled back).
    const dbA = await engagementRepo().findOne({ where: { id: engA.id } });
    expect(new Date(dbA!.starts_at).getTime()).toBe(a.start.getTime());
  });
});
