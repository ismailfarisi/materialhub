// unreleasable-claim.ts — pure decision logic, no I/O.
//
// "A reversal (return / dispute / item cancellation / whole-order
// cancellation) hit a commission whose claiming payout could not be
// invalidated. Does the vendor owe money back, and how much?"
//
// Extracted so the single answer is shared by PayoutService.recordUnreleasableClaim
// (the only writer) and testable on its own against the exact inputs the
// round-3 review proved reachable.

/** Payout statuses in which a Stripe transfer exists — money has left, or is leaving, the platform. */
const MONEY_SENT_STATUSES = new Set(["processing", "paid"]);

export interface UnreleasableClaimDecision {
  /** True only when a transfer actually exists for this payout. */
  moneyLeftThePlatform: boolean;
  /** Absolute fils to claw back. Always a non-negative integer; 0 means "write nothing". */
  amount: number;
  /** Whether a `vendor_payout_adjustments` row may be written at all. */
  writeAdjustment: boolean;
}

export function decideUnreleasableClaim(input: {
  payoutStatus: string;
  clawbackAmount: number;
}): UnreleasableClaimDecision {
  // R3-I4: `failed` means `stripe.transfers.create` threw and NOTHING was
  // sent. Writing a clawback there charges the vendor for money they never
  // received — and since the commission also stays claimed (excluded from
  // `computePayoutTotals`), they would lose the same amount twice. Same for
  // `pending` (a soft-deleted draft read back with withDeleted) and
  // `not_found`.
  //
  // R4-C1 narrowed how a `failed` payout reaches here at all: the shared
  // invalidation CAS now releases `pending` AND `failed` payouts that carry no
  // `gateway_reference`, so an ordinary failed draft is released rather than
  // frozen. What still arrives with `failed` is the pathological remainder —
  // a row that failed while holding a transfer id, or a lost CAS race — and
  // for it this rule is unchanged and still correct.
  const moneyLeftThePlatform = MONEY_SENT_STATUSES.has(input.payoutStatus);

  // R3-C4: `vendor_payout_adjustments` carries CHECK (amount_fils <> 0), and a
  // zero delta is reachable in ordinary operation — a return line with a
  // 0/NULL refund_amount, a 1-fil dispute share whose rounded earning is
  // unchanged, a fixed-rate line whose commission already absorbed the whole
  // net. Saving one raises 23514 AFTER the customer refund has already gone
  // out. Never write a zero row.
  const amount = moneyLeftThePlatform ? Math.max(0, Math.trunc(input.clawbackAmount || 0)) : 0;

  return { moneyLeftThePlatform, amount, writeAdjustment: amount > 0 };
}
