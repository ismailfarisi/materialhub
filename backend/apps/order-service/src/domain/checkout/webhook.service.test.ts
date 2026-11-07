// webhook.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
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
    findOne: mock(
      (_args?: any): Promise<any> =>
        Promise.resolve({ id: "pay-1", order_id: "o1", amount: 15000 }),
    ),
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
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1", amount: 15000 });

    const payload = {
      id: "pi_test",
      metadata: { order_id: "o1" },
      amount_received: 15000,
    };
    const result = await service.handleStripeWebhook("evt_1", "payment_intent.succeeded", payload);

    expect(result.skipped).toBe(false);
    expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledWith("o1");
    expect(mockWebhookRepo.save).toHaveBeenCalledTimes(2); // create + update status
  });

  it("updates Stripe-specific payment row with captured_at on success", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1", amount: 15000 });

    await service.handleStripeWebhook("evt_1", "payment_intent.succeeded", {
      id: "pi_test",
      metadata: { order_id: "o1" },
      amount_received: 15000,
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
      amount_received: 15000,
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
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "order-1",
      amount: 15000,
    });

    const result = await service.handleTamaraWebhook(tamaraToken, `Bearer ${tamaraToken}`, {
      order_id: "tamara-order-1",
      order_reference_id: "order-1",
      order_number: "MH-1001",
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

  describe("Tamara payload validation and token policy", () => {
    function tamaraService(cfg: Record<string, unknown>) {
      return new WebhookService(
        mockWebhookRepo as any,
        mockPaymentRepo as any,
        mockOrderConfirmation as any,
        mockOrderStatusService as any,
        {
          apiToken: "tamara-api-token",
          apiBaseUrl: "https://api-sandbox.tamara.co",
          fetch: mockTamaraFetch as any,
          ...cfg,
        } as any,
      );
    }

    it.each([
      ["an empty object", {}],
      ["a missing order_id", { event_type: "order_approved" }],
      ["a missing event_type", { order_id: "tamara-order-1" }],
      ["a non-string event_type", { event_type: 42, order_id: "tamara-order-1" }],
      ["a non-string order_id", { event_type: "order_approved", order_id: { x: 1 } }],
      ["no body at all", undefined],
    ])("rejects %s with 400 before any DB write", async (_label, payload) => {
      const svc = tamaraService({});
      await expect(svc.handleTamaraWebhook(null, null, payload as any)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockWebhookRepo.findOne).not.toHaveBeenCalled();
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
    });

    it("verifies the token before validating the payload", async () => {
      const svc = tamaraService({ notificationToken: "notification-secret" });
      await expect(svc.handleTamaraWebhook("bad", null, {})).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
    });

    it("fails closed (503) when the notification token is required but unset", async () => {
      const errSpy = mock(() => {});
      const origError = console.error;
      console.error = errSpy as any;
      try {
        const svc = tamaraService({ notificationToken: "", requireNotificationToken: true });
        await expect(
          svc.handleTamaraWebhook(null, null, {
            event_type: "order_approved",
            order_id: "tamara-order-1",
            order_reference_id: "order-1",
          }),
        ).rejects.toMatchObject({ statusCode: 503, code: "TAMARA_WEBHOOK_NOT_CONFIGURED" });
      } finally {
        console.error = origError;
      }
      expect(errSpy).toHaveBeenCalled();
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
      expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
    });
  });

  describe("Stripe signature verification (handleStripeWebhookRequest)", () => {
    const SECRET = "whsec_materialhub_test_secret";
    const stripeWebhooks = Stripe.webhooks;

    function stripeService(secret: string) {
      return new WebhookService(
        mockWebhookRepo as any,
        mockPaymentRepo as any,
        mockOrderConfirmation as any,
        mockOrderStatusService as any,
        undefined,
        { webhooks: stripeWebhooks, secret },
      );
    }

    async function signedEvent(event: Record<string, unknown>, secret = SECRET) {
      const payload = JSON.stringify(event);
      const header = await stripeWebhooks.generateTestHeaderStringAsync({ payload, secret });
      return { payload, header };
    }

    const succeededEvent = {
      id: "evt_signed_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_signed",
          object: "payment_intent",
          metadata: { order_id: "o1" },
          amount_received: 15000,
        },
      },
    };

    it("processes an event with a valid signature using the verified event fields", async () => {
      const { payload, header } = await signedEvent(succeededEvent);
      const result = await stripeService(SECRET).handleStripeWebhookRequest(payload, header);

      expect(result.skipped).toBe(false);
      expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledWith("o1");
      expect(mockWebhookRepo.save.mock.calls[0]?.[0]).toMatchObject({
        gateway: "stripe",
        event_id: "evt_signed_1",
        event_type: "payment_intent.succeeded",
        payload: succeededEvent.data.object,
      });
    });

    it("rejects a bad signature with 400 and writes nothing", async () => {
      const { payload, header } = await signedEvent(succeededEvent, "whsec_someone_else");
      await expect(
        stripeService(SECRET).handleStripeWebhookRequest(payload, header),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_SIGNATURE" });
      expect(mockWebhookRepo.findOne).not.toHaveBeenCalled();
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
      expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
    });

    it("rejects a body tampered with after signing", async () => {
      const { header } = await signedEvent(succeededEvent);
      const forged = JSON.stringify({
        ...succeededEvent,
        data: { object: { id: "pi_x", metadata: { order_id: "someone-elses-order" } } },
      });
      await expect(
        stripeService(SECRET).handleStripeWebhookRequest(forged, header),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_SIGNATURE" });
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
    });

    it("rejects a missing stripe-signature header with 400", async () => {
      const { payload } = await signedEvent(succeededEvent);
      await expect(
        stripeService(SECRET).handleStripeWebhookRequest(payload, null),
      ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_SIGNATURE" });
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
    });

    it("fails closed with 503 when the signing secret is unset", async () => {
      const errSpy = mock(() => {});
      const origError = console.error;
      console.error = errSpy as any;
      const { payload, header } = await signedEvent(succeededEvent);
      try {
        await expect(
          stripeService("").handleStripeWebhookRequest(payload, header),
        ).rejects.toMatchObject({ statusCode: 503, code: "STRIPE_WEBHOOK_NOT_CONFIGURED" });
      } finally {
        console.error = origError;
      }
      expect(errSpy).toHaveBeenCalled();
      expect(mockWebhookRepo.findOne).not.toHaveBeenCalled();
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
    });

    it("fails closed with 503 when no Stripe config is wired at all", async () => {
      const origError = console.error;
      console.error = (() => {}) as any;
      try {
        await expect(service.handleStripeWebhookRequest("{}", "t=1,v1=x")).rejects.toMatchObject({
          statusCode: 503,
        });
      } finally {
        console.error = origError;
      }
      expect(mockWebhookRepo.save).not.toHaveBeenCalled();
    });

    it("skips a replay of an already-processed event id", async () => {
      const svc = stripeService(SECRET);
      const { payload, header } = await signedEvent(succeededEvent);

      await svc.handleStripeWebhookRequest(payload, header);
      expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledTimes(1);

      // The ledger now holds the processed row for evt_signed_1.
      mockWebhookRepo.findOne.mockResolvedValueOnce({ id: "wh1", status: "processed" });
      const replay = await signedEvent(succeededEvent);
      const result = await svc.handleStripeWebhookRequest(replay.payload, replay.header);

      expect(result.skipped).toBe(true);
      expect(mockWebhookRepo.findOne).toHaveBeenLastCalledWith({
        where: { gateway: "stripe", event_id: "evt_signed_1" },
      });
      expect(mockOrderConfirmation.markOrderPaid).toHaveBeenCalledTimes(1);
    });
  });

  it("does not confirm an order when Stripe received less than the order's payment amount", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-1", order_id: "o1", amount: 15000 });
    (mockOrderConfirmation.markOrderPaid as any).mockClear?.();
    await service.handleStripeWebhook("evt_underpaid", "payment_intent.succeeded", {
      id: "pi_underpaid",
      metadata: { order_id: "o1" },
      amount_received: 1,
    });
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });

  it("does not confirm an order from a PaymentIntent created for another order", async () => {
    mockWebhookRepo.findOne.mockResolvedValueOnce(null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({ id: "pay-9", order_id: "other", amount: 100 });
    (mockOrderConfirmation.markOrderPaid as any).mockClear?.();
    await service.handleStripeWebhook("evt_mismatch", "payment_intent.succeeded", {
      id: "pi_other",
      metadata: { order_id: "o1" },
      amount_received: 15000,
    });
    expect(mockOrderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });
});
