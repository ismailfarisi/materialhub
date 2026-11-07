import { describe, expect, it } from "vitest";
import { formatPercent, formatVendorRate, parsePercentInput } from "./commission.helpers";

describe("commission units", () => {
  it("shows a stored percent as a percent (10 is 10%, not 1000%)", () => {
    expect(formatPercent(10)).toBe("10%");
    expect(formatPercent("7.50")).toBe("7.5%");
    expect(formatPercent(12.25)).toBe("12.25%");
    expect(formatPercent(null)).toBe("—");
  });

  it("parses the % input as a percent, not a fraction", () => {
    expect(parsePercentInput("12")).toBe(12);
    expect(parsePercentInput("7.5%")).toBe(7.5);
    expect(parsePercentInput("")).toBeNull();
    expect(parsePercentInput("101")).toBeNull();
    expect(parsePercentInput("-1")).toBeNull();
    expect(parsePercentInput("abc")).toBeNull();
  });

  it("formats a vendor rate in its own unit", () => {
    expect(formatVendorRate("percentage", 10)).toBe("10%");
    expect(formatVendorRate("fixed", 250)).toBe("AED 2.50 per item");
    expect(formatVendorRate("tiered", 0)).toBe("By tier");
  });
});
