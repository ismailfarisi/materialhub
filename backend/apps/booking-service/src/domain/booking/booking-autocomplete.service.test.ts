// booking-autocomplete.service.test.ts
//
// Mocked-repo unit tests (no live DB, no live Redis/BullMQ) — mirrors
// booking-auth.service.test.ts's makeService() shape. Runs unconditionally
// (no BOOKING_LIVE_DB gate) since everything here is pure math or a fake
// queue/repo/status-service.
import { describe, expect, it, mock } from "bun:test";
import { BookingStatus } from "@materialhub/database";
import {
  BookingAutoCompleteService,
  DEFAULT_AUTO_COMPLETE_GRACE_HOURS,
  computeAutoCompleteFireTime,
} from "./booking-autocomplete.service.ts";

const HOUR_MS = 3_600_000;

describe("computeAutoCompleteFireTime (spec §5.3 auto-complete fire-time formula)", () => {
  it("fires at ends_at + graceHours", () => {
    const endsAt = new Date("2026-08-01T10:00:00Z");
    const fireAt = computeAutoCompleteFireTime({ ends_at: endsAt }, 24);
    expect(fireAt.getTime()).toBe(endsAt.getTime() + 24 * HOUR_MS);
  });

  it("respects a non-default grace value", () => {
    const endsAt = new Date("2026-08-01T10:00:00Z");
    const fireAt = computeAutoCompleteFireTime({ ends_at: endsAt }, 6);
    expect(fireAt.getTime()).toBe(endsAt.getTime() + 6 * HOUR_MS);
  });

  it("DEFAULT_AUTO_COMPLETE_GRACE_HOURS is 24h (booking-auth.service.ts's AUTO_COMPLETE_DELAY_HOURS assumes this default)", () => {
    expect(DEFAULT_AUTO_COMPLETE_GRACE_HOURS).toBe(24);
  });
});

// ─── BookingAutoCompleteService ─────────────────────────────────────────

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

function makeBookingRepo(booking: Record<string, any>) {
  return {
    findOne: mock(async () => (booking ? { ...booking } : null)),
  };
}

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    status: BookingStatus.confirmed,
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
    ...overrides,
  };
}

function makeService(opts: {
  booking: Record<string, any> | null;
  completeBooking?: any;
  graceHours?: number;
}) {
  const bookingRepo = makeBookingRepo(opts.booking as Record<string, any>);
  const completeBooking =
    opts.completeBooking ?? mock(async (_id: string, _actor: any) => ({ status: "completed" }));
  const statusService = { completeBooking };
  const queue = fakeQueue();
  const service = new BookingAutoCompleteService(
    bookingRepo as any,
    statusService as any,
    queue as any,
    opts.graceHours,
  );
  return { service, bookingRepo, completeBooking, queue };
}

describe("BookingAutoCompleteService.scheduleForConfirm", () => {
  it("schedules the delayed `autocomplete_{id}` job at ends_at + 24h (default grace)", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);

    const job = queue.jobs.get("autocomplete_booking-1");
    expect(job).toBeTruthy();
    expect(job?.name).toBe("auto-complete");
    expect(job?.data).toEqual({ bookingId: "booking-1" });
    const expectedFireAt = booking.ends_at.getTime() + 24 * HOUR_MS;
    expect(job?.opts.delay).toBe(expectedFireAt - now.getTime());
  });

  it("uses a config-driven grace value when provided", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking, graceHours: 6 });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);

    const job = queue.jobs.get("autocomplete_booking-1");
    const expectedFireAt = booking.ends_at.getTime() + 6 * HOUR_MS;
    expect(job?.opts.delay).toBe(expectedFireAt - now.getTime());
  });

  it("clamps delay to 0 (never negative) if ends_at + grace is already in the past", async () => {
    const now = new Date("2026-08-20T00:00:00Z");
    const booking = baseBooking({ ends_at: new Date("2026-08-01T10:30:00Z") });
    const { service, queue } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, now);

    const job = queue.jobs.get("autocomplete_booking-1");
    expect(job?.opts.delay).toBe(0);
  });
});

describe("BookingAutoCompleteService.rescheduleAutoCompleteJob", () => {
  it("removes any existing job and re-schedules at the (new) ends_at + grace", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.scheduleForConfirm(booking as any, now);
    expect(queue.jobs.get("autocomplete_booking-1")?.opts.delay).toBe(
      booking.ends_at.getTime() + 24 * HOUR_MS - now.getTime(),
    );

    const rescheduled = baseBooking({ ends_at: new Date("2026-08-15T12:00:00Z") });
    await service.rescheduleAutoCompleteJob(rescheduled as any, now);

    const job = queue.jobs.get("autocomplete_booking-1");
    expect(job).toBeTruthy();
    const expectedFireAt = rescheduled.ends_at.getTime() + 24 * HOUR_MS;
    expect(job?.opts.delay).toBe(expectedFireAt - now.getTime());
    expect(queue.remove).toHaveBeenCalledWith("autocomplete_booking-1");
  });

  it("re-times correctly even when no prior job existed (defensive no-op remove, then schedule)", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    const now = new Date("2026-08-01T00:00:00Z");

    await service.rescheduleAutoCompleteJob(booking as any, now);

    const job = queue.jobs.get("autocomplete_booking-1");
    expect(job).toBeTruthy();
  });
});

describe("BookingAutoCompleteService.removeAutoCompleteJob", () => {
  it("removes the job by id", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    queue.jobs.set("autocomplete_booking-1", { name: "auto-complete", data: {}, opts: {} });

    await service.removeAutoCompleteJob("booking-1");

    expect(queue.remove).toHaveBeenCalledWith("autocomplete_booking-1");
    expect(queue.jobs.size).toBe(0);
  });

  it("removal failure (e.g. job locked/active) does not throw — best effort", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    (queue.remove as any).mockImplementationOnce(async () => {
      throw new Error("job is locked");
    });

    await expect(service.removeAutoCompleteJob("booking-1")).resolves.toBeUndefined();
  });
});

describe("BookingAutoCompleteService.runAutoCompleteJob", () => {
  it("still confirmed at fire time: completes the booking with the system actor", async () => {
    const booking = baseBooking();
    const { service, completeBooking } = makeService({ booking });

    await service.runAutoCompleteJob("booking-1");

    expect(completeBooking).toHaveBeenCalledTimes(1);
    const [id, actor] = (completeBooking as any).mock.calls[0];
    expect(id).toBe("booking-1");
    expect(actor).toEqual({ id: null, role: "system" });
  });

  it("terminal (cancelled/no_show/expired before fire time): graceful no-op, does NOT call completeBooking", async () => {
    for (const status of [BookingStatus.cancelled, BookingStatus.no_show, BookingStatus.expired]) {
      const booking = baseBooking({ status });
      const { service, completeBooking } = makeService({ booking });

      await service.runAutoCompleteJob("booking-1");

      expect(completeBooking).not.toHaveBeenCalled();
    }
  });

  // Fix 2 (retry-safety): a booking already `completed` is NOT a no-op — it's
  // the retry-after-mid-flight-capture-failure case. Route it back through
  // completeBooking so the idempotent capture/accrual re-fires (skips whatever
  // already succeeded); the old `status !== confirmed -> skip` guard would have
  // silently dropped the money re-attempt and let the Stripe auth expire.
  it("already completed (a prior run won the transition but capture failed): re-routes to completeBooking for the money retry", async () => {
    const booking = baseBooking({ status: BookingStatus.completed });
    const { service, completeBooking } = makeService({ booking });

    await service.runAutoCompleteJob("booking-1");

    expect(completeBooking).toHaveBeenCalledTimes(1);
  });

  it("capture failure then re-run: the first job throws, a re-run still reaches completeBooking (and succeeds)", async () => {
    const booking = baseBooking(); // confirmed
    let calls = 0;
    const completeBooking = mock(async () => {
      calls++;
      if (calls === 1) {
        // The transition WON (booking is now durably completed) but the
        // capture threw — mirrors completeBooking's real contract.
        booking.status = BookingStatus.completed;
        throw new Error("order-service unreachable during capture");
      }
      return { status: "completed" };
    });
    const { service } = makeService({ booking, completeBooking });

    // First run: confirmed -> completeBooking throws -> job fails (BullMQ retries).
    await expect(service.runAutoCompleteJob("booking-1")).rejects.toThrow(
      "order-service unreachable",
    );
    // Re-run: booking now reads `completed`, but the money side must be retried
    // — completeBooking is reached a SECOND time and succeeds.
    await service.runAutoCompleteJob("booking-1");

    expect(calls).toBe(2);
  });

  it("booking not found (deleted/bad id): graceful no-op, does NOT throw", async () => {
    const { service, completeBooking } = makeService({ booking: null });

    await expect(service.runAutoCompleteJob("missing-id")).resolves.toBeUndefined();
    expect(completeBooking).not.toHaveBeenCalled();
  });

  it("completeBooking throwing propagates (BullMQ retry semantics apply to genuine failures, not status races)", async () => {
    const booking = baseBooking();
    const completeBooking = mock(async () => {
      throw new Error("order-service unreachable");
    });
    const { service } = makeService({ booking, completeBooking });

    await expect(service.runAutoCompleteJob("booking-1")).rejects.toThrow(
      "order-service unreachable",
    );
  });
});
