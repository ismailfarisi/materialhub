import { describe, expect, it } from "vitest";
import { computeDepositFils } from "./money";
import type { ServiceOffering } from "./types";

type DepositInput = Parameters<typeof computeDepositFils>[0];

function offering(overrides: Partial<DepositInput>): DepositInput {
  return {
    deposit_type: "percent" as ServiceOffering["deposit_type"],
    deposit_value: 20,
    price_fils: 50_000, // AED 500.00
    ...overrides,
  };
}

describe("computeDepositFils", () => {
  it("treats deposit_value as fils (not AED) for a fixed deposit", () => {
    // A AED 75.00 fixed deposit is stored as 7500 fils and must pass through
    // untouched — a stray *100 or /100 here would charge 100x or 1/100th.
    expect(computeDepositFils(offering({ deposit_type: "fixed", deposit_value: 7_500 }))).toBe(
      7_500,
    );
  });

  it("treats deposit_value as a percentage of the price for a percent deposit", () => {
    expect(
      computeDepositFils(
        offering({ deposit_type: "percent", deposit_value: 20, price_fils: 50_000 }),
      ),
    ).toBe(10_000); // 20% of AED 500 = AED 100
  });

  it("rounds a fractional percent deposit to a whole fil", () => {
    // 33% of 9999 fils = 3299.67
    expect(
      computeDepositFils(
        offering({ deposit_type: "percent", deposit_value: 33, price_fils: 9_999 }),
      ),
    ).toBe(3_300);
    // 50% of 9999 fils = 4999.5 -> rounds up
    expect(
      computeDepositFils(
        offering({ deposit_type: "percent", deposit_value: 50, price_fils: 9_999 }),
      ),
    ).toBe(5_000);
  });

  it("charges the full price when no deposit split is configured", () => {
    expect(
      computeDepositFils(offering({ deposit_type: "none", deposit_value: 0, price_fils: 50_000 })),
    ).toBe(50_000);
  });

  it("returns a whole number of fils for every deposit type", () => {
    for (const deposit_type of ["fixed", "percent", "none"] as const) {
      const value = computeDepositFils(
        offering({ deposit_type, deposit_value: 17, price_fils: 12_345 }),
      );
      expect({ deposit_type, integral: Number.isInteger(value) }).toEqual({
        deposit_type,
        integral: true,
      });
    }
  });

  it("handles a 0% and a 100% percent deposit", () => {
    expect(
      computeDepositFils(offering({ deposit_type: "percent", deposit_value: 0 })),
    ).toBe(0);
    expect(
      computeDepositFils(offering({ deposit_type: "percent", deposit_value: 100 })),
    ).toBe(50_000);
  });
});
