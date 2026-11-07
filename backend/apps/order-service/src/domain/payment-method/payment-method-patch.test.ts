import { describe, expect, test } from "bun:test";
import { buildPaymentMethodPatch } from "./payment-method-patch.ts";

const cod = {
  provider: "cod",
  is_active: true,
  surcharge_fils: 1000,
  min_amount_fils: 0,
  max_amount_fils: 300000,
};
const tabby = {
  provider: "tabby",
  is_active: true,
  surcharge_fils: null,
  min_amount_fils: 10000,
  max_amount_fils: 500000,
};

describe("buildPaymentMethodPatch", () => {
  test("edits COD max and surcharge, recording only what changed", () => {
    const r = buildPaymentMethodPatch(cod, { max_amount_fils: 250000, surcharge_fils: 1000 });
    expect(r).toEqual({
      ok: true,
      patch: { max_amount_fils: 250000, surcharge_fils: 1000 },
      changes: { max_amount_fils: { old: 300000, new: 250000 } },
    });
  });

  test("edits BNPL thresholds", () => {
    const r = buildPaymentMethodPatch(tabby, { min_amount_fils: 20000, max_amount_fils: 400000 });
    expect(r.ok).toBe(true);
  });

  test("rejects min above max, including against the stored value", () => {
    expect(buildPaymentMethodPatch(tabby, { min_amount_fils: 600000 })).toMatchObject({
      ok: false,
      error: "MIN_ABOVE_MAX",
    });
    expect(
      buildPaymentMethodPatch(tabby, { min_amount_fils: 5, max_amount_fils: 4 }),
    ).toMatchObject({ ok: false });
  });

  test("rejects negative or fractional amounts and a BNPL surcharge", () => {
    expect(buildPaymentMethodPatch(cod, { max_amount_fils: -1 })).toMatchObject({
      ok: false,
      error: "INVALID_AMOUNT",
    });
    expect(buildPaymentMethodPatch(cod, { max_amount_fils: 1.5 })).toMatchObject({
      ok: false,
      error: "INVALID_AMOUNT",
    });
    expect(buildPaymentMethodPatch(tabby, { surcharge_fils: 100 })).toMatchObject({
      ok: false,
      error: "INVALID_FIELD",
    });
  });

  test("needs at least one field", () => {
    expect(buildPaymentMethodPatch(cod, {})).toMatchObject({ ok: false, error: "NO_FIELDS" });
  });
});
