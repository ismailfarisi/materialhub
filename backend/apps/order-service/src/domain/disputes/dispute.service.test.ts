// dispute.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DisputeStatus, OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { DisputeService } from "./dispute.service.ts";

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

/* ------------------------------------------------------------------ */
/*  Test suite                                                        */
/* ------------------------------------------------------------------ */
describe("DisputeService", () => {
  let disputeRepo: any;
  let disputeMessageRepo: any;
  let orderRepo: any;
  let vendorOrderRepo: any;
  let userRepo: any;
  let walletTransactionRepo: any;
  let orderStatusService: any;
  let orderEventQueue: any;
  let refundService: any;
  let orderItemRepo: any;
  let commissionReversal: any;
  /** R3-C5: the transactional manager reverseForItems must run on (see return.service.test.ts). */
  let reversalTxManager: any;
  let service: DisputeService;

  beforeEach(() => {
    disputeRepo = makeMockRepo();
    disputeMessageRepo = makeMockRepo();
    orderRepo = makeMockRepo();
    vendorOrderRepo = makeMockRepo();
    userRepo = makeMockRepo();
    walletTransactionRepo = makeMockRepo();
    orderStatusService = {
      transitionOrder: mock(() => Promise.resolve({})),
    };
    orderEventQueue = {
      add: mock(() => Promise.resolve()),
    };
    refundService = {
      refundToOriginalPayment: mock(() =>
        Promise.resolve({ gateway: "stripe", gatewayRefundId: "re_test", amount: 5000 }),
      ),
    };
    orderItemRepo = makeMockRepo();
    reversalTxManager = { __transactional: true, getRepository: mock(() => makeMockRepo()) };
    orderItemRepo.manager = {
      transaction: mock((cb: any) => cb(reversalTxManager)),
    };
    commissionReversal = {
      reverseForItems: mock(() => Promise.resolve({ recomputed: 0, cancelled: 0, clawedBack: 0 })),
    };

    service = new DisputeService(
      disputeRepo,
      disputeMessageRepo,
      orderRepo,
      vendorOrderRepo,
      userRepo,
      walletTransactionRepo,
      orderStatusService,
      orderEventQueue,
      refundService,
      orderItemRepo,
      commissionReversal,
    );
  });

  /* ================================================================ */
  /*  openDispute                                                     */
  /* ================================================================ */
  describe("openDispute", () => {
    const userId = "user-1";
    const orderId = "order-1";
    const baseData = {
      category: "item_not_as_described",
      description: "Product arrived damaged",
      evidence_urls: ["https://img.test/evidence.jpg"],
    };

    it("throws if order not found", async () => {
      orderRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.openDispute(orderId, userId, baseData)).rejects.toThrow(
        "Order not found",
      );
    });

    it("throws if order does not belong to user", async () => {
      orderRepo.findOne.mockResolvedValueOnce({
        id: orderId,
        user_id: "other-user",
        status: OrderStatus.delivered,
      });

      await expect(service.openDispute(orderId, userId, baseData)).rejects.toThrow(
        "Order not found",
      );
    });

    it("throws if order status is not delivered", async () => {
      orderRepo.findOne.mockResolvedValueOnce({
        id: orderId,
        user_id: userId,
        status: OrderStatus.confirmed,
      });

      await expect(service.openDispute(orderId, userId, baseData)).rejects.toThrow(
        "Order must be delivered to open a dispute",
      );
    });

    it("allows item_not_received disputes for shipped orders", async () => {
      const order = {
        id: orderId,
        user_id: userId,
        status: OrderStatus.shipped,
      };
      orderRepo.findOne.mockResolvedValueOnce(order);
      vendorOrderRepo.find.mockResolvedValueOnce([{ id: "vo-1", vendor_id: "vendor-1" }]);
      disputeRepo.count.mockResolvedValueOnce(0);

      const result = await service.openDispute(orderId, userId, {
        ...baseData,
        category: "item_not_received",
      });

      expect(result.status).toBe(DisputeStatus.opened);
    });

    it("throws if multiple vendor orders and no vendor_order_id specified", async () => {
      const order = {
        id: orderId,
        user_id: userId,
        status: OrderStatus.delivered,
      };
      orderRepo.findOne.mockResolvedValueOnce(order);
      vendorOrderRepo.find.mockResolvedValueOnce([
        { id: "vo-1", vendor_id: "vendor-1" },
        { id: "vo-2", vendor_id: "vendor-2" },
      ]);

      await expect(service.openDispute(orderId, userId, baseData)).rejects.toThrow(
        "vendor_order_id is required",
      );
    });

    it("succeeds with correct dispute_number and transitions order", async () => {
      const order = {
        id: orderId,
        user_id: userId,
        status: OrderStatus.delivered,
      };
      orderRepo.findOne.mockResolvedValueOnce(order);
      vendorOrderRepo.find.mockResolvedValueOnce([{ id: "vo-1", vendor_id: "vendor-1" }]);
      disputeRepo.count.mockResolvedValueOnce(5);

      const result = await service.openDispute(orderId, userId, baseData);

      const year = new Date().getFullYear();
      expect(result.dispute_number).toBe(`DSP-${year}-000006`);
      expect(result.status).toBe(DisputeStatus.opened);
      expect(result.opened_by).toBe(userId);
      expect(result.vendor_id).toBe("vendor-1");
      expect(result.deadline_at).toBeDefined();

      // Verify transitionOrder called with system role
      expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
        orderId,
        OrderStatus.disputed,
        { userId: "system", role: "system" },
      );

      // Verify event enqueued
      expect(orderEventQueue.add).toHaveBeenCalledWith(
        "dispute.opened",
        expect.objectContaining({ type: "dispute.opened", disputeId: expect.any(String) }),
      );
    });

    it("uses provided vendor_order_id when multiple vendor orders exist", async () => {
      const order = {
        id: orderId,
        user_id: userId,
        status: OrderStatus.delivered,
      };
      orderRepo.findOne.mockResolvedValueOnce(order);
      vendorOrderRepo.find.mockResolvedValueOnce([
        { id: "vo-1", vendor_id: "vendor-1" },
        { id: "vo-2", vendor_id: "vendor-2" },
      ]);
      disputeRepo.count.mockResolvedValueOnce(0);

      const result = await service.openDispute(orderId, userId, {
        ...baseData,
        vendor_order_id: "vo-2",
      });

      expect(result.vendor_id).toBe("vendor-2");
      expect(result.vendor_order_id).toBe("vo-2");
    });
  });

  /* ================================================================ */
  /*  assignDispute                                                   */
  /* ================================================================ */
  describe("assignDispute", () => {
    it("throws if status is not opened", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.under_review,
      });

      await expect(service.assignDispute("d-1", "admin-1", "agent-1")).rejects.toThrow(
        "Only opened disputes can be assigned",
      );
    });

    it("succeeds: sets assigned_to and transitions to under_review", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.opened,
      });

      const result = await service.assignDispute("d-1", "admin-1", "agent-1");

      expect(result.assigned_to).toBe("agent-1");
      expect(result.status).toBe(DisputeStatus.under_review);
    });
  });

  /* ================================================================ */
  /*  escalateDispute                                                 */
  /* ================================================================ */
  describe("escalateDispute", () => {
    it("throws if status is not under_review", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.opened,
      });

      await expect(service.escalateDispute("d-1", "admin-1")).rejects.toThrow(
        "Only under_review disputes can be escalated",
      );
    });

    it("succeeds: sets escalated_at and transitions to escalated", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.under_review,
      });

      const result = await service.escalateDispute("d-1", "admin-1");

      expect(result.escalated_at).toBeDefined();
      expect(result.status).toBe(DisputeStatus.escalated);
    });
  });

  /* ================================================================ */
  /*  resolveDispute                                                  */
  /* ================================================================ */
  describe("resolveDispute", () => {
    describe("buyer decision", () => {
      it("transitions to resolved_buyer, credits wallet, and transitions order to refund_requested", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({
          id: "user-1",
          wallet_balance: 10000,
        });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        const result = await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Refund granted",
          resolution_amount: 5000,
        });

        expect(result.status).toBe(DisputeStatus.resolved_buyer);
        expect(result.resolution).toBe("Refund granted");
        expect(result.resolution_amount).toBe(5000);
        expect(result.resolved_by).toBe("admin-1");
        expect(result.resolved_at).toBeDefined();

        // Wallet transaction created
        expect(walletTransactionRepo.save).toHaveBeenCalled();
        const walletTxArg = walletTransactionRepo.create.mock.calls[0][0];
        expect(walletTxArg.amount).toBe(5000);
        expect(walletTxArg.balance_before).toBe(10000);
        expect(walletTxArg.balance_after).toBe(15000);

        // User wallet updated
        expect(userRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ wallet_balance: 15000 }),
        );

        // Order transitioned to refund_requested
        expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
          "order-1",
          OrderStatus.refund_requested,
          { userId: "admin-1", role: "admin" },
        );
      });

      it("reverses the vendor's commission after a wallet refund too", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 5000, refunded_amount: 0 },
        ]);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Refund granted",
          resolution_amount: 5000,
        });

        expect(commissionReversal.reverseForItems).toHaveBeenCalledWith(
          reversalTxManager,
          expect.objectContaining({
            items: [{ orderItemId: "oi-1", refundedQuantity: 0, refundedAmount: 5000 }],
            sourceType: "dispute",
            sourceId: "d-1",
          }),
        );
      });

      it("refunds to original payment via RefundService when refund_method=original_payment", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Card refund granted",
          resolution_amount: 7000,
          refund_method: "original_payment",
        });

        expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith({
          orderId: "order-1",
          amount: 7000,
          referenceType: "dispute",
          referenceId: "d-1",
          reason: "requested_by_customer",
        });
        // Wallet path must NOT fire for original_payment
        expect(walletTransactionRepo.create).not.toHaveBeenCalled();
        // Order still transitions to refund_requested
        expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
          "order-1",
          OrderStatus.refund_requested,
          { userId: "admin-1", role: "admin" },
        );
      });

      it("reverses the vendor's commission after refunding to original payment", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 7000, refunded_amount: 0 },
        ]);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Card refund granted",
          resolution_amount: 7000,
          refund_method: "original_payment",
        });

        // Order item's refunded_amount is persisted BEFORE the reversal call.
        expect(orderItemRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: "oi-1", refunded_amount: 7000 }),
        );
        expect(commissionReversal.reverseForItems).toHaveBeenCalledWith(
          reversalTxManager,
          expect.objectContaining({
            items: [{ orderItemId: "oi-1", refundedQuantity: 0, refundedAmount: 7000 }],
            sourceType: "dispute",
            sourceId: "d-1",
          }),
        );
        const saveOrder = orderItemRepo.save.mock.invocationCallOrder[0];
        const reversalOrder = commissionReversal.reverseForItems.mock.invocationCallOrder[0];
        expect(saveOrder).toBeLessThan(reversalOrder);
        // R3-C5: ran inside a real transaction, not on the base manager.
        expect(orderItemRepo.manager.transaction).toHaveBeenCalledTimes(1);
        expect(commissionReversal.reverseForItems.mock.calls[0][0]).not.toBe(orderItemRepo.manager);
      });

      it("partial resolution reverses only the proportional share, not the full line_total", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 100000, refunded_amount: 0 },
        ]);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Goodwill credit",
          resolution_amount: 5000,
        });

        // Only the 5,000 fils actually returned is credited to the item's
        // ledger — NOT the full 100,000 line_total.
        expect(orderItemRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: "oi-1", refunded_amount: 5000 }),
        );
        expect(commissionReversal.reverseForItems).toHaveBeenCalledWith(
          reversalTxManager,
          expect.objectContaining({
            items: [{ orderItemId: "oi-1", refundedQuantity: 0, refundedAmount: 5000 }],
            sourceType: "dispute",
            sourceId: "d-1",
          }),
        );
      });

      it("full resolution (resolution_amount === outstanding total) still cancels the commission entirely", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 100000, refunded_amount: 0 },
        ]);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Full refund granted",
          resolution_amount: 100000,
        });

        expect(orderItemRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: "oi-1", refunded_amount: 100000 }),
        );
        expect(commissionReversal.reverseForItems).toHaveBeenCalledWith(
          reversalTxManager,
          expect.objectContaining({
            items: [{ orderItemId: "oi-1", refundedQuantity: 0, refundedAmount: 100000 }],
            sourceType: "dispute",
            sourceId: "d-1",
          }),
        );
      });

      it("multi-item vendor_order splits proportionally and sums exactly to resolution_amount, including an uneven remainder", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        // Three equal-outstanding items (100000 each); resolving 100000
        // total does not divide evenly by 3 -> exercises the remainder rule.
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 100000, refunded_amount: 0 },
          { id: "oi-2", line_total: 100000, refunded_amount: 0 },
          { id: "oi-3", line_total: 100000, refunded_amount: 0 },
        ]);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Partial goodwill credit",
          resolution_amount: 100000,
        });

        const call = commissionReversal.reverseForItems.mock.calls[0][1];
        const total = call.items.reduce((sum: number, it: any) => sum + it.refundedAmount, 0);
        expect(total).toBe(100000);
        // No single item may exceed its own outstanding (100000) balance.
        for (const it of call.items) {
          expect(it.refundedAmount).toBeLessThanOrEqual(100000);
        }
      });

      it("an item already partly refunded absorbs no more than its outstanding remainder", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        // oi-1 already has 99000 refunded out of 100000 -> only 1000 left.
        // oi-2 is untouched -> 99000 outstanding.
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 100000, refunded_amount: 99000 },
          { id: "oi-2", line_total: 100000, refunded_amount: 0 },
        ]);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Large goodwill credit",
          resolution_amount: 50000,
        });

        const call = commissionReversal.reverseForItems.mock.calls[0][1];
        const oi1 = call.items.find((it: any) => it.orderItemId === "oi-1");
        expect(oi1).toBeDefined();
        expect(oi1.refundedAmount).toBeLessThanOrEqual(1000);
      });

      it("resolution_amount exceeding the outstanding total is clamped, not over-distributed", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          vendor_order_id: "vo-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);
        orderItemRepo.find.mockResolvedValueOnce([
          { id: "oi-1", line_total: 5000, refunded_amount: 0 },
        ]);

        const userQb = makeQb();
        userQb.getOne.mockResolvedValueOnce({ id: "user-1", wallet_balance: 10000 });
        userRepo.createQueryBuilder.mockReturnValueOnce(userQb);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Refund granted (over-claimed)",
          resolution_amount: 999999,
        });

        // The item can never absorb more than its own line_total/outstanding.
        expect(orderItemRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: "oi-1", refunded_amount: 5000 }),
        );
        const call = commissionReversal.reverseForItems.mock.calls[0][1];
        expect(call.items).toEqual([
          { orderItemId: "oi-1", refundedQuantity: 0, refundedAmount: 5000 },
        ]);
      });

      it("does not reverse commission when the dispute has no vendor_order_id", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Card refund granted",
          resolution_amount: 7000,
          refund_method: "original_payment",
        });

        expect(commissionReversal.reverseForItems).not.toHaveBeenCalled();
      });

      it("skips wallet credit when resolution_amount is 0", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.escalated,
          order_id: "order-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);

        await service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Apology issued",
          resolution_amount: 0,
        });

        expect(walletTransactionRepo.save).not.toHaveBeenCalled();
      });
    });

    describe("seller decision", () => {
      it("transitions to resolved_seller and transitions order to delivered", async () => {
        const dispute = {
          id: "d-1",
          status: DisputeStatus.under_review,
          order_id: "order-1",
          opened_by: "user-1",
        };
        disputeRepo.findOne.mockResolvedValueOnce(dispute);

        const result = await service.resolveDispute("d-1", "admin-1", {
          decision: "seller",
          resolution: "No fault found",
        });

        expect(result.status).toBe(DisputeStatus.resolved_seller);
        expect(result.resolved_by).toBe("admin-1");

        expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
          "order-1",
          OrderStatus.delivered,
          { userId: "admin-1", role: "admin" },
        );
      });
    });

    it("throws if status is not under_review or escalated", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.opened,
      });

      await expect(
        service.resolveDispute("d-1", "admin-1", {
          decision: "buyer",
          resolution: "Refund",
        }),
      ).rejects.toThrow("Dispute must be under_review or escalated to resolve");
    });
  });

  /* ================================================================ */
  /*  closeDispute                                                    */
  /* ================================================================ */
  describe("closeDispute", () => {
    it("throws if status is not resolved_buyer or resolved_seller", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.under_review,
      });

      await expect(service.closeDispute("d-1", "admin-1")).rejects.toThrow(
        "Only resolved disputes can be closed",
      );
    });

    it("succeeds for resolved_buyer", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.resolved_buyer,
      });

      const result = await service.closeDispute("d-1", "admin-1");

      expect(result.status).toBe(DisputeStatus.closed);
    });

    it("succeeds for resolved_seller", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.resolved_seller,
      });

      const result = await service.closeDispute("d-1", "admin-1");

      expect(result.status).toBe(DisputeStatus.closed);
    });
  });

  /* ================================================================ */
  /*  addMessage                                                      */
  /* ================================================================ */
  describe("addMessage", () => {
    it("creates a message on an open dispute", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.opened,
      });

      const result = await service.addMessage("d-1", "user-1", "customer", {
        message: "I have more photos",
        attachment_urls: ["https://img.test/2.jpg"],
      });

      expect(result.dispute_id).toBe("d-1");
      expect(result.sender_id).toBe("user-1");
      expect(result.message).toBe("I have more photos");
      expect(result.is_internal).toBe(false);
    });

    it("rejects is_internal for non-admin role", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.opened,
      });

      await expect(
        service.addMessage("d-1", "user-1", "customer", {
          message: "Internal note",
          is_internal: true,
        }),
      ).rejects.toThrow("Only admins can send internal messages");
    });

    it("allows is_internal for admin role", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.under_review,
      });

      const result = await service.addMessage("d-1", "admin-1", "admin", {
        message: "Internal note for team",
        is_internal: true,
      });

      expect(result.is_internal).toBe(true);
    });

    it("throws if dispute is closed", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        status: DisputeStatus.closed,
      });

      await expect(
        service.addMessage("d-1", "user-1", "customer", {
          message: "Hello",
        }),
      ).rejects.toThrow("Cannot add messages to a closed dispute");
    });
  });

  /* ================================================================ */
  /*  getMessages                                                     */
  /* ================================================================ */
  describe("getMessages", () => {
    it("returns all messages for admin role", async () => {
      const messages = [
        { id: "m-1", is_internal: false, created_at: new Date("2026-01-01") },
        { id: "m-2", is_internal: true, created_at: new Date("2026-01-02") },
      ];
      const qb = makeQb();
      qb.getMany.mockResolvedValueOnce(messages);
      disputeMessageRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.getMessages("d-1", "admin");

      expect(result).toHaveLength(2);
    });

    it("filters out internal messages for buyer role", async () => {
      const messages = [
        { id: "m-1", is_internal: false, created_at: new Date("2026-01-01") },
        { id: "m-2", is_internal: true, created_at: new Date("2026-01-02") },
      ];
      const qb = makeQb();
      qb.getMany.mockResolvedValueOnce(messages);
      disputeMessageRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.getMessages("d-1", "customer");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("m-1");
    });

    it("does not filter internal messages for super_admin role", async () => {
      const messages = [
        { id: "m-1", is_internal: false, created_at: new Date("2026-01-01") },
        { id: "m-2", is_internal: true, created_at: new Date("2026-01-02") },
      ];
      const qb = makeQb();
      qb.getMany.mockResolvedValueOnce(messages);
      disputeMessageRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.getMessages("d-1", "super_admin");

      expect(result).toHaveLength(2);
    });
  });

  /* ================================================================ */
  /*  listForBuyer                                                    */
  /* ================================================================ */
  describe("listForBuyer", () => {
    it("returns paginated disputes for user", async () => {
      const disputes = [{ id: "d-1" }];
      const qb = makeQb([disputes, 1]);
      disputeRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.listForBuyer("user-1", { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(qb.where).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  getForBuyer                                                     */
  /* ================================================================ */
  describe("getForBuyer", () => {
    it("returns dispute owned by user", async () => {
      disputeRepo.findOne.mockResolvedValueOnce({
        id: "d-1",
        opened_by: "user-1",
      });

      const result = await service.getForBuyer("d-1", "user-1");

      expect(result).toBeDefined();
      expect(result!.id).toBe("d-1");
    });
  });

  /* ================================================================ */
  /*  listForAdmin                                                    */
  /* ================================================================ */
  describe("listForAdmin", () => {
    it("returns paginated disputes for admin", async () => {
      const disputes = [{ id: "d-1" }, { id: "d-2" }];
      const qb = makeQb([disputes, 2]);
      disputeRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.listForAdmin({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by status when provided", async () => {
      const qb = makeQb([[], 0]);
      disputeRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.listForAdmin({ status: DisputeStatus.opened });

      expect(qb.andWhere).toHaveBeenCalled();
    });
  });
});
