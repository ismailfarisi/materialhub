import { describe, expect, test } from "bun:test";
import { normalizePhoneForOtp } from "./phone-normalization.ts";

describe("normalizePhoneForOtp", () => {
  test("keeps valid E.164 phone numbers", () => {
    expect(normalizePhoneForOtp(" +971501234567 ")).toBe("+971501234567");
  });

  test("normalizes UAE local mobile numbers", () => {
    expect(normalizePhoneForOtp("0501234567")).toBe("+971501234567");
  });

  test("rejects ambiguous phone numbers", () => {
    expect(() => normalizePhoneForOtp("12345")).toThrow("Invalid phone number");
  });
});
