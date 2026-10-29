import { describe, expect, test } from "bun:test";
import { computeCartTotals } from "./cart-totals.ts";

describe("computeCartTotals", () => {
  test("items only", () => {
    const r = computeCartTotals([{ line_total: 1000 }, { line_total: 2500 }], []);
    expect(r.subtotal).toBe(3500);
    expect(r.itemCount).toBe(2);
  });

  test("gift boxes only — unit_price * quantity", () => {
    const r = computeCartTotals(
      [],
      [
        { unit_price: 8500, quantity: 1 },
        { unit_price: 5000, quantity: 2 }, // 10000
      ],
    );
    expect(r.subtotal).toBe(18500);
    expect(r.itemCount).toBe(2);
  });

  test("items + gift boxes combined", () => {
    const r = computeCartTotals(
      [{ line_total: 1000 }, { line_total: 2000 }], // 3000
      [{ unit_price: 8500, quantity: 2 }], // 17000
    );
    expect(r.subtotal).toBe(20000);
    expect(r.itemCount).toBe(3); // 2 items + 1 gift box (count is per-row, not per-quantity)
  });

  test("empty cart", () => {
    const r = computeCartTotals([], []);
    expect(r.subtotal).toBe(0);
    expect(r.itemCount).toBe(0);
  });
});
