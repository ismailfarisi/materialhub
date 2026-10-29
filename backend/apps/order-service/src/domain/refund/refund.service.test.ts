// refund.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { RefundService } from "./refund.service.ts";

describe("RefundService", () => {
  const mockPaymentRepo = {
    findOne: mock(
      (_args?: any): Promise<any> =>
        Promise.resolve({
          id: "pay-1",
          order_id: "o1",
          gateway: "stripe",
          gateway_payment_id: "pi_test_123",
          status: "captured",
          amount: 20000,
          refunded_amount: 0,
        }),
    ),
    save: mock((p: any) => Promise.resolve(p)),
  };

  const mockStripeRefundsCreate = mock(
    async (_args?: any, _opts?: any) =>
      ({
        id: "re_test_1",
        amount: 12000,
        status: "succeeded",
      }) as any,
  );

  const mockStripe = {
    refunds: {
      create: mockStripeRefundsCreate,
    },
  };

  let service: RefundService;

  beforeEach(() => {
    Object.values(mockPaymentRepo).forEach((m) => m.mockClear());
    mockStripeRefundsCreate.mockClear();
    mockStripeRefundsCreate.mockImplementation(
      async (_args?: any, _opts?: any) =>
        ({
          id: "re_test_1",
          amount: 12000,
          status: "succeeded",
        }) as any,
    );
    service = new RefundService(mockPaymentRepo as any, mockStripe as any);
  });

  it("Stripe path: calls stripe.refunds.create with payment_intent + idempotency key, updates payment row", async () => {
    const result = await service.refundToOriginalPayment({
      orderId: "o1",
      amount: 12000,
      referenceType: "return",
      referenceId: "ret-42",
      reason: "requested_by_customer",
    });

    expect(result.gateway).toBe("stripe");
    expect(result.gatewayRefundId).toBe("re_test_1");

    expect(mockStripeRefundsCreate).toHaveBeenCalledTimes(1);
    const [createArgs, options] = mockStripeRefundsCreate.mock.calls[0]!;
    expect(createArgs).toMatchObject({
      payment_intent: "pi_test_123",
      amount: 12000,
    });
    // Idempotency key must be deterministic per refund reference so retries
    // never double-charge the merchant. Stripe matches by this key.
    expect(options.idempotencyKey).toBe("refund:return:ret-42");

    // Payment row updated: refunded_amount incremented, refunded_at set
    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ refunded_amount: 12000, refunded_at: expect.any(Date) }),
    );
  });

  it("Stripe path: partial refund increments refunded_amount on top of prior refunds", async () => {
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "o1",
      gateway: "stripe",
      gateway_payment_id: "pi_test_123",
      status: "captured",
      amount: 20000,
      refunded_amount: 5000,
    });

    await service.refundToOriginalPayment({
      orderId: "o1",
      amount: 7000,
      referenceType: "return",
      referenceId: "ret-99",
    });

    expect(mockPaymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ refunded_amount: 12000 }),
    );
  });

  it("rejects refund when amount + prior refunds exceeds payment amount", async () => {
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "o1",
      gateway: "stripe",
      gateway_payment_id: "pi_test_123",
      status: "captured",
      amount: 20000,
      refunded_amount: 15000,
    });

    await expect(
      service.refundToOriginalPayment({
        orderId: "o1",
        amount: 6000,
        referenceType: "return",
        referenceId: "ret-x",
      }),
    ).rejects.toThrow(/exceeds/i);
    expect(mockStripeRefundsCreate).not.toHaveBeenCalled();
  });

  it("throws when no captured payment exists for the order", async () => {
    mockPaymentRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.refundToOriginalPayment({
        orderId: "o-missing",
        amount: 1000,
        referenceType: "return",
        referenceId: "ret-missing",
      }),
    ).rejects.toThrow(/no captured payment/i);
  });

  it("Tabby path: throws NotImplemented (placeholder until BNPL refund API is wired)", async () => {
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "o1",
      gateway: "tabby",
      gateway_payment_id: "tabby_123",
      status: "captured",
      amount: 20000,
      refunded_amount: 0,
    });

    await expect(
      service.refundToOriginalPayment({
        orderId: "o1",
        amount: 5000,
        referenceType: "return",
        referenceId: "ret-tabby",
      }),
    ).rejects.toThrow(/tabby.*not.*implemented/i);
  });

  it("Tamara path: throws NotImplemented", async () => {
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "o1",
      gateway: "tamara",
      gateway_payment_id: "tamara_123",
      status: "captured",
      amount: 20000,
      refunded_amount: 0,
    });

    await expect(
      service.refundToOriginalPayment({
        orderId: "o1",
        amount: 5000,
        referenceType: "return",
        referenceId: "ret-tamara",
      }),
    ).rejects.toThrow(/tamara.*not.*implemented/i);
  });

  it("COD path: rejects — COD orders must refund to wallet, not to a non-existent card", async () => {
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "o1",
      gateway: "cod",
      gateway_payment_id: null,
      status: "pending",
      amount: 20000,
      refunded_amount: 0,
    });

    await expect(
      service.refundToOriginalPayment({
        orderId: "o1",
        amount: 5000,
        referenceType: "return",
        referenceId: "ret-cod",
      }),
    ).rejects.toThrow(/cod/i);
  });

  it("Stripe path: uses item_cancellation idempotency key", async () => {
    const result = await service.refundToOriginalPayment({
      orderId: "o1",
      amount: 5000,
      referenceType: "item_cancellation",
      referenceId: "c1",
    });

    expect(result.gateway).toBe("stripe");
    expect(mockStripeRefundsCreate).toHaveBeenCalledTimes(1);
    const [, options] = mockStripeRefundsCreate.mock.calls[0]!;
    expect(options).toEqual({ idempotencyKey: "refund:item_cancellation:c1" });
  });

  it("throws when Stripe SDK not configured", async () => {
    const noStripeService = new RefundService(mockPaymentRepo as any, null);
    mockPaymentRepo.findOne.mockResolvedValueOnce({
      id: "pay-1",
      order_id: "o1",
      gateway: "stripe",
      gateway_payment_id: "pi_test_123",
      status: "captured",
      amount: 20000,
      refunded_amount: 0,
    });

    await expect(
      noStripeService.refundToOriginalPayment({
        orderId: "o1",
        amount: 5000,
        referenceType: "return",
        referenceId: "ret-no-sdk",
      }),
    ).rejects.toThrow(/stripe.*not configured/i);
  });
});
