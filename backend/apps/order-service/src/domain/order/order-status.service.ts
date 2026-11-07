import type { Inventory, Order, OrderItem } from "@materialhub/database";
import type { SiteSetting } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database";
import type { OrderStatusHistory } from "@materialhub/database";
import { CommissionStatus } from "@materialhub/database";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { HttpError } from "@materialhub/plugins";
import type { Queue } from "bullmq";
import { In, IsNull, Not, type Repository } from "typeorm";
import type { DraftInvalidator } from "../commission/commission-reversal.service.ts";
import type { CommissionService } from "../commission/commission.service.ts";
import { IntegrationEventType, emitIfEnabled } from "../integration/emit.ts";
import { OrderAggregationService } from "./order-aggregation.service.ts";
import type { OrderStatusChangedEvent } from "./order-event.job.ts";
import { OrderStateMachine } from "./order-state-machine.ts";

type Role = "buyer" | "vendor" | "admin" | "system";

/**
 * Who is acting on an order.
 *
 * `userId` is always a USER id (or null / "system" for jobs and webhooks): it
 * is what lands in `order_status_history.changed_by`, an FK to `users`.
 * A vendor acting on its own sub-order also carries `vendorId`, which is what
 * vendor ownership is checked against. Passing the vendor id as `userId`
 * violated the FK and 500'd every vendor-side order action.
 */
export interface Actor {
  userId: string | null;
  role: Role;
  vendorId?: string | null;
}

/**
 * The vendor a vendor-role actor acts for. Legacy callers that put the vendor
 * id into `userId` (no `vendorId`) are still honoured for the ownership
 * check, but see `historyActorUserId`: that id is never written as a user.
 */
export function actorVendorId(actor: Actor): string | null {
  if (actor.role !== "vendor") return null;
  return actor.vendorId ?? actor.userId ?? null;
}

/** The user id to record in history for this actor (never a vendor id). */
export function historyActorUserId(actor: Actor): string | null {
  if (actor.role === "vendor" && !actor.vendorId) return null;
  return historyActorId(actor.userId);
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
    private orderEventQueue: Queue,
    private integrationEventsQueue?: Queue,
    private siteSettingRepo?: Repository<SiteSetting>,
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
      if (!vendorOrder) {
        throw new HttpError(404, "Vendor order not found", "VENDOR_ORDER_NOT_FOUND");
      }

      // Verify vendor ownership when role is vendor
      if (actor.role === "vendor" && (vendorOrder as any).vendor_id !== actorVendorId(actor)) {
        throw new HttpError(404, "Vendor order not found", "VENDOR_ORDER_NOT_FOUND");
      }

      const fromStatus = vendorOrder.status;
      const result = this.stateMachine.validateVendorTransition(fromStatus, toStatus, actor.role);
      if (result?.noop) {
        return {
          vendorOrder,
          parentOrderId: (vendorOrder as any).order_id as string,
          parentOrderStatus: undefined as string | undefined,
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

      // A vendor sub-order cancelled before delivery (vendor reject, admin,
      // integration) gives back what it held: its stock reservations and its
      // commissions. Until now only the master cancelOrder released anything,
      // so a rejected sub-order kept its stock reserved and its commission
      // held. Delivered -> cancelled is the admin reversal handled below.
      const releasesHoldings =
        toStatus === OrderStatus.cancelled &&
        fromStatus !== OrderStatus.cancelled &&
        fromStatus !== OrderStatus.delivered;
      if (releasesHoldings) {
        await this.releaseVendorOrderHoldings(tx, vendorOrder, reason);
      }

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
        changed_by: historyActorUserId(actor),
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
      // Cash on delivery: the courier no longer collects for a cancelled
      // sub-order. When every sub-order is cancelled the COD payment is void.
      if (releasesHoldings && order) {
        await this.adjustCodForCancelledVendorOrder(
          tx,
          (order as any).id,
          vendorOrder,
          newParentStatus === OrderStatus.cancelled,
        );
      }

      if (order && order.status !== newParentStatus) {
        const parentFrom = order.status;
        order.status = newParentStatus;

        // COD cash is collected by the courier at delivery. That's the moment
        // the COD payment becomes "captured" — prepaid orders capture at the
        // payment webhook instead, so this only touches COD. Downstream refund
        // logic keys off this status to decide wallet-refund vs no-refund.
        if (newParentStatus === OrderStatus.delivered) {
          // The return window and the storefront read the master's
          // delivered_at; it was never stamped.
          if (!(order as any).delivered_at) (order as any).delivered_at = new Date();
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
        vendorId: (vendorOrder as any).vendor_id,
        fromStatus,
        toStatus,
        parentOrderStatus,
        actorId: actor.userId ?? "system",
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
        fromStatus,
        toStatus,
        transitioned: true as const,
      };
    });

    // Emit a vendor_order.status_changed integration event AFTER commit, gated
    // by the vendor_integrations_outbound_enabled site setting. Skipped on
    // no-op transitions. Errors are swallowed so a failed enqueue never
    // blocks the order flow.
    // Every sub-order cancelled: the master order ended cancelled through
    // aggregation, so run the same post-commit hooks a master cancel runs
    // (e.g. releasing net-terms credit held by the unpaid order).
    if (txResult.transitioned && txResult.parentOrderStatus === OrderStatus.cancelled) {
      for (const hook of this.cancellationHooks) {
        try {
          await hook(txResult.parentOrderId);
        } catch (err) {
          console.error("[order-status] cancellation hook failed", {
            orderId: txResult.parentOrderId,
            error: String(err),
          });
        }
      }
    }

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
      if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

      const fromStatus = order.status;
      const smResult = this.stateMachine.validateMasterTransition(fromStatus, toStatus, actor.role);
      if (smResult?.noop) return { order, transitioned: false as const };

      order.status = toStatus;
      await orderRepo.save(order);

      const historyEntry = historyRepo.create({
        order_id: orderId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: historyActorUserId(actor),
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
        actorId: actor.userId ?? "system",
        actorRole: actor.role,
        reason,
        metadata,
        timestamp: new Date().toISOString(),
      };
      await this.orderEventQueue.add(event.type, event);

      return { order, transitioned: true as const };
    });

    return result.order;
  }

  private cancellationHooks: Array<(orderId: string) => Promise<unknown>> = [];

  /** Register a callback run after an order cancellation commits. */
  onOrderCancelled(hook: (orderId: string) => Promise<unknown>): void {
    this.cancellationHooks.push(hook);
  }

  async cancelOrder(orderId: string, actor: Actor, reason: string): Promise<Order> {
    const cancelled = await this.orderRepo.manager.transaction(async (tx) => {
      const orderRepo = tx.getRepository("Order" as any) as Repository<Order>;
      const voRepo = tx.getRepository("VendorOrder" as any) as Repository<VendorOrder>;
      const historyRepo = tx.getRepository(
        "OrderStatusHistory" as any,
      ) as Repository<OrderStatusHistory>;

      // Lock the order row first: two concurrent cancels must not both pass
      // the status check and release the same stock twice. (FOR UPDATE can't
      // be combined with the outer join `relations` would add.)
      const locked = await orderRepo
        .createQueryBuilder("o")
        .setLock("pessimistic_write")
        .where("o.id = :orderId", { orderId })
        .getOne();
      // A buyer may only cancel their own order; anything else is the same
      // 404 as an unknown id (no existence oracle).
      if (!locked || (actor.role === "buyer" && (locked as any).user_id !== actor.userId)) {
        throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");
      }
      const order = (await orderRepo.findOne({
        where: { id: orderId } as any,
        relations: ["vendorOrders"],
      })) as Order;

      const transition = this.stateMachine.validateMasterTransition(
        order.status,
        OrderStatus.cancelled,
        actor.role,
      );
      // Already cancelled: nothing to do. Releasing again would decrement
      // reserved stock a second time and write a cancelled→cancelled row.
      if (transition.noop) return null;

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
          changed_by: historyActorUserId(actor),
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

      // Release the stock this order still holds. The reservation rows are the
      // ledger: release what is `active`/`committed` and close those rows. Rows
      // already `expired` were released by the reservation-expiry job (e.g. an
      // abandoned checkout the reaper cancels later), so releasing per order
      // item would free the same stock twice.
      if (this.inventoryRepo) {
        const inventoryRepo = tx.getRepository("Inventory" as any) as Repository<Inventory>;
        const held: Array<{ id: string; inventory_id: string; quantity: number }> = await tx.query(
          `SELECT id, inventory_id, quantity FROM inventory_reservations
            WHERE order_id = $1 AND status IN ('active', 'committed') FOR UPDATE`,
          [orderId],
        );
        const [{ count: anyReservation }] = await tx.query(
          "SELECT count(*)::int AS count FROM inventory_reservations WHERE order_id = $1",
          [orderId],
        );

        if (held.length > 0) {
          for (const r of held) {
            const inv = await inventoryRepo
              .createQueryBuilder("inv")
              .setLock("pessimistic_write")
              .where("inv.id = :id", { id: r.inventory_id })
              .getOne();
            if (inv) {
              inv.quantity_reserved = Math.max(0, inv.quantity_reserved - Number(r.quantity));
              await inventoryRepo.save(inv);
            }
          }
          await tx.query(
            `UPDATE inventory_reservations SET status = 'released', released_at = now()
              WHERE id = ANY($1::uuid[])`,
            [held.map((r) => r.id)],
          );
        } else if (anyReservation === 0) {
          // Orders without reservation rows (created before reservations were
          // recorded): fall back to releasing per order item.
          const orderItemRepo = tx.getRepository("OrderItem" as any) as Repository<OrderItem>;
          const orderItems = await orderItemRepo.find({ where: { order_id: orderId } as any });
          for (const oi of orderItems) {
            const where: any = {
              product_id: (oi as any).product_id,
              vendor_id: (oi as any).vendor_id,
            };
            // No variant means the product-level row; without IsNull() the lookup
            // could match a variant row (e.g. the sample SKU).
            where.variant_id = (oi as any).variant_id ?? IsNull();
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
        changed_by: historyActorUserId(actor),
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
        actorId: actor.userId ?? "system",
        actorRole: actor.role,
        reason,
        timestamp: new Date().toISOString(),
      };
      await this.orderEventQueue.add(event.type, event);

      return order;
    });
    // Repeat cancel: return the order as it is, and run no hooks.
    if (!cancelled) {
      return (await this.orderRepo.findOne({ where: { id: orderId } as any })) as Order;
    }
    // A cancelled cash-on-delivery order has nothing left to collect: void its
    // pending COD payment. Post-commit and best-effort like the hooks below;
    // a pending COD row on a cancelled order is inert either way.
    try {
      await this.orderRepo.manager.getRepository("Payment" as any).update(
        { order_id: orderId, gateway: "cod", status: "pending" } as any,
        {
          status: "cancelled",
        } as any,
      );
      // Nothing was collected, so the order itself isn't "payment pending"
      // any more (the buyer saw "Payment Pending" on a cancelled order).
      await this.orderRepo.update(
        { id: orderId, payment_status: "pending" } as any,
        { payment_status: "cancelled" } as any,
      );
    } catch (err) {
      console.error("[order-status] voiding COD payment failed", { orderId, error: String(err) });
    }
    // Post-commit hooks (workstream 3: release net-terms credit held by an
    // unpaid order). Best-effort; never undoes the committed cancellation.
    for (const hook of this.cancellationHooks) {
      try {
        await hook(orderId);
      } catch (err) {
        console.error("[order-status] cancellation hook failed", { orderId, error: String(err) });
      }
    }
    return cancelled;
  }

  /**
   * Release what one cancelled vendor sub-order holds, inside the caller's
   * transaction: its stock reservations (the reservation rows on this
   * vendor's inventory — the ledger, as in cancelOrder) and its non-terminal
   * commissions (voided; a draft claim on them is invalidated through the
   * same sink cancelOrder uses).
   */
  private async releaseVendorOrderHoldings(
    tx: any,
    vendorOrder: VendorOrder,
    reason?: string,
  ): Promise<void> {
    const vo = vendorOrder as any;
    const orderId = vo.order_id as string;

    if (this.inventoryRepo) {
      const inventoryRepo = tx.getRepository("Inventory" as any) as Repository<Inventory>;
      const held: Array<{ id: string; inventory_id: string; quantity: number }> = await tx.query(
        `SELECT r.id, r.inventory_id, r.quantity
           FROM inventory_reservations r
           JOIN inventory i ON i.id = r.inventory_id
          WHERE r.order_id = $1 AND i.vendor_id = $2 AND r.status IN ('active', 'committed')
          FOR UPDATE OF r`,
        [orderId, vo.vendor_id],
      );
      if (held.length > 0) {
        for (const r of held) {
          const inv = await inventoryRepo
            .createQueryBuilder("inv")
            .setLock("pessimistic_write")
            .where("inv.id = :id", { id: r.inventory_id })
            .getOne();
          if (inv) {
            inv.quantity_reserved = Math.max(0, inv.quantity_reserved - Number(r.quantity));
            await inventoryRepo.save(inv);
          }
        }
        await tx.query(
          `UPDATE inventory_reservations SET status = 'released', released_at = now()
            WHERE id = ANY($1::uuid[])`,
          [held.map((r) => r.id)],
        );
      } else {
        const [{ count: anyReservation }] = await tx.query(
          "SELECT count(*)::int AS count FROM inventory_reservations WHERE order_id = $1",
          [orderId],
        );
        if (anyReservation === 0) {
          // Orders created before reservation rows were recorded: release
          // per order item of this sub-order (minus what was already
          // cancelled item by item, which released its own share).
          const orderItemRepo = tx.getRepository("OrderItem" as any) as Repository<OrderItem>;
          const items = await orderItemRepo.find({ where: { vendor_order_id: vo.id } as any });
          for (const oi of items as any[]) {
            const qty = Number(oi.quantity) - Number(oi.refunded_quantity ?? 0);
            if (qty <= 0) continue;
            const inv = await inventoryRepo.findOne({
              where: {
                product_id: oi.product_id,
                vendor_id: oi.vendor_id,
                variant_id: oi.variant_id ?? IsNull(),
              } as any,
            });
            if (inv) {
              inv.quantity_reserved = Math.max(0, inv.quantity_reserved - qty);
              await inventoryRepo.save(inv);
            }
          }
        }
      }
    }

    const commissionRepo = tx.getRepository("Commission" as any) as Repository<any>;
    await commissionRepo.update(
      {
        vendor_order_id: vo.id,
        status: In([CommissionStatus.held, CommissionStatus.pending]),
      } as any,
      { status: CommissionStatus.cancelled, settle_after: null } as any,
    );
    if (this.draftInvalidator) {
      const staleClaims = await commissionRepo.find({
        where: {
          vendor_order_id: vo.id,
          status: CommissionStatus.cancelled,
          payout_id: Not(IsNull()),
        } as any,
      });
      const payoutIds = [...new Set(staleClaims.map((c: any) => c.payout_id as string))];
      for (const payoutId of payoutIds) {
        const result = await this.draftInvalidator.invalidateDraftForReversal(
          tx,
          payoutId,
          `Superseded by vendor order cancellation (${vo.id})${reason ? `: ${reason}` : ""}`,
        );
        if (result.invalidated) continue;
        for (const commission of staleClaims.filter((c: any) => c.payout_id === payoutId)) {
          await this.draftInvalidator.recordUnreleasableClaim(tx, {
            commissionId: (commission as any).id ?? null,
            vendorId: (commission as any).vendor_id,
            payoutId,
            payoutStatus: result.payoutStatus,
            clawbackAmount: Math.max(0, (commission as any).vendor_earning || 0),
            sourceType: "order_cancellation",
            sourceId: orderId,
            reason: `Vendor order cancellation (${vo.id})${reason ? `: ${reason}` : ""}`.slice(
              0,
              255,
            ),
          });
        }
      }
    }
  }

  /**
   * COD side of a vendor sub-order cancel: the pending COD payment no longer
   * includes that sub-order's goods and shipping; with every sub-order
   * cancelled the payment is cancelled outright.
   */
  private async adjustCodForCancelledVendorOrder(
    tx: any,
    orderId: string,
    vendorOrder: VendorOrder,
    parentCancelled: boolean,
  ): Promise<void> {
    const paymentRepo = tx.getRepository("Payment" as any) as Repository<any>;
    const cod = await paymentRepo.findOne({
      where: { order_id: orderId, gateway: "cod", status: "pending" } as any,
    });
    if (!cod) return;
    if (parentCancelled) {
      cod.status = "cancelled";
    } else {
      const vo = vendorOrder as any;
      const share = Number(vo.subtotal ?? 0) + Number(vo.shipping_cost ?? 0);
      cod.amount = Math.max(0, Number(cod.amount ?? 0) - share);
    }
    await paymentRepo.save(cod);
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
