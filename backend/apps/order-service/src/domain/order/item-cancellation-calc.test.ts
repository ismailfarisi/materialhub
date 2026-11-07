import { describe, expect, test } from "bun:test";
import {
  computeItemRefund,
  recomputeCommissionForSurvivingQty,
  shrinkCodOrderTotals,
} from "./item-cancellation-calc.ts";

describe("computeItemRefund", () => {
  test("full line refunds the whole line_total", () => {
    expect(computeItemRefund(10500, 3, 3)).toBe(10500);
  });
  test("partial qty refunds a proportional VAT-inclusive slice", () => {
    // 10500 fils over 3 units => 3500/unit; cancel 2 => 7000
    expect(computeItemRefund(10500, 3, 2)).toBe(7000);
  });
  test("rounds to nearest fils", () => {
    // 10000 over 3 => 3333.33/unit; cancel 1 => round(3333.33) = 3333
    expect(computeItemRefund(10000, 3, 1)).toBe(3333);
  });
});

describe("recomputeCommissionForSurvivingQty", () => {
  test("percentage: recomputes net-of-VAT earning for surviving item_total", () => {
    // survivingItemTotal 10500 gross => netExVat round(10500/1.05)=10000
    // rate 10% => commission 1000, tax 50, earning 8950
    const r = recomputeCommissionForSurvivingQty({
      survivingItemTotal: 10500,
      type: "percentage",
      rate: 10,
    });
    expect(r).toEqual({
      item_total: 10500,
      commission_amount: 1000,
      tax_on_commission: 50,
      vendor_earning: 8950,
    });
  });
  test("fixed: commission capped so the vendor's earning can never go negative", () => {
    const r = recomputeCommissionForSurvivingQty({
      survivingItemTotal: 1050,
      type: "fixed",
      rate: 5000,
    });
    // CHANGED DELIBERATELY (R3-MINOR-1). This used to expect commission 1000
    // for a net of 1000, whose own comment conceded the earning came out at
    // -50. The cap is now floor(net / 1.05) = 952, leaving tax 48 and an
    // earning of 0 — the commission plus its own 5% tax can never exceed the
    // net.
    expect(r.commission_amount).toBe(952);
    expect(r.tax_on_commission).toBe(48);
    expect(r.vendor_earning).toBe(0);
  });

  test("R3-MINOR-1: vendor_earning is never negative across a full sweep of fixed rates", () => {
    for (let total = 0; total <= 30_000; total += 7) {
      for (const rate of [1, 500, 5_000, 25_000, 1_000_000]) {
        const r = recomputeCommissionForSurvivingQty({
          survivingItemTotal: total,
          type: "fixed",
          rate,
        });
        expect(r.vendor_earning).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(r.vendor_earning)).toBe(true);
      }
    }
  });

  test("R3-MINOR-1: earning never drops by more than 1 fil as the surviving total grows (fixed rate 5000)", () => {
    // Near-monotonicity is what makes the reversal clawback telescope: each
    // event's delta is >= 0 (or at worst -1), so the `Math.max(0, …)` clamp in
    // computeDeltaClawback can no longer swallow a LARGE negative delta and
    // over-claw the earlier events by the commission's whole tax (the
    // 250-fil over-claw in the finding).
    //
    // A residual +-1 wobble is unavoidable and deliberate: in the saturated
    // region the commission absorbs the entire net, and `round(0.05c)` can
    // step up a fil before `c` does, so `net - c - tax` alternates between 0
    // and 1. That is the <=1-fil telescoping error the finding itself
    // classifies as minor; the zero-delta save is separately skipped (R3-C4).
    // Measured as the maximum DRAWDOWN from the running maximum, not the
    // largest single step: pre-fix, earning fell by only 1 fil at a time but
    // kept falling, all the way to -250 at the 5_000 saturation point — which
    // is precisely the amount over-clawed.
    let runningMax = Number.NEGATIVE_INFINITY;
    let maxDrawdown = 0;
    for (let total = 0; total <= 20_000; total += 1) {
      const { vendor_earning } = recomputeCommissionForSurvivingQty({
        survivingItemTotal: total,
        type: "fixed",
        rate: 5_000,
      });
      runningMax = Math.max(runningMax, vendor_earning);
      maxDrawdown = Math.max(maxDrawdown, runningMax - vendor_earning);
    }
    expect(maxDrawdown).toBeLessThanOrEqual(1);
  });

  test("percentage rates below the tax ceiling are untouched by the cap", () => {
    // The verified-correct telescoping case (15%) and the 10% fixtures must
    // produce byte-identical figures to before.
    expect(
      recomputeCommissionForSurvivingQty({
        survivingItemTotal: 25_570,
        type: "percentage",
        rate: 15,
      }),
    ).toEqual({
      item_total: 25_570,
      commission_amount: 3_653,
      tax_on_commission: 183,
      vendor_earning: 20_516,
    });
  });
});

describe("shrinkCodOrderTotals", () => {
  test("takes goods, their VAT share and shipping off the master totals", () => {
    const o = { subtotal: 10000, tax_total: 476, shipping_total: 3000, grand_total: 14000 };
    shrinkCodOrderTotals(o, { itemsGross: 4500, shippingGross: 1500 });
    expect(o).toEqual({
      subtotal: 5500,
      tax_total: 476 - 214,
      shipping_total: 1500,
      grand_total: 8000,
    });
  });

  test("never goes negative and stays integer fils", () => {
    const o = { subtotal: 100, tax_total: 5, shipping_total: 0, grand_total: 100 };
    shrinkCodOrderTotals(o, { itemsGross: 333.4, shippingGross: 50 });
    expect(o.subtotal).toBe(0);
    expect(o.grand_total).toBe(0);
    expect(o.shipping_total).toBe(0);
    expect(Number.isInteger(o.tax_total)).toBe(true);
  });
});
