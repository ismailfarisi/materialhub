// commission-reversal.service.ts
import {
  Commission,
  CommissionStatus,
  OrderItem,
  VendorPayoutAdjustment,
} from "@materialhub/database";
import type { EntityManager } from "typeorm";
import { recomputeCommissionForSurvivingQty } from "../order/item-cancellation-calc.ts";

/**
 * The narrow surface CommissionReversalService needs from PayoutService —
 * satisfied structurally by the real PayoutService (see container.ts) and
 * mockable in tests without pulling Stripe/BullMQ/the rest of PayoutService
 * along for the ride.
 */
export interface DraftInvalidator {
  invalidateDraftForReversal(
    manager: EntityManager,
    payoutId: string,
    reason: string,
  ): Promise<{ invalidated: boolean; payoutStatus: string }>;

  /**
   * R3-C2/C4/I4: the single sink for an unreleasable claim, shared with
   * `OrderStatusService.cancelOrder`. Decides whether the money actually
   * left the platform (a clawback is owed only when a Stripe transfer
   * exists), skips a zero-fils adjustment that the table's
   * `CHECK (amount_fils <> 0)` would reject, and always writes the audit
   * row. Implemented by the real PayoutService.
   */
  recordUnreleasableClaim(
    manager: EntityManager,
    input: {
      commissionId: string | null;
      vendorId: string;
      payoutId: string;
      payoutStatus: string;
      clawbackAmount: number;
      sourceType: string;
      sourceId: string;
      reason: string;
    },
  ): Promise<{ clawedBack: boolean; amount: number; moneyLeftThePlatform: boolean }>;

  /**
   * The same audit trail every other payout mutation on this branch leaves,
   * via the real PayoutService's own `writeAudit`.
   */
  writeAudit(input: {
    action: string;
    actor_id: string | null;
    actor_role: string;
    entity_id: string | null;
    changes?: Record<string, { old: unknown; new: unknown }> | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;
}

/**
 * The single sink for "money went back to the customer, so the vendor's
 * earnings must follow".
 *
 * Deliberately NOT called from RefundService: that is a pure gateway sink
 * (amount-only, no item awareness), and the cancellation paths
 * (`admin-order-cancellation.service.ts`, `order-item-cancellation.service.ts`)
 * already handle their own commissions. Wiring reversal into the shared sink
 * would double-reverse them. Callers are the paths that refund without
 * cancelling — returns and disputes — plus item cancellation, and MUST call
 * this only after the order item's `refunded_quantity`/`refunded_amount`
 * have been persisted: this service reads those columns fresh from the DB to
 * compute the surviving quantity, so calling it first is a silent no-op.
 */
export class CommissionReversalService {
  constructor(private draftInvalidator: DraftInvalidator) {}

  /**
   * IMPORTANT A — the clawback on an already-`paid` (or frozen-claim, see
   * IMPORTANT B) commission must be the DELTA this event introduces, not
   * the commission's full original earning minus wherever the item's
   * cumulative refund total happens to sit today. The old formula
   * (`currentEarning - earning(current surviving)`) recomputes the whole
   * cumulative clawback on every event, so a second partial reversal
   * re-charges everything the first one already clawed back.
   *
   * Derivation: callers persist `order_items.refunded_amount` as a running
   * total BEFORE calling `reverseForItems`, and pass this event's own
   * (non-cumulative) contribution as `eventRefundedAmount`. That means:
   *
   *   previousCumulativeRefund = oi.refunded_amount - eventRefundedAmount
   *   previousSurvivingTotal   = oi.line_total - previousCumulativeRefund
   *   newSurvivingTotal        = oi.line_total - oi.refunded_amount
   *
   * The clawback for THIS event is what surviving earning dropped by
   * across just this event:
   *
   *   clawback = earning(previousSurvivingTotal) - earning(newSurvivingTotal)
   *
   * For the very first reversal event on a commission, previousCumulativeRefund
   * is 0 and previousSurvivingTotal is the full line_total — but the
   * baseline used there is the commission's own persisted `vendor_earning`
   * (the actual amount paid), not a recomputed approximation of
   * `earning(line_total)`: it's the ground truth of what left the ledger,
   * and self-heals if the commission's rate/type has since drifted from
   * whatever produced that original figure. Every subsequent event's
   * baseline is instead `earning(previousSurvivingTotal)` via the same
   * formula used to produce the prior event's target — so the events
   * telescope: summing every event's clawback yields
   * `originalEarning - earning(finalSurvivingTotal)`, and a fully-refunded
   * line (finalSurvivingTotal = 0) claws back the original earning in
   * total, however many events it took to get there. Exactly so for
   * percentage/tiered commissions; for `fixed` ones the `Math.max(0, ...)`
   * clamp below leaves a measured residue of at most 1 fil of OVER-claw per
   * event once the commission ceiling binds — see the measured bounds in
   * item-cancellation-calc.ts.
   */
  private computeDeltaClawback(
    commission: {
      vendor_earning: number;
      commission_type: string;
      commission_rate: number | string;
    },
    oi: { line_total: number; refunded_amount: number } | null | undefined,
    eventRefundedAmount: number,
  ): number {
    // R4-I6: `Math.max(0, ...)`, not `Math.abs(...)`. Rows written before the
    // shared commission ceiling existed can carry a NEGATIVE vendor_earning
    // (an uncapped fixed fee at or above the net stored
    // `-round(0.05 * commission)`). `abs` turned a stored -50 into a +50
    // clawback — charging the vendor for money the ledger says they were
    // never paid — where the correct baseline is 0. No backfill exists for
    // those legacy rows, so this clamp is what makes them safe.
    const currentEarning = Math.max(0, commission.vendor_earning || 0);
    if (!oi) return currentEarning;

    const cumulativeRefund = oi.refunded_amount || 0;
    const previousCumulativeRefund = Math.max(0, cumulativeRefund - (eventRefundedAmount || 0));
    const previousSurvivingTotal = Math.max(0, oi.line_total - previousCumulativeRefund);
    const newSurvivingTotal = Math.max(0, oi.line_total - cumulativeRefund);

    const previousEarning =
      previousCumulativeRefund <= 0
        ? currentEarning
        : recomputeCommissionForSurvivingQty({
            survivingItemTotal: previousSurvivingTotal,
            type: commission.commission_type,
            rate: Number(commission.commission_rate),
          }).vendor_earning;

    const newEarning = recomputeCommissionForSurvivingQty({
      survivingItemTotal: newSurvivingTotal,
      type: commission.commission_type,
      rate: Number(commission.commission_rate),
    }).vendor_earning;

    return Math.max(0, previousEarning - newEarning);
  }

  async reverseForItems(
    manager: EntityManager,
    input: {
      items: Array<{ orderItemId: string; refundedQuantity: number; refundedAmount: number }>;
      sourceType: "return" | "dispute" | "item_cancellation";
      sourceId: string;
      reason: string;
    },
  ): Promise<{ recomputed: number; cancelled: number; clawedBack: number }> {
    const commissionRepo = manager.getRepository(Commission);
    const orderItemRepo = manager.getRepository(OrderItem);
    const adjustmentRepo = manager.getRepository(VendorPayoutAdjustment);

    let recomputed = 0;
    let cancelled = 0;
    let clawedBack = 0;

    for (const item of input.items) {
      const commission = await commissionRepo.findOne({
        where: { order_item_id: item.orderItemId } as any,
      });
      if (!commission) continue;

      // Already paid: the commission row is an immutable record of the
      // sale. Claw the money back through the signed adjustment ledger
      // instead of mutating it.
      if ((commission as any).status === CommissionStatus.paid) {
        // IMPORTANT A: the clawback is the DELTA this event introduces
        // (see computeDeltaClawback's derivation above), not
        // `currentEarning - earning(current cumulative surviving)` — that
        // older formula recomputes the full cumulative clawback on every
        // event, so a second partial reversal on the same paid commission
        // re-charges the first event's amount on top of its own. A full
        // refund still drives the running total to the entire original
        // earning, however many events it takes to get there — no special
        // case needed.
        const oi = await orderItemRepo.findOne({ where: { id: item.orderItemId } as any });
        if (!oi) {
          // Should not happen (order_item_id is a real FK) — fall back to a
          // full clawback rather than silently under-clawing on missing data.
          console.error(
            `[CommissionReversalService] order item ${item.orderItemId} not found while ` +
              `clawing back paid commission ${(commission as any).id} — falling back to a full clawback`,
            { sourceType: input.sourceType, sourceId: input.sourceId },
          );
        }
        const clawbackAmount = this.computeDeltaClawback(
          commission as any,
          oi as any,
          item.refundedAmount,
        );

        // R3-C4: a zero delta is legitimately reachable (a return line with a
        // 0/NULL refund_amount, a 1-fil dispute share whose rounded earning is
        // unchanged, a fixed-rate line whose commission already absorbed the
        // whole net) and `vendor_payout_adjustments` carries
        // `CHECK (amount_fils <> 0)`. Saving it raises 23514 — in
        // `return.service.confirmRefund` that throw lands AFTER the customer's
        // Stripe/BNPL refund has already gone out and on a NON-transactional
        // manager, stranding the return `refunded` with no commission
        // reversal; in `order-item-cancellation` the whole transaction rolls
        // back after a successful refund and, being deterministic, every
        // retry fails identically. There is nothing to record for a zero
        // clawback, so skip the row entirely.
        if (clawbackAmount <= 0) continue;

        await adjustmentRepo.save(
          adjustmentRepo.create({
            vendor_id: (commission as any).vendor_id,
            amount_fils: -clawbackAmount,
            reason: input.reason,
            source_type: input.sourceType,
            source_id: input.sourceId,
          } as any),
        );
        clawedBack++;
        continue;
      }

      const oi = await orderItemRepo.findOne({ where: { id: item.orderItemId } as any });
      if (!oi) continue;

      // Claimed by a draft — release the claim so the corrected figure is
      // what the next draft picks up. C1: nulling payout_id here without
      // touching the draft would leave that draft's stored net_amount
      // overstated by exactly this commission's earning, and STILL pay the
      // commission again once it's re-claimed by a future draft — the money
      // is sent twice. Invalidating the whole draft (reusing rejectDraft's
      // release logic via invalidateDraftForReversal) means the next
      // scheduled draft rebuilds correctly from current figures instead.
      if ((commission as any).payout_id) {
        const payoutId = (commission as any).payout_id as string;
        const result = await this.draftInvalidator.invalidateDraftForReversal(
          manager,
          payoutId,
          `Superseded by a reversal (${input.sourceType} ${input.sourceId}): ${input.reason}`,
        );
        if (result.invalidated) {
          (commission as any).payout_id = null;
        } else {
          // IMPORTANT B / R3-C2 / R3-I4: the claiming payout could not be
          // invalidated — it has a transfer (processing/paid, or a `failed`
          // row still carrying a gateway_reference), or it was already
          // soft-deleted, or it is gone.
          //
          // Whether the vendor owes anything back depends entirely on whether
          // the money actually LEFT: `processing`/`paid` means a Stripe
          // transfer exists, so the reversal becomes a compensating negative
          // adjustment and the commission row is left exactly as it is for a
          // human to resolve. `failed` means `stripe.transfers.create` threw
          // and NOTHING was sent — writing a clawback there charges the
          // vendor for money they never received, on top of never being paid
          // the failed payout itself (R3-I4). That decision, the
          // zero-amount skip (R3-C4) and the audit row all live in
          // PayoutService.recordUnreleasableClaim, which
          // `OrderStatusService.cancelOrder` calls too — the two structurally
          // identical branches used to diverge (one wrote a ledger row, one
          // only logged), which is the exact failure mode this shared sink
          // exists to prevent.
          //
          // When no money left, the reversal is NOT discarded: fall through
          // to the ordinary recompute/cancel below with `payout_id` still
          // set. The commission's figures stay current (so
          // `getAdminSummary.total_pending_fils` stops overstating), and the
          // drift is precisely what `assertClaimedSetReconciles` looks for —
          // any later approval or retry of that stale payout now refuses to
          // transfer instead of silently paying a refunded sale.
          //
          // R4-C1 narrowed which payouts can even reach this branch: a
          // `failed` payout with no `gateway_reference` is now released by
          // the CAS above like a `pending` one, because no transfer exists
          // for it. What is left here is the genuinely money-sent case
          // (`processing`/`paid`, or anything carrying a gateway reference),
          // plus a lost race against another invalidator.
          const clawbackAmount = this.computeDeltaClawback(
            commission as any,
            oi as any,
            item.refundedAmount,
          );
          const outcome = await this.draftInvalidator.recordUnreleasableClaim(manager, {
            commissionId: (commission as any).id ?? null,
            vendorId: (commission as any).vendor_id,
            payoutId,
            payoutStatus: result.payoutStatus,
            clawbackAmount,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            reason: input.reason,
          });
          if (outcome.moneyLeftThePlatform) {
            console.error(
              `[CommissionReversalService] cannot release commission ${(commission as any).id} — claimed by payout ${payoutId} in status "${result.payoutStatus}", whose transfer has already gone out. ${
                outcome.clawedBack
                  ? `Wrote a compensating adjustment of -${outcome.amount} fils and an audit row`
                  : "This event's clawback delta is 0 fils, so only an audit row was written (a zero adjustment violates the ledger's amount_fils <> 0 CHECK)"
              }; the commission remains claimed for manual resolution once the payout settles.`,
            );
            if (outcome.clawedBack) clawedBack++;
            continue;
          }
          console.error(
            `[CommissionReversalService] cannot release commission ${(commission as any).id} — claimed by payout ${payoutId} in status "${result.payoutStatus}". No money left the platform for it, so NO clawback was written; the commission is recomputed in place and stays claimed, which makes that payout fail its pre-transfer reconciliation rather than pay a reversed sale.`,
          );
        }
      }

      const survivingQty = (oi as any).quantity - (oi as any).refunded_quantity;
      if (survivingQty <= 0) {
        (commission as any).status = CommissionStatus.cancelled;
        cancelled++;
      } else {
        const recomputedFields = recomputeCommissionForSurvivingQty({
          survivingItemTotal: (oi as any).line_total - (oi as any).refunded_amount,
          type: (commission as any).commission_type,
          rate: Number((commission as any).commission_rate),
        });
        (commission as any).item_total = recomputedFields.item_total;
        (commission as any).commission_amount = recomputedFields.commission_amount;
        (commission as any).tax_on_commission = recomputedFields.tax_on_commission;
        (commission as any).vendor_earning = recomputedFields.vendor_earning;
        recomputed++;
      }
      await commissionRepo.save(commission);
    }

    return { recomputed, cancelled, clawedBack };
  }
}
