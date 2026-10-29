// reminder-scheduler.test.ts
//
// Mocked-repo unit tests (no live DB, no live Redis/BullMQ) — mirrors
// booking-autocomplete.service.test.ts's makeService() shape. Runs
// unconditionally (no BOOKING_LIVE_DB gate) since everything here is pure
// math or a fake queue/repo.
import { describe, expect, it, mock } from "bun:test";
import { BookingStatus, NotificationType } from "@materialhub/database";
import {
  REMINDER_OFFSETS,
  ReminderScheduler,
  computeReminderFireTime,
  reminderEventId,
} from "./reminder-scheduler.ts";

// jobIds are SLOT-VERSIONED (Phase 7 review, findings 3 + 4): the id carries a
// base36 token derived from the booking's starts_at, so a job scheduled for one
// slot can never be confused with — or deleted by a stale remove aimed at —
// another slot. Recomputed here rather than imported so the test pins the wire
// format independently of the implementation's private helper.
function jobIdFor(bookingId: string, offset: string, startsAt: Date): string {
  return `reminder_${bookingId}_${offset}_${startsAt.getTime().toString(36)}`;
}

const HOUR_MS = 3_600_000;

describe("computeReminderFireTime", () => {
  it("fires at startsAt - offsetHours", () => {
    const startsAt = new Date("2026-08-10T10:00:00Z");
    expect(computeReminderFireTime(startsAt, 24).getTime()).toBe(startsAt.getTime() - 24 * HOUR_MS);
    expect(computeReminderFireTime(startsAt, 1).getTime()).toBe(startsAt.getTime() - 1 * HOUR_MS);
  });
});

describe("REMINDER_OFFSETS", () => {
  it("is exactly T-24h and T-1h", () => {
    expect(REMINDER_OFFSETS).toEqual([
      { label: "24h", hours: 24 },
      { label: "1h", hours: 1 },
    ]);
  });
});

// ─── ReminderScheduler ───────────────────────────────────────────────────

function fakeQueue() {
  const jobs = new Map<string, { name: string; data: unknown; opts: any }>();
  return {
    jobs,
    add: mock(async (name: string, data: unknown, opts: any) => {
      jobs.set(opts.jobId, { name, data, opts });
      return { id: opts.jobId };
    }),
    remove: mock(async (jobId: string) => {
      const existed = jobs.delete(jobId);
      return existed ? 1 : 0;
    }),
  };
}

function fakeNotificationQueue() {
  const events: Array<{ name: string; data: any }> = [];
  return {
    events,
    add: mock(async (name: string, data: any) => {
      events.push({ name, data });
      return { id: "job-1" };
    }),
  };
}

function makeBookingRepo(booking: Record<string, any> | null) {
  return {
    findOne: mock(async () => (booking ? { ...booking } : null)),
  };
}

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    booking_number: "BK-001",
    customer_user_id: "customer-1",
    vendor_id: "vendor-1",
    location_id: "location-1",
    customer_address: null,
    service_name: "Deep Tissue Massage",
    duration_minutes: 60,
    status: BookingStatus.confirmed,
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T11:00:00Z"),
    ...overrides,
  };
}

function makeVendorRepo(vendor: Record<string, any> | null = { business_name: "Test Salon" }) {
  return { findOne: mock(async () => vendor) };
}

function makeLocationRepo(
  location: Record<string, any> | null = { name: "Marina Walk", address: { city: "Dubai" } },
) {
  return { findOne: mock(async () => location) };
}

function makeService(opts: {
  booking: Record<string, any> | null;
  vendor?: Record<string, any> | null;
  location?: Record<string, any> | null;
}) {
  const bookingRepo = makeBookingRepo(opts.booking);
  const queue = fakeQueue();
  const notificationQueue = fakeNotificationQueue();
  const vendorRepo = makeVendorRepo(opts.vendor);
  const locationRepo = makeLocationRepo(opts.location);
  const service = new ReminderScheduler(
    bookingRepo as any,
    queue as any,
    notificationQueue as any,
    vendorRepo as any,
    locationRepo as any,
  );
  return { service, bookingRepo, queue, notificationQueue, vendorRepo, locationRepo };
}

describe("ReminderScheduler.scheduleForConfirm", () => {
  it("schedules BOTH reminder_{id}_24h and reminder_{id}_1h jobs when starts_at is far enough out", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);

    const job24h = queue.jobs.get(jobIdFor("booking-1", "24h", booking.starts_at));
    const job1h = queue.jobs.get(jobIdFor("booking-1", "1h", booking.starts_at));
    expect(job24h).toBeTruthy();
    expect(job1h).toBeTruthy();
    expect(job24h?.name).toBe("send-reminder");
    expect(job24h?.data).toEqual({
      bookingId: "booking-1",
      offset: "24h",
      expectedStartsAt: booking.starts_at.toISOString(),
    });
    expect(job1h?.data).toEqual({
      bookingId: "booking-1",
      offset: "1h",
      expectedStartsAt: booking.starts_at.toISOString(),
    });

    const expected24h = booking.starts_at.getTime() - 24 * HOUR_MS - now.getTime();
    const expected1h = booking.starts_at.getTime() - 1 * HOUR_MS - now.getTime();
    expect(job24h?.opts.delay).toBe(expected24h);
    expect(job1h?.opts.delay).toBe(expected1h);
  });

  it("skips the 24h reminder (does not schedule with negative/zero delay) when booked <24h but >=1h ahead", async () => {
    const now = new Date("2026-08-10T00:30:00Z"); // starts_at is 9.5h out
    const booking = baseBooking({ starts_at: new Date("2026-08-10T10:00:00Z") });
    const { service, queue } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, now);

    expect(queue.jobs.get(jobIdFor("booking-1", "24h", booking.starts_at))).toBeUndefined();
    const job1h = queue.jobs.get(jobIdFor("booking-1", "1h", booking.starts_at));
    expect(job1h).toBeTruthy();
    const expected1h = booking.starts_at.getTime() - 1 * HOUR_MS - now.getTime();
    expect(job1h?.opts.delay).toBe(expected1h);
  });

  it("skips BOTH reminders when booked <1h ahead", async () => {
    const now = new Date("2026-08-10T09:45:00Z"); // starts_at is 15min out
    const booking = baseBooking({ starts_at: new Date("2026-08-10T10:00:00Z") });
    const { service, queue } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, now);

    expect(queue.jobs.size).toBe(0);
  });

  it("never schedules with a negative or zero delay (past-offset skip, not clamp-to-0)", async () => {
    const now = new Date("2026-08-10T09:59:00Z"); // starts_at is 1 min out
    const booking = baseBooking({ starts_at: new Date("2026-08-10T10:00:00Z") });
    const { service, queue } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, now);

    for (const job of queue.jobs.values()) {
      expect(job.opts.delay).toBeGreaterThan(0);
    }
  });

  it("skips both reminders for a booking with no customer_user_id (Phase 6 manual walk-in/phone)", async () => {
    const booking = baseBooking({ customer_user_id: null });
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);

    expect(queue.jobs.size).toBe(0);
  });
});

describe("ReminderScheduler.rescheduleReminderJobs", () => {
  it("removes existing jobs and re-schedules at the (new) starts_at", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);
    expect(queue.jobs.get(jobIdFor("booking-1", "24h", booking.starts_at))).toBeTruthy();

    const rescheduled = baseBooking({ starts_at: new Date("2026-08-20T12:00:00Z") });
    await service.rescheduleReminderJobs(rescheduled as any, now);

    const job24h = queue.jobs.get(jobIdFor("booking-1", "24h", rescheduled.starts_at));
    const job1h = queue.jobs.get(jobIdFor("booking-1", "1h", rescheduled.starts_at));
    expect(job24h).toBeTruthy();
    expect(job1h).toBeTruthy();
    const expected24h = rescheduled.starts_at.getTime() - 24 * HOUR_MS - now.getTime();
    expect(job24h?.opts.delay).toBe(expected24h);
    // The OLD slot's jobs are gone (removed by id), not merely shadowed.
    expect(queue.remove).toHaveBeenCalledWith(jobIdFor("booking-1", "24h", booking.starts_at));
    expect(queue.jobs.get(jobIdFor("booking-1", "24h", booking.starts_at))).toBeUndefined();
    expect(queue.jobs.get(jobIdFor("booking-1", "1h", booking.starts_at))).toBeUndefined();
  });

  it("re-times correctly even when no prior jobs existed (defensive no-op remove, then schedule)", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.rescheduleReminderJobs(booking as any, now);

    expect(queue.jobs.get(jobIdFor("booking-1", "24h", booking.starts_at))).toBeTruthy();
    expect(queue.jobs.get(jobIdFor("booking-1", "1h", booking.starts_at))).toBeTruthy();
  });
});

describe("ReminderScheduler.removeReminderJobs", () => {
  it("removes the jobs it scheduled, by their slot-versioned ids", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    await service.scheduleForConfirm(booking as any, new Date("2026-08-01T00:00:00Z"));
    expect(queue.jobs.size).toBe(2);

    await service.removeReminderJobs("booking-1");

    expect(queue.remove).toHaveBeenCalledWith(jobIdFor("booking-1", "24h", booking.starts_at));
    expect(queue.remove).toHaveBeenCalledWith(jobIdFor("booking-1", "1h", booking.starts_at));
    expect(queue.jobs.size).toBe(0);
  });

  it("also sweeps the PRE-slot-versioning ids, so jobs from an older deploy are still cleaned up", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    // Enqueued by the previous code (stable id, no expectedStartsAt) — this
    // process never scheduled them, so they are not in the id registry.
    queue.jobs.set("reminder_booking-1_24h", { name: "send-reminder", data: {}, opts: {} });
    queue.jobs.set("reminder_booking-1_1h", { name: "send-reminder", data: {}, opts: {} });

    await service.removeReminderJobs("booking-1");

    expect(queue.remove).toHaveBeenCalledWith("reminder_booking-1_24h");
    expect(queue.remove).toHaveBeenCalledWith("reminder_booking-1_1h");
    expect(queue.jobs.size).toBe(0);
  });

  it("removal failure (e.g. job locked/active) does not throw — best effort", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    (queue.remove as any).mockImplementationOnce(async () => {
      throw new Error("job is locked");
    });

    await expect(service.removeReminderJobs("booking-1")).resolves.toBeUndefined();
  });
});

describe("ReminderScheduler.runReminderJob", () => {
  it("still confirmed at fire time: emits a notification-event with a complete payload", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.runReminderJob("booking-1", "24h");

    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
    const [name, payload] = (notificationQueue.add as any).mock.calls[0];
    expect(name).toBe("notification-event");
    expect(payload.userId).toBe("customer-1");
    expect(payload.notificationType).toBe(NotificationType.booking_reminder);
    expect(payload.variables.service_name).toBe("Deep Tissue Massage");
    expect(payload.variables.offset).toBe("24h");
    expect(payload.variables.vendor_name).toBe("Test Salon");
    expect(payload.variables.location_name).toBe("Marina Walk");
    expect(payload.data.bookingId).toBe("booking-1");
    expect(payload.data.vendorId).toBe("vendor-1");
    expect(payload.data.locationId).toBe("location-1");
    expect(payload.data.startsAt).toBe(booking.starts_at.toISOString());
    expect(payload.data.endsAt).toBe(booking.ends_at.toISOString());
    expect(payload.data.ics.uid).toBe("booking-booking-1@materialhubuae.com");
    expect(payload.data.ics.text).toContain("BEGIN:VEVENT");
    expect(payload.data.ics.text).toContain("SUMMARY:Deep Tissue Massage");
  });

  it("home-visit booking (no location_id): does not attempt a location lookup, ics location falls back", async () => {
    const booking = baseBooking({
      location_id: null,
      customer_address: { city: "Dubai", line1: "Villa 12" },
    });
    const { service, notificationQueue, locationRepo } = makeService({ booking });

    await service.runReminderJob("booking-1", "1h");

    expect(locationRepo.findOne).not.toHaveBeenCalled();
    const [, payload] = (notificationQueue.add as any).mock.calls[0];
    expect(payload.data.locationId).toBeNull();
    // Finding 6: the customer's home address is NOT shipped cross-service —
    // notification-service PERSISTS this blob to notifications.data (and
    // pushes it to FCM / the Redis SSE channel), and no template reads it.
    expect(payload.data.customerAddress).toBeUndefined();
    expect(payload.data.customerUserId).toBeUndefined();
    expect(payload.data.ics.location).toBe("Customer address (home visit)");
  });

  it("no longer confirmed (cancelled/rescheduled/completed/no_show/expired before fire time): graceful no-op, does NOT emit", async () => {
    for (const status of [
      BookingStatus.cancelled,
      BookingStatus.rescheduled,
      BookingStatus.completed,
      BookingStatus.no_show,
      BookingStatus.expired,
    ]) {
      const booking = baseBooking({ status });
      const { service, notificationQueue } = makeService({ booking });

      await service.runReminderJob("booking-1", "24h");

      expect(notificationQueue.add).not.toHaveBeenCalled();
    }
  });

  it("booking not found (deleted/bad id): graceful no-op, does NOT throw", async () => {
    const { service, notificationQueue } = makeService({ booking: null });

    await expect(service.runReminderJob("missing-id", "24h")).resolves.toBeUndefined();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("vendor/location lookup failure is best-effort — reminder still fires with null display fields", async () => {
    const booking = baseBooking();
    const bookingRepo = makeBookingRepo(booking);
    const queue = fakeQueue();
    const notificationQueue = fakeNotificationQueue();
    const vendorRepo = {
      findOne: mock(async () => {
        throw new Error("db blip");
      }),
    };
    const locationRepo = {
      findOne: mock(async () => {
        throw new Error("db blip");
      }),
    };
    const service = new ReminderScheduler(
      bookingRepo as any,
      queue as any,
      notificationQueue as any,
      vendorRepo as any,
      locationRepo as any,
    );

    await expect(service.runReminderJob("booking-1", "24h")).resolves.toBeUndefined();
    const [, payload] = (notificationQueue.add as any).mock.calls[0];
    expect(payload.data.vendorName).toBeNull();
    expect(payload.data.locationName).toBeNull();
  });

  it("works with no vendor/location repos wired at all (fully optional DI)", async () => {
    const booking = baseBooking();
    const bookingRepo = makeBookingRepo(booking);
    const queue = fakeQueue();
    const notificationQueue = fakeNotificationQueue();
    const service = new ReminderScheduler(
      bookingRepo as any,
      queue as any,
      notificationQueue as any,
    );

    await expect(service.runReminderJob("booking-1", "1h")).resolves.toBeUndefined();
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
  });
});

// ─── Phase 7 review regressions ──────────────────────────────────────────

describe("ReminderScheduler — reschedule/remove ordering (finding 3)", () => {
  it("an UN-AWAITED removeReminderJobs that lands AFTER the re-schedule does NOT delete the fresh jobs", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);

    // Exactly the production interleaving: BookingStatusService fires the
    // cleanup WITHOUT awaiting it on the confirmed -> rescheduled transition
    // (booking-status.service.ts), and the reschedule flow then awaits
    // rescheduleReminderJobs. Make every queue.remove resolve only after a
    // macrotask so the un-awaited cleanup is guaranteed to land LAST.
    (queue.remove as any).mockImplementation(async (jobId: string) => {
      await new Promise((r) => setTimeout(r, 5));
      return queue.jobs.delete(jobId) ? 1 : 0;
    });

    const staleCleanup = service.removeReminderJobs("booking-1");

    const rescheduled = baseBooking({ starts_at: new Date("2026-08-20T12:00:00Z") });
    await service.rescheduleReminderJobs(rescheduled as any, now);
    await staleCleanup;
    // Let any straggler removes drain.
    await new Promise((r) => setTimeout(r, 30));

    // The load-bearing assertion: the booking still HAS its reminders.
    expect(queue.jobs.get(jobIdFor("booking-1", "24h", rescheduled.starts_at))).toBeTruthy();
    expect(queue.jobs.get(jobIdFor("booking-1", "1h", rescheduled.starts_at))).toBeTruthy();
    expect(queue.jobs.size).toBe(2);
  });
});

describe("ReminderScheduler — failed remove cannot pin the OLD time (finding 4)", () => {
  it("re-schedules under a NEW jobId even when every queue.remove throws", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);
    const oldDelay = queue.jobs.get(jobIdFor("booking-1", "24h", booking.starts_at))?.opts.delay;

    // Job locked/active — BullMQ refuses to remove it.
    (queue.remove as any).mockImplementation(async () => {
      throw new Error("job is locked");
    });

    const rescheduled = baseBooking({ starts_at: new Date("2026-08-20T12:00:00Z") });
    await service.rescheduleReminderJobs(rescheduled as any, now);

    // A job for the NEW slot exists, with the NEW delay — the add was NOT
    // swallowed as a same-jobId no-op.
    const fresh = queue.jobs.get(jobIdFor("booking-1", "24h", rescheduled.starts_at));
    expect(fresh).toBeTruthy();
    expect(fresh?.opts.delay).toBe(rescheduled.starts_at.getTime() - 24 * HOUR_MS - now.getTime());
    expect(fresh?.opts.delay).not.toBe(oldDelay);
  });

  it("a surviving OLD-slot job refuses to deliver: expectedStartsAt no longer matches (booking is back to `confirmed`)", async () => {
    // The booking was moved; its status is confirmed again, so the status
    // guard alone would have let this stale reminder through.
    const moved = baseBooking({ starts_at: new Date("2026-08-20T12:00:00Z") });
    const { service, notificationQueue } = makeService({ booking: moved });

    await service.runReminderJob(
      "booking-1",
      "24h",
      new Date("2026-08-10T10:00:00Z").toISOString(),
    );

    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("still delivers when expectedStartsAt matches the booking's current slot", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.runReminderJob("booking-1", "24h", booking.starts_at.toISOString());

    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
  });

  it("a legacy job with NO expectedStartsAt keeps the old status-only behaviour", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.runReminderJob("booking-1", "24h");

    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
  });
});

describe("ReminderScheduler — notification idempotency (finding 5)", () => {
  it("passes a stable (booking, offset, slot) eventId as the notification job's jobId", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.runReminderJob("booking-1", "24h");

    const [, payload, opts] = (notificationQueue.add as any).mock.calls[0];
    const expected = reminderEventId("booking-1", "24h", booking.starts_at);
    expect(opts?.jobId).toBe(expected);
    // Also carried in the payload so the consumer can dedupe downstream.
    expect(payload.eventId).toBe(expected);
    expect(payload.data.eventId).toBe(expected);
    // BullMQ rejects ":" in custom job ids.
    expect(expected).not.toContain(":");
  });

  it("a re-run of the SAME job (attempts: 3 / stalled-lock replay) produces the SAME dedupe id", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.runReminderJob("booking-1", "24h");
    await service.runReminderJob("booking-1", "24h");

    const [, , first] = (notificationQueue.add as any).mock.calls[0];
    const [, , second] = (notificationQueue.add as any).mock.calls[1];
    expect(second.jobId).toBe(first.jobId);
  });

  it("different offsets, and a re-scheduled slot, are genuinely DIFFERENT reminders", async () => {
    const startsAt = new Date("2026-08-10T10:00:00Z");
    const moved = new Date("2026-08-20T12:00:00Z");
    expect(reminderEventId("b1", "24h", startsAt)).not.toBe(reminderEventId("b1", "1h", startsAt));
    expect(reminderEventId("b1", "24h", startsAt)).not.toBe(reminderEventId("b1", "24h", moved));
  });
});
