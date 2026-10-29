import { describe, expect, it } from "bun:test";
import { DEFAULT_SETTLEMENT_WINDOW_DAYS, resolveWindowDays } from "./settlement-window.ts";

describe("resolveWindowDays", () => {
  it("prefers the vendor override", () => {
    expect(resolveWindowDays(2, 7)).toBe(2);
  });

  it("falls back to the global setting when the vendor has none", () => {
    expect(resolveWindowDays(null, 14)).toBe(14);
  });

  it("falls back to the hard default when neither is set", () => {
    expect(resolveWindowDays(null, null)).toBe(DEFAULT_SETTLEMENT_WINDOW_DAYS);
    expect(DEFAULT_SETTLEMENT_WINDOW_DAYS).toBe(7);
  });

  it("honours an explicit zero-day vendor window", () => {
    expect(resolveWindowDays(0, 7)).toBe(0);
  });

  it("ignores negative or non-finite values", () => {
    expect(resolveWindowDays(-1, 7)).toBe(7);
    expect(resolveWindowDays(Number.NaN, 7)).toBe(7);
    expect(resolveWindowDays(null, -3)).toBe(DEFAULT_SETTLEMENT_WINDOW_DAYS);
  });
});
