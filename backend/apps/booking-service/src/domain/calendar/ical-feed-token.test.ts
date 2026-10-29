// ical-feed-token.test.ts
//
// Pure function tests — no DB, no Redis, runs unconditionally.
import { describe, expect, it } from "bun:test";
import { signIcalFeedToken, verifyIcalFeedToken } from "./ical-feed-token.ts";

const SECRET = "test-ical-feed-secret";
const STAFF_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_STAFF_ID = "22222222-2222-2222-2222-222222222222";

describe("ical-feed-token", () => {
  it("round-trips: a signed token verifies for the same secret + staff id", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    expect(verifyIcalFeedToken(SECRET, token, STAFF_ID)).toBe(true);
  });

  it("is deterministic — signing twice for the same inputs yields the same token", () => {
    const a = signIcalFeedToken(SECRET, STAFF_ID);
    const b = signIcalFeedToken(SECRET, STAFF_ID);
    expect(a).toBe(b);
  });

  it("carries a v1 version prefix", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    expect(token.startsWith("v1_")).toBe(true);
  });

  it("rejects a token verified against a different staff id", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    expect(verifyIcalFeedToken(SECRET, token, OTHER_STAFF_ID)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    expect(verifyIcalFeedToken("wrong-secret", token, STAFF_ID)).toBe(false);
  });

  it("rejects a tampered token (single character flipped in the MAC)", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    const tamperedLastChar = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
    expect(verifyIcalFeedToken(SECRET, tamperedLastChar, STAFF_ID)).toBe(false);
  });

  it("rejects a truncated token (shorter than the real MAC) without throwing", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    const truncated = token.slice(0, token.length - 4);
    expect(() => verifyIcalFeedToken(SECRET, truncated, STAFF_ID)).not.toThrow();
    expect(verifyIcalFeedToken(SECRET, truncated, STAFF_ID)).toBe(false);
  });

  it("rejects an over-long token (extra trailing characters) without throwing", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    const extended = `${token}extra`;
    expect(() => verifyIcalFeedToken(SECRET, extended, STAFF_ID)).not.toThrow();
    expect(verifyIcalFeedToken(SECRET, extended, STAFF_ID)).toBe(false);
  });

  it("rejects an empty token", () => {
    expect(verifyIcalFeedToken(SECRET, "", STAFF_ID)).toBe(false);
  });

  it("rejects a token missing the version prefix", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    const withoutPrefix = token.slice(3); // drop "v1_"
    expect(verifyIcalFeedToken(SECRET, withoutPrefix, STAFF_ID)).toBe(false);
  });

  it("rejects a completely unrelated string", () => {
    expect(verifyIcalFeedToken(SECRET, "v1_not-a-real-token-at-all", STAFF_ID)).toBe(false);
  });

  it("issues different tokens for different staff ids under the same secret", () => {
    const a = signIcalFeedToken(SECRET, STAFF_ID);
    const b = signIcalFeedToken(SECRET, OTHER_STAFF_ID);
    expect(a).not.toBe(b);
  });

  // Fix cycle 1 — review finding "Minor — 500 on crafted token": a token
  // with equal UTF-16 `.length` but a different UTF-8 byte length used to
  // slip past the length pre-check (which compared `.length`) and throw
  // inside `timingSafeEqual` (which compares byte length) instead of
  // returning false. Replacing one ASCII char with a 2-byte UTF-8 char (é)
  // keeps `String.length` identical while changing `Buffer.byteLength`.
  it("rejects a same-length multibyte-swapped token without throwing (never a 500)", () => {
    const token = signIcalFeedToken(SECRET, STAFF_ID);
    const lastChar = token.at(-1) as string;
    const multibyteChar = lastChar === "é" ? "è" : "é";
    const swapped = `${token.slice(0, -1)}${multibyteChar}`;
    expect(swapped.length).toBe(token.length);
    expect(Buffer.byteLength(swapped)).not.toBe(Buffer.byteLength(token));
    expect(() => verifyIcalFeedToken(SECRET, swapped, STAFF_ID)).not.toThrow();
    expect(verifyIcalFeedToken(SECRET, swapped, STAFF_ID)).toBe(false);
  });
});
