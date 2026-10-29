import { describe, expect, it } from "vitest";
import { normalizeUaePhone } from "./phone";

describe("normalizeUaePhone", () => {
  it("preserves an already-E.164 number", () => {
    expect(normalizeUaePhone("+971501234567")).toBe("+971501234567");
  });

  it("handles 00971 international-dial prefix", () => {
    expect(normalizeUaePhone("00971501234567")).toBe("+971501234567");
  });

  it("handles plain 971 (no +)", () => {
    expect(normalizeUaePhone("971501234567")).toBe("+971501234567");
  });

  it("handles UAE local '0' prefix by dropping the 0 and adding +971", () => {
    expect(normalizeUaePhone("0501234567")).toBe("+971501234567");
  });

  it("strips spaces, dashes, parens before normalizing", () => {
    expect(normalizeUaePhone("+971 (50) 123-4567")).toBe("+971501234567");
  });
});
