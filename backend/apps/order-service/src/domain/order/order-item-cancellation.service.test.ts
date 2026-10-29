// order-item-cancellation.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CommissionStatus, OrderStatus } from "@materialhub/database/src/enums.ts";
import { CommissionReversalService } from "../commission/commission-reversal.service.ts";
import { OrderItemCancellationService } from "./order-item-cancellation.service.ts";

/* ------------------------------------------------------------------ */
/*  Mock repo factory                                                 */
/* ------------------------------------------------------------------ */
const makeRepo = (extras: Record<string, any> = {}) => ({
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => Promise.resolve([])),
  create: mock((d: any) => ({ ...d })),
  // Preserve the entity as-is on save so an explicitly-set `id` survives
  // (the cancellation row's id is generated up front and must round-trip).
  save: mock((e: any) => Promise.resolve(e)),
  update: mock(() => Promise.resolve({ affected: 1 })),
  ...extras,
});

describe("OrderItemCancellationService", () => {
  let orderRepo: any;
  let vendorOrderRepo: any;
  let orderItemRepo: any;
  let commissionRepo: any;
  let inventoryRepo: any;
  let inventoryMovementRepo: any;
  let paymentRepo: any;
  let cancellationRepo: any;
  let historyRepo: any;
  let vendorPayoutAdjustmentRepo: any;
  let refundService: any;
  let orderStatusService: any;
  let orderEventQueue: any;
  let flashDealApplicator: any;
  let commissionReversalService: CommissionReversalService;
  let service: OrderItemCancellationService;

  beforeEach(() => {
    orderRepo = makeRepo();
    vendorOrderRepo = makeRepo();
    orderItemRepo = makeRepo();
    commissionRepo = makeRepo();
    inventoryRepo = makeRepo();
    inventoryMovementRepo = makeRepo();
    paymentRepo = makeRepo();
    cancellationRepo = makeRepo();
    historyRepo = makeRepo();
    vendorPayoutAdjustmentRepo = makeRepo();

    const reposByName: Record<string, any> = {
      Order: orderRepo,
      VendorOrder: vendorOrderRepo,
      OrderItem: orderItemRepo,
      Commission: commissionRepo,
      Inventory: inventoryRepo,
      InventoryMovement: inventoryMovementRepo,
      OrderItemCancellation: cancellationRepo,
      OrderStatusHistory: historyRepo,
      VendorPayoutAdjustment: vendorPayoutAdjustmentRepo,
    };
    // The service opens `orderRepo.manager.transaction` and does its writes via
    // `tx.getRepository(<EntityName>)`. Route those to the same injected mocks
    // so assertions on e.g. `commissionRepo.save` see the transactional writes.
    // `CommissionReversalService` (reused for the commission/adjustment fate on
    // cancellation) calls `manager.getRepository(<EntityClass>)` with the actual
    // entity class rather than a string, so resolve by `.name` in that case too.
    orderRepo.manager = {
      transaction: mock(async (cb: any) =>
        cb({
          getRepository: (n: any) => reposByName[typeof n === "string" ? n : n?.name],
        }),
      ),
    };

    refundService = {
      refundToOriginalPayment: mock(() =>
        Promise.resolve({ gateway: "stripe", gatewayRefundId: "re_1", amount: 0 }),
      ),
    };
    orderStatusService = { transitionOrder: mock(() => Promise.resolve({})) };
    orderEventQueue = { add: mock(() => Promise.resolve()) };
    flashDealApplicator = { decrement: mock(() => Promise.resolve()) };
    // Default: any draft claim reverseForItems tries to release invalidates
    // cleanly. Tests exercising the non-pending "leave it claimed" path (C1)
    // override this per-test.
    commissionReversalService = new CommissionReversalService({
      invalidateDraftForReversal: mock(() =>
        Promise.resolve({ invalidated: true, payoutStatus: "pending" }),
      ),
      writeAudit: mock(() => Promise.resolve()),
      // R3-C2/C4/I4: the shared unreleasable-claim sink. Unused on the
      // default (invalidated: true) path, but part of the interface.
      recordUnreleasableClaim: mock(() =>
        Promise.resolve({ clawedBack: false, amount: 0, moneyLeftThePlatform: false }),
      ),
    });

    service = new OrderItemCancellationService(
      orderRepo,
      vendorOrderRepo,
      orderItemRepo,
      commissionRepo,
      inventoryRepo,
      inventoryMovementRepo,
      paymentRepo,
      cancellationRepo,
      refundService,
      orderStatusService,
      orderEventQueue,
      commissionReversalService,
      flashDealApplicator,
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Seed helper — standard single-item confirmed order              */
  /* ---------------------------------------------------------------- */
  function seed(over: any = {}) {
    const order = {
      id: "order-1",
      user_id: "user-1",
      refund_total: 0,
      grand_total: 32000,
      status: OrderStatus.confirmed,
      ...(over.order || {}),
    };
    const vo = {
      id: "vo-1",
      order_id: "order-1",
      vendor_id: "v1",
      status: OrderStatus.confirmed,
      shipping_cost: 2000,
      ...(over.vo || {}),
    };
    const oi = {
      id: "oi-1",
      order_id: "order-1",
      vendor_order_id: "vo-1",
      vendor_id: "v1",
      product_id: "p1",
      variant_id: null,
      quantity: 3,
      refunded_quantity: 0,
      refunded_amount: 0,
      line_total: 30000,
      status: OrderStatus.confirmed,
      product_snapshot: null,
      ...(over.oi || {}),
    };
    const commission = {
      id: "c-1",
      order_item_id: "oi-1",
      status: CommissionStatus.pending,
      commission_type: "percentage",
      commission_rate: 10,
      item_total: 30000,
      commission_amount: 0,
      tax_on_commission: 0,
      vendor_earning: 0,
      ...(over.commission || {}),
    };
    const payment = {
      id: "pay-1",
      order_id: "order-1",
      gateway: "stripe",
      status: "captured",
      ...(over.payment || {}),
    };
    const inventory = {
      id: "inv-1",
      product_id: "p1",
      vendor_id: "v1",
      variant_id: null,
      quantity_on_hand: 8,
      quantity_reserved: 5,
      ...(over.inventory || {}),
    };

    orderRepo.findOne.mockResolvedValue(order);
    const itemList = over.items || [oi];
    orderItemRepo.find.mockResolvedValue(itemList);
    // CommissionReversalService re-reads the order item fresh inside the tx
    // (by design — it must see the refunded_quantity/refunded_amount this
    // service persists in step 7a before it recomputes). The mocks share
    // object references, so returning the matching item from `itemList`
    // reflects any in-place mutation already applied.
    orderItemRepo.findOne.mockImplementation((opts: any) =>
      Promise.resolve(itemList.find((x: any) => x.id === opts?.where?.id) ?? null),
    );
    vendorOrderRepo.find.mockResolvedValue(over.vendorOrders || [vo]);
    commissionRepo.findOne.mockResolvedValue(commission);
    paymentRepo.findOne.mockResolvedValue(payment);
    inventoryRepo.findOne.mockResolvedValue(inventory);

    return { order, vo, oi, commission, payment, inventory };
  }

  const call = (items: any[], reason = "out of stock") =>
    service.cancelItems("order-1", "admin-1", { reason, items });

  /* ---------------------------------------------------------------- */
  /*  Partial quantity                                                */
  /* ---------------------------------------------------------------- */
  it("partial qty: proportional refund, bumps refunded fields, recomputes commission (still pending)", async () => {
    const { oi, commission } = seed();

    await call([{ order_item_id: "oi-1", quantity: 1 }]);

    // proportional slice of a 30000 line over qty 3 => 10000
    expect(oi.refunded_quantity).toBe(1);
    expect(oi.refunded_amount).toBe(10000);
    expect(oi.status).toBe(OrderStatus.confirmed); // not fully cancelled
    expect(orderItemRepo.save).toHaveBeenCalled();

    // surviving line = 30000 - 10000 = 20000; netExVat = round(20000/1.05)=19048
    // commission = round(19048*0.10) = 1905
    expect(commission.status).toBe(CommissionStatus.pending);
    expect(commission.item_total).toBe(20000);
    expect(commission.commission_amount).toBe(1905);
    expect(commissionRepo.save).toHaveBeenCalled();

    expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.partially_refunded,
      { userId: "admin-1", role: "admin" },
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Full line                                                       */
  /* ---------------------------------------------------------------- */
  it("full line: order_item.status=cancelled and commission.status=cancelled", async () => {
    const { oi, commission } = seed();

    await call([{ order_item_id: "oi-1", quantity: 3 }]);

    expect(oi.refunded_quantity).toBe(3);
    expect(oi.refunded_amount).toBe(30000);
    expect(oi.status).toBe(OrderStatus.cancelled);
    expect(commission.status).toBe(CommissionStatus.cancelled);
  });

  /* ---------------------------------------------------------------- */
  /*  Shipping refunded only when the vendor_order is emptied         */
  /* ---------------------------------------------------------------- */
  it("adds vendor_order shipping_cost to the refund when the cancel empties the vendor_order", async () => {
    seed();

    await call([{ order_item_id: "oi-1", quantity: 3 }]);

    // items refund 30000 + shipping 2000 = 32000
    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 32000 }),
    );
    expect(cancellationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ refund_amount: 32000, currency: "AED" }),
    );
    // emptied vendor_order flipped to cancelled
    expect(vendorOrderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vo-1", status: OrderStatus.cancelled }),
    );
  });

  it("does NOT add shipping when the vendor_order still has surviving items", async () => {
    seed();

    await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10000 }),
    );
    expect(vendorOrderRepo.save).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  Stage gate                                                      */
  /* ---------------------------------------------------------------- */
  it("throws BadRequestError when the item's vendor_order is past ready_to_ship (shipped)", async () => {
    seed({ vo: { status: OrderStatus.shipped } });

    await expect(call([{ order_item_id: "oi-1", quantity: 1 }])).rejects.toThrow();
    expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  Quantity cap                                                    */
  /* ---------------------------------------------------------------- */
  it("throws when cancelQty exceeds (quantity - refunded_quantity)", async () => {
    seed({ oi: { quantity: 3, refunded_quantity: 2 } }); // remaining = 1

    await expect(call([{ order_item_id: "oi-1", quantity: 2 }])).rejects.toThrow();
    expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  COD                                                             */
  /* ---------------------------------------------------------------- */
  it("COD: no gateway refund call, refund_method=cod_uncollected, order.refund_total still bumped", async () => {
    const { order } = seed({ payment: { gateway: "cod", status: "pending" } });

    await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
    expect(cancellationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ refund_method: "cod_uncollected", gateway_refund_id: null }),
    );
    expect(order.refund_total).toBe(10000);
    expect(orderRepo.save).toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  Prepaid refund args                                             */
  /* ---------------------------------------------------------------- */
  it("prepaid: calls refundService once with referenceType item_cancellation and referenceId === saved row id", async () => {
    seed();

    const result = await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(refundService.refundToOriginalPayment).toHaveBeenCalledTimes(1);
    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith({
      orderId: "order-1",
      amount: 10000,
      referenceType: "item_cancellation",
      referenceId: result.id,
      reason: "requested_by_customer",
    });
    expect(result.refund_method).toBe("stripe");
    expect(result.gateway_refund_id).toBe("re_1");
  });

  /* ---------------------------------------------------------------- */
  /*  Idempotent prepaid refund — resume a pre-persisted pending row  */
  /* ---------------------------------------------------------------- */
  it("resume: reuses an existing pending cancellation id (no second refund, no new pending row)", async () => {
    seed();
    // A prior attempt persisted a pending row + moved the money, then the
    // finalize tx failed. The admin retries: find surfaces that open row.
    cancellationRepo.find.mockResolvedValue([
      {
        id: "canc-existing",
        order_id: "order-1",
        status: "pending",
        refund_method: "stripe",
        gateway_refund_id: null,
        items: [
          { order_item_id: "oi-1", vendor_order_id: "vo-1", quantity: 1, refund_amount: 10000 },
        ],
      },
    ]);

    const result = await call([{ order_item_id: "oi-1", quantity: 1 }]);

    // Same id → identical Stripe idempotency key → Stripe returns the original
    // refund, never a second one.
    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: "canc-existing" }),
    );
    expect(result.id).toBe("canc-existing");
    // No fresh pending row minted on resume.
    expect(cancellationRepo.create).not.toHaveBeenCalled();
    // Finalized in place to completed.
    expect(cancellationRepo.update).toHaveBeenCalledWith(
      "canc-existing",
      expect.objectContaining({ status: "completed", gateway_refund_id: "re_1" }),
    );
  });

  it("resume only when the pending item-set matches: a different set mints a fresh id", async () => {
    seed({ oi: { quantity: 3, refunded_quantity: 0 } });
    // Open pending row is for a DIFFERENT quantity than this request.
    cancellationRepo.find.mockResolvedValue([
      {
        id: "canc-other",
        order_id: "order-1",
        status: "pending",
        items: [
          { order_item_id: "oi-1", vendor_order_id: "vo-1", quantity: 2, refund_amount: 20000 },
        ],
      },
    ]);

    const result = await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(result.id).not.toBe("canc-other");
    expect(cancellationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" }),
    );
    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: result.id }),
    );
  });

  it("resume: two distinct pending rows on the same order — matches request against the SECOND row's item-set, reuses its id, no double refund", async () => {
    seed({ oi: { quantity: 3, refunded_quantity: 0 } });
    // Two prior cancellations on this order both had their finalize tx fail
    // after Stripe succeeded, leaving TWO `pending` rows with different
    // item-sets. A `find` (not `findOne`) must surface both, and the request
    // must be matched against the one whose item-set actually matches — here
    // the SECOND row — not an arbitrary one.
    cancellationRepo.find.mockResolvedValue([
      {
        id: "canc-first",
        order_id: "order-1",
        status: "pending",
        items: [
          { order_item_id: "oi-1", vendor_order_id: "vo-1", quantity: 1, refund_amount: 10000 },
        ],
      },
      {
        id: "canc-second",
        order_id: "order-1",
        status: "pending",
        items: [
          { order_item_id: "oi-1", vendor_order_id: "vo-1", quantity: 2, refund_amount: 20000 },
        ],
      },
    ]);

    const result = await call([{ order_item_id: "oi-1", quantity: 2 }]);

    // Reuses the SECOND row's id — same Stripe idempotency key, no second
    // refund minted for an already-refunded item-set.
    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: "canc-second" }),
    );
    expect(result.id).toBe("canc-second");
    // No fresh pending row inserted — an existing row was resumed.
    expect(cancellationRepo.create).not.toHaveBeenCalled();
    expect(cancellationRepo.update).toHaveBeenCalledWith(
      "canc-second",
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("fresh: no pending row → new id, pre-persists a pending row, finalizes to completed", async () => {
    seed(); // cancellationRepo.findOne defaults to null (no open pending)

    const result = await call([{ order_item_id: "oi-1", quantity: 1 }]);

    // Pending row written BEFORE the refund…
    expect(cancellationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", refund_amount: 10000, gateway_refund_id: null }),
    );
    expect(cancellationRepo.save).toHaveBeenCalled();
    // …then finalized to completed with the gateway id.
    expect(cancellationRepo.update).toHaveBeenCalledWith(
      result.id,
      expect.objectContaining({ status: "completed", gateway_refund_id: "re_1" }),
    );
    expect(result.status).toBe("completed");
    expect(result.refund_method).toBe("stripe");
  });

  /* ---------------------------------------------------------------- */
  /*  Inventory release + movement                                    */
  /* ---------------------------------------------------------------- */
  it("releases reservation and writes an oos_cancellation InventoryMovement", async () => {
    const { inventory } = seed();

    const result = await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(inventory.quantity_reserved).toBe(4); // 5 - 1
    expect(inventoryRepo.save).toHaveBeenCalled();
    expect(inventoryMovementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        movement_type: "oos_cancellation",
        reference_type: "order_item_cancellation",
        reference_id: result.id,
        quantity: 1,
        quantity_before: 8,
        quantity_after: 8,
      }),
    );
    expect(inventoryMovementRepo.save).toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  Receipt invalidation (Task 8)                                   */
  /* ---------------------------------------------------------------- */
  it("clears the stored receipt so the next download regenerates", async () => {
    const { order } = seed({
      order: {
        invoice_s3_key: "receipts/order-1.pdf",
        invoice_generated_at: new Date("2026-01-01"),
      },
    });

    await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(order.invoice_s3_key).toBeNull();
    expect(order.invoice_generated_at).toBeNull();
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_s3_key: null, invoice_generated_at: null }),
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Master order status                                             */
  /* ---------------------------------------------------------------- */
  it("some items remain => master transitions to partially_refunded", async () => {
    seed();
    await call([{ order_item_id: "oi-1", quantity: 1 }]);
    expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.partially_refunded,
      { userId: "admin-1", role: "admin" },
    );
  });

  it("all items gone => master transitions to cancelled", async () => {
    seed();
    await call([{ order_item_id: "oi-1", quantity: 3 }]);
    expect(orderStatusService.transitionOrder).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.cancelled,
      { userId: "admin-1", role: "admin" },
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Event                                                           */
  /* ---------------------------------------------------------------- */
  it("enqueues order.items_cancelled after success", async () => {
    seed();
    const result = await call([{ order_item_id: "oi-1", quantity: 1 }]);
    expect(orderEventQueue.add).toHaveBeenCalledWith(
      "order.items_cancelled",
      expect.objectContaining({
        type: "order.items_cancelled",
        orderId: "order-1",
        cancellationId: result.id,
        userId: "admin-1",
      }),
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Commission locked                                               */
  /* ---------------------------------------------------------------- */
  it("throws ITEM_CANCEL_COMMISSION_LOCKED when a commission is disputed, before moving money", async () => {
    seed({ commission: { status: CommissionStatus.disputed } });

    await expect(call([{ order_item_id: "oi-1", quantity: 1 }])).rejects.toThrow(
      "ITEM_CANCEL_COMMISSION_LOCKED",
    );
    expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
    expect(orderItemRepo.save).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- */
  /*  Clawback on cancellation (Task 10)                              */
  /* ---------------------------------------------------------------- */
  it("no longer blocks cancelling an item whose commission was already paid", async () => {
    seed({
      commission: { status: CommissionStatus.paid, vendor_id: "v1", vendor_earning: 8_950 },
    });

    await expect(call([{ order_item_id: "oi-1", quantity: 1 }])).resolves.toBeDefined();
  });

  it("writes a negative adjustment for the paid portion (full cancellation claws back the whole earning)", async () => {
    // Full-line cancellation (qty 3 of 3) drives the surviving amount to 0,
    // so the proportional clawback (C2) collapses to the whole earning —
    // exercised separately below with a partial cancellation.
    seed({
      commission: { status: CommissionStatus.paid, vendor_id: "v1", vendor_earning: 8_950 },
    });

    await call([{ order_item_id: "oi-1", quantity: 3 }]);

    expect(vendorPayoutAdjustmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        amount_fils: -8_950,
        source_type: "item_cancellation",
      }),
    );
  });

  it("C2: a partial cancellation claws back only the proportional share of a paid commission's earning", async () => {
    // 3-unit line, line_total 30_000, commission_rate 10% — the same figures
    // as the C2 finding's example: vendor_earning 25_571 on the full line.
    seed({
      commission: {
        status: CommissionStatus.paid,
        vendor_id: "v1",
        vendor_earning: 25_571,
        commission_type: "percentage",
        commission_rate: 10,
      },
    });

    // Cancel 1 of 3 units: refund 10_000, surviving line_total 20_000.
    await call([{ order_item_id: "oi-1", quantity: 1 }]);

    // netExVat(20_000) = round(20000/1.05) = 19_048
    // commission = round(19048*0.10) = 1_905; tax = round(1905*0.05) = 95
    // surviving vendor_earning = 19048 - 1905 - 95 = 17_048
    // clawback = 25_571 - 17_048 = 8_523 (NOT the full 25_571)
    expect(vendorPayoutAdjustmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_id: "v1",
        amount_fils: -8_523,
        source_type: "item_cancellation",
      }),
    );
  });

  it("still hard-fails for a disputed commission", async () => {
    seed({ commission: { status: CommissionStatus.disputed } });

    await expect(call([{ order_item_id: "oi-1", quantity: 1 }])).rejects.toThrow(
      "ITEM_CANCEL_COMMISSION_LOCKED",
    );
  });

  it("releases a draft claim before recomputing", async () => {
    const { commission } = seed({
      commission: { status: CommissionStatus.pending, payout_id: "draft-1" },
    });

    await call([{ order_item_id: "oi-1", quantity: 1 }]);

    expect(commission.payout_id).toBeNull();
  });

  /* ---------------------------------------------------------------- */
  /*  Flash deal decrement (optional dependency)                      */
  /* ---------------------------------------------------------------- */
  it("decrements the flash deal counter when the item snapshot carries a flash_deal_id", async () => {
    seed({ oi: { product_snapshot: { flash_deal_id: "deal-1" } } });

    await call([{ order_item_id: "oi-1", quantity: 2 }]);

    expect(flashDealApplicator.decrement).toHaveBeenCalledWith(expect.anything(), "deal-1", 2);
  });

  /* ---------------------------------------------------------------- */
  /*  Validation                                                      */
  /* ---------------------------------------------------------------- */
  it("throws on empty reason", async () => {
    seed();
    await expect(call([{ order_item_id: "oi-1", quantity: 1 }], "   ")).rejects.toThrow();
  });

  it("throws on empty items list", async () => {
    seed();
    await expect(call([])).rejects.toThrow();
  });

  it("throws on duplicate order_item_id", async () => {
    seed();
    await expect(
      call([
        { order_item_id: "oi-1", quantity: 1 },
        { order_item_id: "oi-1", quantity: 1 },
      ]),
    ).rejects.toThrow();
  });

  it("throws when an item does not belong to the order", async () => {
    seed();
    await expect(call([{ order_item_id: "oi-nope", quantity: 1 }])).rejects.toThrow();
  });

  /* ---------------------------------------------------------------- */
  /*  Carrier COD effects (Task 12)                                   */
  /* ---------------------------------------------------------------- */
  describe("carrier COD effects", () => {
    let shipmentRepo: any;
    let accountRepo: any;
    let carrierVendorRepo: any;
    let warehouseRepo: any;
    let carrierUserRepo: any;
    let encryption: any;
    let adapter: any;
    let registry: any;
    let carrierService: OrderItemCancellationService;

    const bookedShipment = {
      id: "ship-1",
      vendor_order_id: "vo-1",
      vendor_id: "v1",
      carrier: "postaplus",
      tracking_number: "PP123",
      external_shipment_id: "AWB-1",
    };

    beforeEach(() => {
      adapter = {
        amendCodAmount: mock(() => Promise.resolve()),
        cancelShipment: mock(() => Promise.resolve({ ok: true })),
      };
      registry = { get: mock(() => adapter) };
      shipmentRepo = makeRepo();
      shipmentRepo.findOne.mockResolvedValue(bookedShipment);
      accountRepo = makeRepo();
      accountRepo.findOne.mockResolvedValue({
        id: "acct-1",
        provider: { code: "postaplus", is_active: true },
        is_active: true,
        is_verified: true,
        credentials_encrypted: "enc",
      });
      accountRepo.find.mockResolvedValue([
        {
          id: "acct-1",
          provider: { code: "postaplus", is_active: true },
          is_active: true,
          is_verified: true,
          credentials_encrypted: "enc",
        },
      ]);
      carrierVendorRepo = makeRepo();
      carrierVendorRepo.findOne.mockResolvedValue({ id: "v1", default_shipping_account_id: null });
      warehouseRepo = makeRepo();
      warehouseRepo.findOne.mockResolvedValue({
        name: "WH",
        contact_phone: "+9715",
        city: "Dubai",
        emirate: "Dubai",
        country_code: "AE",
        operating_hours: { postaplus: { city_code: "DXB" } },
        is_active: true,
      });
      encryption = { decryptObject: mock(() => ({ PartnerKey: "k" })) };
      carrierUserRepo = makeRepo();
      carrierUserRepo.findOne.mockResolvedValue({ id: "user-1", email: "user1@example.com" });

      carrierService = new OrderItemCancellationService(
        orderRepo,
        vendorOrderRepo,
        orderItemRepo,
        commissionRepo,
        inventoryRepo,
        inventoryMovementRepo,
        paymentRepo,
        cancellationRepo,
        refundService,
        orderStatusService,
        orderEventQueue,
        commissionReversalService,
        flashDealApplicator,
        {
          shipmentRepo,
          registry,
          accountRepo,
          vendorRepo: carrierVendorRepo,
          warehouseRepo,
          encryption,
          userRepo: carrierUserRepo,
        },
      );
    });

    const codCall = (items: any[]) =>
      carrierService.cancelItems("order-1", "admin-1", { reason: "out of stock", items });

    it("COD partial cancel on a booked postaplus shipment amends COD by originalCod - refund_total", async () => {
      const { order } = seed({
        payment: { gateway: "cod", status: "pending", amount: 32000 },
        // shipping_address snapshot has NO email — must be backfilled from the
        // ordering user (carrierUserRepo mock resolves user1@example.com).
        order: { refund_total: 0, shipping_address: { name: "Al", city: "Dubai" } },
      });

      await codCall([{ order_item_id: "oi-1", quantity: 1 }]);

      expect(adapter.amendCodAmount).toHaveBeenCalledTimes(1);
      const [params] = adapter.amendCodAmount.mock.calls[0];
      // originalCod 32000 - refund_total (now 10000 after this cancel) = 22000
      expect(params.codAmountFils).toBe(22000);
      expect(params.airWaybill).toBe("AWB-1");
      expect(adapter.cancelShipment).not.toHaveBeenCalled();

      // Backfilled consignee email — the raw snapshot has none.
      expect(params.shippingAddress.email).toBe("user1@example.com");
      expect(carrierUserRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: order.user_id } }),
      );
      // The original snapshot object must not be mutated in place.
      expect((order as any).shipping_address.email).toBeUndefined();
    });

    it("COD emptied vendor_order cancels the booked shipment (no amend)", async () => {
      seed({
        payment: { gateway: "cod", status: "pending", amount: 32000 },
        order: { refund_total: 0, shipping_address: { name: "Al", city: "Dubai" } },
      });

      await codCall([{ order_item_id: "oi-1", quantity: 3 }]);

      expect(adapter.cancelShipment).toHaveBeenCalledTimes(1);
      const [params] = adapter.cancelShipment.mock.calls[0];
      expect(params.trackingNumber).toBe("AWB-1");
      expect(adapter.amendCodAmount).not.toHaveBeenCalled();
    });

    it("carrier adapter throw does NOT propagate (best-effort) and records booking_error", async () => {
      seed({
        payment: { gateway: "cod", status: "pending", amount: 32000 },
        order: { refund_total: 0, shipping_address: { name: "Al", city: "Dubai" } },
      });
      adapter.amendCodAmount.mockRejectedValue(new Error("carrier down"));

      const result = await codCall([{ order_item_id: "oi-1", quantity: 1 }]);

      expect(result.id).toBeDefined();
      expect(vendorOrderRepo.update).toHaveBeenCalledWith(
        "vo-1",
        expect.objectContaining({ booking_error: expect.stringContaining("carrier down") }),
      );
    });

    it("prepaid (stripe) path calls neither carrier method", async () => {
      seed({ order: { shipping_address: { name: "Al", city: "Dubai" } } });

      await codCall([{ order_item_id: "oi-1", quantity: 1 }]);

      expect(adapter.amendCodAmount).not.toHaveBeenCalled();
      expect(adapter.cancelShipment).not.toHaveBeenCalled();
    });

    it("no carrier effect when the shipment is not booked", async () => {
      seed({ payment: { gateway: "cod", status: "pending", amount: 32000 } });
      shipmentRepo.findOne.mockResolvedValue(null);

      await codCall([{ order_item_id: "oi-1", quantity: 1 }]);

      expect(adapter.amendCodAmount).not.toHaveBeenCalled();
      expect(adapter.cancelShipment).not.toHaveBeenCalled();
    });

    it("skips non-postaplus carriers", async () => {
      seed({ payment: { gateway: "cod", status: "pending", amount: 32000 } });
      shipmentRepo.findOne.mockResolvedValue({ ...bookedShipment, carrier: "aramex" });

      await codCall([{ order_item_id: "oi-1", quantity: 1 }]);

      expect(adapter.amendCodAmount).not.toHaveBeenCalled();
      expect(adapter.cancelShipment).not.toHaveBeenCalled();
    });
  });

  it("no carrierDeps: COD cancel runs no carrier calls (existing behaviour intact)", async () => {
    const { order } = seed({ payment: { gateway: "cod", status: "pending", amount: 32000 } });
    // service built without carrierDeps in the outer beforeEach
    await call([{ order_item_id: "oi-1", quantity: 1 }]);
    expect(order.refund_total).toBe(10000);
  });
});
