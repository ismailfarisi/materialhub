import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { AdminPayoutDraftAdjustmentBody } from "./admin-payout.dto.ts";

/**
 * FIX 6 (final review) — `amountFils` used to be an unbounded `Type.Integer()`.
 * Both `vendor_payouts.net_amount` and `vendor_payout_adjustments.amount_fils`
 * are Postgres int4, so `amountFils: 3e9` passed this DTO (it IS a valid JS
 * integer) and then died as a raw int4-overflow 500 in `addDraftAdjustment`
 * instead of a clean 400 on operator input to a money endpoint.
 */
describe("AdminPayoutDraftAdjustmentBody", () => {
  const valid = { amountFils: 5_000, reason: "Manual correction" };

  test("accepts an ordinary in-range amount", () => {
    expect(Value.Check(AdminPayoutDraftAdjustmentBody, valid)).toBe(true);
  });

  test("rejects an amount that overflows Postgres int4 (the reported 3e9 case)", () => {
    expect(
      Value.Check(AdminPayoutDraftAdjustmentBody, { ...valid, amountFils: 3_000_000_000 }),
    ).toBe(false);
  });

  test("rejects the negative int4 overflow too", () => {
    expect(
      Value.Check(AdminPayoutDraftAdjustmentBody, { ...valid, amountFils: -3_000_000_000 }),
    ).toBe(false);
  });

  test("accepts the exact int4 boundary values", () => {
    expect(
      Value.Check(AdminPayoutDraftAdjustmentBody, { ...valid, amountFils: 2_147_483_647 }),
    ).toBe(true);
    expect(
      Value.Check(AdminPayoutDraftAdjustmentBody, { ...valid, amountFils: -2_147_483_648 }),
    ).toBe(true);
  });

  test("rejects one past each int4 boundary", () => {
    expect(
      Value.Check(AdminPayoutDraftAdjustmentBody, { ...valid, amountFils: 2_147_483_648 }),
    ).toBe(false);
    expect(
      Value.Check(AdminPayoutDraftAdjustmentBody, { ...valid, amountFils: -2_147_483_649 }),
    ).toBe(false);
  });
});
