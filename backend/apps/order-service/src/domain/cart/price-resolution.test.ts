import { describe, expect, it } from "bun:test";
import { resolveUnitPrice } from "./price-resolution.ts";

describe("resolveUnitPrice: quote > tier > base", () => {
  it("uses the base price with nothing else set", () => {
    expect(resolveUnitPrice({ basePrice: 480 })).toEqual({ unitPrice: 480, source: "base" });
  });

  it("prefers a tier price over the base price", () => {
    expect(resolveUnitPrice({ basePrice: 480, tierPrice: 420 })).toEqual({
      unitPrice: 420,
      source: "tier",
    });
  });

  it("prefers an accepted quote over tier and base", () => {
    expect(
      resolveUnitPrice({ basePrice: 480, tierPrice: 420, quoteId: "q1", quotedUnitPrice: 365 }),
    ).toEqual({ unitPrice: 365, source: "quote" });
  });

  it("ignores a quoted price without a quote id", () => {
    expect(resolveUnitPrice({ basePrice: 480, quotedUnitPrice: 365 }).source).toBe("base");
  });

  it("uses a quote even when it is above the list price", () => {
    // A custom spec can cost more than the stock listing; the quote still wins.
    expect(
      resolveUnitPrice({ basePrice: 480, quoteId: "q1", quotedUnitPrice: 650 }).unitPrice,
    ).toBe(650);
  });
});
