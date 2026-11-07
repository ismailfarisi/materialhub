// return-refund-split.ts — pure: share a return's refund across its lines.

export interface RefundSplitLine {
  /** Weight of the line: the returned units' paid value (line_total pro rata). */
  value: number;
}

/**
 * Split `total` (integer fils) across `lines` in proportion to their value,
 * each share rounded down to a whole fil, the remainder on the last line, so
 * the shares always add up to exactly `total`. With no value to weigh by
 * (every line 0) the split is by line count, the remainder again on the last.
 */
export function splitRefundAcrossLines(total: number, lines: RefundSplitLine[]): number[] {
  const n = lines.length;
  if (n === 0) return [];
  const amount = Math.max(0, Math.round(total));
  const weights = lines.map((l) => Math.max(0, Number(l.value) || 0));
  const sum = weights.reduce((s, w) => s + w, 0);
  const shares = weights.map((w) =>
    sum > 0 ? Math.floor((amount * w) / sum) : Math.floor(amount / n),
  );
  const allocated = shares.slice(0, -1).reduce((s, x) => s + x, 0);
  shares[n - 1] = amount - allocated;
  return shares;
}
