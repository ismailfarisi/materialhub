// booking-auth.service.test.ts
//
// Mocked-repo unit tests (no live DB, no live Redis/BullMQ) — mirrors
// booking-reaper.service.test.ts's makeService() shape. Runs unconditionally
// (no BOOKING_LIVE_DB gate) since everything here is pure math or a fake
// queue/repo/client, matching the "prefer asserting on the QUEUE state ...
// rather than waiting on real delays" guidance in the Task 7b brief.
import { describe, expect, it, mock, spyOn } from "bun:test";
import { BookingStatus, ServicePaymentMode } from "@materialhub/database";
import {
  AUTH_SAFETY_MARGIN_HOURS,
  AUTO_COMPLETE_DELAY_HOURS,
  BookingAuthService,
  MAX_AUTH_TO_CAPTURE_HOURS,
  STRIPE_AUTH_VALIDITY_HOURS,
  assertAutoCompleteGraceAligned,
  authSupportsCaptureDeadline,
  computeAuthFireTime,
  computeCaptureDeadline,
  computeFollowUpFireTime,
} from "./booking-auth.service.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// The TRUE capture deadline per spec §5.3 "Auto-complete": a still-`confirmed`
// booking auto-completes (and is therefore captured, spec §5.2 step 3) at
// `ends_at + 24h`, NOT at `ends_at` itself. Every test below computes its
// expectation off THIS deadline — not the old (buggy) `starts_at + duration`
// one — so a regression back to the old formula fails these tests.
function trueCaptureDeadline(startsAt: Date, durationMinutes: number): number {
  return startsAt.getTime() + durationMinutes * 60_000 + AUTO_COMPLETE_DELAY_HOURS * HOUR_MS;
}

describe("computeAuthFireTime (spec §5.2 fire-time formula + 7-day clamp)", () => {
  it("uses the naive starts_at - (cancellation_window_hours + 24h) formula when within the 144h safety cap", () => {
    const startsAt = new Date("2026-08-01T10:00:00Z");
    const fireAt = computeAuthFireTime({
      starts_at: startsAt,
      duration_minutes: 30,
      cancellation_window_hours: 24,
    });
    // lead = 24h (window) + 24h (anchor offset) = 48h
    expect(fireAt.getTime()).toBe(startsAt.getTime() - 48 * HOUR_MS);
  });

  it("clamps the fire time later (closer to starts_at) when the naive lead time would exceed the 144h cap, using the TRUE capture deadline (ends_at + 24h auto-complete)", () => {
    const startsAt = new Date("2026-09-01T10:00:00Z");
    // cancellation_window_hours=400h -> lead=424h (~17.7 days) — far beyond
    // the 144h/6-day cap, which would otherwise mint a Stripe auth that
    // expires (~7 days) long before auto-complete ever captures it.
    const fireAt = computeAuthFireTime({
      starts_at: startsAt,
      duration_minutes: 30,
      cancellation_window_hours: 400,
    });
    // RED/GREEN-relevant: this is `ends_at + 24h`, the REAL capture point —
    // NOT `startsAt.getTime() + 30 * 60_000` (the old, buggy `ends_at`
    // deadline the pre-fix clamp used, which was 24h too permissive).
    const captureDeadline = trueCaptureDeadline(startsAt, 30);
    const earliestSafeFireAt = captureDeadline - 144 * HOUR_MS;
    expect(fireAt.getTime()).toBe(earliestSafeFireAt);

    // Sanity: clamped fire time is strictly LATER than the naive (unclamped)
    // formula would have produced.
    const naiveFireAt = startsAt.getTime() - 424 * HOUR_MS;
    expect(fireAt.getTime()).toBeGreaterThan(naiveFireAt);

    // The real invariant this whole clamp exists to protect: from fireAt to
    // the TRUE capture deadline must be <= 144h, leaving a genuine 24h
    // (AUTH_SAFETY_MARGIN_HOURS) of headroom before Stripe's 168h ceiling.
    const spanHours = (captureDeadline - fireAt.getTime()) / HOUR_MS;
    expect(spanHours).toBeLessThanOrEqual(MAX_AUTH_TO_CAPTURE_HOURS);
    expect(STRIPE_AUTH_VALIDITY_HOURS - spanHours).toBeGreaterThanOrEqual(AUTH_SAFETY_MARGIN_HOURS);
  });

  it("bases the TRUE capture deadline on starts_at + duration + 24h auto-complete, not just starts_at + duration (long-duration bookings)", () => {
    const startsAt = new Date("2026-09-01T10:00:00Z");
    const threeDayMinutes = 3 * 24 * 60;
    const fireAt = computeAuthFireTime({
      starts_at: startsAt,
      duration_minutes: threeDayMinutes,
      cancellation_window_hours: 300,
    });
    const captureDeadline = trueCaptureDeadline(startsAt, threeDayMinutes);
    const naiveFireAt = startsAt.getTime() - (300 + 24) * HOUR_MS;
    const earliestSafeFireAt = captureDeadline - 144 * HOUR_MS;
    // naive (~13.5 days before starts_at) is earlier than the safe floor
    // (~3 days before starts_at, now pushed 24h later than the old buggy
    // formula by the auto-complete tail) — clamp must win.
    expect(fireAt.getTime()).toBe(Math.max(naiveFireAt, earliestSafeFireAt));
    expect(fireAt.getTime()).toBe(earliestSafeFireAt);
  });

  it("long-window + long-duration prepay booking: the fire time keeps REAL headroom (span to true capture strictly < 168h - margin, i.e. <= 144h)", () => {
    // A deliberately extreme combination — a multi-day service AND a
    // multi-week cancellation window — the exact shape of booking the old
    // (ends_at-only) clamp under-protected: it would have clamped to a fire
    // time that left the auth-fire -> TRUE-capture span at exactly 168h (zero
    // margin) instead of 144h (24h margin), because it was 24h short on the
    // deadline side.
    const startsAt = new Date("2026-10-01T00:00:00Z");
    const durationMinutes = 2 * 24 * 60; // 2-day service
    const cancellationWindowHours = 20 * 24; // 20-day cancellation window

    const fireAt = computeAuthFireTime({
      starts_at: startsAt,
      duration_minutes: durationMinutes,
      cancellation_window_hours: cancellationWindowHours,
    });

    const captureDeadline = trueCaptureDeadline(startsAt, durationMinutes);
    const spanHours = (captureDeadline - fireAt.getTime()) / HOUR_MS;

    // The clamp must have engaged (naive lead here is ~21 days, way over).
    expect(spanHours).toBeCloseTo(MAX_AUTH_TO_CAPTURE_HOURS, 5); // 144h exactly
    // Strictly under Stripe's raw ~7-day (168h) ceiling, with real headroom —
    // not equal to it (which is what the pre-fix bug produced).
    expect(spanHours).toBeLessThan(STRIPE_AUTH_VALIDITY_HOURS);
    expect(STRIPE_AUTH_VALIDITY_HOURS - spanHours).toBe(AUTH_SAFETY_MARGIN_HOURS);
  });

  it("a booking created inside the window naturally produces a fireAt in the past (the inline-authorize signal)", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const startsAt = new Date(now.getTime() + 2 * HOUR_MS); // 2h out
    const fireAt = computeAuthFireTime({
      starts_at: startsAt,
      duration_minutes: 30,
      cancellation_window_hours: 24, // lead = 48h > 2h until starts_at
    });
    expect(fireAt.getTime()).toBeLessThan(now.getTime());
  });
});

describe("computeFollowUpFireTime (spec §5.2 auth-failure auto-cancel deadline)", () => {
  it("uses starts_at - cancellation_window_hours when that's comfortably in the future", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const startsAt = new Date("2026-08-10T00:00:00Z");
    const fireAt = computeFollowUpFireTime(
      { starts_at: startsAt, duration_minutes: 30, cancellation_window_hours: 24 },
      now,
    );
    expect(fireAt.getTime()).toBe(startsAt.getTime() - 24 * HOUR_MS);
  });

  it("falls back to now + 1h grace when the policy deadline has already passed", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const startsAt = new Date(now.getTime() + HOUR_MS); // 1h out
    // policy fireAt = startsAt - 24h = now - 23h (already past)
    const fireAt = computeFollowUpFireTime(
      { starts_at: startsAt, duration_minutes: 30, cancellation_window_hours: 24 },
      now,
    );
    expect(fireAt.getTime()).toBe(now.getTime() + HOUR_MS);
  });
});

// ─── BookingAuthService ─────────────────────────────────────────────────

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
    getJob: mock(async (jobId: string) => jobs.get(jobId) ?? undefined),
  };
}

function makeBookingRepo(booking: Record<string, any>) {
  return {
    findOne: mock(async () => ({ ...booking })),
    // Fix 4: honors the optional `status` guard on the criteria — a write
    // conditioned on `status = 'confirmed'` no-ops (affected 0) when the shared
    // booking has since flipped to a terminal state, exactly like the real
    // `UPDATE ... WHERE id = :id AND status = 'confirmed'`.
    update: mock(async (criteria: any, partial: Record<string, any>) => {
      if (criteria.status !== undefined && booking.status !== criteria.status) {
        return { affected: 0 };
      }
      Object.assign(booking, partial);
      return { affected: 1 };
    }),
  };
}

function makePaymentRepo(paymentsById: Record<string, any>) {
  return {
    findOne: mock(async ({ where }: any) => paymentsById[where.id] ?? null),
  };
}

function fakeNotificationQueue() {
  return { add: mock(async (_name: string, _data: unknown) => ({ id: "notif-job-1" })) };
}

const SAVED_METHOD_PAYMENT = {
  id: "pay-setup-1",
  gateway_response: {
    kind: "setup_intent",
    stripe_customer_id: "cus_1",
    payment_method_id: "pm_1",
  },
};

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    customer_user_id: "cust-1",
    status: BookingStatus.confirmed,
    payment_id: SAVED_METHOD_PAYMENT.id,
    escrow_hold_id: null,
    price_fils: 20_000,
    amount_paid_fils: 0,
    starts_at: new Date("2026-08-10T10:00:00Z"),
    duration_minutes: 30,
    cancellation_window_hours: 24,
    ...overrides,
  };
}

function makeService(opts: {
  booking: Record<string, any>;
  authorize?: any;
  voidFn?: any;
  transition?: any;
  paymentsById?: Record<string, any>;
}) {
  const bookingRepo = makeBookingRepo(opts.booking);
  const paymentRepo = makePaymentRepo(
    opts.paymentsById ?? { [SAVED_METHOD_PAYMENT.id]: SAVED_METHOD_PAYMENT },
  );
  const authorize =
    opts.authorize ??
    mock(async () => ({
      paymentId: "pay-auth-1",
      paymentIntentId: "pi_1",
      status: "requires_capture",
      failureReason: null,
    }));
  const voidFn =
    opts.voidFn ?? mock(async () => ({ paymentIntentId: "pi_auth_1", status: "canceled" }));
  const paymentClient = { authorize, void: voidFn };
  const transition = opts.transition ?? mock(async (_id: string, to: string) => ({ status: to }));
  const statusService = { transition };
  const queue = fakeQueue();
  const notificationQueue = fakeNotificationQueue();
  const service = new BookingAuthService(
    bookingRepo as any,
    paymentRepo as any,
    paymentClient as any,
    statusService as any,
    queue as any,
    notificationQueue as any,
    "https://app.materialhubuae.com",
  );
  return {
    service,
    bookingRepo,
    paymentRepo,
    authorize,
    voidFn,
    transition,
    queue,
    notificationQueue,
  };
}

describe("BookingAuthService.scheduleForConfirm", () => {
  it("far-out booking: schedules the delayed `auth:{id}` job instead of authorizing inline", async () => {
    const booking = baseBooking({ starts_at: new Date(Date.now() + 20 * DAY_MS) });
    const { service, authorize, queue } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, new Date());

    expect(authorize).not.toHaveBeenCalled();
    const job = queue.jobs.get("auth_booking-1");
    expect(job).toBeTruthy();
    expect(job?.name).toBe("authorize");
    expect(job?.data).toEqual({ bookingId: "booking-1" });
    expect(job?.opts.delay).toBeGreaterThan(0);
    // Expected delay: starts_at - 48h - now, give or take test execution time.
    const expectedFireAt = booking.starts_at.getTime() - 48 * HOUR_MS;
    expect(job?.opts.delay).toBeGreaterThan(expectedFireAt - Date.now() - 5_000);
    expect(job?.opts.delay).toBeLessThan(expectedFireAt - Date.now() + 5_000);
  });

  it("near-term booking (inside the window): authorizes INLINE, no delayed job scheduled", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    // cancellation_window_hours=24 -> lead=48h; starts_at only 2h out -> fireAt is already past `now`.
    const booking = baseBooking({
      starts_at: new Date(now.getTime() + 2 * HOUR_MS),
      cancellation_window_hours: 24,
    });
    const { service, authorize, queue, bookingRepo } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, now);

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(queue.jobs.has("auth_booking-1")).toBe(false);
    expect(bookingRepo.update).toHaveBeenCalledWith(
      { id: "booking-1", status: BookingStatus.confirmed },
      { escrow_hold_id: "pay-auth-1" },
    );
  });
});

describe("BookingAuthService.runAuthorizeJob", () => {
  it("success: authorizes and records the PaymentIntent's Payment-row id as escrow_hold_id", async () => {
    const booking = baseBooking();
    const { service, authorize, bookingRepo } = makeService({ booking });

    await service.runAuthorizeJob("booking-1");

    expect(authorize).toHaveBeenCalledWith({
      bookingId: "booking-1",
      userId: "cust-1",
      stripeCustomerId: "cus_1",
      paymentMethodId: "pm_1",
      amountFils: 20_000,
      currency: "AED",
    });
    expect(bookingRepo.update).toHaveBeenCalledWith(
      { id: "booking-1", status: BookingStatus.confirmed },
      { escrow_hold_id: "pay-auth-1" },
    );
  });

  // ── Fix 4: cancel/no-show racing an in-flight authorize ──────────────────
  it("booking flipped to cancelled DURING the authorize round-trip: does NOT stamp escrow_hold_id, voids the just-minted PI", async () => {
    const booking = baseBooking();
    // The authorize round-trip "takes time" — a cancel lands during it and
    // flips the shared booking to a terminal state before the post-authorize
    // write runs.
    const authorize = mock(async () => {
      booking.status = BookingStatus.cancelled;
      return {
        paymentId: "pay-auth-1",
        paymentIntentId: "pi_race",
        status: "requires_capture",
        failureReason: null,
      };
    });
    const { service, voidFn, bookingRepo } = makeService({ booking, authorize });

    await service.runAuthorizeJob("booking-1");

    // Guarded write attempted (status = confirmed) but matched 0 rows, so the
    // stamp never landed.
    expect(bookingRepo.update).toHaveBeenCalledWith(
      { id: "booking-1", status: BookingStatus.confirmed },
      { escrow_hold_id: "pay-auth-1" },
    );
    expect(booking.escrow_hold_id).toBeNull();
    // The orphaned PI is voided so the customer's card isn't held ~7 days.
    expect(voidFn).toHaveBeenCalledTimes(1);
    const [voidInput] = (voidFn as any).mock.calls[0];
    expect(voidInput.bookingId).toBe("booking-1");
    expect(voidInput.paymentIntentId).toBe("pi_race");
  });

  it("void of the orphaned PI failing is best-effort (does not throw out of the job)", async () => {
    const booking = baseBooking();
    const authorize = mock(async () => {
      booking.status = BookingStatus.no_show;
      return {
        paymentId: "pay-auth-1",
        paymentIntentId: "pi_race",
        status: "requires_capture",
        failureReason: null,
      };
    });
    const voidFn = mock(async () => {
      throw new Error("order-service unreachable");
    });
    const { service } = makeService({ booking, authorize, voidFn });

    await expect(service.runAuthorizeJob("booking-1")).resolves.toBeUndefined();
    expect(booking.escrow_hold_id).toBeNull();
  });

  it("skips a booking that is no longer confirmed (cancelled/expired before the job fired)", async () => {
    const booking = baseBooking({ status: BookingStatus.cancelled });
    const { service, authorize } = makeService({ booking });

    await service.runAuthorizeJob("booking-1");

    expect(authorize).not.toHaveBeenCalled();
  });

  it("skips a booking that's already authorized (idempotent re-run)", async () => {
    const booking = baseBooking({ escrow_hold_id: "pay-auth-already" });
    const { service, authorize } = makeService({ booking });

    await service.runAuthorizeJob("booking-1");

    expect(authorize).not.toHaveBeenCalled();
  });

  it("no saved payment method on the booking's Payment row: schedules the follow-up-cancel job instead of throwing", async () => {
    const booking = baseBooking({ payment_id: "pay-missing" });
    const { service, authorize, queue } = makeService({ booking, paymentsById: {} });

    await service.runAuthorizeJob("booking-1");

    expect(authorize).not.toHaveBeenCalled();
    const job = queue.jobs.get("auth-followup_booking-1");
    expect(job).toBeTruthy();
    expect(job?.name).toBe("follow-up-cancel");
  });

  it("paymentClient.authorize throws (sync failure): schedules the follow-up-cancel job", async () => {
    const booking = baseBooking();
    const authorize = mock(async () => {
      throw new Error("order-service unreachable");
    });
    const { service, queue } = makeService({ booking, authorize });

    await service.runAuthorizeJob("booking-1");

    expect(queue.jobs.get("auth-followup_booking-1")).toBeTruthy();
  });

  it("paymentClient.authorize resolves with a decline (business-outcome failure): schedules the follow-up-cancel job", async () => {
    const booking = baseBooking();
    const authorize = mock(async () => ({
      paymentId: "pay-declined",
      paymentIntentId: null,
      status: "failed",
      failureReason: "Your card was declined.",
    }));
    const { service, queue, bookingRepo } = makeService({ booking, authorize });

    await service.runAuthorizeJob("booking-1");

    expect(queue.jobs.get("auth-followup_booking-1")).toBeTruthy();
    // Never records a failed PI as if it were a successful authorization.
    expect(bookingRepo.update).not.toHaveBeenCalled();
  });
});

describe("BookingAuthService.runFollowUpCancelJob", () => {
  it("still unauthorized at the deadline: cancels the booking via the status service (frees the slot)", async () => {
    const booking = baseBooking();
    const { service, transition } = makeService({ booking });

    await service.runFollowUpCancelJob("booking-1");

    expect(transition).toHaveBeenCalledTimes(1);
    const [id, to, actor] = (transition as any).mock.calls[0];
    expect(id).toBe("booking-1");
    expect(to).toBe(BookingStatus.cancelled);
    expect(actor).toEqual({ id: null, role: "system" });
  });

  it("already authorized in the meantime: does NOT cancel", async () => {
    const booking = baseBooking({ escrow_hold_id: "pay-auth-1" });
    const { service, transition } = makeService({ booking });

    await service.runFollowUpCancelJob("booking-1");

    expect(transition).not.toHaveBeenCalled();
  });

  it("already terminal (cancelled by some other path): does NOT cancel again", async () => {
    const booking = baseBooking({ status: BookingStatus.expired });
    const { service, transition } = makeService({ booking });

    await service.runFollowUpCancelJob("booking-1");

    expect(transition).not.toHaveBeenCalled();
  });
});

describe("BookingAuthService.removeBookingAuthJob", () => {
  it("removes both the auth and auth-followup jobs", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    queue.jobs.set("auth_booking-1", { name: "authorize", data: {}, opts: {} });
    queue.jobs.set("auth-followup_booking-1", { name: "follow-up-cancel", data: {}, opts: {} });

    await service.removeBookingAuthJob("booking-1");

    expect(queue.remove).toHaveBeenCalledWith("auth_booking-1");
    expect(queue.remove).toHaveBeenCalledWith("auth-followup_booking-1");
    expect(queue.jobs.size).toBe(0);
  });

  it("one job's removal failing does not block the other's (best-effort)", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });
    queue.jobs.set("auth-followup_booking-1", { name: "follow-up-cancel", data: {}, opts: {} });
    (queue.remove as any).mockImplementationOnce(async () => {
      throw new Error("job is locked");
    });

    await expect(service.removeBookingAuthJob("booking-1")).resolves.toBeUndefined();
    expect(queue.jobs.has("auth-followup_booking-1")).toBe(false);
  });
});

describe("BookingAuthService.handleAsyncAuthFailure (webhook path)", () => {
  it("routes through the same failure handling as the sync path — schedules the follow-up-cancel job", async () => {
    const booking = baseBooking();
    const { service, queue } = makeService({ booking });

    await service.handleAsyncAuthFailure(booking as any, "card_declined via webhook");

    expect(queue.jobs.get("auth-followup_booking-1")).toBeTruthy();
  });

  it("no-ops if the booking was authorized before the async failure arrived (stale webhook)", async () => {
    const booking = baseBooking({ escrow_hold_id: "pay-auth-1" });
    const { service, queue } = makeService({ booking });

    await service.handleAsyncAuthFailure(booking as any, "stale");

    expect(queue.jobs.has("auth-followup_booking-1")).toBe(false);
  });
});

// Fix 2 (review): the sync (authorizeNow decline/throw) and async (webhook ->
// handlePaymentFailed -> handleAsyncAuthFailure) failure paths can both fire
// for the SAME failed off-session attempt — Stripe delivers
// payment_intent.payment_failed independently of the sync API call's own
// outcome. Phase 5 Task 8 wired notifyPaymentFailed to actually push a
// `booking_payment_failed` notification-event (previously a console.log-only
// TODO seam) — these tests now count THAT queue emission as the notify
// marker; the follow-up-cancel job's existence remains the de-dupe marker
// under test.
describe("BookingAuthService failure-notify dedupe (Fix 2)", () => {
  function countNotifies(notificationQueue: ReturnType<typeof fakeNotificationQueue>): number {
    return (notificationQueue.add.mock.calls as unknown[][]).filter(
      (args) => (args[1] as any)?.notificationType === "booking_payment_failed",
    ).length;
  }

  it("sync failure then async webhook failure for the SAME booking notifies only ONCE", async () => {
    const booking = baseBooking();
    const authorize = mock(async () => ({
      paymentId: "pay-declined",
      paymentIntentId: null,
      status: "failed",
      failureReason: "Your card was declined.",
    }));
    const { service, queue, notificationQueue } = makeService({ booking, authorize });

    // Sync path first: runAuthorizeJob -> authorizeNow -> decline -> handleAuthFailure.
    await service.runAuthorizeJob("booking-1");
    expect(countNotifies(notificationQueue)).toBe(1);
    expect(queue.jobs.get("auth-followup_booking-1")).toBeTruthy();

    // The SAME failed off-session attempt also arrives via the webhook.
    // Booking is still `confirmed`, still no escrow_hold_id — without the
    // dedupe this would notify the customer a SECOND time for one failure.
    await service.handleAsyncAuthFailure(
      booking as any,
      "card_declined via webhook (duplicate delivery of the same failure)",
    );

    expect(countNotifies(notificationQueue)).toBe(1); // unchanged — still just the sync-path notify
  });

  it("first failure (no existing follow-up job yet) still notifies", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.handleAsyncAuthFailure(booking as any, "card_declined");
    expect(countNotifies(notificationQueue)).toBe(1);
  });

  it("notification payload carries the pay-now link + booking/reason detail", async () => {
    const booking = baseBooking();
    const { service, notificationQueue } = makeService({ booking });

    await service.handleAsyncAuthFailure(booking as any, "card_declined");

    const call = notificationQueue.add.mock.calls[0] as any[];
    expect(call[1].userId).toBe(booking.customer_user_id);
    expect(call[1].notificationType).toBe("booking_payment_failed");
    expect(call[1].variables.pay_now_url).toBe("https://app.materialhubuae.com/bookings/booking-1");
    expect(call[1].variables.reason).toBe("card_declined");
    expect(call[1].data.bookingId).toBe("booking-1");
    expect(call[1].data.payNowUrl).toBe("https://app.materialhubuae.com/bookings/booking-1");
  });

  it("queue.getJob failing fails OPEN (still notifies) rather than silently swallowing a legitimate failure notification", async () => {
    const booking = baseBooking();
    const { service, queue, notificationQueue } = makeService({ booking });
    (queue.getJob as any).mockImplementationOnce(async () => {
      throw new Error("redis blip");
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    try {
      await service.handleAsyncAuthFailure(booking as any, "card_declined");
      expect(countNotifies(notificationQueue)).toBe(1);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("BookingAuthService.rescheduleBookingAuthJob (Phase 5 Task 3)", () => {
  // Auth Payment row fixture (what the escrow_hold_id resolves to): minted
  // `NOW`, PI id pi_auth_1 — created_at drives the carry-over validity check.
  const NOW = new Date("2026-08-01T00:00:00Z");
  const ESCROW_PAYMENT = {
    id: "pay-auth-1",
    gateway_payment_id: "pi_auth_1",
    gateway_response: {},
    created_at: NOW,
  };
  function paymentsWithEscrow() {
    return {
      [SAVED_METHOD_PAYMENT.id]: SAVED_METHOD_PAYMENT,
      [ESCROW_PAYMENT.id]: ESCROW_PAYMENT,
    };
  }
  // New slot times: "near" keeps the capture deadline (ends_at + 24h) within
  // the auth's 144h (MAX_AUTH_TO_CAPTURE_HOURS) budget from created_at;
  // "far" pushes it weeks past it.
  const NEAR_STARTS = new Date(NOW.getTime() + 2 * DAY_MS);
  const NEAR_ENDS = new Date(NEAR_STARTS.getTime() + 30 * 60_000);
  const FAR_STARTS = new Date(NOW.getTime() + 20 * DAY_MS);
  const FAR_ENDS = new Date(FAR_STARTS.getTime() + 30 * 60_000);

  it("prepay + not-yet-authorized: removes stale jobs then re-schedules for the new slot", async () => {
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: null,
      starts_at: FAR_STARTS,
      ends_at: FAR_ENDS,
    });
    const { service, queue, authorize, voidFn } = makeService({ booking });
    // Seed a stale auth job (keyed to the OLD slot) to prove it's removed.
    queue.jobs.set("auth_booking-1", { name: "authorize", data: {}, opts: {} });

    await service.rescheduleBookingAuthJob(booking as any, NOW);

    expect(queue.remove).toHaveBeenCalledWith("auth_booking-1");
    expect(queue.remove).toHaveBeenCalledWith("auth-followup_booking-1");
    // Far-out -> a fresh delayed job was scheduled (not inline-authorized).
    expect(authorize).not.toHaveBeenCalled();
    expect(voidFn).not.toHaveBeenCalled();
    expect(queue.jobs.get("auth_booking-1")?.opts.delay).toBeGreaterThan(0);
  });

  it("authorized + new capture deadline WITHIN the existing auth's validity: carry-over untouched (no void, no re-auth, no new job)", async () => {
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: ESCROW_PAYMENT.id,
      starts_at: NEAR_STARTS,
      ends_at: NEAR_ENDS,
    });
    const { service, queue, authorize, voidFn, bookingRepo } = makeService({
      booking,
      paymentsById: paymentsWithEscrow(),
    });

    await service.rescheduleBookingAuthJob(booking as any, NOW);

    expect(queue.remove).toHaveBeenCalledWith("auth_booking-1");
    expect(voidFn).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(bookingRepo.update).not.toHaveBeenCalled();
    expect(queue.jobs.has("auth_booking-1")).toBe(false);
    expect((booking as any).escrow_hold_id).toBe(ESCROW_PAYMENT.id);
  });

  it("authorized + FAR-future new slot (capture deadline outruns the auth): voids the old PI, clears escrow_hold_id, re-schedules at the new timing", async () => {
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: ESCROW_PAYMENT.id,
      cancellation_window_hours: 24,
      starts_at: FAR_STARTS,
      ends_at: FAR_ENDS,
    });
    const { service, queue, authorize, voidFn, bookingRepo } = makeService({
      booking,
      paymentsById: paymentsWithEscrow(),
    });

    await service.rescheduleBookingAuthJob(booking as any, NOW);

    // Old auth voided by its resolved PI id.
    expect(voidFn).toHaveBeenCalledTimes(1);
    const [voidInput] = (voidFn as any).mock.calls[0];
    expect(voidInput.bookingId).toBe("booking-1");
    expect(voidInput.paymentIntentId).toBe("pi_auth_1");

    // Hold ref cleared so Task 9's capture path can't resolve the voided PI.
    expect(bookingRepo.update).toHaveBeenCalledWith({ id: "booking-1" }, { escrow_hold_id: null });
    expect(booking.escrow_hold_id).toBeNull();

    // Fresh delayed job at the NEW timing (starts_at - 48h from NOW), not an
    // inline re-auth (fire time is still in the future).
    expect(authorize).not.toHaveBeenCalled();
    const job = queue.jobs.get("auth_booking-1");
    expect(job).toBeTruthy();
    const expectedFireAt = FAR_STARTS.getTime() - 48 * HOUR_MS;
    expect(job?.opts.delay).toBe(expectedFireAt - NOW.getTime());
  });

  it("void failure is best-effort: still clears escrow_hold_id and re-schedules (the unvoided PI auto-expires at Stripe)", async () => {
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: ESCROW_PAYMENT.id,
      starts_at: FAR_STARTS,
      ends_at: FAR_ENDS,
    });
    const voidFn = mock(async () => {
      throw new Error("order-service unreachable");
    });
    const { service, queue, bookingRepo } = makeService({
      booking,
      voidFn,
      paymentsById: paymentsWithEscrow(),
    });

    await service.rescheduleBookingAuthJob(booking as any, NOW);

    expect(bookingRepo.update).toHaveBeenCalledWith({ id: "booking-1" }, { escrow_hold_id: null });
    expect(queue.jobs.has("auth_booking-1")).toBe(true);
  });

  it("authorized but the auth Payment row is missing: conservative re-auth (void skipped — no PI to void), escrow cleared, re-scheduled", async () => {
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: "hold-orphan",
      starts_at: FAR_STARTS,
      ends_at: FAR_ENDS,
    });
    // paymentsById lacks "hold-orphan" -> findOne resolves null.
    const { service, queue, voidFn, bookingRepo } = makeService({ booking });

    await service.rescheduleBookingAuthJob(booking as any, NOW);

    expect(voidFn).not.toHaveBeenCalled();
    expect(bookingRepo.update).toHaveBeenCalledWith({ id: "booking-1" }, { escrow_hold_id: null });
    expect(queue.jobs.has("auth_booking-1")).toBe(true);
  });

  it("authorized + far slot but the new fire time is ALREADY past: voids, clears, then re-authorizes INLINE via the standard path", async () => {
    // Auth minted 6 days ago, new slot ~26h out: capture deadline
    // (ends_at + 24h ≈ mint + 194h) exceeds mint + 144h, so the carry-over
    // check fails — while the new fire time (starts_at - 48h ≈ now - 22h) is
    // already in the past, forcing scheduleForConfirm's INLINE branch.
    const mintedLongAgo = new Date(NOW.getTime() - 6 * DAY_MS);
    const soonStarts = new Date(NOW.getTime() + 26 * HOUR_MS);
    const soonEnds = new Date(soonStarts.getTime() + 30 * 60_000);
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: ESCROW_PAYMENT.id,
      cancellation_window_hours: 24,
      starts_at: soonStarts,
      ends_at: soonEnds,
    });
    const { service, queue, authorize, voidFn } = makeService({
      booking,
      paymentsById: {
        [SAVED_METHOD_PAYMENT.id]: SAVED_METHOD_PAYMENT,
        [ESCROW_PAYMENT.id]: { ...ESCROW_PAYMENT, created_at: mintedLongAgo },
      },
    });

    await service.rescheduleBookingAuthJob(booking as any, NOW);

    expect(voidFn).toHaveBeenCalledTimes(1);
    // Inline re-auth (fire time starts_at - 48h is 22h in the past).
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(queue.jobs.has("auth_booking-1")).toBe(false);
  });

  it("non-prepay (deposit/pay_at_venue): removes stale jobs, never schedules an auth job", async () => {
    for (const mode of [ServicePaymentMode.deposit, ServicePaymentMode.pay_at_venue]) {
      const booking = baseBooking({
        payment_mode: mode,
        starts_at: FAR_STARTS,
        ends_at: FAR_ENDS,
      });
      const { service, queue, authorize, voidFn } = makeService({ booking });

      await service.rescheduleBookingAuthJob(booking as any, NOW);

      expect(queue.remove).toHaveBeenCalledWith("auth_booking-1");
      expect(authorize).not.toHaveBeenCalled();
      expect(voidFn).not.toHaveBeenCalled();
      expect(queue.jobs.has("auth_booking-1")).toBe(false);
    }
  });
});

describe("computeCaptureDeadline / authSupportsCaptureDeadline (Phase 5 Task 3 carry-over check)", () => {
  it("computeCaptureDeadline = ends_at + AUTO_COMPLETE_DELAY_HOURS", () => {
    const endsAt = new Date("2026-08-10T10:30:00Z");
    expect(computeCaptureDeadline({ ends_at: endsAt }).getTime()).toBe(
      endsAt.getTime() + AUTO_COMPLETE_DELAY_HOURS * HOUR_MS,
    );
  });

  it("supports a deadline exactly at mint + MAX_AUTH_TO_CAPTURE_HOURS (boundary inclusive)", () => {
    const minted = new Date("2026-08-01T00:00:00Z");
    const atBound = new Date(minted.getTime() + MAX_AUTH_TO_CAPTURE_HOURS * HOUR_MS);
    expect(authSupportsCaptureDeadline(minted, atBound)).toBe(true);
    expect(authSupportsCaptureDeadline(minted, new Date(atBound.getTime() + 1))).toBe(false);
  });

  it("rejects a deadline weeks past the mint (the reschedule-far-future case)", () => {
    const minted = new Date("2026-08-01T00:00:00Z");
    const weeksOut = new Date(minted.getTime() + 21 * DAY_MS);
    expect(authSupportsCaptureDeadline(minted, weeksOut)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #6 — a zero outstanding balance must not mint a hold.
// ───────────────────────────────────────────────────────────────────────────

describe("BookingAuthService zero-amount prepay (Phase 7 review fix 6)", () => {
  it("skips authorization entirely for a free prepay offering instead of holding 1 fil", async () => {
    const booking = baseBooking({ price_fils: 0, amount_paid_fils: 0 });
    const { service, authorize, queue, notificationQueue } = makeService({ booking });

    // Fire time already passed -> inline authorizeNow path.
    await service.scheduleForConfirm(booking as any, new Date("2027-01-01T00:00:00Z"));

    // Before the fix, `Math.max(price - paid, 1)` minted a real 1-fil
    // off-session hold on the customer's card for a booking that owes nothing.
    expect(authorize).not.toHaveBeenCalled();
    // And it is NOT treated as an auth failure: no payment-failed notify and
    // no follow-up auto-cancel for a perfectly valid free booking.
    expect(notificationQueue.add).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("skips authorization when the booking is already fully paid", async () => {
    const booking = baseBooking({ price_fils: 20_000, amount_paid_fils: 20_000 });
    const { service, authorize } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, new Date("2027-01-01T00:00:00Z"));

    expect(authorize).not.toHaveBeenCalled();
  });

  it("authorizes the UNFLOORED outstanding amount, matching deriveRecoverableAmount", async () => {
    const booking = baseBooking({ price_fils: 20_000, amount_paid_fils: 5_000 });
    const { service, authorize } = makeService({ booking });

    await service.scheduleForConfirm(booking as any, new Date("2027-01-01T00:00:00Z"));

    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ amountFils: 15_000 }));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #5 — the follow-up job must not outlive its failure.
// ───────────────────────────────────────────────────────────────────────────

describe("BookingAuthService follow-up job retention (Phase 7 review fix 5)", () => {
  it("schedules the follow-up job with removeOnComplete/removeOnFail TRUE, not a retained count", async () => {
    const authorize = mock(async () => ({
      paymentId: "p",
      paymentIntentId: "pi",
      status: "requires_payment_method",
      failureReason: "card_declined",
    }));
    const booking = baseBooking();
    const { service, queue } = makeService({ booking, authorize });

    await service.scheduleForConfirm(booking as any, new Date("2027-01-01T00:00:00Z"));

    const followUp = queue.jobs.get("auth-followup_booking-1");
    expect(followUp).toBeDefined();
    // THE FIX: with `removeOnComplete: 500` a COMPLETED follow-up job — including
    // the very common case where it ran, found the booking fine and no-op'd —
    // stayed in the completed set forever. Because this job's mere EXISTENCE is
    // the "already notified about this failure" marker
    // (followUpJobAlreadyScheduled), that stale record then suppressed BOTH the
    // payment-failed notification AND (via BullMQ's existing-jobId semantics)
    // the re-add that schedules the auto-cancel, for every LATER failure on the
    // same booking. Retaining neither terminal state makes the marker mean what
    // the dedupe check assumes: "an auto-cancel is genuinely still pending".
    expect(followUp?.opts.removeOnComplete).toBe(true);
    expect(followUp?.opts.removeOnFail).toBe(true);
  });

  it("a LATER failure still notifies once the previous follow-up job is gone", async () => {
    const authorize = mock(async () => ({
      paymentId: "p",
      paymentIntentId: "pi",
      status: "requires_payment_method",
      failureReason: "card_declined",
    }));
    const booking = baseBooking();
    const { service, queue, notificationQueue } = makeService({ booking, authorize });

    await service.scheduleForConfirm(booking as any, new Date("2027-01-01T00:00:00Z"));
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);

    // The job fires, no-ops, and (with removeOnComplete: true) is removed —
    // simulated here by clearing it from the fake queue.
    queue.jobs.delete("auth-followup_booking-1");

    await service.handleAsyncAuthFailure(booking as any, "second decline");

    // Both halves of failure handling work again: the customer IS notified…
    expect(notificationQueue.add).toHaveBeenCalledTimes(2);
    // …and a fresh auto-cancel IS scheduled.
    expect(queue.jobs.get("auth-followup_booking-1")).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #7 — the follow-up auto-cancel must not be silent.
// ───────────────────────────────────────────────────────────────────────────

describe("BookingAuthService.runFollowUpCancelJob notification (Phase 7 review fix 7)", () => {
  it("emits booking_cancelled when it auto-cancels — the customer's slot must not vanish silently", async () => {
    const booking = baseBooking({
      status: BookingStatus.confirmed,
      escrow_hold_id: null,
      booking_number: "BK-77",
      service_name: "Deep Tissue Massage",
      vendor_id: "vendor-1",
    });
    const { service, transition, notificationQueue } = makeService({ booking });

    await service.runFollowUpCancelJob("booking-1");

    expect(transition).toHaveBeenCalledWith(
      "booking-1",
      BookingStatus.cancelled,
      { id: null, role: "system" },
      expect.stringContaining("auto-cancelled"),
    );

    // Before the fix this path went straight through statusService.transition,
    // which emits no cancellation notification of its own — so the booking
    // simply disappeared, explained only by the earlier payment-failed mail.
    const calls = (notificationQueue.add.mock.calls as any[][]).map((c) => c[1]);
    const cancelled = calls.find((c) => c.notificationType === "booking_cancelled");
    expect(cancelled).toBeDefined();
    expect(cancelled.userId).toBe("cust-1");
    expect(cancelled.data.bookingId).toBe("booking-1");
    expect(cancelled.data.cancelledBy).toBe("system");
  });

  it("does NOT notify when there was nothing to cancel (already authorized)", async () => {
    const booking = baseBooking({ escrow_hold_id: "pay-auth-1" });
    const { service, transition, notificationQueue } = makeService({ booking });

    await service.runFollowUpCancelJob("booking-1");

    expect(transition).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("does NOT notify when the booking is already terminal", async () => {
    const booking = baseBooking({ status: BookingStatus.cancelled, escrow_hold_id: null });
    const { service, transition, notificationQueue } = makeService({ booking });

    await service.runFollowUpCancelJob("booking-1");

    expect(transition).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("a notification failure never fails the auto-cancel (best-effort emission)", async () => {
    const booking = baseBooking({ status: BookingStatus.confirmed, escrow_hold_id: null });
    const harness = makeService({ booking });
    (harness.notificationQueue.add as any).mockImplementation(async () => {
      throw new Error("redis down");
    });

    await expect(harness.service.runFollowUpCancelJob("booking-1")).resolves.toBeUndefined();
    expect(harness.transition).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PHASE 7 REVIEW FIX #9 — the hardcoded/env grace coupling is now enforced.
// ───────────────────────────────────────────────────────────────────────────

describe("assertAutoCompleteGraceAligned (Phase 7 review fix 9)", () => {
  it("passes when the deployed grace equals AUTO_COMPLETE_DELAY_HOURS", () => {
    expect(() => assertAutoCompleteGraceAligned(AUTO_COMPLETE_DELAY_HOURS)).not.toThrow();
  });

  it("throws when an operator raises BOOKING_AUTOCOMPLETE_GRACE_HOURS without bumping the constant", () => {
    // This is the silent money-loss the comment used to only warn about: a
    // larger deployed grace means capture happens LATER than the clamp assumes,
    // eating AUTH_SAFETY_MARGIN_HOURS and letting Stripe auths expire before
    // capture. Fail closed at boot instead.
    expect(() => assertAutoCompleteGraceAligned(48)).toThrow(
      /BOOKING_AUTOCOMPLETE_GRACE_HOURS is 48h/,
    );
  });

  it("throws when the grace is LOWERED out of alignment too", () => {
    expect(() => assertAutoCompleteGraceAligned(12)).toThrow(/MUST be equal/);
  });

  it("the module-scope boot assertion ran on import (default env is aligned)", () => {
    // Reaching this line at all proves the module-level call did not throw for
    // the default 24h config — i.e. the assertion is wired, not just exported.
    expect(AUTO_COMPLETE_DELAY_HOURS).toBe(24);
  });
});
