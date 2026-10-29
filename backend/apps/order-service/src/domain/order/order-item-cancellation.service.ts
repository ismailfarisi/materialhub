// order-item-cancellation.service.ts
//
// Admin item-level order cancellation. Refunds a slice of an order (one or more
// order_items, partial or full quantity), releases their inventory reservation,
// voids/recomputes the vendor commission, and transitions the master order to
// `partially_refunded` or `cancelled`.
//
// Ordering mirrors ReturnService / PayoutService: move the money FIRST (the
// gateway refund is a network call that must not sit inside a DB transaction),
// then do the DB bookkeeping atomically, then transition the master order via
// OrderStatusService (which opens its OWN transaction — nesting it inside ours
// would risk a self-deadlock on the rows it re-locks).
import type {
  Commission,
  Inventory,
  InventoryMovement,
  Order,
  OrderItem,
  OrderItemCancellation,
  OrderStatusHistory,
  Payment,
  Shipment,
  User,
  Vendor,
  VendorCarrierAccount,
  VendorOrder,
} from "@materialhub/database";
import { CommissionStatus, OrderStatus } from "@materialhub/database/src/enums.ts";
import { BadRequestError, HttpError, NotFoundError } from "@materialhub/plugins";
import type { EncryptionService } from "@materialhub/utils";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";
import type { CommissionReversalService } from "../commission/commission-reversal.service.ts";
import {
  resolveOriginWarehouse,
  resolveShippingAccount,
  warehouseToCarrierAddress,
} from "../shipment/auto-shipment.job.ts";
import type { ShippingProviderRegistry } from "../shipment/shipping-provider-adapter.ts";
import { computeItemRefund } from "./item-cancellation-calc.ts";
import type { OrderStatusService } from "./order-status.service.ts";

// Mirrors OrderItemCancellation.items — the entity's exported interface is not
// re-exported from the @materialhub/database barrel, so keep a local shape.
interface CancelledItemSnapshot {
  order_item_id: string;
  vendor_order_id: string;
  quantity: number;
  refund_amount: number;
}

interface RefundServiceLike {
  refundToOriginalPayment(input: {
    orderId: string;
    amount: number;
    referenceType: "return" | "dispute" | "order_cancellation" | "item_cancellation";
    referenceId: string;
    reason?: string;
  }): Promise<{ gateway: string; gatewayRefundId: string; amount: number }>;
}

interface FlashDealApplicatorLike {
  decrement(tx: unknown, dealId: string, qty: number): Promise<void>;
}

// Optional carrier-effects bundle. When absent, no COD carrier correction runs
// (existing callers/tests that don't wire it keep the pure-bookkeeping behaviour).
// Added as ONE optional trailing constructor arg so the Task-5 positional wiring
// upstream of it is untouched.
export interface CarrierDeps {
  shipmentRepo: Repository<Shipment>;
  registry: ShippingProviderRegistry;
  accountRepo: Repository<VendorCarrierAccount>;
  vendorRepo: Repository<Vendor>;
  warehouseRepo: Repository<any>;
  encryption: EncryptionService;
  userRepo: Repository<User>;
}

export interface CancelItemsInput {
  reason: string;
  items: Array<{ order_item_id: string; quantity: number }>;
}

// Vendor-order stages at which an item may still be pulled out of fulfilment.
// Anything shipped/delivered/cancelled is out of scope for this admin action.
const CANCELLABLE_STAGES = new Set<OrderStatus>([
  OrderStatus.confirmed,
  OrderStatus.processing,
  OrderStatus.ready_to_ship,
]);

export class OrderItemCancellationService {
  constructor(
    private orderRepo: Repository<Order>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private orderItemRepo: Repository<OrderItem>,
    private commissionRepo: Repository<Commission>,
    private inventoryRepo: Repository<Inventory>,
    private inventoryMovementRepo: Repository<InventoryMovement>,
    private paymentRepo: Repository<Payment>,
    private cancellationRepo: Repository<OrderItemCancellation>,
    private refundService: RefundServiceLike,
    private orderStatusService: OrderStatusService,
    private orderEventQueue: Queue,
    private commissionReversalService: CommissionReversalService,
    private flashDealApplicator?: FlashDealApplicatorLike,
    private carrierDeps?: CarrierDeps,
  ) {}

  async cancelItems(
    orderId: string,
    adminId: string,
    input: CancelItemsInput,
  ): Promise<OrderItemCancellation> {
    /* -------------------------------------------------------------- */
    /*  1. Validate the request shape                                 */
    /* -------------------------------------------------------------- */
    const reason = (input.reason ?? "").trim();
    if (!reason) throw new BadRequestError("Cancellation reason is required");
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError("At least one item is required");
    }
    const seenIds = new Set<string>();
    for (const it of input.items) {
      if (seenIds.has(it.order_item_id)) {
        throw new BadRequestError(`Duplicate order_item_id: ${it.order_item_id}`);
      }
      seenIds.add(it.order_item_id);
    }

    /* -------------------------------------------------------------- */
    /*  2. Load the order graph                                       */
    /* -------------------------------------------------------------- */
    const order = await this.orderRepo.findOne({ where: { id: orderId } as any });
    if (!order) throw new NotFoundError("Order not found");

    const allItems = await this.orderItemRepo.find({ where: { order_id: orderId } as any });
    const itemById = new Map(allItems.map((oi) => [(oi as any).id as string, oi]));

    const vendorOrders = await this.vendorOrderRepo.find({
      where: { order_id: orderId } as any,
    });
    const voById = new Map(vendorOrders.map((vo) => [(vo as any).id as string, vo]));

    /* -------------------------------------------------------------- */
    /*  3. Validate each requested line + build the cancel plan       */
    /* -------------------------------------------------------------- */
    interface PlanEntry {
      oi: OrderItem;
      commission: Commission | null;
      cancelQty: number;
      itemRefund: number;
    }
    const plan: PlanEntry[] = [];

    for (const it of input.items) {
      const oi = itemById.get(it.order_item_id);
      if (!oi || (oi as any).order_id !== orderId) {
        throw new BadRequestError(`Order item ${it.order_item_id} does not belong to this order`);
      }

      const vo = voById.get((oi as any).vendor_order_id);
      if (!vo || !CANCELLABLE_STAGES.has((vo as any).status)) {
        throw new BadRequestError(
          `Item ${it.order_item_id} can no longer be cancelled at its current fulfilment stage`,
        );
      }

      const remaining = (oi as any).quantity - (oi as any).refunded_quantity;
      if (it.quantity < 1 || it.quantity > remaining) {
        throw new BadRequestError(
          `Cancel quantity ${it.quantity} for item ${it.order_item_id} must be between 1 and ${remaining}`,
        );
      }

      // Commission gate — checked BEFORE any money moves so a genuinely
      // un-handleable commission fails loudly instead of the refund running
      // ahead of it. `disputed` is the only state with no defined resolution:
      // the dispute is unresolved, so there is no correct answer yet. Every
      // other state (held/pending, a pending row claimed by an unapproved
      // draft, or paid) is handled by `CommissionReversalService` in the
      // apply step below — held/pending recomputes in place, a claimed draft
      // is released first, and paid claws the money back through the signed
      // adjustment ledger instead of mutating an immutable paid row.
      const BLOCKING_COMMISSION_STATUSES = new Set<CommissionStatus>([CommissionStatus.disputed]);
      const commission = await this.commissionRepo.findOne({
        where: { order_item_id: (oi as any).id } as any,
      });
      if (commission && BLOCKING_COMMISSION_STATUSES.has((commission as any).status)) {
        throw new HttpError(
          400,
          `ITEM_CANCEL_COMMISSION_LOCKED: commission for order item ${it.order_item_id} is ${(commission as any).status} and cannot be cancelled`,
          "ITEM_CANCEL_COMMISSION_LOCKED",
        );
      }

      const itemRefund = computeItemRefund(
        (oi as any).line_total,
        (oi as any).quantity,
        it.quantity,
      );
      plan.push({ oi, commission, cancelQty: it.quantity, itemRefund });
    }

    /* -------------------------------------------------------------- */
    /*  4. Compute refund total (items + emptied-vendor shipping)     */
    /* -------------------------------------------------------------- */
    const itemsRefund = plan.reduce((sum, p) => sum + p.itemRefund, 0);

    // Post-cancellation refunded-quantity for EVERY item in the order — drives
    // both the emptied-vendor_order test and the master-status decision.
    const postRefundedQty = new Map<string, number>();
    for (const oi of allItems) {
      postRefundedQty.set((oi as any).id, (oi as any).refunded_quantity);
    }
    for (const p of plan) {
      const id = (p.oi as any).id as string;
      postRefundedQty.set(id, (postRefundedQty.get(id) ?? 0) + p.cancelQty);
    }
    const isFullyGone = (oi: OrderItem) =>
      (postRefundedQty.get((oi as any).id) ?? 0) >= (oi as any).quantity;

    const itemsByVo = new Map<string, OrderItem[]>();
    for (const oi of allItems) {
      const vid = (oi as any).vendor_order_id as string;
      const arr = itemsByVo.get(vid) ?? [];
      arr.push(oi);
      itemsByVo.set(vid, arr);
    }

    const affectedVoIds = new Set(plan.map((p) => (p.oi as any).vendor_order_id as string));
    const emptiedVoIds = new Set<string>();
    let shippingRefund = 0;
    for (const voId of affectedVoIds) {
      const voItems = itemsByVo.get(voId) ?? [];
      if (voItems.length > 0 && voItems.every(isFullyGone)) {
        emptiedVoIds.add(voId);
        shippingRefund += Number((voById.get(voId) as any)?.shipping_cost ?? 0);
      }
    }

    const totalRefund = itemsRefund + shippingRefund;

    const masterAllGone = allItems.length > 0 && allItems.every(isFullyGone);
    const masterStatus = masterAllGone ? OrderStatus.cancelled : OrderStatus.partially_refunded;

    /* -------------------------------------------------------------- */
    /*  5. Resolve payment gateway                                     */
    /* -------------------------------------------------------------- */
    const payment = await this.paymentRepo.findOne({
      where: { order_id: orderId } as any,
      order: { created_at: "DESC" } as any,
    });
    const isCod = (payment as any)?.gateway === "cod";
    // COD money was never captured up-front — nothing to refund to a gateway;
    // we simply reduce the collectable by marking the items refunded.
    const refundMethod = isCod ? "cod_uncollected" : "stripe";

    // The cancelled-items snapshot — built here (not inside the tx) because both
    // the pre-persisted pending row AND the resume-match need it.
    const items: CancelledItemSnapshot[] = plan.map((p) => ({
      order_item_id: (p.oi as any).id,
      vendor_order_id: (p.oi as any).vendor_order_id,
      quantity: p.cancelQty,
      refund_amount: p.itemRefund,
    }));

    /* -------------------------------------------------------------- */
    /*  5b. Idempotency guard: resume-or-persist the cancellation id   */
    /* -------------------------------------------------------------- */
    // If a prior attempt already moved the money but its finalize tx failed, an
    // unfinalized `pending` row for this exact item-set is still on disk. Reuse
    // its id so the Stripe idempotency key (`refund:item_cancellation:<id>`) is
    // identical and Stripe returns the ORIGINAL refund instead of a second one.
    // Otherwise mint a fresh id and commit a `pending` row BEFORE moving money —
    // so any later retry can find and resume it. A successful cancel finalizes
    // the row to `completed`, so a genuinely separate later cancel of the same
    // items never false-matches (find only surfaces `pending` rows).
    //
    // There can be MORE THAN ONE `pending` row for this order at once — e.g. two
    // distinct cancellations whose finalize txs both failed after their Stripe
    // refunds succeeded. A single findOne would return an arbitrary one of them,
    // and matching this request's items against the WRONG row would mint a
    // fresh id and refund the same item-set a second time. So load ALL pending
    // rows for the order and match against each until the right one is found.
    const requestedQtyById = new Map(items.map((i) => [i.order_item_id, i.quantity]));
    const pendingRows = await this.cancellationRepo.find({
      where: { order_id: orderId, status: "pending" } as any,
    });
    const resumable = (pendingRows ?? []).find((row) =>
      this.itemsMatch((row as any).items, requestedQtyById),
    );
    let cancellationId: string;
    if (resumable) {
      cancellationId = (resumable as any).id as string;
    } else {
      cancellationId = crypto.randomUUID();
      const pending = this.cancellationRepo.create({
        id: cancellationId,
        order_id: orderId,
        admin_id: adminId,
        reason,
        refund_amount: totalRefund,
        refund_method: refundMethod,
        gateway_refund_id: null,
        currency: (order as any).currency ?? "AED",
        status: "pending",
        items,
      } as any);
      await this.cancellationRepo.save(pending);
    }

    /* -------------------------------------------------------------- */
    /*  6. Move the money FIRST (network call, outside the tx)         */
    /* -------------------------------------------------------------- */
    let gatewayRefundId: string | null = null;
    if (!isCod) {
      const result = await this.refundService.refundToOriginalPayment({
        orderId,
        amount: totalRefund,
        referenceType: "item_cancellation",
        referenceId: cancellationId,
        reason: "requested_by_customer",
      });
      gatewayRefundId = result.gatewayRefundId;
    }

    /* -------------------------------------------------------------- */
    /*  7. DB bookkeeping — atomic                                     */
    /* -------------------------------------------------------------- */
    const savedCancellation = await this.orderRepo.manager.transaction(async (tx) => {
      const oiRepo = tx.getRepository("OrderItem" as any) as Repository<OrderItem>;
      const commRepo = tx.getRepository("Commission" as any) as Repository<Commission>;
      const invRepo = tx.getRepository("Inventory" as any) as Repository<Inventory>;
      const movRepo = tx.getRepository("InventoryMovement" as any) as Repository<InventoryMovement>;
      const cancRepo = tx.getRepository(
        "OrderItemCancellation" as any,
      ) as Repository<OrderItemCancellation>;
      const ordRepo = tx.getRepository("Order" as any) as Repository<Order>;
      const voRepo = tx.getRepository("VendorOrder" as any) as Repository<VendorOrder>;
      const histRepo = tx.getRepository(
        "OrderStatusHistory" as any,
      ) as Repository<OrderStatusHistory>;

      for (const p of plan) {
        const oi = p.oi as any;

        // 7a. Bump the order_item refunded counters.
        oi.refunded_quantity += p.cancelQty;
        oi.refunded_amount += p.itemRefund;
        if (oi.refunded_quantity >= oi.quantity) {
          oi.status = OrderStatus.cancelled;
        }
        await oiRepo.save(oi);

        // 7b. Route the commission fate through the shared reversal service —
        // it already encodes the whole decision table: paid -> negative
        // ledger adjustment (row left untouched, immutable record of the
        // sale), a pending row claimed by an unapproved draft -> release the
        // claim then recompute, surviving qty <= 0 -> cancel, otherwise ->
        // recompute in place on the surviving quantity. It re-reads the order
        // item fresh from `tx`, which is safe here because it's read AFTER
        // the 7a save above persisted this item's bumped refunded counters.
        // Disputed commissions never reach here — the plan-phase guard above
        // hard-fails them first.
        if (p.commission) {
          await this.commissionReversalService.reverseForItems(tx, {
            items: [
              {
                orderItemId: oi.id,
                refundedQuantity: p.cancelQty,
                refundedAmount: p.itemRefund,
              },
            ],
            sourceType: "item_cancellation",
            sourceId: cancellationId,
            reason: `Item cancellation ${cancellationId}`,
          });
        }

        // 7c. Release the inventory reservation + audit trail.
        const where: any = { product_id: oi.product_id, vendor_id: oi.vendor_id };
        if (oi.variant_id) where.variant_id = oi.variant_id;
        const inv = (await invRepo.findOne({ where })) as any;
        if (inv) {
          const onHand = inv.quantity_on_hand;
          inv.quantity_reserved = Math.max(0, inv.quantity_reserved - p.cancelQty);
          await invRepo.save(inv);

          const movement = movRepo.create({
            inventory_id: inv.id,
            product_id: oi.product_id,
            variant_id: oi.variant_id ?? null,
            quantity: p.cancelQty,
            quantity_before: onHand,
            quantity_after: onHand, // reservation-only release, on-hand unchanged
            movement_type: "oos_cancellation",
            reference_type: "order_item_cancellation",
            reference_id: cancellationId,
          } as any);
          await movRepo.save(movement);
        }

        // 7d. Best-effort flash-deal counter decrement (optional dependency).
        const dealId = oi.product_snapshot?.flash_deal_id ?? null;
        if (dealId && this.flashDealApplicator) {
          try {
            await this.flashDealApplicator.decrement(tx, dealId, p.cancelQty);
          } catch (err) {
            console.error("[cancelItems] flash deal decrement failed (continuing)", {
              orderId,
              dealId,
              qty: p.cancelQty,
              error: String(err),
            });
          }
        }
      }

      // 7e. Finalize the pre-persisted cancellation row: flip it to `completed`
      // and stamp the gateway refund id. Keeping this in the SAME tx as the
      // bookkeeping means a `completed` row always implies the bookkeeping
      // committed — so a resumed retry (which only ever sees a `pending` row,
      // i.e. a tx that never committed) re-applies the bookkeeping exactly once.
      await cancRepo.update(
        cancellationId as any,
        {
          status: "completed",
          gateway_refund_id: gatewayRefundId,
        } as any,
      );
      const saved: OrderItemCancellation = {
        id: cancellationId,
        order_id: orderId,
        admin_id: adminId,
        reason,
        refund_amount: totalRefund,
        refund_method: refundMethod,
        gateway_refund_id: gatewayRefundId,
        currency: (order as any).currency ?? "AED",
        status: "completed",
        items,
      } as unknown as OrderItemCancellation;

      // 7f. Bump the order refund_total. The stored receipt is now stale
      // (totals/refund changed) — null it in the SAME transaction so a
      // `completed` cancellation always implies the receipt was invalidated.
      // The next download lazily regenerates a fresh PDF via
      // InvoiceService.resolveDownload.
      (order as any).refund_total = Number((order as any).refund_total ?? 0) + totalRefund;
      (order as any).invoice_s3_key = null;
      (order as any).invoice_generated_at = null;
      await ordRepo.save(order);

      // 7g. Flip emptied vendor_orders to cancelled + history row. Sub-order
      // status is set directly (as cancelOrder does) rather than routed through
      // transitionOrder.
      for (const voId of emptiedVoIds) {
        const vo = voById.get(voId) as any;
        if (!vo || vo.status === OrderStatus.cancelled) continue;
        const from = vo.status;
        vo.status = OrderStatus.cancelled;
        await voRepo.save(vo);

        const hist = histRepo.create({
          order_id: orderId,
          vendor_order_id: voId,
          from_status: from,
          to_status: OrderStatus.cancelled,
          changed_by: adminId,
          changed_by_role: "admin",
          is_customer_visible: true,
          comment: `Items cancelled by admin: ${reason}`,
          metadata: null,
        } as any);
        await histRepo.save(hist);
      }

      return saved;
    });

    /* -------------------------------------------------------------- */
    /*  8. Master-order status transition (own transaction)           */
    /* -------------------------------------------------------------- */
    await this.orderStatusService.transitionOrder(orderId, masterStatus, {
      userId: adminId,
      role: "admin",
    });

    /* -------------------------------------------------------------- */
    /*  8b. Correct the courier's COD collect amount (best-effort).    */
    /*  Only for cash-on-delivery: `order.refund_total` was already    */
    /*  bumped inside the tx above, so it reflects this cancel.        */
    /* -------------------------------------------------------------- */
    if (refundMethod === "cod_uncollected" && this.carrierDeps) {
      const originalCodFils = Number((payment as any)?.amount ?? 0);
      await this.applyCodCarrierEffects({
        order,
        affectedVoIds,
        emptiedVoIds,
        itemsByVo,
        voById,
        originalCodFils,
        reason,
      });
    }

    /* -------------------------------------------------------------- */
    /*  9. Emit the domain event AFTER everything succeeds            */
    /* -------------------------------------------------------------- */
    await this.orderEventQueue.add("order.items_cancelled", {
      type: "order.items_cancelled",
      orderId,
      cancellationId,
      userId: adminId,
      timestamp: new Date().toISOString(),
    });

    return savedCancellation;
  }

  // True when a pre-persisted pending row covers EXACTLY this request's
  // order_item_id→quantity set (same keys, same quantities). Used to decide
  // whether a retry may resume that row's id (and thus its Stripe refund) or
  // must mint a fresh one.
  private itemsMatch(
    existing: CancelledItemSnapshot[] | null | undefined,
    requested: Map<string, number>,
  ): boolean {
    if (!Array.isArray(existing) || existing.length !== requested.size) return false;
    for (const it of existing) {
      if (requested.get(it.order_item_id) !== it.quantity) return false;
    }
    return true;
  }

  /* ================================================================ */
  /*  Carrier COD correction (best-effort — never throws upward)      */
  /* ================================================================ */
  //
  // For each affected vendor sub-order that has a *booked* PostaPlus shipment,
  // reconcile the courier's cash-collect amount with the just-committed refund:
  //   - emptied sub-order  → cancel the shipment (nothing left to collect)
  //   - partial cancel     → amend COD to max(0, originalCod - order.refund_total)
  // A not-yet-booked shipment is skipped: `resolveCodAmountFils` already nets the
  // refund_total into the COD when the shipment books later. Every carrier call
  // is wrapped so a courier/API failure can NEVER roll back the committed
  // refund/commission bookkeeping — the reason is logged and stamped onto
  // `vendor_orders.booking_error` for the admin panel to surface.
  private async applyCodCarrierEffects(params: {
    order: Order;
    affectedVoIds: Set<string>;
    emptiedVoIds: Set<string>;
    itemsByVo: Map<string, OrderItem[]>;
    voById: Map<string, VendorOrder>;
    originalCodFils: number;
    reason: string;
  }): Promise<void> {
    const deps = this.carrierDeps;
    if (!deps) return;
    const { order, affectedVoIds, emptiedVoIds, itemsByVo, voById, originalCodFils, reason } =
      params;

    for (const voId of affectedVoIds) {
      try {
        const vendorOrder = voById.get(voId) as any;
        if (!vendorOrder) continue;

        const shipment = (await deps.shipmentRepo.findOne({
          where: { vendor_order_id: voId } as any,
        })) as any;
        const airWaybill = shipment?.external_shipment_id ?? shipment?.tracking_number ?? null;
        if (!shipment || !airWaybill) continue; // not booked — nothing to correct yet

        const carrier = String(shipment.carrier ?? "").toLowerCase();
        if (carrier !== "postaplus") {
          console.warn("[cancelItems] skipping carrier COD effect for non-postaplus shipment", {
            voId,
            carrier: shipment.carrier ?? null,
          });
          continue;
        }

        const adapter = deps.registry.get("postaplus");
        if (!adapter) {
          console.warn("[cancelItems] postaplus adapter not registered; skipping COD effect", {
            voId,
          });
          continue;
        }

        const creds = await this.resolveCarrierCreds(shipment.vendor_id);

        if (emptiedVoIds.has(voId)) {
          if (!adapter.cancelShipment) {
            console.warn("[cancelItems] adapter has no cancelShipment; skipping", { voId });
            continue;
          }
          await adapter.cancelShipment({ trackingNumber: airWaybill, reason }, creds);
        } else {
          if (!adapter.amendCodAmount) {
            console.warn("[cancelItems] adapter has no amendCodAmount; skipping", { voId });
            continue;
          }
          const originWarehouse = await resolveOriginWarehouse(
            deps.warehouseRepo,
            vendorOrder,
            shipment.vendor_id,
          );
          const shipperAddress = originWarehouse ? warehouseToCarrierAddress(originWarehouse) : {};
          // PostaPlus requires a consignee email; shipping_address snapshots
          // frequently lack one, so backfill from the ordering user's account
          // email — mirrors the same fallback in auto-shipment.job.ts's
          // resolveShipTo/bookShipment path. Copy the snapshot rather than
          // mutating `order.shipping_address` in place.
          const shippingAddress = {
            ...(((order as any).shipping_address ?? {}) as Record<string, unknown>),
          };
          if (!shippingAddress.email) {
            const orderUserEmail = (order as any).user?.email as string | undefined;
            if (orderUserEmail) {
              shippingAddress.email = orderUserEmail;
            } else {
              const user = await deps.userRepo.findOne({
                where: { id: (order as any).user_id } as any,
              });
              if ((user as any)?.email) {
                shippingAddress.email = (user as any).email;
              }
            }
          }
          const items = (itemsByVo.get(voId) ?? []).map((oi: any) => ({
            productName: oi.product_name,
            quantity: oi.quantity,
            weightGrams: 500,
          }));
          const newOrderCodFils = Math.max(
            0,
            originalCodFils - Number((order as any).refund_total ?? 0),
          );
          await adapter.amendCodAmount(
            { airWaybill, codAmountFils: newOrderCodFils, shipperAddress, shippingAddress, items },
            creds,
          );
        }
      } catch (err) {
        console.error("[cancelItems] carrier COD effect failed (continuing)", {
          orderId: (order as any).id,
          voId,
          error: String(err),
        });
        await this.recordCarrierFailure(voId, err);
      }
    }
  }

  // Mirrors AdminOrderCancellationService.resolveCarrierCredentials.
  private async resolveCarrierCreds(vendorId: string): Promise<Record<string, string>> {
    const deps = this.carrierDeps;
    if (!deps) throw new Error("carrierDeps not configured");
    const vendor = await deps.vendorRepo.findOne({ where: { id: vendorId } as any });
    const account = await resolveShippingAccount(deps.accountRepo, vendor as any);
    if (!account) throw new Error("No usable PostaPlus account found for COD amendment");
    if (account.provider?.code !== "postaplus") {
      throw new Error("Resolved carrier account is not PostaPlus");
    }
    return deps.encryption.decryptObject<Record<string, string>>(account.credentials_encrypted);
  }

  // Best-effort persistence of a carrier-side failure so the admin panel can
  // prompt a manual follow-up. Swallows its own errors — this must never throw.
  private async recordCarrierFailure(voId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await this.vendorOrderRepo.update(
        voId as any,
        {
          booking_error: `COD carrier update failed on cancellation: ${message}`,
        } as any,
      );
    } catch (persistErr) {
      console.error("[cancelItems] failed to persist carrier booking_error", {
        voId,
        error: String(persistErr),
      });
    }
  }
}
