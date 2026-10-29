import { describe, expect, test } from "bun:test";
import { computeCartTotals } from "./cart-totals.ts";

describe("computeCartTotals", () => {
  test("sums line totals and counts rows", () => {
    const r = computeCartTotals([{ line_total: 1000 }, { line_total: 2500 }]);
    expect(r.subtotal).toBe(3500);
    expect(r.itemCount).toBe(2);
  });

  test("item_count is per-row, not per-quantity", () => {
    const r = computeCartTotals([{ line_total: 1000 }, { line_total: 2000 }, { line_total: 500 }]);
    expect(r.subtotal).toBe(3500);
    expect(r.itemCount).toBe(3);
  });

  test("empty cart", () => {
    const r = computeCartTotals([]);
    expect(r.subtotal).toBe(0);
    expect(r.itemCount).toBe(0);
  });
});
