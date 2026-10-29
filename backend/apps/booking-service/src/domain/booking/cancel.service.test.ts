// cancel.service.test.ts
//
// Mocked-repo unit tests (no live DB / order-service) for the cancel
// orchestration + money branching: ownership scoping, the confirmed-only
// guard, the pure-policy refund/forfeit decision per payment_mode ×
// in/out-window × actor, the concrete gateway action (void / partial-capture /
// refund / none), best-effort failure isolation, the audit-reason contents, and
// notification emission. The real slot-free / job-cleanup / DB transitions are
// covered by the live-DB integration suite.
import { describe, expect, it, mock } from "bun:test";
import { BookingStatus, CancellationRefundPolicy, NotificationType } from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { InvalidBookingTransitionError } from "./booking-status.service.ts";
import { CancelService } from "./cancel.service.ts";

const HOUR_MS = 3_600_000;
const NOW = new Date("2026-08-01T00:00:00Z");
const IN_WINDOW_START = new Date(NOW.getTime() + 100 * HOUR_MS); // >> 24h window
const OUT_OF_WINDOW_START = new Date(NOW.getTime() + 5 * HOUR_MS); // < 24h window

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    booking_number: "BK-001",
    customer_user_id: "customer-1",
    vendor_id: "vendor-1",
    service_name: "Deep Tissue Massage",
    starts_at: IN_WINDOW_START,
    ends_at: new Date(IN_WINDOW_START.getTime() + 30 * 60_000),
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
    vendorUserId?: string | null;
  } = {},
) {
  const booking = opts.booking === undefined ? baseBooking() : opts.booking;

  const bookingRepo = {
    findOne: mock(async () => (booking ? { ...booking } : null)),
  };
  const paymentRepo = {
    findOne: mock(async () =>
      opts.paymentRow === undefined ? { gateway_payment_id: "pi_auth_1" } : opts.paymentRow,
    ),
  };

  // transition returns the cancelled booking (carrying the same fields so
  // emitNotifications has a full row to read).
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
  const vendorOwnerLookup = {
    findOwnerUserId: mock(async () =>
      opts.vendorUserId === undefined ? "vendor-owner-1" : opts.vendorUserId,
    ),
  };

  const service = new CancelService(
    bookingRepo as any,
    paymentRepo as any,
    statusService as any,
    paymentClient as any,
    notificationQueue as any,
    vendorOwnerLookup as any,
  );

  return {
    service,
    bookingRepo,
    paymentRepo,
    transition,
    paymentClient,
    notificationQueue,
    vendorOwnerLookup,
  };
}

const CUSTOMER = { id: "customer-1", role: "customer" as const };
const ADMIN = { id: "admin-1", role: "admin" as const };

describe("CancelService.cancel — guards", () => {
  it("404 when the booking does not exist / is not owned by the customer", async () => {
    const { service } = makeService({ booking: null });
    let threw: unknown;
    try {
      await service.cancel("missing", CUSTOMER, { now: NOW });
    } catch (err) {
      threw = err;
    }
    expect((threw as Error).message).toBe("Booking not found");
    expect((threw as HttpError).statusCode).toBe(404);
  });

  it("customer load is scoped by customer_user_id (ownership); admin load is by id only", async () => {
    const c = makeService();
    await c.service.cancel("booking-1", CUSTOMER, { now: NOW }).catch(() => undefined);
    const cWhere = ((c.bookingRepo.findOne.mock.calls as any[])[0][0] as any).where;
    expect(cWhere.id).toBe("booking-1");
    expect(cWhere.customer_user_id).toBe("customer-1");

    const a = makeService();
    await a.service.cancel("booking-1", ADMIN, { now: NOW }).catch(() => undefined);
    const aWhere = ((a.bookingRepo.findOne.mock.calls as any[])[0][0] as any).where;
    expect(aWhere.id).toBe("booking-1");
    expect(aWhere.customer_user_id).toBeUndefined();
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
        await service.cancel("booking-1", CUSTOMER, { now: NOW });
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(InvalidBookingTransitionError);
      expect((threw as HttpError).statusCode).toBe(422);
      expect(transition).not.toHaveBeenCalled();
      expect(paymentClient.void).not.toHaveBeenCalled();
      expect(paymentClient.refund).not.toHaveBeenCalled();
    }
  });
});

describe("CancelService.cancel — money matrix", () => {
  it("pay_at_venue -> action none, transitions to cancelled, no gateway calls", async () => {
    const { service, transition, paymentClient } = makeService({
      booking: baseBooking({ payment_mode: "pay_at_venue" }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.action).toBe("none");
    expect(res.refundFils).toBe(0);
    expect(res.forfeitFils).toBe(0);
    expect((transition.mock.calls[0] as any[])[1]).toBe(BookingStatus.cancelled);
    expect(paymentClient.void).not.toHaveBeenCalled();
    expect(paymentClient.capture).not.toHaveBeenCalled();
    expect(paymentClient.refund).not.toHaveBeenCalled();
  });

  it("prepay authorized in-window -> VOID the authorization (full release)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        starts_at: IN_WINDOW_START,
      }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.withinWindow).toBe(true);
    expect(res.action).toBe("void");
    expect(res.forfeitFils).toBe(0);
    expect(res.refundFils).toBe(20_000);
    expect(paymentClient.void).toHaveBeenCalledTimes(1);
    expect((paymentClient.void.mock.calls[0] as any[])[0].paymentIntentId).toBe("pi_auth_1");
    expect(paymentClient.capture).not.toHaveBeenCalled();
  });

  it("prepay NOT authorized -> action none, no void/capture (SetupIntent holds no money)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({ payment_mode: "prepay", escrow_hold_id: null }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.action).toBe("none");
    expect(paymentClient.void).not.toHaveBeenCalled();
    expect(paymentClient.capture).not.toHaveBeenCalled();
  });

  it("prepay authorized out-of-window (percent 30%) -> partial-capture the forfeit", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        price_fils: 20_000,
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 30,
      }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.withinWindow).toBe(false);
    expect(res.action).toBe("partial_capture");
    expect(res.forfeitFils).toBe(6_000); // 30% of 20_000
    expect(res.refundFils).toBe(14_000);
    expect(paymentClient.capture).toHaveBeenCalledTimes(1);
    const captureArg = (paymentClient.capture.mock.calls[0] as any[])[0];
    expect(captureArg.amountFils).toBe(6_000);
    expect(captureArg.paymentIntentId).toBe("pi_auth_1");
    expect(paymentClient.void).not.toHaveBeenCalled();
  });

  it("prepay authorized out-of-window (full policy) -> VOID (nothing forfeited)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.full,
      }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.withinWindow).toBe(false);
    expect(res.forfeitFils).toBe(0);
    expect(res.action).toBe("void");
    expect(paymentClient.void).toHaveBeenCalledTimes(1);
  });

  it("deposit in-window -> refund the full deposit", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        starts_at: IN_WINDOW_START,
      }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.withinWindow).toBe(true);
    expect(res.action).toBe("refund");
    expect(res.refundFils).toBe(5_000);
    expect(res.forfeitFils).toBe(0);
    expect(paymentClient.refund).toHaveBeenCalledTimes(1);
    const refundArg = (paymentClient.refund.mock.calls[0] as any[])[0];
    expect(refundArg.amountFils).toBe(5_000);
    expect(refundArg.referenceType).toBe("cancellation");
  });

  it("deposit out-of-window (deposit_forfeit) -> keep deposit, NO refund", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.deposit_forfeit,
      }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.withinWindow).toBe(false);
    expect(res.action).toBe("none");
    expect(res.forfeitFils).toBe(5_000);
    expect(res.refundFils).toBe(0);
    expect(paymentClient.refund).not.toHaveBeenCalled();
  });

  it("deposit out-of-window (percent 40%) -> refund the remainder", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 40,
      }),
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.forfeitFils).toBe(2_000); // 40% of 5_000
    expect(res.refundFils).toBe(3_000);
    expect(res.action).toBe("refund");
    expect((paymentClient.refund.mock.calls[0] as any[])[0].amountFils).toBe(3_000);
  });

  it("admin BYPASSES the window: deposit out-of-window still refunds in FULL", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.deposit_forfeit,
      }),
    });
    const res = await service.cancel("booking-1", ADMIN, { now: NOW });
    expect(res.withinWindow).toBe(true); // bypassed
    expect(res.forfeitFils).toBe(0);
    expect(res.refundFils).toBe(5_000);
    expect(res.action).toBe("refund");
    expect((paymentClient.refund.mock.calls[0] as any[])[0].amountFils).toBe(5_000);
  });

  it("admin BYPASSES the window: prepay authorized out-of-window still VOIDS (no capture)", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 50,
      }),
    });
    const res = await service.cancel("booking-1", ADMIN, { now: NOW });
    expect(res.action).toBe("void");
    expect(res.forfeitFils).toBe(0);
    expect(paymentClient.void).toHaveBeenCalledTimes(1);
    expect(paymentClient.capture).not.toHaveBeenCalled();
  });
});

describe("CancelService.cancel — audit + notifications + resilience", () => {
  it("records refund/forfeit + action in the transition reason", async () => {
    const { service, transition } = makeService({
      booking: baseBooking({
        payment_mode: "deposit",
        deposit_fils: 5_000,
        starts_at: OUT_OF_WINDOW_START,
        cancellation_refund_policy: CancellationRefundPolicy.percent,
        cancellation_penalty_percent: 40,
      }),
    });
    await service.cancel("booking-1", CUSTOMER, { now: NOW, reason: "changed my mind" });
    const reason = (transition.mock.calls[0] as any[])[3] as string;
    expect(reason).toContain("refund=3000 fils");
    expect(reason).toContain("forfeit=2000 fils");
    expect(reason).toContain("action=refund");
    expect(reason).toContain("out-of-window");
    expect(reason).toContain("changed my mind");
  });

  it("emits booking_cancelled to the customer and vendor_booking_cancelled to the vendor owner", async () => {
    const { service, notificationQueue } = makeService();
    await service.cancel("booking-1", CUSTOMER, { now: NOW });
    const calls = notificationQueue.add.mock.calls as any[];
    const customerEvt = calls.find((c) => c[1].userId === "customer-1");
    const vendorEvt = calls.find((c) => c[1].userId === "vendor-owner-1");
    expect(customerEvt[1].notificationType).toBe(NotificationType.booking_cancelled);
    expect(vendorEvt[1].notificationType).toBe(NotificationType.vendor_booking_cancelled);
  });

  // Task 8 fix: `action` must be present (and correct) on BOTH the customer
  // and vendor payloads so the notification template can distinguish
  // "authorization hold released" (void — never charged) from "money
  // refunded" (refund) instead of always saying "refunded".
  it("emits the money `action` (void/partial_capture/refund/none) on both variables and data for both audiences", async () => {
    const { service, notificationQueue } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        starts_at: IN_WINDOW_START, // in-window -> void (full release, no forfeit)
      }),
    });
    await service.cancel("booking-1", CUSTOMER, { now: NOW });
    const calls = notificationQueue.add.mock.calls as any[];
    for (const c of calls) {
      expect(c[1].variables.action).toBe("void");
      expect(c[1].data.action).toBe("void");
    }
  });

  it("a best-effort gateway failure does NOT fail the cancel (booking stays cancelled)", async () => {
    const voidImpl = mock(async () => {
      throw new Error("order-service unreachable");
    });
    const { service } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        starts_at: IN_WINDOW_START,
      }),
      voidImpl,
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.booking.status).toBe(BookingStatus.cancelled);
    expect(voidImpl).toHaveBeenCalledTimes(1);
  });

  it("prepay authorized but Payment row has no gateway_payment_id -> skips the void gracefully", async () => {
    const { service, paymentClient } = makeService({
      booking: baseBooking({
        payment_mode: "prepay",
        escrow_hold_id: "pay-row-1",
        starts_at: IN_WINDOW_START,
      }),
      paymentRow: { gateway_payment_id: null },
    });
    const res = await service.cancel("booking-1", CUSTOMER, { now: NOW });
    expect(res.action).toBe("void");
    expect(paymentClient.void).not.toHaveBeenCalled();
    expect(res.booking.status).toBe(BookingStatus.cancelled);
  });
});
