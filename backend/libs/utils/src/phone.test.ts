import { describe, expect, it } from "bun:test";
import { normalizePhoneE164 } from "./phone.ts";

describe("normalizePhoneE164", () => {
  it("passes through valid E.164", () => {
    expect(normalizePhoneE164("+971501234567")).toBe("+971501234567");
  });

  it("converts UAE local mobile format to +971", () => {
    expect(normalizePhoneE164("0501234567")).toBe("+971501234567");
  });

  it("strips spaces, dashes, and parentheses", () => {
    expect(normalizePhoneE164(" +971 50-123(4567) ")).toBe("+971501234567");
    expect(normalizePhoneE164("050 123 4567")).toBe("+971501234567");
  });

  it("returns null for unnormalizable input", () => {
    expect(normalizePhoneE164("not-a-phone")).toBeNull();
    expect(normalizePhoneE164("12345")).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
    // Local landline format (not 05x mobile) is not converted.
    expect(normalizePhoneE164("043211234")).toBeNull();
  });
});
