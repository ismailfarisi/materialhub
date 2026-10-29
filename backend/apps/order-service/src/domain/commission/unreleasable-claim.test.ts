import { describe, expect, test } from "bun:test";
import { decideUnreleasableClaim } from "./unreleasable-claim.ts";

describe("decideUnreleasableClaim", () => {
  describe("R3-I4 — a clawback is only owed when money actually left", () => {
    test("processing: a transfer exists, so the vendor owes the delta back", () => {
      expect(
        decideUnreleasableClaim({ payoutStatus: "processing", clawbackAmount: 8_950 }),
      ).toEqual({ moneyLeftThePlatform: true, amount: 8_950, writeAdjustment: true });
    });

    test("paid: same", () => {
      expect(decideUnreleasableClaim({ payoutStatus: "paid", clawbackAmount: 61_550 })).toEqual({
        moneyLeftThePlatform: true,
        amount: 61_550,
        writeAdjustment: true,
      });
    });

    test("failed: stripe.transfers.create threw, nothing was sent — NO clawback", () => {
      // The finding's example: earning 8_950, full return. Writing -8_950
      // here nets the vendor's next payout while the 8_950 they were never
      // paid stays unpaid — the same money taken twice.
      expect(decideUnreleasableClaim({ payoutStatus: "failed", clawbackAmount: 8_950 })).toEqual({
        moneyLeftThePlatform: false,
        amount: 0,
        writeAdjustment: false,
      });
    });

    test("pending (a soft-deleted draft read back withDeleted): no clawback", () => {
      expect(decideUnreleasableClaim({ payoutStatus: "pending", clawbackAmount: 8_950 })).toEqual({
        moneyLeftThePlatform: false,
        amount: 0,
        writeAdjustment: false,
      });
    });

    test("not_found: no clawback", () => {
      expect(
        decideUnreleasableClaim({ payoutStatus: "not_found", clawbackAmount: 8_950 }),
      ).toMatchObject({ writeAdjustment: false, amount: 0 });
    });
  });

  describe("R3-C4 — never a zero (or negative) row: the ledger CHECKs amount_fils <> 0", () => {
    test("a zero delta against a processing payout writes nothing", () => {
      expect(
        decideUnreleasableClaim({ payoutStatus: "processing", clawbackAmount: 0 }),
      ).toMatchObject({ amount: 0, writeAdjustment: false });
    });

    test("a negative delta is floored at zero and writes nothing", () => {
      expect(
        decideUnreleasableClaim({ payoutStatus: "processing", clawbackAmount: -5 }),
      ).toMatchObject({ amount: 0, writeAdjustment: false });
    });

    test("the amount is always an integer number of fils", () => {
      const d = decideUnreleasableClaim({ payoutStatus: "paid", clawbackAmount: 1_234.9 });
      expect(Number.isInteger(d.amount)).toBe(true);
      expect(d.amount).toBe(1_234);
    });
  });
});
