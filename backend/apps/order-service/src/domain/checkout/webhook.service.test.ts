// webhook.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import jwt from "jsonwebtoken";
import { WebhookService } from "./webhook.service.ts";

describe("WebhookService", () => {
  const mockWebhookRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    save: mock((w: any) => Promise.resolve({ id: "wh1", ...w })),
  };
  const mockOrderRepo = {
    findOne: mock(
      (_args?: any): Promise<any> => Promise.resolve({ id: "o1", status: "pending_payment" }),
    ),
    save: mock((o: any) => Promise.resolve(o)),
  };
  const mockPaymentRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve({ id: "pay-1", order_id: "o1" })),
    save: mock((p: any) => Promise.resolve(p)),
  };
  const mockOrderConfirmation = {
    markOrderPaid: mock(() => Promise.resolve({ confirmed: true })),
  };
  const mockOrderStatusService = {
    cancelOrder: mock(() => Promise.resolve({ id: "o1" })),
  };
  const mockBookingLifecycleClient = {
    confirm: mock((_id: string) => Promise.resolve({ id: "b1", status: "confirmed" })),
    paymentFailed: mock((_id: string, _reason?: string | null) =>
      Promise.resolve({ id: "b1", status: "pending_payment" }),
    ),
  };
  const mockTamaraFetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify({ status: "authorised" }), { status: 200 })),
  );

  let service: WebhookService;

  beforeEach(() => {
    for (const repo of [
      mockWebhookRepo,
      mockOrderRepo,
      mockPaymentRepo,
      mockOrderConfirmation,
      mockOrderStatusService,
      mockBookingLifecycleClient,
    ]) {
      Object.values(repo).forEach((m) => m.mockClear());
    }
    mockTamaraFetch.mockClear();
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
      undefined,
      mockBookingLifecycleClient as any,
    );
  });

  it("skips already-processed webhooks (idempotent)", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce({ id: "wh1", status: "processed" });
    const result = await service.handleStripeWebhook("evt_1", "payment_intent.succeeded", {});
    expect(result.skipped).toBe(true);
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });

  it("processes payment_intent.succeeded by delegating to OrderConfirmationService", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null); // not processed yet
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1" });

    const payload = {
      id: "pi_test",
      metadata: { order_id: "o1" },
    };
    const result = await service.handleStripeWebhook("evt_1", "payment_intent.succeeded", payload);

    expect(result.skipped).toBe(false);
    expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledWith("o1");
    expect(mockWebhookRepo.save).toHaveBeenCalledTimes(2); // create + update status
  });

  it("updates Stripe-specific payment row with captured_at on success", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1" });

    await service.handleStripeWebhook("evt_1", "payment_intent.succeeded", {
      id: "pi_test",
      metadata: { order_id: "o1" },
    });

    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "captured" }),
    );
  });

  // ─── Phase 4 Task 3: booking_id routing ────────────────────────────────
  // Booking-tagged Stripe events flow through the SAME handleStripeWebhook
  // entry point (and its webhook_events idempotency dedup) as order events
  // — the fixtures above already prove dedup works generically; these
  // confirm the branch that routes on metadata.booking_id instead of
  // metadata.order_id, and that order events never touch the booking client.

  it("payment_intent.succeeded with booking_id (deposit): captures the payment row and confirms the booking, NOT the order path", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-2", booking_id: "b1" });

    const result = await service.handleStripeWebhook("evt_b1", "payment_intent.succeeded", {
      id: "pi_booking_deposit",
      metadata: { booking_id: "b1" },
    });

    expect(result.skipped).toBe(false);
    expect(mockBookingLifecycleClient.confirm).toHaveBeenCalledWith("b1");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "captured" }),
    );
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });

  it("setup_intent.succeeded with booking_id (prepay): marks the payment row authorized and confirms the booking", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-3", booking_id: "b2" });

    const result = await service.handleStripeWebhook("evt_b2", "setup_intent.succeeded", {
      id: "seti_booking_prepay",
      metadata: { booking_id: "b2" },
    });

    expect(result.skipped).toBe(false);
    expect(mockBookingLifecycleClient.confirm).toHaveBeenCalledWith("b2");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "authorized" }),
    );
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });

  it("payment_intent.payment_failed with booking_id: marks the payment row failed and calls booking-service payment-failed, NOT order cancel", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-4", booking_id: "b3" });

    const result = await service.handleStripeWebhook("evt_b3", "payment_intent.payment_failed", {
      id: "pi_booking_failed",
      metadata: { booking_id: "b3" },
      last_payment_error: { message: "Your card was declined." },
    });

    expect(result.skipped).toBe(false);
    expect(mockBookingLifecycleClient.paymentFailed).toHaveBeenCalledWith(
      "b3",
      "Your card was declined.",
    );
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", failure_reason: "Your card was declined." }),
    );
    expect(mockOrderStatusService.cancelOrder).not.toHaveBeenCalled();
  });

  it("payment_intent.canceled with booking_id: marks the payment row cancelled and calls booking-service payment-failed", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-5", booking_id: "b4" });

    const result = await service.handleStripeWebhook("evt_b4", "payment_intent.canceled", {
      id: "pi_booking_void",
      metadata: { booking_id: "b4" },
    });

    expect(result.skipped).toBe(false);
    expect(mockBookingLifecycleClient.paymentFailed).toHaveBeenCalledWith("b4", "Payment canceled");
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  // ── FINAL REVIEW FIX 2 regression tests ─────────────────────────────────
  // Defense-in-depth for BookingStatusService.confirm()'s idempotency fix:
  // a booking-lifecycle 4xx can never be fixed by Stripe redelivering the
  // SAME event, so it must be swallowed as non-retryable ("processed", 2xx
  // to Stripe) instead of marking the webhook_events row `failed` (which
  // would 4xx/5xx Stripe into retrying forever). A genuine 5xx (transient —
  // booking-service down) must still be retried.
  it("booking-lifecycle confirm() 4xx (e.g. booking already completed, mirrors BookingStatusService.confirm's no-op-turned-422-if-unfixed case) is swallowed as non-retryable — event marked processed, NOT failed, no throw", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-6", booking_id: "b5" });
    const clientError = Object.assign(
      new Error("booking-service /internal/bookings/b5/confirm failed (422)"),
      { statusCode: 422 },
    );
    mockBookingLifecycleClient.confirm.mockRejectedValueOnce(clientError);

    const result = await service.handleStripeWebhook("evt_b5", "payment_intent.succeeded", {
      id: "pi_booking_completed_capture",
      metadata: { booking_id: "b5" },
    });

    expect(result.skipped).toBe(false);
    expect(mockBookingLifecycleClient.confirm).toHaveBeenCalledWith("b5");
    // The LAST webhookRepo.save call is the terminal status write — must be
    // "processed" (2xx to Stripe), never "failed" (which would retry).
    const lastSave = mockWebhookRepo.save.mock.calls.at(-1)?.[0];
    expect(lastSave.status).toBe("processed");
  });

  it("booking-lifecycle confirm() 5xx (booking-service down/transient) is STILL retryable — event marked failed, error rethrown", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-7", booking_id: "b6" });
    const clientError = Object.assign(
      new Error("booking-service unreachable calling /internal/bookings/b6/confirm: fetch failed"),
      { statusCode: 503 },
    );
    mockBookingLifecycleClient.confirm.mockRejectedValueOnce(clientError);

    await expect(
      service.handleStripeWebhook("evt_b6", "payment_intent.succeeded", {
        id: "pi_booking_service_down",
        metadata: { booking_id: "b6" },
      }),
    ).rejects.toThrow(
      "booking-service unreachable calling /internal/bookings/b6/confirm: fetch failed",
    );

    const lastSave = mockWebhookRepo.save.mock.calls.at(-1)?.[0];
    expect(lastSave.status).toBe("failed");
  });

  it("booking-lifecycle paymentFailed() 4xx is also swallowed as non-retryable (same handling as confirm())", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-8", booking_id: "b7" });
    const clientError = Object.assign(new Error("booking not found"), { statusCode: 404 });
    mockBookingLifecycleClient.paymentFailed.mockRejectedValueOnce(clientError);

    const result = await service.handleStripeWebhook("evt_b7", "payment_intent.payment_failed", {
      id: "pi_booking_unknown",
      metadata: { booking_id: "b7" },
      last_payment_error: { message: "Your card was declined." },
    });

    expect(result.skipped).toBe(false);
    const lastSave = mockWebhookRepo.save.mock.calls.at(-1)?.[0];
    expect(lastSave.status).toBe("processed");
  });

  it("order_id events are unaffected by the booking-lifecycle 4xx swallowing (order path never touches this logic)", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1" });
    mockOrderConfirmation.markOrderPaid.mockRejectedValueOnce(
      Object.assign(new Error("order confirmation failed"), { statusCode: 422 }),
    );

    await expect(
      service.handleStripeWebhook("evt_o3", "payment_intent.succeeded", {
        id: "pi_order_fail",
        metadata: { order_id: "o1" },
      }),
    ).rejects.toThrow("order confirmation failed");

    const lastSave = mockWebhookRepo.save.mock.calls.at(-1)?.[0];
    expect(lastSave.status).toBe("failed");
  });

  it("order_id events never call the booking-service client (order path fully unaffected)", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1" });

    await service.handleStripeWebhook("evt_o1", "payment_intent.succeeded", {
      id: "pi_order",
      metadata: { order_id: "o1" },
    });

    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    // Note: no mockPaymentRepo.findOne queue push here — processPaymentFailure's
    // order_id branch cancels the order directly and never looks up the
    // payment row, so queuing a value here would go unconsumed and leak into
    // a later test's paymentRepo.findOne call.

    await service.handleStripeWebhook("evt_o2", "payment_intent.payment_failed", {
      id: "pi_order_failed",
      metadata: { order_id: "o1" },
    });

    expect(mockBookingLifecycleClient.confirm).not.toHaveBeenCalled();
    expect(mockBookingLifecycleClient.paymentFailed).not.toHaveBeenCalled();
    expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledWith("o1");
    expect(mockOrderStatusService.cancelOrder).toHaveBeenCalled();
  });

  it("neither order_id nor booking_id in metadata: no-op on both paths", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.handleStripeWebhook("evt_neither", "payment_intent.succeeded", {
      id: "pi_orphan",
      metadata: {},
    });

    expect(result.skipped).toBe(false);
    expect(mockPaymentRepo.findOne).not.toHaveBeenCalled();
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
    expect(mockBookingLifecycleClient.confirm).not.toHaveBeenCalled();
  });

  it("a re-delivered booking event is deduped by webhook_events like any other event", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce({ id: "wh-b1", status: "processed" });

    const result = await service.handleStripeWebhook("evt_b1_retry", "setup_intent.succeeded", {
      id: "seti_booking_prepay",
      metadata: { booking_id: "b2" },
    });

    expect(result.skipped).toBe(true);
    expect(mockBookingLifecycleClient.confirm).not.toHaveBeenCalled();
  });

  it("authorises approved Tamara orders before confirming the order", async () => {
    const tamaraToken = jwt.sign({ iss: "Tamara" }, "notification-secret", {
      algorithm: "HS256",
    });
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      undefined,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "order-1" });

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-1",
      order_reference_id: "order-1",
      order_number: "NL-1001",
      event_type: "order_approved",
      data: [],
    });

    expect(result.skipped).toBe(false);
    expect(mockTamaraFetch).toHaveBeenCalledWith(
      "https://api-sandbox.tamara.co/orders/tamara-order-1/authorise",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tamara-api-token" }),
      }),
    );
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "authorized", gateway_order_id: "tamara-order-1" }),
    );
    expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledWith("order-1");
  });

  it("rejects Tamara webhooks with an invalid notification token", async () => {
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      undefined,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );

    await expect(
      service.handleTamaraWebhook("bad-token", "Bearer bad-token", {
        order_id: "tamara-order-1",
        order_reference_id: "order-1",
        event_type: "order_approved",
        data: [],
      }),
    ).rejects.toThrow("Invalid Tamara notification token");
    expect(mockTamaraFetch).not.toHaveBeenCalled();
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });

  it.each([
    ["order_declined", "failed"],
    ["order_expired", "failed"],
    ["order_canceled", "cancelled"],
  ])("settles the payment as %s -> %s without touching the order", async (eventType, expected) => {
    const tamaraToken = jwt.sign({ iss: "Tamara" }, "notification-secret", {
      algorithm: "HS256",
    });
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "order-1",
      status: "pending",
    });

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-1",
      order_reference_id: "order-1",
      event_type: eventType,
      data: [],
    });

    expect(result.skipped).toBe(false);
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: expected, failure_reason: eventType }),
    );
    // I3: a settle-to-failed event stamps failed_at (matches markPaymentFailed
    // / payment.service.ts's decline path convention); cancelled needs no
    // failed_at.
    if (expected === "failed") {
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ failed_at: expect.any(Date) }),
      );
    }
    // The reaper owns order cancellation and inventory release, not this path.
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
    expect(mockOrderStatusService.cancelOrder).not.toHaveBeenCalled();
    // No Tamara API call: there is nothing to authorise on a terminal event.
    expect(mockTamaraFetch).not.toHaveBeenCalled();
  });

  it("I2: does not overwrite an already-authorized payment on a terminal event (post-approval order_expired/order_canceled)", async () => {
    const tamaraToken = jwt.sign({ iss: "Tamara" }, "notification-secret", {
      algorithm: "HS256",
    });
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "order-1",
      status: "authorized",
    });

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-1",
      order_reference_id: "order-1",
      event_type: "order_expired",
      data: [],
    });

    expect(result.skipped).toBe(false);
    // The webhook event is still recorded (nothing lost) — only the Payment
    // row mutation is skipped.
    expect(mockWebhookRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "processed" }),
    );
    expect(mockPaymentRepo.save).not.toHaveBeenCalled();
  });

  it('minor 1: an event_type of "constructor" is treated as unknown, not a terminal event (Object.prototype key)', async () => {
    const tamaraToken = jwt.sign({ iss: "Tamara" }, "notification-secret", {
      algorithm: "HS256",
    });
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-1",
      order_reference_id: "order-1",
      event_type: "constructor",
      data: [],
    });

    expect(result.skipped).toBe(false);
    expect(mockWebhookRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "processed" }),
    );
    // Prototype-pollution regression: must never look up/mutate a payment,
    // let alone assign a function into payment.status.
    expect(mockPaymentRepo.findOne).not.toHaveBeenCalled();
    expect(mockPaymentRepo.save).not.toHaveBeenCalled();
  });

  it("records an unknown Tamara event without acting on it", async () => {
    const tamaraToken = jwt.sign({ iss: "Tamara" }, "notification-secret", {
      algorithm: "HS256",
    });
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-1",
      order_reference_id: "order-1",
      event_type: "order_on_hold",
      data: [],
    });

    expect(result.skipped).toBe(false);
    expect(mockWebhookRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "processed" }),
    );
    expect(mockPaymentRepo.save).not.toHaveBeenCalled();
  });

  it("ignores a terminal event for a payment it has no record of", async () => {
    const tamaraToken = jwt.sign({ iss: "Tamara" }, "notification-secret", {
      algorithm: "HS256",
    });
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
      {
        apiToken: "tamara-api-token",
        apiBaseUrl: "https://api-sandbox.tamara.co",
        notificationToken: "notification-secret",
        fetch: mockTamaraFetch as any,
      },
    );
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-unknown",
      order_reference_id: "order-1",
      event_type: "order_declined",
      data: [],
    });

    expect(result.skipped).toBe(false);
    expect(mockPaymentRepo.save).not.toHaveBeenCalled();
  });
});
