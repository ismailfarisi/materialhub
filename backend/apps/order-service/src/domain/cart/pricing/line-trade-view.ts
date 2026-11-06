// line-trade-view.ts
// What GET /cart tells the storefront about each line's trade pricing: the
// unit, the rules, the tier in force, the savings and the next tier.
import { type NextTier, type PriceSource, resolveLinePrice } from "./price-resolver.ts";
import { type QuantityViolationCode, type TradeTerms, checkQuantity } from "./trade-terms.ts";

export interface CartLineTrade {
  unit: string | null;
  units_per_pack: number | null;
  pack_contents_unit: string | null;
  min_order_quantity: number;
  order_increment: number;
  is_sample: boolean;
  max_quantity: number | null;
  base_unit_price: number;
  /** Unit price the resolver gives at the line's current quantity. */
  live_unit_price: number;
  price_source: PriceSource;
  tier: { min_quantity: number; unit_price: number } | null;
  savings_fils: number;
  next_tier: NextTier | null;
  tiers: { min_quantity: number; unit_price: number }[];
  violation: {
    code: QuantityViolationCode;
    message: string;
    suggested_quantity: number;
  } | null;
}

export function lineTradeView(terms: TradeTerms, quantity: number): CartLineTrade {
  const resolved = resolveLinePrice({
    basePrice: terms.basePrice,
    tiers: terms.tiers,
    quantity,
  });
  const v = checkQuantity(terms, quantity);
  return {
    unit: terms.unit,
    units_per_pack: terms.unitsPerPack,
    pack_contents_unit: terms.packContentsUnit,
    min_order_quantity: terms.minOrderQuantity,
    order_increment: terms.orderIncrement,
    is_sample: terms.isSample,
    max_quantity: terms.maxQuantity,
    base_unit_price: resolved.baseUnitPrice,
    live_unit_price: resolved.unitPrice,
    price_source: resolved.source,
    tier: resolved.tier,
    savings_fils: resolved.savingsFils,
    next_tier: resolved.nextTier,
    tiers: [...terms.tiers].sort((a, b) => a.min_quantity - b.min_quantity),
    violation: v
      ? { code: v.code, message: v.message, suggested_quantity: v.details.suggested_quantity }
      : null,
  };
}
