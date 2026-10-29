import type { Inventory, Order, OrderItem } from "@materialhub/database";
import type { SiteSetting } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database";
import type { OrderStatusHistory } from "@materialhub/database";
import type { VendorHoliday } from "@materialhub/database";
import { CommissionStatus } from "@materialhub/database";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type { Queue } from "bullmq";
import { In, IsNull, Not, type Repository } from "typeorm";
import type { FlashDealApplicator } from "../checkout/flash-deal-applicator.service.ts";
import type { DraftInvalidator } from "../commission/commission-reversal.service.ts";
import type { CommissionService } from "../commission/commission.service.ts";
import { IntegrationEventType, emitIfEnabled } from "../integration/emit.ts";
import {
  publishOrderDeliveredForAffiliates,
  publishOrderPaidForAffiliates,
  publishOrderRefundedForAffiliates,
} from "./affiliate-commission-events.ts";
import { OrderAggregationService } from "./order-aggregation.service.ts";
import type { OrderStatusChangedEvent } from "./order-event.job.ts";
import { OrderStateMachine } from "./order-state-machine.ts";
import {
  publishOrderDeliveredForCommissions,
  publishOrderPaidForCommissions,
  publishOrderRefundedForCommissions,
} from "./reels-commission-events.ts";
import { publishOrderDeliveredForNudge } from "./reels-nudge-events.ts";

type Role = "buyer" | "vendor" | "admin" | "system";

interface Actor {
  userId: string;
  role: Role;
}

/**
 * R5-I2 — leaving `delivered` for one of these stops the settlement clock and
 * demotes the vendor_order's unclaimed commissions back to `held`.
 *
 * `partially_refunded` is deliberately ABSENT. It is reachable from
 * `delivered` via `ADMIN_BYPASS_TARGETS`, and demoting on it forfeited the
 * vendor's entire earning on the items the customer kept, with no path back:
 * nothing re-stamps `settle_after` for a vendor_order that is no longer
 * `delivered`, and the settlement job skips a null clock. Proportional
 * reversal is `CommissionReversalService`'s job.
 *
 * These two are the complete list, not a subset: `VENDOR_ORDER_TRANSITIONS`
 * has no edge at all out of `delivered`, so the only way a vendor_order leaves
 * it is `ADMIN_BYPASS_TARGETS` = {cancelled, delivered, partially_refunded,
 * refunded}. `disputed` / `refund_requested` are master-order statuses and are
 * unreachable here. Every listed status means the whole vendor order's money
 * went back, so the demotion below and the claim release that follows it apply
 * to exactly the same set — hence one set, not two.
 */
const UNDELIVERY_DEMOTION_TARGETS: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.refunded,
  OrderStatus.cancelled,
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `order_status_history.changed_by` is a `uuid` column (FK to users), but
 * system actors — the pending-order reaper, carrier webhooks, payment
 * webhooks — identify themselves as the literal string `"system"`. Writing
 * that straight through made Postgres reject the INSERT with
 * `invalid input syntax for type uuid: "system"`, which rolled back the whole
 * enclosing transaction: the order was never cancelled, its inventory was
 * never released, and its vendor sub-orders stayed `confirmed` — abandoned
 * checkouts sat in `pending_payment` forever while the reaper retried and
 * failed every 5 minutes.
 *
 * The acting party is already recorded in `changed_by_role`, so any actor id
 * that isn't a uuid is stored as NULL (the column is nullable).
 */
function historyActorId(userId: string | null | undefined): string | null {
  return userId && UUID_RE.test(userId) ? userId : null;
}

export class OrderStatusService {
  private stateMachine = new OrderStateMachine();
  private aggregation = new OrderAggregationService();

  constructor(
    private orderRepo: Repository<Order>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private historyRepo: Repository<OrderStatusHistory>,
    private vendorHolidayRepo: Repository<VendorHoliday>,
    private orderEventQueue: Queue,
    private integrationEventsQueue?: Queue,
    private siteSettingRepo?: Repository<SiteSetting>,
    private flashDealApplicator?: FlashDealApplicator,
    private inventoryRepo?: Repository<Inventory>,
    private commissionService?: CommissionService,
    // CRITICAL 1: the narrow surface needed to invalidate a draft whose
    // claim survives a cancel-voided commission (see cancelOrder below).
    // Optional and last so every pre-existing positional construction
    // (tests, and any caller not yet wired to a PayoutService) keeps
    // compiling unchanged; container.ts passes the real PayoutService,
    // which structurally satisfies this interface.
    private draftInvalidator?: DraftInvalidator,
  ) {}

  async transitionVendorOrder(
    vendorOrderId: string,
    toStatus: OrderStatus,
    actor: Actor,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<VendorOrder> {
    const txResult = await this.orderRepo.manager.transaction(async (tx) => {
      const voRepo = tx.getRepository("VendorOrder" as any) as Repository<VendorOrder>;
      const orderRepo = tx.getRepository("Order" as any) as Repository<Order>;
      const historyRepo = tx.getRepository(
        "OrderStatusHistory" as any,
      ) as Repository<OrderStatusHistory>;

      const vendorOrder = await voRepo.findOne({
        where: { id: vendorOrderId } as any,
        relations: ["order"],
      });
      if (!vendorOrder) throw new Error("Vendor order not found");

      // Verify vendor ownership when role is vendor
      if (actor.role === "vendor" && (vendorOrder as any).vendor_id !== actor.userId) {
        throw new Error("Vendor order not found");
      }

      const fromStatus = vendorOrder.status;
      const result = this.stateMachine.validateVendorTransition(fromStatus, toStatus, actor.role);
      if (result?.noop) {
        return {
          vendorOrder,
          parentOrderId: (vendorOrder as any).order_id as string,
          parentOrderStatus: undefined as string | undefined,
          parentUserId: undefined as string | undefined,
          fromStatus,
          toStatus,
          transitioned: false as const,
        };
      }

      // Set accepted_at when moving to processing
      if (fromStatus === OrderStatus.confirmed && toStatus === OrderStatus.processing) {
        (vendorOrder as any).accepted_at = new Date();
      }

      // Set rejected_at when rejecting
      if (toStatus === OrderStatus.cancelled && actor.role === "vendor") {
        (vendorOrder as any).rejected_at = new Date();
        (vendorOrder as any).rejection_reason = reason || null;
      }

      vendorOrder.status = toStatus;
      await voRepo.save(vendorOrder);

      // Delivery starts the settlement clock. Both writes live in this
      // transaction so a crash can never leave a delivered order with no
      // clock, or a clock with no delivery.
      const commissionRepo = tx.getRepository("Commission" as any) as Repository<any>;
      if (toStatus === OrderStatus.delivered) {
        if (!(vendorOrder as any).delivered_at) {
          (vendorOrder as any).delivered_at = new Date();
          await voRepo.save(vendorOrder);
        }
        if (!this.commissionService) {
          throw new Error(
            "OrderStatusService.commissionService is required to process a delivered transition",
          );
        }
        const days = await this.commissionService.getSettlementWindowDays(
          (vendorOrder as any).vendor_id,
        );
        const settleAfter = new Date(
          (vendorOrder as any).delivered_at.getTime() + days * 86_400_000,
        );
        await commissionRepo.update(
          { vendor_order_id: vendorOrderId, status: CommissionStatus.held } as any,
          { settle_after: settleAfter } as any,
        );
      } else if (
        fromStatus === OrderStatus.delivered &&
        UNDELIVERY_DEMOTION_TARGETS.has(toStatus)
      ) {
        // Un-delivered (returned / refunded after delivery, reopened, etc.).
        //
        // R5-I2: gated on the TARGET status, not merely on leaving
        // `delivered`. `ADMIN_BYPASS_TARGETS` (order-state-machine.ts) lets an
        // admin move a delivered vendor_order straight to
        // `partially_refunded`, and demoting there forfeited 100% of the
        // vendor's earning on the items the customer KEPT: nothing re-stamps
        // `settle_after` afterwards (the delivery branch above requires a
        // transition INTO `delivered`, and backfillCommissionsForOrder
        // requires `status === delivered`), and the settlement job requires
        // `settle_after IS NOT NULL` — so the row sits `held` with a null
        // clock, unpayable, with no admin action that repairs it short of
        // flipping the order back to `delivered`. Partial reversals are
        // CommissionReversalService's job; it recomputes the surviving
        // earning proportionally instead of zeroing it.
        //
        // R4-I2: clearing `settle_after` on `held` rows alone was a complete
        // no-op for any order un-delivered AFTER the window had already
        // elapsed — the settlement job had by then promoted the row to
        // `pending`, where `settle_after` is not consulted by anything and
        // the earning is fully payable. So the money kept flowing for goods
        // the customer had returned. Demote `pending` back to `held` as well
        // and null the clock, which puts the row back where the delivery
        // transition found it: unpayable until a real re-delivery re-stamps
        // it.
        //
        // Restricted to `payout_id IS NULL`. A row already claimed by a
        // draft is NOT quietly demoted here: releasing a claim is the
        // invalidation paths' job (they also decide what happens to the
        // draft and whether a clawback is owed), and mutating a claimed row
        // behind the draft's back is exactly the drift
        // `assertClaimedSetReconciles` has to catch. `cancelled` rows are
        // untouched — they are terminal.
        await commissionRepo.update(
          {
            vendor_order_id: vendorOrderId,
            status: In([CommissionStatus.held, CommissionStatus.pending]),
            payout_id: IsNull(),
          } as any,
          { status: CommissionStatus.held, settle_after: null } as any,
        );

        // R5-I3: the demotion above deliberately skips commissions a draft has
        // already claimed — but until now NOTHING else handled them on this
        // path either. `cancelOrder` routes its claimed rows through
        // `draftInvalidator`, and `CommissionReversalService` covers the
        // Return/Dispute flows; a bare admin `delivered -> refunded` on a
        // vendor_order went through neither. The claimed earning simply stayed
        // inside an approvable draft, and `assertClaimedSetReconciles` cannot
        // catch it: the commission's `status` and `vendor_earning` are both
        // unchanged, so the sum still matches and the transfer goes out for a
        // sale that was refunded.
        //
        // Guarded by the same set as the demotion above (see
        // UNDELIVERY_DEMOTION_TARGETS): every status that gets here means the
        // whole vendor order's money went back.
        if (this.draftInvalidator) {
          const staleClaims = await commissionRepo.find({
            where: { vendor_order_id: vendorOrderId, payout_id: Not(IsNull()) } as any,
          });
          const payoutIds = [...new Set(staleClaims.map((c: any) => c.payout_id as string))];
          for (const payoutId of payoutIds) {
            const result = await this.draftInvalidator.invalidateDraftForReversal(
              tx,
              payoutId,
              `Superseded by vendor order reversal (${vendorOrderId} -> ${toStatus})`,
            );
            if (result.invalidated) continue;

            // The claiming payout is already processing/paid/failed — the
            // money is gone or in flight, so it cannot be released. Same
            // shared sink cancelOrder uses: recordUnreleasableClaim decides
            // whether money actually left and skips a zero-fils row the
            // table's CHECK would reject.
            const affected = staleClaims.filter((c: any) => c.payout_id === payoutId);
            for (const commission of affected) {
              await this.draftInvalidator.recordUnreleasableClaim(tx, {
                commissionId: (commission as any).id ?? null,
                vendorId: (commission as any).vendor_id,
                payoutId,
                payoutStatus: result.payoutStatus,
                // Clamp at 0, mirroring cancelOrder: a legacy row with a
                // negative vendor_earning must not claw back money the vendor
                // was never paid.
                clawbackAmount: Math.max(0, (commission as any).vendor_earning || 0),
                sourceType: "order_cancellation",
                sourceId: (vendorOrder as any).order_id,
                reason: `Vendor order ${vendorOrderId} moved ${fromStatus} -> ${toStatus}${
                  reason ? `: ${reason}` : ""
                }`.slice(0, 255),
              });
            }
          }
        }
      }

      // Log history
      const historyEntry = historyRepo.create({
        order_id: (vendorOrder as any).order_id,
        vendor_order_id: vendorOrderId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: historyActorId(actor.userId),
        changed_by_role: actor.role,
        is_customer_visible: this.isCustomerVisible(toStatus, actor.role),
        comment: reason || null,
        metadata: metadata || null,
      } as any);
      await historyRepo.save(historyEntry);

      // Aggregate parent status
      const allVendorOrders = await voRepo.find({
        where: { order_id: (vendorOrder as any).order_id } as any,
      });
      const newParentStatus = this.aggregation.computeParentStatus(
        allVendorOrders.map((vo) => vo.status),
      );

      const order = await orderRepo.findOne({
        where: { id: (vendorOrder as any).order_id } as any,
      });
      let parentOrderStatus: string | undefined;
      if (order && order.status !== newParentStatus) {
        const parentFrom = order.status;
        order.status = newParentStatus;

        // COD cash is collected by the courier at delivery. That's the moment
        // the COD payment becomes "captured" — prepaid orders capture at the
        // payment webhook instead, so this only touches COD. Downstream refund
        // logic keys off this status to decide wallet-refund vs no-refund.
        if (newParentStatus === OrderStatus.delivered) {
          const paymentRepo = tx.getRepository("Payment" as any) as Repository<any>;
          const codPayment = await paymentRepo.findOne({
            where: { order_id: (order as any).id, gateway: "cod" } as any,
          });
          if (codPayment && (codPayment as any).status !== "captured") {
            (codPayment as any).status = "captured";
            (codPayment as any).captured_at = new Date();
            await paymentRepo.save(codPayment);
            (order as any).payment_status = "captured";
          }
        }

        await orderRepo.save(order);
        parentOrderStatus = newParentStatus;

        const parentHistory = historyRepo.create({
          order_id: (order as any).id,
          from_status: parentFrom,
          to_status: newParentStatus,
          changed_by: null,
          changed_by_role: "system",
          is_customer_visible: this.isCustomerVisible(newParentStatus, "system"),
          comment: "Aggregated from vendor order statuses",
          metadata: null,
        } as any);
        await historyRepo.save(parentHistory);
      }

      // Enqueue event
      const event: OrderStatusChangedEvent = {
        type: "order.status.changed",
        orderId: (vendorOrder as any).order_id,
        vendorOrderId,
        fromStatus,
        toStatus,
        parentOrderStatus,
        actorId: actor.userId,
        actorRole: actor.role,
        reason,
        metadata,
        timestamp: new Date().toISOString(),
      };
      await this.orderEventQueue.add(event.type, event);

      return {
        vendorOrder,
        parentOrderId: (vendorOrder as any).order_id as string,
        parentOrderStatus,
        // Capture parent user_id so the post-commit nudge publish has a
        // userId to address the notification to. `order` may be null if the
        // parent row was deleted concurrently — leave undefined in that case
        // and the publish site will skip.
        parentUserId: (order as any)?.user_id as string | undefined,
        fromStatus,
        toStatus,
        transitioned: true as const,
      };
    });

    // Publish reels commission events AFTER the DB transaction commits when
    // the vendor-order transition aggregated the MASTER order into a
    // commission-relevant status. Mirrors the publish block in
    // `transitionOrder` — the shipment delivery path runs through
    // `transitionVendorOrder` and never calls `transitionOrder`, so without
    // this the delivered/paid/refunded commission events would never fire
    // for the common production paths. Errors are swallowed per the same
    // convention as `transitionOrder`.
    if (txResult.parentOrderStatus) {
      const parentId = txResult.parentOrderId;
      if (txResult.parentOrderStatus === OrderStatus.confirmed) {
        publishOrderPaidForCommissions(parentId).catch((err) => {
          console.error("[order->reels] paid publish failed (vendor agg)", {
            orderId: parentId,
            error: String(err),
          });
        });
        publishOrderPaidForAffiliates(parentId).catch((err) => {
          console.error("[affiliate-events] publishOrderPaidForAffiliates failed (vendor agg)", {
            orderId: parentId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else if (txResult.parentOrderStatus === OrderStatus.delivered) {
        publishOrderDeliveredForCommissions(parentId).catch((err) => {
          console.error("[order->reels] delivered publish failed (vendor agg)", {
            orderId: parentId,
            error: String(err),
          });
        });
        publishOrderDeliveredForAffiliates(parentId).catch((err) => {
          console.error(
            "[affiliate-events] publishOrderDeliveredForAffiliates failed (vendor agg)",
            {
              orderId: parentId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        });
        // Post-delivery nudge publish. Requires a parent user_id; skip
        // quietly if undefined (concurrent delete of parent row — the
        // commission publish above also doesn't care about userId so it
        // still fires).
        const parentUserId = txResult.parentUserId;
        if (parentUserId) {
          publishOrderDeliveredForNudge(parentId, parentUserId).catch((err) => {
            console.error("[order->reels] nudge publish failed (vendor agg)", {
              orderId: parentId,
              userId: parentUserId,
              error: String(err),
            });
          });
        }
      } else if (txResult.parentOrderStatus === OrderStatus.refunded) {
        publishOrderRefundedForCommissions(parentId).catch((err) => {
          console.error("[order->reels] refunded publish failed (vendor agg)", {
            orderId: parentId,
            error: String(err),
          });
        });
        publishOrderRefundedForAffiliates(parentId).catch((err) => {
          console.error(
            "[affiliate-events] publishOrderRefundedForAffiliates failed (vendor agg)",
            {
              orderId: parentId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        });
      }
    }

    // Emit a vendor_order.status_changed integration event AFTER commit, gated
    // by the vendor_integrations_outbound_enabled site setting. Skipped on
    // no-op transitions. Errors are swallowed so a failed enqueue never
    // blocks the order flow.
    if (txResult.transitioned && this.integrationEventsQueue && this.siteSettingRepo) {
      try {
        await emitIfEnabled(this.integrationEventsQueue, this.siteSettingRepo, {
          event_type: IntegrationEventType.vendor_order_status_changed,
          vendor_id: (txResult.vendorOrder as any).vendor_id,
          payload: {
            vendor_order: txResult.vendorOrder,
            transition: {
              from: txResult.fromStatus,
              to: txResult.toStatus,
              changed_at: new Date().toISOString(),
              reason,
            },
          },
          source_ref: { vendor_order_id: txResult.vendorOrder.id },
          schema_version: 1,
        });
      } catch (err) {
        console.error("[order->integration] vendor_order.status_changed emit failed", {
          vendor_order_id: txResult.vendorOrder?.id,
          error: String(err),
        });
      }
    }

    return txResult.vendorOrder;
  }

  async transitionOrder(
    orderId: string,
    toStatus: OrderStatus,
    actor: Actor,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<Order> {
    const result = await this.orderRepo.manager.transaction(async (tx) => {
      const orderRepo = tx.getRepository("Order" as any) as Repository<Order>;
      const historyRepo = tx.getRepository(
        "OrderStatusHistory" as any,
      ) as Repository<OrderStatusHistory>;

      const order = await orderRepo.findOne({ where: { id: orderId } as any });
      if (!order) throw new Error("Order not found");

      const fromStatus = order.status;
      const smResult = this.stateMachine.validateMasterTransition(fromStatus, toStatus, actor.role);
      if (smResult?.noop)
        return {
          order,
          transitioned: false as const,
          parentUserId: (order as any)?.user_id as string | undefined,
        };

      order.status = toStatus;
      await orderRepo.save(order);

      const historyEntry = historyRepo.create({
        order_id: orderId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: historyActorId(actor.userId),
        changed_by_role: actor.role,
        is_customer_visible: this.isCustomerVisible(toStatus, actor.role),
        comment: reason || null,
        metadata: metadata || null,
      } as any);
      await historyRepo.save(historyEntry);

      const event: OrderStatusChangedEvent = {
        type: "order.status.changed",
        orderId,
        fromStatus,
        toStatus,
        actorId: actor.userId,
        actorRole: actor.role,
        reason,
        metadata,
        timestamp: new Date().toISOString(),
      };
      await this.orderEventQueue.add(event.type, event);

      return {
        order,
        transitioned: true as const,
        parentUserId: (order as any)?.user_id as string | undefined,
      };
    });

    // Publish reels commission events AFTER the DB transaction commits so that
    // the reels-service workers see a consistent state. Errors are swallowed —
    // a queue publish failure must never block the order flow (same convention
    // as Task 4's attribution tap writes). Only full `refunded` triggers the
    // void; `partially_refunded` is intentionally excluded in M3.
    if (result.transitioned) {
      if (toStatus === OrderStatus.confirmed) {
        publishOrderPaidForCommissions(orderId).catch((err) => {
          console.error("[order->reels] paid publish failed", {
            orderId,
            error: String(err),
          });
        });
        publishOrderPaidForAffiliates(orderId).catch((err) => {
          console.error("[affiliate-events] publishOrderPaidForAffiliates failed", {
            orderId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else if (toStatus === OrderStatus.delivered) {
        publishOrderDeliveredForCommissions(orderId).catch((err) => {
          console.error("[order->reels] delivered publish failed", {
            orderId,
            error: String(err),
          });
        });
        publishOrderDeliveredForAffiliates(orderId).catch((err) => {
          console.error("[affiliate-events] publishOrderDeliveredForAffiliates failed", {
            orderId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
        // Post-delivery nudge — delivered-only, requires parent user_id.
        const parentUserId = result.parentUserId;
        if (parentUserId) {
          publishOrderDeliveredForNudge(orderId, parentUserId).catch((err) => {
            console.error("[order->reels] nudge publish failed", {
              orderId,
              userId: parentUserId,
              error: String(err),
            });
          });
        }
      } else if (toStatus === OrderStatus.refunded) {
        publishOrderRefundedForCommissions(orderId).catch((err) => {
          console.error("[order->reels] refunded publish failed", {
            orderId,
            error: String(err),
          });
        });
        publishOrderRefundedForAffiliates(orderId).catch((err) => {
          console.error("[affiliate-events] publishOrderRefundedForAffiliates failed", {
            orderId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    return result.order;
  }

  async cancelOrder(orderId: string, actor: Actor, reason: string): Promise<Order> {
    return this.orderRepo.manager.transaction(async (tx) => {
      const orderRepo = tx.getRepository("Order" as any) as Repository<Order>;
      const voRepo = tx.getRepository("VendorOrder" as any) as Repository<VendorOrder>;
      const historyRepo = tx.getRepository(
        "OrderStatusHistory" as any,
      ) as Repository<OrderStatusHistory>;

      const order = await orderRepo.findOne({
        where: { id: orderId } as any,
        relations: ["vendorOrders"],
      });
      if (!order) throw new Error("Order not found");

      this.stateMachine.validateMasterTransition(order.status, OrderStatus.cancelled, actor.role);

      const fromStatus = order.status;
      order.status = OrderStatus.cancelled;
      await orderRepo.save(order);

      // Admins carry a "cancel from anywhere" bypass on the master order; the
      // vendor sub-orders must inherit it, otherwise cancelling an order that's
      // already past `confirmed` throws "Invalid transition ... by system".
      // Buyers keep the stricter `system` path (their master transition already
      // gates cancel to pending/confirmed, so sub-orders are always confirmed).
      const voRole = actor.role === "admin" ? "admin" : "system";
      for (const vo of (order as any).vendorOrders || []) {
        if (vo.status === OrderStatus.cancelled) continue;
        const voFrom = vo.status;
        this.stateMachine.validateVendorTransition(voFrom, OrderStatus.cancelled, voRole);
        vo.status = OrderStatus.cancelled;
        await voRepo.save(vo);

        const voHistory = historyRepo.create({
          order_id: orderId,
          vendor_order_id: vo.id,
          from_status: voFrom,
          to_status: OrderStatus.cancelled,
          changed_by: historyActorId(actor.userId),
          changed_by_role: "system",
          is_customer_visible: true,
          comment: `Cancelled by buyer: ${reason}`,
          metadata: null,
        } as any);
        await historyRepo.save(voHistory);
      }

      // Void this order's non-terminal commissions. A commission row is
      // created 'held' (settle_after stamped on delivery) and later promoted
      // to 'pending' by the hourly settlement job once that matures — so
      // both statuses have to be covered here, or a commission that's
      // already `held` (the common case: most cancellations happen before
      // the settlement window elapses) survives the cancel with a live
      // clock and gets paid out days later regardless. `settle_after` is
      // cleared too so a voided row can never be picked up by the
      // settlement job even if something upstream ever resurrected its
      // status. Only 'held'/'pending' rows are voided — an already-'paid'
      // commission is a clawback (VendorPayoutAdjustment ledger), out of
      // scope here.
      //
      // This also repairs the reaper (pending-order-reaper.service.ts) and
      // the payment-failure webhook path (webhook.service.ts
      // processPaymentFailure) for free — both cancel through this same
      // cancelOrder method rather than voiding commissions themselves.
      const commissionRepo = tx.getRepository("Commission" as any) as Repository<any>;
      await commissionRepo.update(
        { order_id: orderId, status: In([CommissionStatus.held, CommissionStatus.pending]) } as any,
        { status: CommissionStatus.cancelled, settle_after: null } as any,
      );

      // CRITICAL 1: the update above voids status but does NOT touch
      // `payout_id` — a commission a draft has already claimed (stamped
      // `payout_id`, still 'pending' at the moment it matured into this
      // void) survives the cancel with that stale claim intact. Left alone,
      // the draft's stored net_amount still includes this commission's
      // earning, and approving that draft still sends the money (Stripe
      // doesn't know or care that the commission underneath was cancelled).
      // `recordSuccessfulTransfer` now refuses to flip a non-'pending'
      // commission to 'paid' (payout.service.ts), so the row itself can
      // never be silently un-cancelled again — but the transfer would still
      // go out for an amount that includes a refunded sale unless the
      // claiming draft is invalidated. Route every such claim through the
      // SAME release path CommissionReversalService already uses
      // (PayoutService.invalidateDraftForReversal) rather than a second,
      // divergent release mechanism — it releases the commission AND
      // invalidates the whole draft, so the next scheduled draft rebuilds
      // from current (correct) figures. This also repairs the reaper and
      // payment-failure webhook path for free, same as the void above.
      if (this.draftInvalidator) {
        const staleClaims = await commissionRepo.find({
          where: {
            order_id: orderId,
            status: CommissionStatus.cancelled,
            payout_id: Not(IsNull()),
          } as any,
        });
        const payoutIds = [...new Set(staleClaims.map((c: any) => c.payout_id as string))];
        for (const payoutId of payoutIds) {
          const result = await this.draftInvalidator.invalidateDraftForReversal(
            tx,
            payoutId,
            `Superseded by order cancellation (${orderId}): ${reason}`,
          );
          if (result.invalidated) continue;

          // R3-C2: the claiming payout is already processing/paid/failed.
          // This branch used to be a bare `console.error`, on the claim that
          // "the payout's own reconciliation backstop may now legitimately
          // fail". It could not: that backstop summed `vendor_earning` with
          // NO status filter, and cancelling a commission changes only
          // `status` — the sum was byte-identical, so it always passed and
          // the money went out for a refunded sale with no ledger trace
          // beyond a log line. The sum is now status-filtered
          // (`assertClaimedSetReconciles`) AND this branch writes the same
          // compensating adjustment + audit row that
          // CommissionReversalService's structurally identical branch does —
          // through the one shared sink, so the two cannot diverge again.
          // recordUnreleasableClaim decides whether money actually left
          // (`processing`/`paid`) and skips a zero-fils row the table's
          // CHECK would reject.
          const affected = staleClaims.filter((c: any) => c.payout_id === payoutId);
          for (const commission of affected) {
            // The whole order is cancelled and refunded, so the correct
            // earning for this line is 0 — claw back everything the payout
            // was built including for it.
            await this.draftInvalidator.recordUnreleasableClaim(tx, {
              commissionId: (commission as any).id ?? null,
              vendorId: (commission as any).vendor_id,
              payoutId,
              payoutStatus: result.payoutStatus,
              // R4-I6, mirroring computeDeltaClawback's baseline: clamp at
              // 0 rather than taking the absolute value. A legacy row with a
              // negative vendor_earning (written before the shared
              // commission ceiling) would otherwise claw back money the
              // vendor was never paid.
              clawbackAmount: Math.max(0, (commission as any).vendor_earning || 0),
              sourceType: "order_cancellation",
              sourceId: orderId,
              reason: `Order cancellation (${orderId}): ${reason}`.slice(0, 255),
            });
          }
          console.error(
            `[cancelOrder] could not invalidate draft ${payoutId} for order ${orderId} — status "${result.payoutStatus}", not "pending". ${affected.length} cancelled commission(s) remain claimed by an in-flight/settled payout; a compensating adjustment + audit row was written for each where money had already left. Investigate manually.`,
          );
        }
      }

      // Decrement flash-deal counters and release inventory for each
      // order_item with a deal id in its snapshot.
      if (this.flashDealApplicator || this.inventoryRepo) {
        const orderItemRepo = tx.getRepository("OrderItem" as any) as Repository<OrderItem>;
        const orderItems = await orderItemRepo.find({
          where: { order_id: orderId } as any,
        });

        const dealQtyByDealId = new Map<string, number>();
        for (const oi of orderItems) {
          const dealId = (oi as any).product_snapshot?.flash_deal_id ?? null;
          if (!dealId) continue;
          dealQtyByDealId.set(dealId, (dealQtyByDealId.get(dealId) ?? 0) + (oi as any).quantity);
        }

        if (this.flashDealApplicator) {
          for (const [dealId, qty] of dealQtyByDealId) {
            try {
              await this.flashDealApplicator.decrement(tx, dealId, qty);
            } catch (err) {
              console.error("[cancelOrder] flash deal decrement failed (continuing)", {
                orderId,
                dealId,
                qty,
                error: String(err),
              });
            }
          }
        }

        if (this.inventoryRepo) {
          const inventoryRepo = tx.getRepository("Inventory" as any) as Repository<Inventory>;
          for (const oi of orderItems) {
            const where: any = {
              product_id: (oi as any).product_id,
              vendor_id: (oi as any).vendor_id,
            };
            if ((oi as any).variant_id) where.variant_id = (oi as any).variant_id;
            const inv = await inventoryRepo.findOne({ where });
            if (inv) {
              const release = Math.min(inv.quantity_reserved, (oi as any).quantity);
              inv.quantity_reserved = Math.max(0, inv.quantity_reserved - release);
              await inventoryRepo.save(inv);
            }
          }
        }
      }

      const historyEntry = historyRepo.create({
        order_id: orderId,
        from_status: fromStatus,
        to_status: OrderStatus.cancelled,
        changed_by: historyActorId(actor.userId),
        changed_by_role: actor.role,
        is_customer_visible: true,
        comment: reason,
        metadata: null,
      } as any);
      await historyRepo.save(historyEntry);

      const event: OrderStatusChangedEvent = {
        type: "order.status.changed",
        orderId,
        fromStatus,
        toStatus: OrderStatus.cancelled,
        actorId: actor.userId,
        actorRole: actor.role,
        reason,
        timestamp: new Date().toISOString(),
      };
      await this.orderEventQueue.add(event.type, event);

      return order;
    });
  }

  async computeProcessingDeadline(vendorId: string, baseDeadline: Date): Promise<Date> {
    const holidays = await this.vendorHolidayRepo.find({
      where: { vendor_id: vendorId, auto_extend_sla: true } as any,
    });

    // Sort by start date to process in chronological order
    const sorted = holidays
      .map((h) => ({ start: new Date(h.starts_at), end: new Date(h.ends_at) }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let deadline = new Date(baseDeadline);
    let changed = true;
    while (changed) {
      changed = false;
      for (const holiday of sorted) {
        if (deadline >= holiday.start && deadline <= holiday.end) {
          const remainingMs = deadline.getTime() - holiday.start.getTime();
          deadline = new Date(holiday.end.getTime() + remainingMs);
          changed = true;
        }
      }
    }
    return deadline;
  }

  private isCustomerVisible(toStatus: OrderStatus, _role: string): boolean {
    const visibleStatuses = new Set([
      OrderStatus.confirmed,
      OrderStatus.processing,
      OrderStatus.partially_shipped,
      OrderStatus.shipped,
      OrderStatus.partially_delivered,
      OrderStatus.out_for_delivery,
      OrderStatus.delivered,
      OrderStatus.cancelled,
      OrderStatus.refund_requested,
      OrderStatus.refunded,
    ]);
    return visibleStatuses.has(toStatus);
  }
}
