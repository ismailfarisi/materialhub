// return.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  OrderStatus,
  ReturnReason,
  ReturnStatus,
} from "@materialhub/database/src/enums/order.enums.ts";
import { ReturnService } from "./return.service.ts";

/* ------------------------------------------------------------------ */
/*  Helper: chainable query-builder mock                              */
/* ------------------------------------------------------------------ */
const makeQb = (resolvedValue: [any[], number] = [[], 0]) => {
  const qb: any = {
    leftJoinAndSelect: mock(() => qb),
    innerJoinAndSelect: mock(() => qb),
    where: mock(() => qb),
    andWhere: mock(() => qb),
    orderBy: mock(() => qb),
    skip: mock(() => qb),
    take: mock(() => qb),
    getOne: mock(() => Promise.resolve(null)),
    getMany: mock(() => Promise.resolve([])),
    getManyAndCount: mock(() => Promise.resolve(resolvedValue)),
    setLock: mock(() => qb),
  };
  return qb;
};

/* ------------------------------------------------------------------ */
/*  Shared mock factories                                             */
/* ------------------------------------------------------------------ */
const makeMockRepo = (extras: Record<string, any> = {}) => ({
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => Promise.resolve([])),
  count: mock(() => Promise.resolve(0)),
  create: mock((data: any) => ({ ...data })),
  save: mock((entity: any) => Promise.resolve({ id: "new-id", ...entity })),
  createQueryBuilder: mock(() => makeQb()),
  ...extras,
});

describe("ReturnService", () => {
  let returnRepo: any;
  let returnItemRepo: any;
  let orderRepo: any;
  let vendorOrderRepo: any;
  let orderItemRepo: any;
  let inventoryRepo: any;
  let inventoryMovementRepo: any;
  let userRepo: any;
  let walletTransactionRepo: any;
  let orderStatusService: any;
  let orderEventQueue: any;
  let refundService: any;
  let commissionReversal: any;
  /**
   * R3-C5: the transactional EntityManager `confirmRefund`/`processRefund`
   * must hand to CommissionReversalService. Passing the BASE manager made the
   * reversal a run of independent autocommitted statements, so a failure
   * partway through `invalidateDraftForReversal` left a draft soft-deleted
   * with its commissions still claiming it — permanently unpayable and
   * unreachable, with the customer already refunded.
   */
  let reversalTxManager: any;
  let service: ReturnService;

  beforeEach(() => {
    returnRepo = makeMockRepo();
    returnItemRepo = makeMockRepo();
    orderRepo = makeMockRepo();
    vendorOrderRepo = makeMockRepo();
    orderItemRepo = makeMockRepo();
    reversalTxManager = { __transactional: true, getRepository: mock(() => makeMockRepo()) };
    orderItemRepo.manager = {
      transaction: mock((cb: any) => cb(reversalTxManager)),
    };
    inventoryRepo = makeMockRepo();
    inventoryMovementRepo = makeMockRepo();
    // markReceived restocks and saves the return in one transaction; the tx
    // manager hands back the same mocks so assertions keep working.
    returnRepo.manager = {
      transaction: mock((cb: any) =>
        cb({
          getRepository: (name: string) =>
            ({
              Inventory: inventoryRepo,
              InventoryMovement: inventoryMovementRepo,
              Return: returnRepo,
            })[name],
        }),
      ),
    };
    userRepo = makeMockRepo();
    walletTransactionRepo = makeMockRepo();
    // The wallet credit runs in its own transaction (it locks the user row);
    // hand the same fakes back from the transactional manager.
    userRepo.target = "User";
    walletTransactionRepo.target = "WalletTransaction";
    userRepo.manager = {
      transaction: async (cb: any) =>
        cb({ getRepository: (t: string) => (t === "User" ? userRepo : walletTransactionRepo) }),
    };
    orderStatusService = {
      transitionOrder: mock(() => Promise.resolve({})),
    };
    orderEventQueue = {
      add: mock(() => Promise.resolve()),
    };
    refundService = {
      getCapturedGateway: mock(() => Promise.resolve("stripe")),
      refundToOriginalPayment: mock(() =>
        Promise.resolve({ gateway: "stripe", gatewayRefundId: "re_test", amount: 5000 }),
      ),
    };
    commissionReversal = {
      reverseForItems: mock(() => Promise.resolve({ recomputed: 0, cancelled: 0, clawedBack: 0 })),
    };

    service = new ReturnService(
      returnRepo,
      returnItemRepo,
      orderRepo,
      vendorOrderRepo,
      orderItemRepo,
      inventoryRepo,
      inventoryMovementRepo,
      userRepo,
      walletTransactionRepo,
      orderStatusService,
      orderEventQueue,
      refundService,
      commissionReversal,
    );
  });

  /* ================================================================ */
  /*  createReturn                                                    */
  /* ================================================================ */
  describe("createReturn", () => {
    const userId = "user-1";
    const orderId = "order-1";
    const baseData = {
      vendor_order_id: "vo-1",
      reason: ReturnReason.defective,
      reason_details: "Broken screen",
      media_urls: ["https://img.test/1.jpg"],
      items: [
        {
          order_item_id: "oi-1",
          quantity: 1,
          reason: ReturnReason.defective,
          condition: "damaged",
        },
      ],
    };

    it("throws if vendor_order not found", async () => {
      vendorOrderRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.createReturn(orderId, userId, baseData)).rejects.toThrow(
        "Vendor order not found",
      );
    });

    it("throws if vendor_order status is not delivered", async () => {
      vendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        order_id: orderId,
        vendor_id: "vendor-1",
        status: OrderStatus.processing,
        order: { id: orderId, user_id: userId },
      });

      await expect(service.createReturn(orderId, userId, baseData)).rejects.toThrow(
        "Only delivered orders can be returned",
      );
    });

    it("throws if delivered order is outside the 7-day return window", async () => {
      vendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        order_id: orderId,
        vendor_id: "vendor-1",
        status: OrderStatus.delivered,
        updated_at: new Date("2026-06-20T00:00:00.000Z"),
        order: {
          id: orderId,
          user_id: userId,
          delivered_at: new Date("2026-06-20T00:00:00.000Z"),
        },
      });

      await expect(
        service.createReturn(orderId, userId, baseData, new Date("2026-06-28T00:00:01.000Z")),
      ).rejects.toThrow("Return window has expired");
    });

    it("throws if requested qty exceeds ordered qty", async () => {
      vendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        order_id: orderId,
        vendor_id: "vendor-1",
        status: OrderStatus.delivered,
        order: { id: orderId, user_id: userId },
      });

      // order item has quantity 2
      orderItemRepo.findOne.mockResolvedValueOnce({
        id: "oi-1",
        quantity: 2,
        vendor_order_id: "vo-1",
      });

      // existing return items already returned 2 of this item
      returnItemRepo.find.mockResolvedValueOnce([{ order_item_id: "oi-1", quantity: 2 }]);

      await expect(
        service.createReturn(orderId, userId, {
          ...baseData,
          items: [
            {
              order_item_id: "oi-1",
              quantity: 1,
              reason: ReturnReason.defective,
              condition: "damaged",
            },
          ],
        }),
      ).rejects.toThrow(/already have a return|exceeds/);
    });

    it("creates return with items and enqueues event", async () => {
      vendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        order_id: orderId,
        vendor_id: "vendor-1",
        status: OrderStatus.delivered,
        order: { id: orderId, user_id: userId },
      });

      orderItemRepo.findOne.mockResolvedValueOnce({
        id: "oi-1",
        quantity: 3,
        vendor_order_id: "vo-1",
      });

      // no existing return items
      returnItemRepo.find.mockResolvedValueOnce([]);

      returnRepo.count.mockResolvedValueOnce(5);
      returnRepo.save.mockResolvedValueOnce({ id: "ret-1", return_number: "RET-2026-000006" });
      returnItemRepo.save.mockResolvedValueOnce({ id: "ri-1" });

      const result = await service.createReturn(orderId, userId, baseData);

      expect(result).toBeTruthy();
      expect(returnRepo.create).toHaveBeenCalled();
      expect(returnItemRepo.create).toHaveBeenCalled();
      expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
        orderId,
        OrderStatus.refund_requested,
        { userId: "system", role: "system" },
      );
      expect(orderEventQueue.add).toHaveBeenCalledWith(
        "return.requested",
        expect.objectContaining({ type: "return.requested" }),
      );
    });
  });

  /* ================================================================ */
  /*  approveReturn                                                   */
  /* ================================================================ */
  describe("approveReturn", () => {
    it("throws if status is not requested", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        status: ReturnStatus.approved,
      });

      await expect(
        service.approveReturn("ret-1", "admin-1", {
          refund_amount: 5000,
          refund_method: "wallet",
          items: [],
        }),
      ).rejects.toThrow("Only requested returns can be approved");
    });

    it("approves return and enqueues event", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        status: ReturnStatus.requested,
        returnItems: [{ id: "ri-1", order_item_id: "oi-1" }],
      });

      const result = await service.approveReturn("ret-1", "admin-1", {
        refund_amount: 5000,
        refund_method: "wallet",
        items: [{ return_item_id: "ri-1", refund_amount: 5000 }],
      });

      expect(result.status).toBe(ReturnStatus.approved);
      expect(result.refund_amount).toBe(5000);
      expect(result.approved_by).toBe("admin-1");
      expect(orderEventQueue.add).toHaveBeenCalledWith(
        "return.approved",
        expect.objectContaining({ type: "return.approved" }),
      );
    });
  });

  /* ================================================================ */
  /*  rejectReturn                                                    */
  /* ================================================================ */
  describe("rejectReturn", () => {
    it("throws if status is not requested", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        status: ReturnStatus.approved,
      });

      await expect(service.rejectReturn("ret-1", "admin-1", "Not eligible")).rejects.toThrow(
        "Only requested returns can be rejected",
      );
    });

    it("rejects return and enqueues event", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        status: ReturnStatus.requested,
      });

      const result = await service.rejectReturn("ret-1", "admin-1", "Not eligible");

      expect(result.status).toBe(ReturnStatus.rejected);
      expect(result.rejection_reason).toBe("Not eligible");
      expect(orderEventQueue.add).toHaveBeenCalledWith(
        "return.rejected",
        expect.objectContaining({ type: "return.rejected" }),
      );
    });
  });

  /* ================================================================ */
  /*  markReceived                                                    */
  /* ================================================================ */
  describe("markReceived", () => {
    it("throws if return does not belong to vendor", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        vendor_id: "vendor-2",
        status: ReturnStatus.shipped_back,
        returnItems: [],
      });

      await expect(service.markReceived("ret-1", "vendor-1", true)).rejects.toThrow(
        "Return not found",
      );
    });

    it("marks received with restock and creates inventory movements", async () => {
      const returnItems = [
        {
          id: "ri-1",
          order_item_id: "oi-1",
          quantity: 2,
          orderItem: { product_id: "prod-1", variant_id: "var-1" },
        },
      ];

      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        vendor_id: "vendor-1",
        status: ReturnStatus.shipped_back,
        refund_amount: 5000,
        refund_method: "wallet",
        order_id: "order-1",
        user_id: "user-1",
        returnItems,
      });

      inventoryRepo.findOne.mockResolvedValueOnce({
        id: "inv-1",
        product_id: "prod-1",
        variant_id: "var-1",
        quantity_on_hand: 10,
      });

      // Mock for processRefund: the return after marking received
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        vendor_id: "vendor-1",
        status: ReturnStatus.received,
        refund_amount: 5000,
        refund_method: "wallet",
        refunded_at: null,
        order_id: "order-1",
        user_id: "user-1",
        returnItems,
      });

      // Mock user for wallet refund
      const qb = makeQb();
      qb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
      userRepo.createQueryBuilder.mockReturnValueOnce(qb);

      // Mock order for refund_total update
      orderRepo.findOne.mockResolvedValueOnce({
        id: "order-1",
        grand_total: 20000,
        refund_total: 0,
      });

      // Mock order items for updating refunded amounts
      orderItemRepo.find.mockResolvedValueOnce([
        { id: "oi-1", refunded_quantity: 0, refunded_amount: 0 },
      ]);

      const result = await service.markReceived("ret-1", "vendor-1", true);

      expect(result.status).toBe(ReturnStatus.received);
      expect(result.restocked).toBe(true);
      expect(inventoryMovementRepo.create).toHaveBeenCalled();
      expect(inventoryMovementRepo.save).toHaveBeenCalled();
      expect(inventoryRepo.save).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  processRefund                                                   */
  /* ================================================================ */
  describe("processRefund", () => {
    it("is idempotent — skips if refunded_at is already set", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        refunded_at: new Date(),
        status: ReturnStatus.refunded,
      });

      await service.processRefund("ret-1");

      // No wallet transaction should be created
      expect(walletTransactionRepo.create).not.toHaveBeenCalled();
    });

    it("creates wallet transaction and updates user balance for wallet refund", async () => {
      const returnItems = [
        {
          id: "ri-1",
          order_item_id: "oi-1",
          quantity: 1,
          refund_amount: 5000,
        },
      ];

      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        refunded_at: null,
        refund_amount: 5000,
        refund_method: "wallet",
        order_id: "order-1",
        user_id: "user-1",
        status: ReturnStatus.received,
        returnItems,
      });

      const qb = makeQb();
      qb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
      userRepo.createQueryBuilder.mockReturnValueOnce(qb);

      orderRepo.findOne.mockResolvedValueOnce({
        id: "order-1",
        grand_total: 20000,
        refund_total: 0,
      });

      orderItemRepo.find.mockResolvedValueOnce([
        { id: "oi-1", refunded_quantity: 0, refunded_amount: 0 },
      ]);

      await service.processRefund("ret-1");

      expect(walletTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          amount: 5000,
          balance_before: 10000,
          balance_after: 15000,
          transaction_type: "refund",
          order_id: "order-1",
          reference_type: "return",
          reference_id: "ret-1",
        }),
      );
      expect(walletTransactionRepo.save).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ wallet_balance: 15000 }),
      );
      expect(returnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReturnStatus.refunded }),
      );
      expect(orderStatusService.transitionOrder).toHaveBeenCalled();

      // Commission reversal fires AFTER the order-item counters are saved.
      expect(commissionReversal.reverseForItems).toHaveBeenCalledWith(
        reversalTxManager,
        expect.objectContaining({
          items: [{ orderItemId: "oi-1", refundedQuantity: 1, refundedAmount: 5000 }],
          sourceType: "return",
          sourceId: "ret-1",
        }),
      );
      const orderItemSaveOrder = orderItemRepo.save.mock.invocationCallOrder[0];
      const reversalCallOrder = commissionReversal.reverseForItems.mock.invocationCallOrder[0];
      expect(orderItemSaveOrder).toBeLessThan(reversalCallOrder);
      // R3-C5: and it ran inside a real transaction, not on the base manager.
      expect(orderItemRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(commissionReversal.reverseForItems.mock.calls[0][0]).not.toBe(orderItemRepo.manager);
    });

    it("delegates to RefundService for refund_method=original_payment (Stripe refund)", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-2",
        refunded_at: null,
        refund_amount: 6000,
        refund_method: "original_payment",
        order_id: "order-2",
        user_id: "user-2",
        status: ReturnStatus.received,
        returnItems: [{ id: "ri-1", order_item_id: "oi-1", quantity: 1, refund_amount: 6000 }],
      });
      orderRepo.findOne.mockResolvedValueOnce({
        id: "order-2",
        grand_total: 20000,
        refund_total: 0,
      });
      orderItemRepo.find.mockResolvedValueOnce([
        { id: "oi-1", refunded_quantity: 0, refunded_amount: 0 },
      ]);

      await service.processRefund("ret-2");

      expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith({
        orderId: "order-2",
        amount: 6000,
        referenceType: "return",
        referenceId: "ret-2",
        reason: "requested_by_customer",
      });
      // Wallet path must NOT be triggered when refunding to original payment
      expect(walletTransactionRepo.create).not.toHaveBeenCalled();
      // Order-item and order-status updates still happen
      expect(orderItemRepo.save).toHaveBeenCalled();
      expect(orderStatusService.transitionOrder).toHaveBeenCalled();
      expect(commissionReversal.reverseForItems).toHaveBeenCalledWith(
        reversalTxManager,
        expect.objectContaining({
          items: [{ orderItemId: "oi-1", refundedQuantity: 1, refundedAmount: 6000 }],
          sourceType: "return",
          sourceId: "ret-2",
        }),
      );
    });
  });
  /* ================================================================ */
  /*  COD refunds, retryable refunds                                  */
  /* ================================================================ */
  describe("refund method resolution and retry", () => {
    const receivedReturn = (over: Record<string, any> = {}) => ({
      id: "ret-cod",
      vendor_id: "vendor-1",
      refunded_at: null,
      refund_amount: 4000,
      refund_method: "original_payment",
      order_id: "order-cod",
      user_id: "user-1",
      status: ReturnStatus.received,
      returnItems: [{ id: "ri-1", order_item_id: "oi-1", quantity: 1, refund_amount: 4000 }],
      ...over,
    });
    const primeRefundSideEffects = () => {
      const qb = makeQb();
      qb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 0 });
      userRepo.createQueryBuilder.mockReturnValueOnce(qb);
      orderRepo.findOne.mockResolvedValueOnce({
        id: "order-cod",
        grand_total: 9000,
        refund_total: 0,
      });
      orderItemRepo.find.mockResolvedValueOnce([
        { id: "oi-1", refunded_quantity: 0, refunded_amount: 0 },
      ]);
    };

    it("approve: original payment on a COD order is stored as a wallet refund", async () => {
      refundService.getCapturedGateway.mockResolvedValueOnce("cod");
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-cod",
        order_id: "order-cod",
        status: ReturnStatus.requested,
        returnItems: [],
      });
      const result = await service.approveReturn("ret-cod", "admin-1", {
        refund_amount: 4000,
        refund_method: "original_payment",
        items: [],
      });
      expect(result.refund_method).toBe("wallet");
    });

    it("approve: store_credit is the wallet; omitted amount defaults to the lines' paid value", async () => {
      returnRepo.findOne.mockResolvedValueOnce({
        id: "ret-1",
        order_id: "order-1",
        status: ReturnStatus.requested,
        returnItems: [{ id: "ri-1", order_item_id: "oi-1", quantity: 1 }],
      });
      orderItemRepo.findOne.mockResolvedValueOnce({ id: "oi-1", quantity: 4, line_total: 10000 });
      const result = await service.approveReturn("ret-1", "admin-1", {
        refund_method: "store_credit",
        items: [],
      });
      expect(result.refund_method).toBe("wallet");
      expect(result.refund_amount).toBe(2500);
      expect(refundService.getCapturedGateway).not.toHaveBeenCalled();
    });

    it("processRefund: a COD return approved as original_payment credits the wallet", async () => {
      refundService.getCapturedGateway.mockResolvedValueOnce("cod");
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn());
      primeRefundSideEffects();

      await service.processRefund("ret-cod");

      expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
      expect(walletTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4000,
          reference_type: "return",
          reference_id: "ret-cod",
        }),
      );
      expect(returnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReturnStatus.refunded, refund_method: "wallet" }),
      );
    });

    it("processRefund: a wallet credit from an earlier attempt is not repeated", async () => {
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ refund_method: "wallet" }));
      walletTransactionRepo.findOne.mockResolvedValueOnce({ id: "wt-1" });
      orderRepo.findOne.mockResolvedValueOnce({
        id: "order-cod",
        grand_total: 9000,
        refund_total: 0,
      });
      orderItemRepo.find.mockResolvedValueOnce([
        { id: "oi-1", refunded_quantity: 0, refunded_amount: 0 },
      ]);

      await service.processRefund("ret-cod");

      expect(walletTransactionRepo.create).not.toHaveBeenCalled();
      expect(returnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReturnStatus.refunded }),
      );
    });

    it("processRefund: manual refunds move no money", async () => {
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ refund_method: "manual" }));
      orderRepo.findOne.mockResolvedValueOnce({
        id: "order-cod",
        grand_total: 9000,
        refund_total: 0,
      });

      await service.processRefund("ret-cod");

      expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
      expect(walletTransactionRepo.create).not.toHaveBeenCalled();
      expect(returnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReturnStatus.refunded }),
      );
    });

    it("processRefund: refuses a return that has not been received", async () => {
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ status: ReturnStatus.approved }));
      await expect(service.processRefund("ret-cod")).rejects.toThrow(
        "Only received returns can be refunded",
      );
    });

    it("markReceived: a failed refund keeps the receive and leaves the return retryable", async () => {
      returnRepo.findOne.mockResolvedValueOnce(
        receivedReturn({ status: ReturnStatus.shipped_back, returnItems: [] }),
      );
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ returnItems: [] }));
      refundService.refundToOriginalPayment.mockRejectedValueOnce(new Error("gateway down"));

      const result = await service.markReceived("ret-cod", "vendor-1", false);

      expect(result.status).toBe(ReturnStatus.received);
      expect(result.refunded_at).toBeFalsy();
      expect(returnRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it("markReceived again on a received, unrefunded return retries the refund without restocking", async () => {
      // markReceived lookup, retryRefund lookup, processRefund lookup, final read
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ refund_method: "wallet" }));
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ refund_method: "wallet" }));
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn({ refund_method: "wallet" }));
      primeRefundSideEffects();
      returnRepo.findOne.mockResolvedValueOnce(
        receivedReturn({ status: ReturnStatus.refunded, refunded_at: new Date() }),
      );

      const result = await service.markReceived("ret-cod", "vendor-1", true);

      expect(result.status).toBe(ReturnStatus.refunded);
      expect(returnRepo.manager.transaction).not.toHaveBeenCalled();
      expect(inventoryRepo.save).not.toHaveBeenCalled();
      expect(walletTransactionRepo.save).toHaveBeenCalled();
    });

    it("retryRefund reports a gateway failure as 409 REFUND_FAILED", async () => {
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn());
      returnRepo.findOne.mockResolvedValueOnce(receivedReturn());
      refundService.refundToOriginalPayment.mockRejectedValueOnce(new Error("Tabby down"));

      await expect(service.retryRefund("ret-cod")).rejects.toMatchObject({
        statusCode: 409,
        code: "REFUND_FAILED",
      });
    });
  });
});
