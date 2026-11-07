import { filsToAed, parseAedInput } from "./money";

/**
 * Coupon money fields are typed in AED and stored in fils. A percentage
 * discount stays a plain percent; fixed-amount discounts, the percentage cap
 * and the minimum order are AED ↔ fils.
 */
export interface CouponMoneyInput {
  type: string;
  discountValue: string;
  maxDiscountAed: string;
  minimumOrderAed: string;
}

export interface CouponMoneyValues {
  discount_value?: number;
  max_discount_amount?: number;
  minimum_order_amount?: number;
}

/** Form text for a stored coupon. */
export function couponMoneyToInput(coupon: {
  type?: string;
  discount_value?: number | null;
  max_discount_amount?: number | null;
  minimum_order_amount?: number | null;
}): Omit<CouponMoneyInput, "type"> {
  const fils = (v: number | null | undefined) => (v != null ? filsToAed(Number(v)) : "");
  return {
    discountValue:
      coupon.discount_value == null
        ? ""
        : coupon.type === "fixed_amount"
          ? filsToAed(Number(coupon.discount_value))
          : String(coupon.discount_value),
    maxDiscountAed: fils(coupon.max_discount_amount),
    minimumOrderAed: fils(coupon.minimum_order_amount),
  };
}

/** Payload values in fils, or the first field error. */
export function couponMoneyFromInput(
  input: CouponMoneyInput,
): { ok: true; values: CouponMoneyValues } | { ok: false; error: string } {
  const values: CouponMoneyValues = {};

  if (input.type === "percentage" && input.discountValue.trim()) {
    const pct = Number(input.discountValue);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return { ok: false, error: "Discount % must be between 0 and 100." };
    }
    values.discount_value = pct;
  } else if (input.type === "fixed_amount" && input.discountValue.trim()) {
    const fils = parseAedInput(input.discountValue);
    if (fils === null || fils <= 0) return { ok: false, error: "Enter the discount in AED, e.g. 25 or 12.50." };
    values.discount_value = fils;
  }

  if (input.type === "percentage" && input.maxDiscountAed.trim()) {
    const fils = parseAedInput(input.maxDiscountAed);
    if (fils === null) return { ok: false, error: "Enter the maximum discount in AED." };
    values.max_discount_amount = fils;
  }

  if (input.minimumOrderAed.trim()) {
    const fils = parseAedInput(input.minimumOrderAed);
    if (fils === null) return { ok: false, error: "Enter the minimum order in AED." };
    values.minimum_order_amount = fils;
  }

  return { ok: true, values };
}
