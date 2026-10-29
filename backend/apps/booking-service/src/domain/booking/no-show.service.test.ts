// no-show.service.test.ts
//
// Mocked-repo unit tests (no live DB / order-service) for the no-show
// orchestration + money branching: the actor gate (no customer), the
// confirmed-only guard, the [starts_at, ends_at+grace) window rule, the
// pure-policy forfeit decision per payment_mode (partial-capture / void / keep-
// deposit / refund-remainder / none), best-effort failure isolation, the audit
// reason, and the booking_no_show notification (penalty breakdown + dispute
// link). Real slot/job/DB behaviour is covered by the live-DB integration suite.
import { describe, expect, it, mock } from "bun:test";
import { BookingStatus, CancellationRefundPolicy, NotificationType } from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { InvalidBookingTransitionError } from "./booking-status.service.ts";
import { NoShowService, NoShowWindowError } from "./no-show.service.ts";

const HOUR_MS = 3_600_000;
const NOW = new Date("2026-08-01T12:00:00Z");
const GRACE_HOURS = 24;
const APP_URL = "https://materialhubuae.com";

// In-window "now": booking started 1h ago, ended 30m ago; auto-complete moment
// is ends_at + 24h = NOW + 23.5h — so NOW is comfortably inside the window.
const STARTED_AT = new Date(NOW.getTime() - 1 * HOUR_MS);
const ENDED_AT = new Date(NOW.getTime() - 0.5 * HOUR_MS);

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    booking_number: "BK-001",
    customer_user_id: "customer-1",
    vendor_id: "vendor-1",
    service_name: "Deep Tissue Massage",
    starts_at: STARTED_AT,
    ends_at: ENDED_AT,
    status: BookingStatus.confirmed,
    payment_mode: "pay_at_venue",
    price_fils: 20_000,
    amount_paid_fils: 0,
    deposit_fils: 0,
    escrow_hold_id: null,
    cancellation_window_hours: 24,
    cancellation_refund_policy: CancellationRefundPolicy.full,
    cancellation_penalty_percent: 100,
    ...overrides,
  };
}

function makeService(
  opts: {
    booking?: Record<string, any> | null;
    paymentRow?: { gateway_payment_id?: string | null } | null;
    voidImpl?: any;
    captureImpl?: any;
    refundImpl?: any;
  } = {},
) {
  const booking = opts.booking === undefined ? baseBooking() : opts.booking;

  const bookingRepo = { findOne: mock(async () => (booking ? { ...booking } : null)) };
  const paymentRepo = {
    findOne: mock(async () =>
      opts.paymentRow === undefined ? { gateway_payment_id: "pi_auth_1" } : opts.paymentRow,
    ),
  };

  const transition = mock(async (_id: string, to: any, _actor: any, reason?: string) => ({
    ...(booking as Record<string, any>),
    status: to,
    _reason: reason,
  }));
  const statusService = { transition };

  const paymentClient = {
    void: opts.voidImpl ?? mock(async () => ({ paymentIntentId: "pi_auth_1", status: "canceled" })),
    capture:
      opts.captureImpl ?? mock(async () => ({ paymentIntentId: "pi_auth_1", status: "succeeded" })),
    refund:
      opts.refundImpl ??
      mock(async () => ({ gateway: "stripe", gatewayRefundId: "re_1", amountFils: 0 })),
  };

  const notificationQueue = { add: mock(async () => ({ id: "job-1" })) };

  const service = new NoShowService(
    bookingRepo as any,
    paymentRepo as any,
    statusService as any,
    paymentClient as any,
    notificationQueue as any,
    GRACE_HOURS,
    APP_URL,
  );

  return { service, bookingRepo, paymentRepo, transition, paymentClient, notificationQueue };
}

const VENDOR = { id: "vendor-user-1", role: "vendor" as const };
const ADMIN = { id: "admin-1", role: "admin" as const };
const CUSTOMER = { id: "customer-1", role: "customer" as const };

describe("NoShowService.markNoShow — guards", () => {
  it("customer actor -> ForbiddenError (403), no load/transition", async () => {
    const { service, bookingRepo, transition } = makeService();
    let threw: unknown;
    try {
      await service.markNoShow("booking-1", CUSTOMER, { now: NOW });
    } catch (err) {
      threw = err;
    }
    expect((threw as HttpError).statusCode).toBe(403);
    expect(bookingRepo.findOne).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("404 when the booking does not exist", async () => {
    const { service } = makeService({ booking: null });
    let threw: unknown;
    try {
      await service.markNoShow("missing", ADMIN, { now: NOW });
    } catch (err) {
      threw = err;
    }
    expect((threw as Error).message).toBe("Booking not found");
    expect((threw as HttpError).statusCode).toBe(404);
  });

  it("loads by id ONLY (no customer-ownership scoping — caller is staff)", async () => {
    const { service, bookingRepo } = makeService();
    await service.markNoShow("booking-1", VENDOR, { now: NOW }).catch(() => undefined);
    const where = ((bookingRepo.findOne.mock.calls as any[])[0][0] as any).where;
    expect(where.id).toBe("booking-1");
    expect(where.customer_user_id).toBeUndefined();
  });

  it("non-confirmed booking -> InvalidBookingTransitionError (422), no transition/money", async () => {
    for (const status of [
      BookingStatus.pending_payment,
      BookingStatus.completed,
      BookingStatus.cancelled,
      BookingStatus.no_show,
      BookingStatus.expired,
    ]) {
      const { service, transition, paymentClient } = makeService({
        booking: baseBooking({ status }),
      });
      let threw: unknown;
      try {
        await service.markNoShow("booking-1", ADMIN, { now: NOW });
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(InvalidBookingTransitionError);
      expect((threw as HttpError).statusCode).toBe(422);
      expect(transition).not.toHaveBeenCalled();
      expect(paymentClient.void).not.toHaveBeenCalled();
    }
  });
});

describe("NoShowService.markNoShow — window rule", () => {
  it("before starts_at -> NoShowWindowError (422), no transition", async () => {
    const future = new Date(NOW.getTime() + 2 * HOUR_MS);
    const { service, transition } = makeService({
      booking: baseBooking({ starts_at: future, ends_at: new Date(future.getTime() + HOUR_MS) }),
    });
    let threw: unknown;
    try {
      await service.markNoShow("booking-1", ADMIN, { now: NOW });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(NoShowWindowError);
    expect((threw as HttpError).statusCode).toBe(422);
    expect((threw as HttpError).code).toBe("no_show_window");
    expect(transition).not.toHaveBeenCalled();
  });

  it("at/after the auto-complete moment (ends_at + grace) -> NoShowWindowError (422)", async () => {
    // ended 25h ago, grace 24h -> auto-complete moment was 1h ago -> too late.
    const endedLongAgo = new Date(NOW.getTime() - 25 * HOUR_MS);
    const { service, transition } = makeService({
      booking: baseBooking({
        starts_at: new Date(endedLongAgo.getTime() - HOUR_MS),
        ends_at: endedLongAgo,
      }),
    });
    let threw: unknown;
    try {
      await service.markNoShow("booking-1", ADMIN, { now: NOW });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(NoShowWindowError);
    expect((threw as HttpError).statusCode).toBe(422);
    expect(transition).not.toHaveBeenCalled();
  });

  it("inside [starts_at, ends_at+grace) -> transitions to no_show", async () => {
    const { service, transition } = makeService();
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.booking.status).toBe(BookingStatus.no_show);
    expect((transition.mock.calls[0] as any[])[1]).toBe(BookingStatus.no_show);
  });
});

describe("NoShowService.markNoShow — money matrix", () => {
  it("pay_at_venue -> action none, no gateway calls", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({ payment_mode: "pay_at_venue" }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("none");
    expect(res.forfeitFils).toBe(0);
    expect(res.refundFils).toBe(0);
    expect(paymentClient.void).not.toHaveBeenCalled();
    expect(paymentClient.capture).not.toHaveBeenCalled();
    expect(paymentClient.refund).not.toHaveBeenCalled();
  });

  it("prepay authorized, percent 30% -> partial-capture the forfeit (remainder auto-releases)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        price_fils: 20_000,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 30,
      }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("partial_capture");
    expect(res.forfeitFils).toBe(6_000); // 30% of 20_000
    expect(res.refundFils).toBe(14_000);
    expect(paymentClient.capture).toHaveBeenCalledTimes(1);
    const captureArg = (paymentClient.capture.mock.calls[0] as any[])[0];
    expect(captureArg.amountFils).toBe(6_000);
    expect(captureArg.paymentIntentId).toBe("pi_auth_1");
    expect(paymentClient.void).not.toHaveBeenCalled();
  });

  it("prepay authorized, full policy -> VOID the authorization (no penalty)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        cancellation_refund_policy: CancellationRefundPolicy.full,
      }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("void");
    expect(res.forfeitFils).toBe(0);
    expect(paymentClient.void).toHaveBeenCalledTimes(1);
    expect(paymentClient.capture).not.toHaveBeenCalled();
  });

  it("prepay NOT authorized -> action none (SetupIntent holds no money)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({ payment_mode: "prepay", escrow_hold_id: null }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("none");
    expect(paymentClient.void).not.toHaveBeenCalled();
    expect(paymentClient.capture).not.toHaveBeenCalled();
  });

  it("deposit, deposit_forfeit -> KEEP the whole deposit, action none, no refund", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        cancellation_refund_policy: CancellationRefundPolicy.deposit_forfeit,
      }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("none");
    expect(res.forfeitFils).toBe(5_000);
    expect(res.refundFils).toBe(0);
    expect(paymentClient.refund).not.toHaveBeenCalled();
  });

  it("deposit, percent 40% -> keep the penalty, refund the remainder (no_show_reversal)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 40,
      }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("refund");
    expect(res.forfeitFils).toBe(2_000); // 40% of 5_000
    expect(res.refundFils).toBe(3_000);
    expect(paymentClient.refund).toHaveBeenCalledTimes(1);
    const refundArg = (paymentClient.refund.mock.calls[0] as any[])[0];
    expect(refundArg.amountFils).toBe(3_000);
    expect(refundArg.referenceType).toBe("no_show_reversal");
  });

  it("deposit, full policy -> refund the whole deposit (no penalty)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        cancellation_refund_policy: CancellationRefundPolicy.full,
      }),
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("refund");
    expect(res.forfeitFils).toBe(0);
    expect(res.refundFils).toBe(5_000);
    expect((paymentClient.refund.mock.calls[0] as any[])[0].amountFils).toBe(5_000);
  });
});

describe("NoShowService.markNoShow — audit + notification + resilience", () => {
  it("records forfeit/refund/action/policy in the transition reason", async () => {
    const { service, transition } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 40,
      }),
    });
    await service.markNoShow("booking-1", ADMIN, { now: NOW, reason: "customer never arrived" });
    const reason = (transition.mock.calls[0] as any[])[3] as string;
    expect(reason).toContain("Marked no-show by admin");
    expect(reason).toContain("forfeit=2000 fils");
    expect(reason).toContain("refund=3000 fils");
    expect(reason).toContain("action=refund");
    expect(reason).toContain("policy=percent");
    expect(reason).toContain("customer never arrived");
  });

  it("emits booking_no_show to the customer with the penalty breakdown + dispute link", async () => {
    const { service, notificationQueue } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 40,
      }),
    });
    await service.markNoShow("booking-1", ADMIN, { now: NOW });
    const evt = (notificationQueue.add.mock.calls as any[])[0][1];
    expect(evt.userId).toBe("customer-1");
    expect(evt.notificationType).toBe(NotificationType.booking_no_show);
    // Penalty breakdown.
    expect(evt.variables.forfeit_fils).toBe("2000");
    expect(evt.variables.refund_fils).toBe("3000");
    expect(evt.variables.policy).toBe("percent");
    expect(evt.data.penalty).toEqual({
      policy: "percent",
      forfeitFils: 2_000,
      refundFils: 3_000,
      action: "refund",
    });
    // Dispute/support deep link.
    expect(evt.data.disputeUrl).toBe("https://materialhubuae.com/support/bookings/booking-1");
    expect(evt.variables.dispute_url).toBe("https://materialhubuae.com/support/bookings/booking-1");
  });

  it("a best-effort gateway failure does NOT fail the no-show (booking stays no_show)", async () => {
    const captureImpl = mock(async () => {
      throw new Error("order-service unreachable");
    });
    const { service } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 30,
      }),
      captureImpl,
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.booking.status).toBe(BookingStatus.no_show);
    expect(captureImpl).toHaveBeenCalledTimes(1);
  });

  it("prepay authorized but Payment row has no gateway_payment_id -> skips capture gracefully", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 30,
      }),
      paymentRow: { gateway_payment_id: null },
    });
    const res = await service.markNoShow("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("partial_capture");
    expect(paymentClient.capture).not.toHaveBeenCalled();
    expect(res.booking.status).toBe(BookingStatus.no_show);
  });
});
