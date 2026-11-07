import { describe, expect, test } from "vitest";
import { paymentProviderLabel, validatePaymentMethodAmount } from "./payment-methods";

describe("payment methods", () => {
  test("provider labels", () => {
    expect(paymentProviderLabel("cod")).toBe("COD");
    expect(paymentProviderLabel("tabby")).toBe("Tabby");
    expect(paymentProviderLabel("tamara")).toBe("Tamara");
  });

  test("amount validation mirrors the API", () => {
    const row = { min_amount_fils: 10000, max_amount_fils: 300000 };
    expect(validatePaymentMethodAmount(row, "max_amount_fils", 250000)).toBeNull();
    expect(validatePaymentMethodAmount(row, "max_amount_fils", 5000)).toMatch(/below the minimum/);
    expect(validatePaymentMethodAmount(row, "min_amount_fils", 400000)).toMatch(/above the maximum/);
    expect(validatePaymentMethodAmount(row, "surcharge_fils", -1)).toMatch(/0 or more/);
  });
});
