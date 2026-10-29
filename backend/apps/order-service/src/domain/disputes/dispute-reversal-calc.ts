// dispute-reversal-calc.ts — pure math, no I/O. Mirrors item-cancellation-calc.ts's style.
//
// Distributes a dispute's `resolution_amount` across the disputed
// vendor_order's order items, proportional to each item's OUTSTANDING
// balance (line_total - refunded_amount already applied) — NOT its full
// line_total, so an item already partly refunded never absorbs more than
// what it actually has left.
//
// Remainder rule: classic largest-remainder (Hare-Niemeyer) apportionment.
// Each item's exact share (amountToDistribute * outstanding_i /
// totalOutstanding) is floored first; the fils lost to flooring are handed
// out one at a time to the items with the largest fractional remainder
// (ties broken by outstanding desc, then input order). This guarantees the
// shares always sum EXACTLY to the amount distributed, and that no single
// item's share can exceed its own outstanding balance: for every item,
// floor(exact_i) + 1 <= outstanding_i, because exact_i <= outstanding_i
// whenever the amount actually distributed does not exceed totalOutstanding
// (which is enforced by the clamp below), and the ceiling of a value that is
// <= an integer can never exceed that integer.
export interface DisputeItemBalance {
  orderItemId: string;
  outstanding: number;
}

export interface DisputeReversalShare {
  orderItemId: string;
  amount: number;
}

export interface DisputeReversalDistribution {
  shares: DisputeReversalShare[];
  distributed: number;
  clamped: boolean;
}

export function distributeDisputeResolution(
  items: DisputeItemBalance[],
  resolutionAmount: number,
): DisputeReversalDistribution {
  const eligible = items.filter((i) => i.outstanding > 0);
  const totalOutstanding = eligible.reduce((sum, i) => sum + i.outstanding, 0);

  if (totalOutstanding <= 0 || resolutionAmount <= 0) {
    return { shares: [], distributed: 0, clamped: resolutionAmount > totalOutstanding };
  }

  // Never distribute money that does not exist: clamp to what is actually
  // outstanding rather than over-crediting items past their line total.
  const clamped = resolutionAmount > totalOutstanding;
  const amountToDistribute = clamped ? totalOutstanding : Math.floor(resolutionAmount);

  const rows = eligible.map((item, idx) => {
    const numerator = amountToDistribute * item.outstanding;
    const floorShare = Math.floor(numerator / totalOutstanding);
    const frac = numerator - floorShare * totalOutstanding;
    return {
      orderItemId: item.orderItemId,
      outstanding: item.outstanding,
      amount: floorShare,
      frac,
      idx,
    };
  });

  const flooredTotal = rows.reduce((sum, r) => sum + r.amount, 0);
  const remainder = amountToDistribute - flooredTotal;

  if (remainder > 0) {
    const byRemainder = [...rows].sort(
      (a, b) => b.frac - a.frac || b.outstanding - a.outstanding || a.idx - b.idx,
    );
    for (let i = 0; i < remainder; i++) {
      // Safe: remainder is always strictly less than the number of items
      // with a nonzero fractional remainder (see module header), so this
      // never runs past the items that can still absorb it.
      byRemainder[i]!.amount += 1;
    }
  }

  const shares = rows.map((r) => ({ orderItemId: r.orderItemId, amount: r.amount }));
  const distributed = shares.reduce((sum, s) => sum + s.amount, 0);

  return { shares, distributed, clamped };
}
