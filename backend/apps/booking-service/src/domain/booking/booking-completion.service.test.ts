// booking-completion.service.test.ts
//
// Mocked-repo unit tests (no live DB, no live HTTP) — mirrors
// booking-auth.service.test.ts / booking-reaper.service.test.ts's shape.
// Verifies BookingCompletionService.onCompleted resolves the right
// PaymentIntent id (or none) per payment_mode and forwards the booking's
// snapshotted commission fields verbatim to BookingPaymentClient.complete.
import { describe, expect, it, mock } from "bun:test";
import { CommissionType, ServicePaymentMode } from "@materialhub/database";
import {
  BookingCompletionService,
  BookingCompletionUnpaidError,
} from "./booking-completion.service.ts";

function makePaymentRepo(paymentsById: Record<string, { gateway_payment_id: string | null }>) {
  return {
    findOne: mock(async ({ where }: any) => paymentsById[where.id] ?? null),
  };
}

// Fix 4 (defense-in-depth): a mock that also asserts the caller scoped the
// lookup by booking_id, not just the escrow_hold_id — a real repo would
// simply return no row for a mismatched booking_id; this fake fails loudly
// instead so the test catches a regression to the old `{ id }`-only lookup.
function makeScopedPaymentRepo(
  paymentsById: Record<string, { gateway_payment_id: string | null; booking_id: string }>,
) {
  return {
    findOne: mock(async ({ where }: any) => {
      const row = paymentsById[where.id];
      if (!row) return null;
      if (row.booking_id !== where.booking_id) return null;
      return row;
    }),
  };
}

function makeClient() {
  return {
    complete: mock(async (_input: any) => ({
      captured: true,
      paymentIntentId: "pi_test",
      paymentStatus: "succeeded",
      commissionId: "cm-1",
      commissionCreated: true,
    })),
  };
}

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    vendor_id: "vendor-1",
    customer_user_id: "customer-1",
    booking_number: "BK-100",
    service_name: "Deep Tissue Massage",
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
    payment_mode: ServicePaymentMode.pay_at_venue,
    payment_id: null,
    escrow_hold_id: null,
    commission_rate: 10,
    commission_fils: 950,
    commission_type: CommissionType.percentage,
    price_fils: 10000,
    vat_fils: 476,
    ...overrides,
  } as any;
}

function fakeNotificationQueue() {
  return { add: mock(async (_name: string, _data: unknown) => ({ id: "notif-job-1" })) };
}

describe("BookingCompletionService.onCompleted", () => {
  it("prepay: resolves escrow_hold_id -> Payment row -> gateway_payment_id and passes it as the PaymentIntent to capture", async () => {
    const paymentRepo = makePaymentRepo({
      "pay-auth-1": { gateway_payment_id: "pi_captureme" },
    });
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: "pay-auth-1",
    });
    await service.onCompleted(booking);

    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking-1",
        paymentIntentId: "pi_captureme",
        vendorId: "vendor-1",
        commissionRate: 10,
        commissionFils: 950,
        commissionType: CommissionType.percentage,
        priceFils: 10000,
        vatFils: 476,
      }),
    );
  });

  // PHASE 7 REVIEW FIX #4 — BEHAVIOUR CHANGE. This case previously asserted
  // that a prepay booking with no authorization "completes with paymentIntentId
  // null — commission still requested". VERIFIED against order-service's
  // /internal/booking-payments/complete: a null payment_intent_id skips the
  // Stripe capture but STILL runs commissionService.createForBookingInTx, so
  // that old behaviour credited the vendor a commission/payout accrual for a
  // booking on which ZERO was ever collected. Reachable on the mainline: a
  // prepay booking whose auth job died (the booking-auth queue had attempts: 1
  // before fix #3) auto-completes at ends_at+24h with nothing authorized.
  it("prepay with no escrow_hold_id (auth never fired): THROWS instead of accruing commission for uncollected money", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: null,
    });

    await expect(service.onCompleted(booking)).rejects.toThrow(BookingCompletionUnpaidError);
    // The vendor is NOT credited.
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("the unpaid-completion error carries a greppable code and the booking id for reconciliation", async () => {
    const service = new BookingCompletionService(makePaymentRepo({}) as any, makeClient() as any);
    const booking = baseBooking({
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: null,
    });

    const err = await service.onCompleted(booking).catch((e) => e);

    expect(err).toBeInstanceOf(BookingCompletionUnpaidError);
    expect(err.code).toBe("booking_completion_no_captured_payment");
    expect(err.bookingId).toBe("booking-1");
    expect(err.message).toContain("reconciliation");
  });

  it("prepay WITH a capturable authorization still completes normally (the fix is scoped to the unpaid case)", async () => {
    const paymentRepo = makePaymentRepo({ "pay-auth-9": { gateway_payment_id: "pi_ok" } });
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    await service.onCompleted(
      baseBooking({ payment_mode: ServicePaymentMode.prepay, escrow_hold_id: "pay-auth-9" }),
    );

    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_ok" }),
    );
  });

  it("deposit: never resolves a PaymentIntent (already captured at booking time) — paymentIntentId is null", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({ payment_mode: ServicePaymentMode.deposit });
    await service.onCompleted(booking);

    expect(paymentRepo.findOne).not.toHaveBeenCalled();
    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: null }),
    );
  });

  it("pay_at_venue: never resolves a PaymentIntent — paymentIntentId is null, commission still accrues", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({ payment_mode: ServicePaymentMode.pay_at_venue });
    await service.onCompleted(booking);

    expect(paymentRepo.findOne).not.toHaveBeenCalled();
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: null, commissionFils: 950 }),
    );
  });

  // ── Final review Fix 4: booking_id-scoped escrow Payment lookup ─────────
  it("prepay: scopes the escrow_hold_id Payment lookup by booking_id too — a payment row with a mismatched booking_id is treated as not found", async () => {
    const paymentRepo = makeScopedPaymentRepo({
      "pay-auth-1": { gateway_payment_id: "pi_captureme", booking_id: "some-other-booking" },
    });
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({
      id: "booking-1",
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: "pay-auth-1",
    });
    // PHASE 7 REVIEW FIX #4: a mismatched booking_id means the authorization
    // is unresolvable, so there is nothing to capture — which must now throw
    // rather than fall through to a commission accrual with a null PI.
    await expect(service.onCompleted(booking)).rejects.toThrow(BookingCompletionUnpaidError);

    // findOne was still called scoped to THIS booking's id, not just the raw
    // escrow_hold_id.
    expect(paymentRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "pay-auth-1", booking_id: "booking-1" }),
      }),
    );
    expect(client.complete).not.toHaveBeenCalled();
  });

  it("prepay: matching booking_id still resolves the PaymentIntent normally", async () => {
    const paymentRepo = makeScopedPaymentRepo({
      "pay-auth-2": { gateway_payment_id: "pi_captureme2", booking_id: "booking-2" },
    });
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({
      id: "booking-2",
      payment_mode: ServicePaymentMode.prepay,
      escrow_hold_id: "pay-auth-2",
    });
    await service.onCompleted(booking);

    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_captureme2" }),
    );
  });

  // ── Review Fix 2: commission_type threading ─────────────────────────────
  it("FIXED-rate vendor: threads the booking's snapshotted commission_type ('fixed') through to the client instead of always 'percentage'", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    const booking = baseBooking({
      payment_mode: ServicePaymentMode.pay_at_venue,
      commission_type: CommissionType.fixed,
      commission_rate: 500, // a fils CAP, not a percent
      commission_fils: 500,
    });
    await service.onCompleted(booking);

    expect(client.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        commissionType: CommissionType.fixed,
        commissionRate: 500,
        commissionFils: 500,
      }),
    );
  });
});

// ── Phase 5 Task 8: booking_completed + booking_review_request notifications ──
describe("BookingCompletionService.onCompleted — notifications", () => {
  it("emits booking_completed AND booking_review_request to the customer after a successful capture/commission call", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const notificationQueue = fakeNotificationQueue();
    const service = new BookingCompletionService(
      paymentRepo as any,
      client as any,
      notificationQueue as any,
    );

    const booking = baseBooking();
    await service.onCompleted(booking);

    const types = notificationQueue.add.mock.calls.map((c: any) => c[1].notificationType);
    expect(types).toContain("booking_completed");
    expect(types).toContain("booking_review_request");
    for (const call of notificationQueue.add.mock.calls as any[]) {
      expect(call[1].userId).toBe("customer-1");
      expect(call[1].variables.booking_number).toBe("BK-100");
      expect(call[1].data.bookingId).toBe("booking-1");
    }
  });

  it("no notificationQueue wired: onCompleted still succeeds (existing 2-arg construction keeps working)", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const service = new BookingCompletionService(paymentRepo as any, client as any);

    await expect(service.onCompleted(baseBooking())).resolves.toBeUndefined();
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  // ── Fix 3: notifications only on the WINNING (first) completion ──────────
  it("firstCompletion:false (retry / lost race): re-runs capture/commission but emits ZERO notifications", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const notificationQueue = fakeNotificationQueue();
    const service = new BookingCompletionService(
      paymentRepo as any,
      client as any,
      notificationQueue as any,
    );

    await service.onCompleted(baseBooking(), { firstCompletion: false });

    // Capture/commission still attempted (idempotent server-side)...
    expect(client.complete).toHaveBeenCalledTimes(1);
    // ...but no duplicate completion notifications on a retry/lost-race re-fire.
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("firstCompletion:true (winning transition, explicit): emits both notifications exactly once", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const notificationQueue = fakeNotificationQueue();
    const service = new BookingCompletionService(
      paymentRepo as any,
      client as any,
      notificationQueue as any,
    );

    await service.onCompleted(baseBooking(), { firstCompletion: true });

    const types = notificationQueue.add.mock.calls.map((c: any) => c[1].notificationType);
    expect(types).toEqual(["booking_completed", "booking_review_request"]);
  });

  // ── C1 (Task 0B review): manual walk-in/phone booking → capacity-only ──────
  it("manual walk-in (customer_user_id null): completes capacity-only — NO capture/commission call, NO notifications", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const notificationQueue = fakeNotificationQueue();
    const service = new BookingCompletionService(
      paymentRepo as any,
      client as any,
      notificationQueue as any,
    );

    const booking = baseBooking({
      customer_user_id: null,
      payment_mode: ServicePaymentMode.pay_at_venue,
      commission_fils: 0,
      escrow_hold_id: null,
    });
    await expect(service.onCompleted(booking)).resolves.toBeUndefined();

    // No money moved for money MaterialHub never collected, and no PI lookup.
    expect(client.complete).not.toHaveBeenCalled();
    expect(paymentRepo.findOne).not.toHaveBeenCalled();
    // No customer-facing completion/review notifications (userId would be null).
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("a notification-emit failure does not throw out of onCompleted (best-effort, capture/commission already committed)", async () => {
    const paymentRepo = makePaymentRepo({});
    const client = makeClient();
    const notificationQueue = {
      add: mock(async () => {
        throw new Error("redis down");
      }),
    };
    const service = new BookingCompletionService(
      paymentRepo as any,
      client as any,
      notificationQueue as any,
    );

    await expect(service.onCompleted(baseBooking())).resolves.toBeUndefined();
  });
});
