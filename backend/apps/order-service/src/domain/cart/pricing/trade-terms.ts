// trade-terms.ts
// The buying rules of one cart line: unit, minimum order, order increment,
// sample cap and price tiers. Pure, so the cart, the quote and their tests all
// read the same rules.
import { HttpError } from "@materialhub/plugins";
import type { PriceTierInput } from "./price-resolver.ts";

/** Per-order cap on a sample when the vendor leaves `sample_max_quantity` empty. */
export const DEFAULT_SAMPLE_MAX_QUANTITY = 2;

export interface TradeTerms {
  unit: string | null;
  unitsPerPack: number | null;
  packContentsUnit: string | null;
  minOrderQuantity: number;
  orderIncrement: number;
  isSample: boolean;
  /** Effective per-order cap; null when the line is not a sample. */
  maxQuantity: number | null;
  basePrice: number;
  tiers: PriceTierInput[];
}

type TermsSource = {
  price?: number | null;
  unit_of_measure?: string | null;
  units_per_pack?: number | null;
  pack_contents_unit?: string | null;
  min_order_quantity?: number | null;
  order_increment?: number | null;
  is_sample?: boolean | null;
  sample_max_quantity?: number | null;
};

type TierRow = PriceTierInput & { variant_id?: string | null };

function positiveInt(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/**
 * Terms for a line. A variant line reads the variant's own columns and tiers;
 * a line for a product without variants reads the product's columns and the
 * product-level tiers (variant_id null). Samples never carry tiers and always
 * order in single units.
 */
export function tradeTermsFor(
  product: TermsSource,
  variant: (TermsSource & { id?: string }) | null | undefined,
  tierRows: readonly TierRow[] = [],
): TradeTerms {
  const src = variant ?? product;
  const isSample = Boolean(variant?.is_sample);
  const tiers = isSample
    ? []
    : tierRows
        .filter((t) => (variant ? t.variant_id === variant.id : t.variant_id == null))
        .map((t) => ({ min_quantity: t.min_quantity, unit_price: t.unit_price }));
  return {
    unit: src.unit_of_measure ?? null,
    unitsPerPack: src.units_per_pack ?? null,
    packContentsUnit: src.pack_contents_unit ?? null,
    minOrderQuantity: isSample ? 1 : positiveInt(src.min_order_quantity, 1),
    orderIncrement: isSample ? 1 : positiveInt(src.order_increment, 1),
    isSample,
    maxQuantity: isSample
      ? positiveInt(variant?.sample_max_quantity, DEFAULT_SAMPLE_MAX_QUANTITY)
      : null,
    basePrice: Math.max(0, Math.trunc(Number(src.price ?? 0))),
    tiers,
  };
}

export type QuantityViolationCode =
  | "MIN_ORDER_QUANTITY"
  | "ORDER_INCREMENT"
  | "SAMPLE_QUANTITY_CAP";

export interface QuantityViolation {
  code: QuantityViolationCode;
  message: string;
  details: {
    quantity: number;
    min_order_quantity: number;
    order_increment: number;
    max_quantity: number | null;
    unit: string | null;
    /** Closest valid quantity at or above the request (at or below the cap for samples). */
    suggested_quantity: number;
  };
}

/** Smallest valid quantity at or above `quantity`: MOQ, then MOQ + k × increment. */
export function nextValidQuantity(terms: TradeTerms, quantity: number): number {
  const moq = terms.minOrderQuantity;
  const inc = terms.orderIncrement;
  if (quantity <= moq) return moq;
  return moq + Math.ceil((quantity - moq) / inc) * inc;
}

/**
 * Null when `quantity` is orderable. Valid quantities are the minimum order
 * quantity and every step of `order_increment` above it (MOQ 50, increment 25
 * → 50, 75, 100 …). A sample is capped at its per-order maximum.
 */
export function checkQuantity(terms: TradeTerms, quantity: number): QuantityViolation | null {
  const unitWord = terms.unit ?? "unit";
  const base = {
    quantity,
    min_order_quantity: terms.minOrderQuantity,
    order_increment: terms.orderIncrement,
    max_quantity: terms.maxQuantity,
    unit: terms.unit,
  };
  if (terms.isSample && terms.maxQuantity != null && quantity > terms.maxQuantity) {
    return {
      code: "SAMPLE_QUANTITY_CAP",
      message: `Samples are limited to ${terms.maxQuantity} per order`,
      details: { ...base, suggested_quantity: terms.maxQuantity },
    };
  }
  if (quantity < terms.minOrderQuantity) {
    return {
      code: "MIN_ORDER_QUANTITY",
      message: `The minimum order is ${terms.minOrderQuantity} × ${unitWord}`,
      details: { ...base, suggested_quantity: terms.minOrderQuantity },
    };
  }
  if ((quantity - terms.minOrderQuantity) % terms.orderIncrement !== 0) {
    const suggested = nextValidQuantity(terms, quantity);
    return {
      code: "ORDER_INCREMENT",
      message:
        terms.minOrderQuantity > 1
          ? `Order ${terms.minOrderQuantity} × ${unitWord}, then steps of ${terms.orderIncrement}`
          : `Order in steps of ${terms.orderIncrement} × ${unitWord}`,
      details: { ...base, suggested_quantity: suggested },
    };
  }
  return null;
}

/** Throw a 422 carrying the violation code and details for the client. */
export function assertQuantity(terms: TradeTerms, quantity: number): void {
  const v = checkQuantity(terms, quantity);
  if (v) throw new HttpError(422, v.message, v.code, v.details);
}
