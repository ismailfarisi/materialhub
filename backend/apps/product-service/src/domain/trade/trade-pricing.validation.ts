// trade-pricing.validation.ts
// Vendor input rules for trade pricing. Pure: the service applies the result.
// Every failure is a 422 with a specific code so the dashboard can point at
// the field.
import { UNITS_OF_MEASURE, type UnitOfMeasure } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export const MAX_PRICE_TIERS = 10;
export const MAX_SAMPLE_QUANTITY = 20;

export interface TierInput {
  min_quantity: number;
  unit_price: number;
}

export interface TradeTermsInput {
  unit_of_measure?: string | null;
  units_per_pack?: number | null;
  pack_contents_unit?: string | null;
  min_order_quantity?: number;
  order_increment?: number;
  tiers?: TierInput[];
}

export interface ValidTradeTerms {
  unit_of_measure: UnitOfMeasure | null;
  units_per_pack: number | null;
  pack_contents_unit: UnitOfMeasure | null;
  min_order_quantity: number;
  order_increment: number;
  /** Sorted by min_quantity; undefined when the input did not send tiers. */
  tiers?: TierInput[];
}

const PACK_UNITS = new Set<string>(["pack", "carton", "box", "roll"]);

function fail(code: string, message: string, details?: unknown): never {
  throw new HttpError(422, message, code, details);
}

function isUnit(v: unknown): v is UnitOfMeasure {
  return typeof v === "string" && (UNITS_OF_MEASURE as readonly string[]).includes(v);
}

function wholeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/**
 * Validate trade terms for one sellable (a variant, or a product without
 * variants). `current` fills fields the input leaves out, so a partial update
 * is checked against the whole result. `basePrice` is the unit price charged
 * from the minimum up to the first tier.
 *
 * Rules:
 * - unit and pack-contents unit come from the fixed list;
 * - units_per_pack ≥ 1, only for pack-like units, and needs a contents unit;
 * - minimum order ≥ 1, increment ≥ 1 (valid quantities: MOQ, MOQ + k × increment);
 * - up to 10 tiers; each min_quantity is a whole number above the minimum
 *   order, distinct, and each tier's unit price is below base and below the
 *   tier before it.
 */
export function validateTradeTerms(
  input: TradeTermsInput,
  current: Partial<ValidTradeTerms>,
  basePrice: number,
): ValidTradeTerms {
  const pick = <K extends keyof ValidTradeTerms>(k: K, fallback: ValidTradeTerms[K]) =>
    ((input as any)[k] !== undefined
      ? (input as any)[k]
      : (current[k] ?? fallback)) as ValidTradeTerms[K];

  const unit = pick("unit_of_measure", null) ?? null;
  if (unit !== null && !isUnit(unit)) {
    fail("INVALID_UNIT_OF_MEASURE", `Unit must be one of: ${UNITS_OF_MEASURE.join(", ")}`);
  }

  const contents = pick("pack_contents_unit", null) ?? null;
  if (contents !== null && !isUnit(contents)) {
    fail(
      "INVALID_PACK_CONTENTS_UNIT",
      `Pack contents unit must be one of: ${UNITS_OF_MEASURE.join(", ")}`,
    );
  }

  const perPack = pick("units_per_pack", null) ?? null;
  if (perPack !== null) {
    if (!wholeNumber(perPack) || perPack < 1) {
      fail("INVALID_UNITS_PER_PACK", "Units per pack must be a whole number of at least 1");
    }
    if (!unit || !PACK_UNITS.has(unit)) {
      fail("INVALID_UNITS_PER_PACK", "Units per pack only applies to a pack, carton, box or roll");
    }
    if (!contents) {
      fail("INVALID_PACK_CONTENTS_UNIT", "Say what the pack holds (e.g. sheet)");
    }
  }

  const moq = pick("min_order_quantity", 1);
  if (!wholeNumber(moq) || moq < 1) {
    fail(
      "INVALID_MIN_ORDER_QUANTITY",
      "Minimum order quantity must be a whole number of at least 1",
    );
  }
  const inc = pick("order_increment", 1);
  if (!wholeNumber(inc) || inc < 1) {
    fail("INVALID_ORDER_INCREMENT", "Order increment must be a whole number of at least 1");
  }

  let tiers: TierInput[] | undefined;
  if (input.tiers !== undefined) {
    if (input.tiers.length > MAX_PRICE_TIERS) {
      fail("TOO_MANY_PRICE_TIERS", `Up to ${MAX_PRICE_TIERS} price tiers`);
    }
    tiers = [...input.tiers].sort((a, b) => a.min_quantity - b.min_quantity);
    let prevMin = 0;
    let prevPrice = basePrice;
    tiers.forEach((t, index) => {
      if (!wholeNumber(t.min_quantity) || t.min_quantity <= moq) {
        fail("TIER_BELOW_MIN_ORDER", `Each tier must start above the minimum order of ${moq}`, {
          index,
          min_quantity: t.min_quantity,
        });
      }
      if (t.min_quantity === prevMin) {
        fail("DUPLICATE_PRICE_TIER", `Two tiers start at ${t.min_quantity}`, { index });
      }
      if (!wholeNumber(t.unit_price) || t.unit_price < 0) {
        fail("INVALID_TIER_PRICE", "Tier prices are whole fils, 0 or more", { index });
      }
      if (t.unit_price >= prevPrice) {
        fail(
          "TIER_PRICE_NOT_LOWER",
          index === 0
            ? "A tier's unit price must be lower than the base price"
            : "Each tier's unit price must be lower than the tier before it",
          { index, unit_price: t.unit_price, must_be_below: prevPrice },
        );
      }
      prevMin = t.min_quantity;
      prevPrice = t.unit_price;
    });
  }

  return {
    unit_of_measure: unit,
    units_per_pack: perPack,
    pack_contents_unit: perPack === null ? null : contents,
    min_order_quantity: moq,
    order_increment: inc,
    ...(tiers ? { tiers } : {}),
  };
}

export interface SampleInput {
  enabled: boolean;
  price?: number;
  max_quantity?: number | null;
  sku?: string | null;
  quantity_on_hand?: number;
}

export function validateSample(input: SampleInput): void {
  if (!input.enabled) return;
  if (!wholeNumber(input.price) || input.price < 0) {
    fail("INVALID_SAMPLE_PRICE", "A sample needs a price in whole fils (0 for free)");
  }
  if (
    input.max_quantity != null &&
    (!wholeNumber(input.max_quantity) ||
      input.max_quantity < 1 ||
      input.max_quantity > MAX_SAMPLE_QUANTITY)
  ) {
    fail(
      "INVALID_SAMPLE_MAX_QUANTITY",
      `Samples per order must be between 1 and ${MAX_SAMPLE_QUANTITY}`,
    );
  }
}
