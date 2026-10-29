import { describe, expect, it } from "vitest";
import { toLocalUaeDigits, toUaeE164 } from "./phone";

describe("toUaeE164", () => {
  it("prefixes +971 onto local digits", () => {
    expect(toUaeE164("501234567")).toBe("+971501234567");
  });

  it("drops a leading zero (05… → +9715…)", () => {
    expect(toUaeE164("0501234567")).toBe("+971501234567");
  });

  it("strips spaces, dashes and parens", () => {
    expect(toUaeE164("(050) 123-4567")).toBe("+971501234567");
  });

  it("caps at 10 significant digits", () => {
    expect(toUaeE164("50123456789999")).toBe("+9715012345678");
  });

  it("returns empty string for empty/zero-only input (no bare +971)", () => {
    expect(toUaeE164("")).toBe("");
    expect(toUaeE164("000")).toBe("");
  });
});

describe("toLocalUaeDigits", () => {
  it("strips a +971 prefix for display", () => {
    expect(toLocalUaeDigits("+971501234567")).toBe("501234567");
  });

  it("strips a 00971 prefix", () => {
    expect(toLocalUaeDigits("00971501234567")).toBe("501234567");
  });

  it("strips a bare 971 prefix", () => {
    expect(toLocalUaeDigits("971501234567")).toBe("501234567");
  });

  it("drops a leading zero on a legacy local number", () => {
    expect(toLocalUaeDigits("0501234567")).toBe("501234567");
  });

  it("returns empty for empty input", () => {
    expect(toLocalUaeDigits("")).toBe("");
  });
});

describe("round-trip", () => {
  it("toLocalUaeDigits ∘ toUaeE164 is stable", () => {
    const stored = toUaeE164("0501234567");
    expect(stored).toBe("+971501234567");
    expect(toLocalUaeDigits(stored)).toBe("501234567");
    expect(toUaeE164(toLocalUaeDigits(stored))).toBe(stored);
  });
});
