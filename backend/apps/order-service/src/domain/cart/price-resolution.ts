/**
 * Cart line unit-price resolution. Order of precedence: quote > tier > base.
 *
 * OWNERSHIP: the trade-pricing workstream (feature/trade-pricing) owns this
 * resolver and the tier step. The RFQ workstream (feature/rfq) only adds the
 * marked QUOTE BRANCH below. When the two merge, keep the quote branch first.
 */
export interface PriceInputs {
  /** The variant's (or product's) list price in fils. */
  basePrice: number;
  /** Quantity-break tier price in fils, when trade pricing applies. */
  tierPrice?: number | null;
  /** Set on a line created by accepting a quote (cart_items.quote_id). */
  quoteId?: string | null;
  /** The accepted quote's per-unit price in fils (cart_items.quoted_unit_price). */
  quotedUnitPrice?: number | null;
}

export type PriceSource = "quote" | "tier" | "base";

export function resolveUnitPrice(inputs: PriceInputs): { unitPrice: number; source: PriceSource } {
  // ── QUOTE BRANCH (feature/rfq) ─────────────────────────────────────────
  // An accepted quote locks the price for that line; it beats any tier.
  if (inputs.quoteId && inputs.quotedUnitPrice != null && inputs.quotedUnitPrice > 0) {
    return { unitPrice: inputs.quotedUnitPrice, source: "quote" };
  }
  // ── END QUOTE BRANCH ───────────────────────────────────────────────────

  if (inputs.tierPrice != null && inputs.tierPrice > 0) {
    return { unitPrice: inputs.tierPrice, source: "tier" };
  }
  return { unitPrice: inputs.basePrice, source: "base" };
}
