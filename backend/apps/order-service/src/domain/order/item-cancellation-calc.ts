// item-cancellation-calc.ts — pure math, no I/O. Mirrors CommissionService formula.
import { maxCommissionForNet } from "../commission/commission-cap.ts";
export function computeItemRefund(lineTotal: number, quantity: number, cancelQty: number): number {
  if (quantity <= 0) return 0;
  return Math.round((lineTotal * cancelQty) / quantity);
}

export function recomputeCommissionForSurvivingQty(input: {
  survivingItemTotal: number;
  type: string;
  rate: number;
}): {
  item_total: number;
  commission_amount: number;
  tax_on_commission: number;
  vendor_earning: number;
} {
  const netExVat = Math.round(input.survivingItemTotal / 1.05);
  const rawCommission =
    input.type === "fixed"
      ? Math.min(input.rate, netExVat)
      : Math.round(netExVat * (input.rate / 100));
  // R3-MINOR-1: cap the commission so that commission + its own 5% tax can
  // never exceed the net — i.e. `vendor_earning` can never go NEGATIVE.
  //
  // The old cap was `min(rate, netExVat)`, which ignored the tax charged on
  // top of the commission: a fixed rate at or above the net left
  // `vendor_earning = -round(0.05 * commission)`. That is not merely odd
  // bookkeeping — it breaks the exact telescoping the reversal clawback
  // depends on. Fixed rate 5,000 on a 2-unit 10,500 line: event 1 clawed
  // 5,000 and event 2 clawed 0 (the `Math.max(0, …)` clamp swallowing a
  // negative delta), totalling 5,000 against an original earning of 4,750 —
  // a 250-fil OVER-CLAW. With the cap below, earning is monotonically
  // non-decreasing in the surviving total and never negative.
  //
  // How exactly successive clawbacks then telescope, MEASURED (round 4 —
  // the previous claim here was a flat "sum to exactly the original
  // earning", which is true for percentage/tiered and false for fixed):
  //   - percentage/tiered: EXACT. 0 drift over 2,500 rate/unit/qty
  //     combinations.
  //   - fixed: up to 1 fil of OVER-claw per reversal event, from the
  //     rounding of the 5% tax on a commission that the ceiling is already
  //     binding. Never under-claws (0 negative drifts over 174,240
  //     combinations) and never exceeds qty/2 fils in total; worst case
  //     measured is 6 fils across 12 single-unit returns. Smallest
  //     reproducer: fixed rate 1,000 on a 5x210 line — original earning 0,
  //     five unit returns claw back 2.
  // The residue is a rounding artefact of the fixed-fee ceiling, not a
  // formula error; it is recorded here so the next reader does not build on
  // an exactness that only holds for percentages.
  //
  // The ceiling itself lives in commission-cap.ts, shared with the CREATION
  // path (CommissionService.calculateAmount) — capping only one side broke the
  // `stored vendor_earning === recompute(line_total)` identity that makes the
  // clawbacks telescope exactly.
  const commissionAmount = Math.min(rawCommission, maxCommissionForNet(netExVat));
  const taxOnCommission = Math.round(commissionAmount * 0.05);
  const vendorEarning = netExVat - commissionAmount - taxOnCommission;
  return {
    item_total: input.survivingItemTotal,
    commission_amount: commissionAmount,
    tax_on_commission: taxOnCommission,
    vendor_earning: vendorEarning,
  };
}

/**
 * Shrink a cash-on-delivery order's master totals when part of it is taken
 * out before anything was collected (admin item cancel, vendor sub-order
 * reject/cancel). Nothing was paid, so nothing is refunded: the order simply
 * got smaller and `refund_total` is left alone. Shared by
 * OrderItemCancellationService and OrderStatusService so both paths shrink
 * the same way.
 *
 *   itemsGross     VAT-inclusive goods value removed (line totals)
 *   shippingGross  shipping removed (the emptied vendor sub-order's
 *                  `shipping_cost`)
 *
 * VAT sits inside the line totals; `tax_total` loses the removed goods'
 * proportional share of it. Mutates and returns `order`. Integer fils.
 */
export function shrinkCodOrderTotals<
  T extends {
    subtotal?: number | null;
    tax_total?: number | null;
    shipping_total?: number | null;
    grand_total?: number | null;
  },
>(order: T, removed: { itemsGross: number; shippingGross: number }): T {
  const items = Math.max(0, Math.round(removed.itemsGross));
  const shipping = Math.max(0, Math.round(removed.shippingGross));
  const subtotalBefore = Number(order.subtotal ?? 0);
  if (subtotalBefore > 0 && order.tax_total != null) {
    const taxShare = Math.round(
      (Number(order.tax_total) * Math.min(items, subtotalBefore)) / subtotalBefore,
    );
    order.tax_total = Math.max(0, Number(order.tax_total) - taxShare);
  }
  if (order.subtotal != null) order.subtotal = Math.max(0, subtotalBefore - items);
  if (order.shipping_total != null && shipping > 0) {
    order.shipping_total = Math.max(0, Number(order.shipping_total) - shipping);
  }
  if (order.grand_total != null) {
    order.grand_total = Math.max(0, Number(order.grand_total) - items - shipping);
  }
  return order;
}
