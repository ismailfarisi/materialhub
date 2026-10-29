// reminder-scheduler.integration.test.ts
//
// Live Postgres + live Redis/BullMQ (BOOKING_LIVE_DB=1) — no order-service,
// no Stripe required (unlike booking-autocomplete's/booking-auth's live
// suites): reminders never touch money or capture, only read the booking and
// enqueue a notification event. Mirrors booking-autocomplete.service
// .integration.test.ts's live-gate + cleanup patterns and
// booking-status.service.integration.test.ts's "seed booking+engagement
// fixtures directly" shortcut (bypasses BookingService.create's
// hold->availability->pay flow entirely).
//
// Exercises the REAL ReminderScheduler wired the same way container.ts wires
// it into BookingStatusService (BookingReminderHook), against the real
// BullMQ `booking-reminder` queue and a real Postgres booking row. Covers the
// brief's exact "Test (live-ish)" requirement: confirming schedules 2 delayed
// jobs; cancel removes them; reschedule re-times them.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  DepositType,
  EngagementKind,
  EngagementStatus,
  NotificationType,
  ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
  StaffEngagement,
  StaffMember,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorLocation,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import type { BookingReminderHook } from "../booking/booking-status.service.ts";
import { BookingStatusService } from "../booking/booking-status.service.ts";
import { EngagementService } from "../engagement/engagement.service.ts";
import { getBookingReminderQueue, getNotificationEventsQueue } from "./booking-reminder.job.ts";
import { ReminderScheduler } from "./reminder-scheduler.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const HOUR_MS = 3_600_000;

// jobIds are slot-versioned (Phase 7 review, findings 3 + 4): the id carries a
// base36 token derived from the booking's starts_at, so a stale remove aimed at
// an old slot can never delete a newly-scheduled job. Mirrors reminderJobId in
// reminder-scheduler.ts.
function jobIdFor(bookingId: string, offset: string, startsAt: Date): string {
  return `reminder_${bookingId}_${offset}_${startsAt.getTime().toString(36)}`;
}
const unique = Date.now();

describeLive("ReminderScheduler (live DB + Redis)", () => {
  let vendorId: string;
  let locationId: string;
  let customerId: string;
  let staffId: string;
  let offeringId: string;

  let bookingStatusService: BookingStatusService;
  let reminderScheduler: ReminderScheduler;
  let engagementService: EngagementService;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
  const reminderQueue = getBookingReminderQueue();
  const notificationQueue = getNotificationEventsQueue();

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  const jobIdsToClean: string[] = [];
  let slotCursor = 0;

  function nextSlotStartsAt(daysOut: number): Date {
    slotCursor += 1;
    const d = new Date(Date.now() + daysOut * 24 * HOUR_MS);
    d.setUTCHours(d.getUTCHours() + slotCursor * 2);
    return d;
  }

  async function seedBooking(opts: {
    daysOut: number;
    status?: BookingStatus;
    engagementStatus?: EngagementStatus;
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
        booking_number: `REM${unique}${slotCursor}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        location_id: locationId,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: offeringId,
        service_name: "Reminder Test Service",
        duration_minutes: 30,
        price_fils: 10_000,
        vat_fils: 0,
        deposit_fils: 0,
        deposit_type: DepositType.none,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        commission_rate: 10,
        commission_fils: 1000,
        starts_at: startsAt,
        ends_at: endsAt,
        status: opts.status ?? BookingStatus.confirmed,
        source: "marketplace",
        payment_mode: ServicePaymentMode.pay_at_venue,
      }),
    );
    createdBookingIds.push(booking.id);
    return booking;
  }

  beforeAll(async () => {
    await ensureDatabase();

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const locationRepo = AppDataSource.getRepository(VendorLocation);
    const staffRepo = AppDataSource.getRepository(StaffMember);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Reminder",
        last_name: "Customer",
        email: `booking-reminder-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Reminder Test Vendor ${unique}`,
        slug: `reminder-test-vendor-${unique}`,
        business_name: "Reminder Test Salon",
        business_type: "salon",
        contact_email: `booking-reminder-vendor-${unique}@test.local`,
        contact_phone: "+971500000005",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const location = await locationRepo.save(
      locationRepo.create({
        vendor_id: vendorId,
        name: "Reminder Test Branch",
        address: { city: "Dubai", line1: "Marina Walk" },
      }),
    );
    locationId = location.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Reminder Test Stylist ${unique}` }),
    );
    staffId = staff.id;

    const offeringRepo = AppDataSource.getRepository(ServiceOffering);
    const offering = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `reminder-test-offering-${unique}`,
        name: "Reminder Test Offering",
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
    offeringId = offering.id;

    engagementService = new EngagementService(engagementRepo());
    reminderScheduler = new ReminderScheduler(
      bookingRepo(),
      reminderQueue,
      notificationQueue,
      vendorRepo,
      locationRepo,
    );
    const reminderHook: BookingReminderHook = {
      scheduleForConfirm: (b) => reminderScheduler.scheduleForConfirm(b),
      removeReminderJobs: (id) => reminderScheduler.removeReminderJobs(id),
    };
    bookingStatusService = new BookingStatusService(
      bookingRepo(),
      undefined,
      undefined,
      undefined,
      undefined,
      reminderHook,
    );
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[reminder-scheduler.integration.test] cleanup step "${label}" failed`, err);
      }
    }

    for (const jobId of jobIdsToClean) {
      await step(`remove reminder job ${jobId}`, () => reminderQueue.remove(jobId));
    }
    if (createdBookingIds.length) {
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

  it("confirm(): schedules BOTH slot-versioned reminder jobs at starts_at - offset", async () => {
    const startsAt = nextSlotStartsAt(20);
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
        booking_number: `REMS${unique}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        location_id: locationId,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: offeringId,
        service_name: "Reminder Schedule Test Service",
        duration_minutes: 30,
        price_fils: 10_000,
        vat_fils: 0,
        deposit_fils: 0,
        deposit_type: DepositType.none,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        commission_rate: 10,
        commission_fils: 1000,
        starts_at: startsAt,
        ends_at: endsAt,
        status: BookingStatus.pending_payment,
        source: "marketplace",
        payment_mode: ServicePaymentMode.pay_at_venue,
      }),
    );
    createdBookingIds.push(booking.id);
    jobIdsToClean.push(jobIdFor(booking.id, "24h", startsAt), jobIdFor(booking.id, "1h", startsAt));

    const confirmed = await bookingStatusService.confirm(booking.id);
    expect(confirmed.status).toBe(BookingStatus.confirmed);

    const job24h = await reminderQueue.getJob(jobIdFor(booking.id, "24h", startsAt));
    const job1h = await reminderQueue.getJob(jobIdFor(booking.id, "1h", startsAt));
    expect(job24h).toBeTruthy();
    expect(job1h).toBeTruthy();
    expect(job24h?.name).toBe("send-reminder");

    const expectedFireAt24h = startsAt.getTime() - 24 * HOUR_MS;
    const actualFireAt24h = job24h!.timestamp + (job24h!.opts.delay ?? 0);
    expect(Math.abs(actualFireAt24h - expectedFireAt24h)).toBeLessThan(10_000);

    const expectedFireAt1h = startsAt.getTime() - 1 * HOUR_MS;
    const actualFireAt1h = job1h!.timestamp + (job1h!.opts.delay ?? 0);
    expect(Math.abs(actualFireAt1h - expectedFireAt1h)).toBeLessThan(10_000);
  }, 15_000);

  it("cancel transition removes BOTH reminder jobs (defensive cleanup)", async () => {
    const booking = await seedBooking({ daysOut: 21 });
    const id24h = jobIdFor(booking.id, "24h", booking.starts_at);
    const id1h = jobIdFor(booking.id, "1h", booking.starts_at);
    jobIdsToClean.push(id24h, id1h);

    await reminderScheduler.scheduleForConfirm(booking, new Date());
    expect(await reminderQueue.getJob(id24h)).toBeTruthy();
    expect(await reminderQueue.getJob(id1h)).toBeTruthy();

    await bookingStatusService.transition(booking.id, BookingStatus.cancelled, {
      id: customerId,
      role: "customer",
    });

    // removeReminderJobs is fired-and-forgotten (best-effort, outside the
    // transaction) — poll briefly rather than assuming same-tick completion,
    // mirrors booking-autocomplete.service.integration.test.ts's own
    // cancel-removes-jobs test.
    let job24h = await reminderQueue.getJob(id24h);
    let job1h = await reminderQueue.getJob(id1h);
    for (let i = 0; i < 20 && (job24h || job1h); i++) {
      await new Promise((r) => setTimeout(r, 100));
      job24h = await reminderQueue.getJob(id24h);
      job1h = await reminderQueue.getJob(id1h);
    }
    expect(job24h).toBeFalsy();
    expect(job1h).toBeFalsy();
  }, 10_000);

  it("rescheduleReminderJobs: removes existing jobs and re-times them against the NEW starts_at", async () => {
    const booking = await seedBooking({ daysOut: 22 });
    const newStartsAt = new Date(booking.starts_at.getTime() + 5 * 24 * HOUR_MS);
    jobIdsToClean.push(
      jobIdFor(booking.id, "24h", booking.starts_at),
      jobIdFor(booking.id, "1h", booking.starts_at),
      jobIdFor(booking.id, "24h", newStartsAt),
      jobIdFor(booking.id, "1h", newStartsAt),
    );

    const now = new Date();
    await reminderScheduler.scheduleForConfirm(booking, now);
    const original24h = await reminderQueue.getJob(jobIdFor(booking.id, "24h", booking.starts_at));
    expect(original24h).toBeTruthy();

    const rescheduledSnapshot = { ...booking, starts_at: newStartsAt } as Booking;
    await reminderScheduler.rescheduleReminderJobs(rescheduledSnapshot, now);

    // Slot-versioned: the OLD-slot jobs are gone, the NEW-slot jobs exist.
    expect(await reminderQueue.getJob(jobIdFor(booking.id, "24h", booking.starts_at))).toBeFalsy();
    const rescheduled24h = await reminderQueue.getJob(jobIdFor(booking.id, "24h", newStartsAt));
    const rescheduled1h = await reminderQueue.getJob(jobIdFor(booking.id, "1h", newStartsAt));
    expect(rescheduled24h).toBeTruthy();
    expect(rescheduled1h).toBeTruthy();

    const expectedFireAt = newStartsAt.getTime() - 24 * HOUR_MS;
    const actualFireAt = rescheduled24h!.timestamp + (rescheduled24h!.opts.delay ?? 0);
    expect(Math.abs(actualFireAt - expectedFireAt)).toBeLessThan(10_000);

    const originalFireAt = original24h!.timestamp + (original24h!.opts.delay ?? 0);
    expect(actualFireAt).not.toBe(originalFireAt);
  }, 15_000);

  it("runReminderJob: still-confirmed booking emits a real notification-event onto the shared queue", async () => {
    const booking = await seedBooking({ daysOut: 23 });

    await reminderScheduler.runReminderJob(booking.id, "24h");

    // Best-effort poll: notificationQueue.add() already awaited inside
    // runReminderJob, so the job should be visible immediately, but poll
    // briefly for parity with the other jobs-visibility checks in this file.
    const waiting = await notificationQueue.getJobs(["waiting", "completed", "active"], 0, 50);
    const match = waiting.find(
      (j) => j.data?.data?.bookingId === booking.id && j.data?.data?.offset === "24h",
    );
    expect(match).toBeTruthy();
    expect(match?.data.userId).toBe(customerId);
    expect(match?.data.notificationType).toBe(NotificationType.booking_reminder);
    expect(match?.data.data.vendorName).toBe("Reminder Test Salon");
    expect(match?.data.data.locationName).toBe("Reminder Test Branch");
    expect(match?.data.data.ics.text).toContain("BEGIN:VEVENT");

    if (match?.id) await notificationQueue.remove(match.id);
  }, 15_000);

  it("runReminderJob: cancelled booking is a graceful no-op — does not emit a notification-event", async () => {
    const booking = await seedBooking({ daysOut: 24, status: BookingStatus.cancelled });

    const before = await notificationQueue.getJobs(["waiting", "completed", "active"], 0, 200);

    // Plain await (NOT `expect(...).resolves`) — bun 1.3.13's
    // expect(promise).resolves hung indefinitely in the sibling
    // booking-autocomplete live suite while the same promise resolves
    // instantly under a direct await; avoiding it here too.
    await reminderScheduler.runReminderJob(booking.id, "1h");

    const after = await notificationQueue.getJobs(["waiting", "completed", "active"], 0, 200);
    const newMatch = after.find(
      (j) => j.data?.data?.bookingId === booking.id && !before.some((b) => b.id === j.id),
    );
    expect(newMatch).toBeUndefined();
  }, 15_000);
});
