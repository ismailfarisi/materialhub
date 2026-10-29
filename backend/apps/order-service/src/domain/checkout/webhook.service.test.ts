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
    ]) {
      Object.values(repo).forEach((m) => m.mockClear());
    }
    mockTamaraFetch.mockClear();
    service = new WebhookService(
      mockWebhookRepo as any,
      mockPaymentRepo as any,
      mockOrderConfirmation as any,
      mockOrderStatusService as any,
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

  it("ignores a Stripe event whose metadata carries no order_id", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.handleStripeWebhook("evt_orphan", "payment_intent.succeeded", {
      id: "pi_orphan",
      metadata: {},
    });

    expect(result.skipped).toBe(false);
    expect(mockPaymentRepo.findOne).not.toHaveBeenCalled();
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
    // Still recorded as processed so Stripe does not keep redelivering it.
    const lastSave = mockWebhookRepo.save.mock.calls.at(-1)?.[0];
    expect(lastSave.status).toBe("processed");
  });

  it("payment_intent.payment_failed cancels the order through OrderStatusService", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);

    await service.handleStripeWebhook("evt_fail", "payment_intent.payment_failed", {
      id: "pi_order_failed",
      metadata: { order_id: "o1" },
    });

    expect(mockOrderStatusService.cancelOrder).toHaveBeenCalledWith(
      "o1",
      expect.objectContaining({ role: "system" }),
      "Payment failed",
    );
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
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
