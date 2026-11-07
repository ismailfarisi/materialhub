// price-resolver.ts
// The single place a cart line's unit price is decided. The cart (add, update,
// merge, read) and the checkout quote all price lines through
// `resolveLinePrice`, so the price a buyer sees is the price they are charged.
//
// Order of precedence: quote > tier > base.
//   - base:  the variant's (or simple product's) `price`, charged from the
//            minimum order quantity up to the first tier.
//   - tier:  the highest `variant_price_tiers` row whose min_quantity is at or
//            below the line quantity. A tier never raises the price above base.
//   - quote: RFQ HOOK (workstream 2, feature/rfq). When a cart line comes from
//            an accepted quote, pass `quotedUnitPrice` (cart_items.quoted_unit_price
//            for a line with a quote_id). It wins over tiers and base. Nothing
//            in this workstream sets it; the branch is here so the RFQ stream
//            only has to feed the value in.
//
// All amounts are integer fils.

export interface PriceTierInput {
  min_quantity: number;
  unit_price: number;
}

export interface ResolvePriceInput {
  /** Base unit price in fils. */
  basePrice: number;
  /** Quantity-break tiers; any order. Ignored for samples (pass []). */
  tiers: readonly PriceTierInput[];
  /** Line quantity, in the listing's unit of measure. */
  quantity: number;
  /** RFQ hook: unit price agreed on an accepted quote. See the header comment. */
  quotedUnitPrice?: number | null;
}

export type PriceSource = "base" | "tier" | "quote";

export interface NextTier {
  min_quantity: number;
  unit_price: number;
  /** Units to add to the line to reach this tier. */
  units_to_go: number;
}

export interface ResolvedPrice {
  unitPrice: number;
  lineTotal: number;
  source: PriceSource;
  /** The tier that set the price, when source is "tier". */
  tier: PriceTierInput | null;
  baseUnitPrice: number;
  /** (base − unit) × quantity, never negative. */
  savingsFils: number;
  /** The next cheaper tier above this quantity, if any (not for quoted lines). */
  nextTier: NextTier | null;
}

/** Tiers sorted by min_quantity ascending, keeping valid, distinct rows only. */
export function normaliseTiers(tiers: readonly PriceTierInput[]): PriceTierInput[] {
  const byMin = new Map<number, PriceTierInput>();
  for (const t of tiers) {
    const min = Math.trunc(Number(t.min_quantity));
    const price = Math.trunc(Number(t.unit_price));
    if (!Number.isFinite(min) || !Number.isFinite(price) || min < 2 || price < 0) continue;
    byMin.set(min, { min_quantity: min, unit_price: price });
  }
  return [...byMin.values()].sort((a, b) => a.min_quantity - b.min_quantity);
}

/** The tier that applies at `quantity`, or null when the base price applies. */
export function tierFor(
  tiers: readonly PriceTierInput[],
  quantity: number,
  basePrice: number,
): PriceTierInput | null {
  let hit: PriceTierInput | null = null;
  for (const t of normaliseTiers(tiers)) {
    if (t.min_quantity <= quantity) hit = t;
  }
  return hit && hit.unit_price < basePrice ? hit : null;
}

export function resolveLinePrice(input: ResolvePriceInput): ResolvedPrice {
  const basePrice = Math.max(0, Math.trunc(input.basePrice));
  const quantity = Math.max(0, Math.trunc(input.quantity));
  const tiers = normaliseTiers(input.tiers);

  // ── RFQ hook: quote > tier > base ─────────────────────────────────
  // A quote never makes the buyer pay MORE than the listing charges for the
  // same quantity: when the listing's own quantity-break price is lower, that
  // price applies to the quoted line.
  if (input.quotedUnitPrice != null && Number.isFinite(input.quotedUnitPrice)) {
    const quoted = Math.max(0, Math.trunc(input.quotedUnitPrice));
    const listedTier = tierFor(tiers, quantity, basePrice);
    const listed = listedTier ? listedTier.unit_price : basePrice;
    const unitPrice = Math.min(quoted, listed);
    const quoteWins = quoted <= listed;
    return {
      unitPrice,
      lineTotal: unitPrice * quantity,
      source: quoteWins ? "quote" : listedTier ? "tier" : "base",
      tier: quoteWins ? null : listedTier,
      baseUnitPrice: basePrice,
      savingsFils: Math.max(0, (basePrice - unitPrice) * quantity),
      nextTier: null,
    };
  }

  const tier = tierFor(tiers, quantity, basePrice);
  const unitPrice = tier ? tier.unit_price : basePrice;

  const next = tiers.find((t) => t.min_quantity > quantity && t.unit_price < unitPrice) ?? null;

  return {
    unitPrice,
    lineTotal: unitPrice * quantity,
    source: tier ? "tier" : "base",
    tier,
    baseUnitPrice: basePrice,
    savingsFils: Math.max(0, (basePrice - unitPrice) * quantity),
    nextTier: next
      ? {
          min_quantity: next.min_quantity,
          unit_price: next.unit_price,
          units_to_go: next.min_quantity - quantity,
        }
      : null,
  };
}

/** Lowest unit price any quantity can reach: the "from" price on listings. */
export function lowestUnitPrice(basePrice: number, tiers: readonly PriceTierInput[]): number {
  return normaliseTiers(tiers).reduce((min, t) => Math.min(min, t.unit_price), basePrice);
}
