/**
 * Vendors must not see orders whose payment never landed.
 *
 * `order-creation.service.ts` creates every `vendor_order` with
 * `status: "confirmed"` while the master order is still `pending_payment` —
 * so without this predicate a vendor sees a live, actionable order (and its
 * revenue, in the dashboard tiles) the instant a customer reaches checkout,
 * whether or not that customer ever pays.
 *
 * COD is the exception and must stay visible: choosing COD *is* the
 * commitment — `checkout.service.ts`'s COD branch records the coupon, drains
 * the cart, books the carrier and emails the vendor right there — and a COD
 * master order legitimately sits in `pending_payment` until the courier
 * collects cash at delivery (the COD Payment row is only marked `captured`
 * when the parent aggregates to `delivered`, see `order-status.service.ts`).
 * Filtering COD out would hide real orders during exactly the window in which
 * the vendor needs to act on them.
 *
 * So this hides exactly one thing: an order still awaiting a prepaid payment
 * that hasn't arrived. Once the payment is captured the master leaves
 * `pending_payment` and the order appears; if it is never paid the
 * pending-order reaper cancels it.
 *
 * ── Why `payment_status = 'captured'` is also an escape hatch ──────────────
 * Keying on `orders.status` alone would make this predicate fail CLOSED on
 * exactly the class of bug the rest of this branch fixes: side effects commit
 * while the status transition rolls back. The `changed_by` uuid crash did
 * precisely that, and `markOrderPaid` has stranded `payment_status` before
 * (MH-2026-000123). An order whose money was captured but whose `status` is
 * stuck at `pending_payment` would then be invisible to the vendor — real
 * money in, nobody fulfilling it, and nothing surfacing it. Hiding an unpaid
 * order is a cosmetic error; hiding a PAID one is a fulfilment failure, so
 * captured money always wins over a stale status.
 *
 * Written as an EXISTS subquery rather than a join so it can be dropped into
 * query builders that don't already join `orders` (the dashboard aggregates).
 * The `payments` EXISTS is deliberately the LAST disjunct: Postgres evaluates
 * the cheap `orders` column tests first and only reaches the subquery for
 * orders actually sitting in `pending_payment` (see `idx_payments_order`,
 * added by `AddPaymentsOrderIdIndex1785100000000`).
 */
export function vendorVisibleOrderPredicate(vendorOrderAlias = "vo"): string {
  return `EXISTS (
    SELECT 1 FROM orders o_vis
    WHERE o_vis.id = ${vendorOrderAlias}.order_id
      AND (
        o_vis.status <> 'pending_payment'
        OR o_vis.payment_status = 'captured'
        OR EXISTS (
          SELECT 1 FROM payments p_vis
          WHERE p_vis.order_id = o_vis.id AND p_vis.gateway = 'cod'
        )
      )
  )`;
}
