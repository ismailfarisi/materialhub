/**
 * Admin edits to a payment method's limits. Amounts are fils (integers).
 * `min_amount_fils`/`max_amount_fils` are the order totals the method is
 * offered for (COD max, Tabby/Tamara thresholds); the surcharge is COD-only.
 */
export interface PaymentMethodPatchBody {
  is_active?: boolean;
  surcharge_fils?: number;
  min_amount_fils?: number;
  max_amount_fils?: number;
}

export interface PaymentMethodRow {
  provider: string;
  is_active: boolean;
  surcharge_fils: number | null;
  min_amount_fils: number;
  max_amount_fils: number;
}

export type PaymentMethodPatchResult =
  | {
      ok: true;
      patch: Partial<PaymentMethodRow>;
      changes: Record<string, { old: unknown; new: unknown }>;
    }
  | { ok: false; status: 400; error: string; message: string };

const FIELDS = ["is_active", "surcharge_fils", "min_amount_fils", "max_amount_fils"] as const;

export function buildPaymentMethodPatch(
  row: PaymentMethodRow,
  body: PaymentMethodPatchBody,
): PaymentMethodPatchResult {
  const given = FIELDS.filter((f) => body[f] !== undefined);
  if (given.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "NO_FIELDS",
      message: `At least one of ${FIELDS.join(", ")} must be provided`,
    };
  }
  if (body.surcharge_fils !== undefined && row.provider !== "cod") {
    return {
      ok: false,
      status: 400,
      error: "INVALID_FIELD",
      message: "surcharge_fils is only editable for COD",
    };
  }
  for (const f of ["surcharge_fils", "min_amount_fils", "max_amount_fils"] as const) {
    const v = body[f];
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 0)) {
      return {
        ok: false,
        status: 400,
        error: "INVALID_AMOUNT",
        message: `${f} must be a whole number of fils, 0 or more`,
      };
    }
  }
  const min = body.min_amount_fils ?? row.min_amount_fils;
  const max = body.max_amount_fils ?? row.max_amount_fils;
  if (min > max) {
    return {
      ok: false,
      status: 400,
      error: "MIN_ABOVE_MAX",
      message: "The minimum order amount can't be above the maximum",
    };
  }

  const patch: Partial<PaymentMethodRow> = {};
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const f of given) {
    const next = body[f];
    (patch as Record<string, unknown>)[f] = next;
    if (row[f] !== next) changes[f] = { old: row[f], new: next };
  }
  return { ok: true, patch, changes };
}
