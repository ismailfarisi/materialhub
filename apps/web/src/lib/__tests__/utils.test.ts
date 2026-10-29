import { describe, expect, it } from "vitest";
import { formatPrice } from "../utils";

describe("formatPrice", () => {
  it("converts fils to AED with 2 decimals", () => {
    const result = formatPrice(1500);
    expect(result).toContain("15.00");
    expect(result).toContain("AED");
  });

  it("handles zero", () => {
    const result = formatPrice(0);
    expect(result).toContain("0.00");
    expect(result).toContain("AED");
  });

  it("supports other currencies", () => {
    const result = formatPrice(1000, "USD");
    expect(result).toContain("10.00");
  });
});
