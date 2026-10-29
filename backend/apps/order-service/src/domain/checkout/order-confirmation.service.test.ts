// order-confirmation.service.test.ts
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  CHANNEL_CONVERSION_EVENTS_QUEUE,
  __setQueueFactoryForTests as __setChannelsQueueFactoryForTests,
} from "../order/channel-conversion-events.ts";
import {
  REELS_COMMISSIONS_QUEUE,
  __setQueueFactoryForTests,
} from "../order/reels-commission-events.ts";
import { OrderConfirmationService } from "./order-confirmation.service.ts";

describe("OrderConfirmationService", () => {
  const mockOrderRepo = {
    findOne: mock(
      (_args?: any): Promise<any> =>
        Promise.resolve({ id: "o1", user_id: "u1", status: "pending_payment" }),
    ),
    save: mock((o: any) => Promise.resolve(o)),
  };
  const mockReservationRepo = {
    find: mock(() => Promise.resolve([{ id: "res-1", quantity: 2, status: "active" }])),
    save: mock((r: any) => Promise.resolve(r)),
  };
  const mockStatusHistoryRepo = {
    save: mock((h: any) => Promise.resolve(h)),
  };
  const mockCartService = {
    clearCart: mock(() => Promise.resolve()),
  };

  let service: OrderConfirmationService;
  let fakeQueueAdd: ReturnType<typeof mock>;
  let fakeChannelsQueueAdd: ReturnType<typeof mock>;
  let fakeEnqueueAutoShipments: ReturnType<typeof mock>;

  beforeEach(() => {
    fakeQueueAdd = mock(async () => ({ id: "job-id" }));
    __setQueueFactoryForTests(
      () =>
        ({
          name: REELS_COMMISSIONS_QUEUE,
          add: fakeQueueAdd,
        }) as any,
    );

    fakeChannelsQueueAdd = mock(async () => ({ id: "ch-job-id" }));
    __setChannelsQueueFactoryForTests(
      () =>
        ({
          name: CHANNEL_CONVERSION_EVENTS_QUEUE,
          add: fakeChannelsQueueAdd,
        }) as any,
    );

    for (const repo of [
      mockOrderRepo,
      mockReservationRepo,
      mockStatusHistoryRepo,
      mockCartService,
    ]) {
      Object.values(repo).forEach((m) => m.mockClear());
    }
    fakeEnqueueAutoShipments = mock(async () => {});
    service = new OrderConfirmationService(
      mockOrderRepo as any,
      mockReservationRepo as any,
      mockStatusHistoryRepo as any,
      mockCartService as any,
      fakeEnqueueAutoShipments as any,
    );
  });

  afterEach(() => {
    __setQueueFactoryForTests(null);
    __setChannelsQueueFactoryForTests(null);
  });

  it("markOrderPaid: flips status to confirmed and clears the user's cart", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "o1",
      user_id: "u1",
      status: "pending_payment",
    });

    const result = await service.markOrderPaid("o1");

    expect(result.confirmed).toBe(true);
    expect(mockOrderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed", payment_status: "captured" }),
    );
    expect(mockCartService.clearCart).toHaveBeenCalledWith("u1", null);
  });

  it("markOrderPaid: emits a master-level confirmed order-placed event when a queue is wired", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "o1",
      user_id: "u1",
      status: "pending_payment",
    });
    const fakeOrderEventAdd = mock(async () => ({ id: "evt" }));
    const withQueue = new OrderConfirmationService(
      mockOrderRepo as any,
      mockReservationRepo as any,
      mockStatusHistoryRepo as any,
      mockCartService as any,
      fakeEnqueueAutoShipments as any,
      { add: fakeOrderEventAdd } as any,
    );

    await withQueue.markOrderPaid("o1");

    expect(fakeOrderEventAdd).toHaveBeenCalledWith(
      "order.status.changed",
      expect.objectContaining({ orderId: "o1", toStatus: "confirmed", actorId: "u1" }),
    );
    // Master-level only — no vendorOrderId, so the order-event bridge won't
    // double-trigger auto-shipment.
    const emitted = (fakeOrderEventAdd.mock.calls as any)[0][1];
    expect(emitted.vendorOrderId).toBeUndefined();
  });

  it("markOrderPaid: commits inventory reservations and records status history", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "o1",
      user_id: "u1",
      status: "pending_payment",
    });

    await service.markOrderPaid("o1");

    expect(mockReservationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "committed" }),
    );
    expect(mockStatusHistoryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: "o1",
        from_status: "pending_payment",
        to_status: "confirmed",
      }),
    );
  });

  it("markOrderPaid: publishes reels commission event for the master order", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "order-42",
      user_id: "u-42",
      status: "pending_payment",
    });

    await service.markOrderPaid("order-42");

    // fire-and-forget — give the .catch chain a tick to land
    await Promise.resolve();

    expect(fakeQueueAdd).toHaveBeenCalledTimes(1);
    const call = fakeQueueAdd.mock.calls[0]!;
    expect(call[0]).toBe("createCommissionsFromOrder");
    expect(call[1]).toEqual({ orderId: "order-42" });
  });

  it("markOrderPaid: publishes channel conversion event for the master order", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "order-77",
      user_id: "u-77",
      status: "pending_payment",
    });

    await service.markOrderPaid("order-77");

    // fire-and-forget — give the .catch chain a tick to land
    await Promise.resolve();

    expect(fakeChannelsQueueAdd).toHaveBeenCalledTimes(1);
    const call = fakeChannelsQueueAdd.mock.calls[0]!;
    expect(call[0]).toBe("recordChannelConversion");
    expect(call[1]).toEqual({ orderId: "order-77" });
    expect(call[2]).toMatchObject({ removeOnComplete: 1000, attempts: 5 });

    // Both publishes fire on success.
    expect(fakeQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("markOrderPaid: swallows channel conversion publish failures", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "order-99",
      user_id: "u-99",
      status: "pending_payment",
    });
    fakeChannelsQueueAdd.mockImplementationOnce(() => Promise.reject(new Error("redis down")));

    const result = await service.markOrderPaid("order-99");

    // give the rejected .catch a tick
    await Promise.resolve();

    expect(result.confirmed).toBe(true);
    expect(fakeChannelsQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("markOrderPaid: enqueues auto shipment booking for the order", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "order-55",
      user_id: "u-55",
      status: "pending_payment",
    });

    await service.markOrderPaid("order-55");
    await Promise.resolve();

    expect(fakeEnqueueAutoShipments).toHaveBeenCalledWith("order-55");
  });

  it("markOrderPaid: swallows auto shipment enqueue failures", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "order-56",
      user_id: "u-56",
      status: "pending_payment",
    });
    fakeEnqueueAutoShipments.mockImplementationOnce(() => Promise.reject(new Error("redis down")));

    const result = await service.markOrderPaid("order-56");
    await Promise.resolve();

    expect(result.confirmed).toBe(true);
  });

  it("triggerAutoShipments: invokes the enqueue hook and swallows failures", async () => {
    await service.triggerAutoShipments("order-cod-1");
    expect(fakeEnqueueAutoShipments).toHaveBeenCalledWith("order-cod-1");

    fakeEnqueueAutoShipments.mockImplementationOnce(() => Promise.reject(new Error("redis down")));
    await service.triggerAutoShipments("order-cod-2");
    expect(fakeEnqueueAutoShipments).toHaveBeenCalledTimes(2);
  });

  it("markOrderPaid: is idempotent — no-ops when payment is already captured", async () => {
    // A fully-processed order always has payment_status 'captured'. Idempotency
    // keys on the payment, not the order status, so a re-delivered webhook is a
    // true no-op regardless of how far fulfilment has since advanced the order.
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "o1",
      user_id: "u1",
      status: "confirmed",
      payment_status: "captured",
    });

    const result = await service.markOrderPaid("o1");

    expect(result.confirmed).toBe(false);
    expect(mockOrderRepo.save).not.toHaveBeenCalled();
    expect(mockCartService.clearCart).not.toHaveBeenCalled();
    expect(fakeQueueAdd).not.toHaveBeenCalled();
    expect(fakeChannelsQueueAdd).not.toHaveBeenCalled();
    expect(fakeEnqueueAutoShipments).not.toHaveBeenCalled();
  });

  it("markOrderPaid: still records capture and emits order-placed when a delayed webhook races fulfilment", async () => {
    // Real prod race (FKS-2026-815743): the provider webhook arrived AFTER a
    // vendor-status aggregation had already bumped the master order from
    // 'pending_payment' to 'processing'. The old status guard short-circuited
    // here, stranding payment_status at 'pending' and skipping the order-placed
    // emails (customer + vendors). Capturing on payment_status must survive it.
    mockOrderRepo.findOne.mockResolvedValueOnce({
      id: "o1",
      user_id: "u1",
      status: "processing",
      payment_status: "pending",
    });
    const fakeOrderEventAdd = mock(async () => ({ id: "evt" }));
    const withQueue = new OrderConfirmationService(
      mockOrderRepo as any,
      mockReservationRepo as any,
      mockStatusHistoryRepo as any,
      mockCartService as any,
      fakeEnqueueAutoShipments as any,
      { add: fakeOrderEventAdd } as any,
    );

    const result = await withQueue.markOrderPaid("o1");

    expect(result.confirmed).toBe(true);
    // Payment capture is still recorded...
    expect(mockOrderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "captured" }),
    );
    // ...but the already-advanced status is NOT regressed back to 'confirmed'.
    const saved = (mockOrderRepo.save.mock.calls as any)[0][0];
    expect(saved.status).toBe("processing");
    // The order-placed event fires so customer + vendor emails go out.
    expect(fakeOrderEventAdd).toHaveBeenCalledWith(
      "order.status.changed",
      expect.objectContaining({ orderId: "o1", toStatus: "confirmed" }),
    );
    expect(mockCartService.clearCart).toHaveBeenCalledWith("u1", null);
  });

  it("markOrderPaid: no-ops when order does not exist", async () => {
    mockOrderRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.markOrderPaid("missing-order");

    expect(result.confirmed).toBe(false);
    expect(mockCartService.clearCart).not.toHaveBeenCalled();
  });

  it("emitOrderPlaced enqueues an invoice job with deterministic jobId", async () => {
    const invoiceAdd = mock(async () => {});
    const orderEventAdd = mock(async () => {});
    const svc = new OrderConfirmationService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      null,
      { add: orderEventAdd } as any, // orderEventQueue
      null, // couponService
      { add: invoiceAdd } as any, // invoiceQueue (new last param)
    );

    await svc.emitOrderPlaced("ord-1", "user-1");

    expect(invoiceAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = (invoiceAdd.mock.calls as any)[0];
    expect(name).toBe("generate");
    expect(data).toEqual({ orderId: "ord-1" });
    expect(opts).toEqual({ jobId: "invoice_ord-1" });
  });

  it("clearCustomerCart: drains the user's cart without touching order status", async () => {
    await service.clearCustomerCart("user-cod-7");

    expect(mockCartService.clearCart).toHaveBeenCalledWith("user-cod-7", null);
    expect(mockOrderRepo.save).not.toHaveBeenCalled();
  });

  it("markOrderPaid: records the coupon redemption from the order snapshot", async () => {
    const couponOrder = {
      id: "o-cpn",
      user_id: "u1",
      status: "pending_payment",
      coupon_id: "cp1",
      coupon_discount: 1500,
    };
    mockOrderRepo.findOne.mockImplementation(() => Promise.resolve({ ...couponOrder }) as any);
    const recordUsage = mock(() => Promise.resolve());
    const withCoupon = new OrderConfirmationService(
      mockOrderRepo as any,
      mockReservationRepo as any,
      mockStatusHistoryRepo as any,
      mockCartService as any,
      fakeEnqueueAutoShipments as any,
      null,
      { recordUsage } as any,
    );

    await withCoupon.markOrderPaid("o-cpn");

    expect(recordUsage).toHaveBeenCalledWith("cp1", "u1", "o-cpn", 1500);
    mockOrderRepo.findOne.mockImplementation(
      (_args?: any): Promise<any> =>
        Promise.resolve({ id: "o1", user_id: "u1", status: "pending_payment" }),
    );
  });

  it("recordCouponUsage: no-ops for orders without a coupon", async () => {
    const recordUsage = mock(() => Promise.resolve());
    const withCoupon = new OrderConfirmationService(
      mockOrderRepo as any,
      mockReservationRepo as any,
      mockStatusHistoryRepo as any,
      mockCartService as any,
      fakeEnqueueAutoShipments as any,
      null,
      { recordUsage } as any,
    );

    await withCoupon.recordCouponUsage("o1");

    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("recordCouponUsage: swallows failures so payment confirmation never breaks", async () => {
    const couponOrder = {
      id: "o-cpn2",
      user_id: "u1",
      status: "pending_payment",
      coupon_id: "cp1",
      coupon_discount: 500,
    };
    mockOrderRepo.findOne.mockResolvedValueOnce(couponOrder as any);
    const recordUsage = mock(() => Promise.reject(new Error("db down")));
    const withCoupon = new OrderConfirmationService(
      mockOrderRepo as any,
      mockReservationRepo as any,
      mockStatusHistoryRepo as any,
      mockCartService as any,
      fakeEnqueueAutoShipments as any,
      null,
      { recordUsage } as any,
    );

    await expect(withCoupon.recordCouponUsage("o-cpn2")).resolves.toBeUndefined();
  });
});
