import { describe, expect, it } from "vitest";
import { FREE_SHIPPING_THRESHOLD_FILS, getFreeShippingProgress } from "./cart-shipping-threshold";

describe("cart shipping threshold", () => {
  it("unlocks complimentary shipping at AED 150", () => {
    expect(FREE_SHIPPING_THRESHOLD_FILS).toBe(15000);
    expect(getFreeShippingProgress(14999)).toMatchObject({
      unlocked: false,
      remainingFils: 1,
    });
    expect(getFreeShippingProgress(15000)).toMatchObject({
      unlocked: true,
      remainingFils: 0,
      progress: 100,
    });
  });
});
