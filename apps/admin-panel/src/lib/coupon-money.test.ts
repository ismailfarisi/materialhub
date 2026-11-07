import { describe, expect, test } from "vitest";
import { couponMoneyFromInput, couponMoneyToInput } from "./coupon-money";

describe("coupon money fields", () => {
  test("AED inputs become fils; percentages stay percent", () => {
    expect(
      couponMoneyFromInput({ type: "fixed_amount", discountValue: "25.50", maxDiscountAed: "", minimumOrderAed: "200" }),
    ).toEqual({ ok: true, values: { discount_value: 2550, minimum_order_amount: 20000 } });
    expect(
      couponMoneyFromInput({ type: "percentage", discountValue: "15", maxDiscountAed: "50", minimumOrderAed: "" }),
    ).toEqual({ ok: true, values: { discount_value: 15, max_discount_amount: 5000 } });
  });

  test("bad input is an error, not a silent zero", () => {
    expect(couponMoneyFromInput({ type: "percentage", discountValue: "150", maxDiscountAed: "", minimumOrderAed: "" }).ok).toBe(false);
    expect(couponMoneyFromInput({ type: "fixed_amount", discountValue: "abc", maxDiscountAed: "", minimumOrderAed: "" }).ok).toBe(false);
  });

  test("stored fils show as AED in the form", () => {
    expect(
      couponMoneyToInput({ type: "fixed_amount", discount_value: 2550, max_discount_amount: null, minimum_order_amount: 20000 }),
    ).toEqual({ discountValue: "25.50", maxDiscountAed: "", minimumOrderAed: "200.00" });
    expect(couponMoneyToInput({ type: "percentage", discount_value: 15 }).discountValue).toBe("15");
  });
});
