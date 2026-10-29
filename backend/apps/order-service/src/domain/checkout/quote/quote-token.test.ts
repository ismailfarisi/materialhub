import { describe, expect, it } from "bun:test";
import { parseIssuedAt, signQuoteToken, verifyQuoteToken } from "./quote-token.ts";

const SECRET = "test-secret-0123456789abcdef";

const BASE = {
  cartHash: "abc123",
  addressId: "addr-1",
  userId: "user-1",
  rulesEpoch: 5,
  fxCapturedAt: "2026-04-17T00:00:00.000Z",
  issuedAt: "2026-04-17T12:00:00.000Z",
};

describe("quote-token", () => {
  it("is deterministic for identical inputs", () => {
    const a = signQuoteToken(SECRET, BASE);
    const b = signQuoteToken(SECRET, BASE);
    expect(a).toBe(b);
  });

  it("produces a different token when any input changes", () => {
    const base = signQuoteToken(SECRET, BASE);
    expect(signQuoteToken(SECRET, { ...BASE, cartHash: "xyz" })).not.toBe(base);
    expect(signQuoteToken(SECRET, { ...BASE, addressId: "addr-2" })).not.toBe(base);
    expect(signQuoteToken(SECRET, { ...BASE, userId: "user-2" })).not.toBe(base);
    expect(signQuoteToken(SECRET, { ...BASE, rulesEpoch: 6 })).not.toBe(base);
    expect(signQuoteToken(SECRET, { ...BASE, fxCapturedAt: "2026-04-18T00:00:00.000Z" })).not.toBe(
      base,
    );
    expect(signQuoteToken(SECRET, { ...BASE, issuedAt: "2026-04-17T12:00:01.000Z" })).not.toBe(
      base,
    );
  });

  it("has the q_<mac>.<issuedAt> format with parseable suffix", () => {
    const tok = signQuoteToken(SECRET, BASE);
    expect(tok).toStartWith("q_");
    expect(tok.split(".").length).toBeGreaterThanOrEqual(2);
    expect(parseIssuedAt(tok)).toBe(BASE.issuedAt);
  });

  it("null addressId and null userId are accepted and bound", () => {
    const tok1 = signQuoteToken(SECRET, { ...BASE, addressId: null });
    const tok2 = signQuoteToken(SECRET, { ...BASE, addressId: null, userId: null });
    expect(tok1).not.toBe(tok2);
  });

  it("verifyQuoteToken returns true for matching inputs, false otherwise", () => {
    const tok = signQuoteToken(SECRET, BASE);
    expect(verifyQuoteToken(SECRET, tok, BASE)).toBe(true);
    expect(verifyQuoteToken(SECRET, tok, { ...BASE, cartHash: "other" })).toBe(false);
    expect(verifyQuoteToken("wrong-secret", tok, BASE)).toBe(false);
  });

  // Regression: a token with equal UTF-16 `.length` but a different UTF-8 byte
  // length used to slip past the length pre-check (which compared `.length`)
  // and throw inside `timingSafeEqual` (which compares byte length) — a 500 on
  // a crafted token instead of a clean `false`. Swapping one ASCII char for a
  // 2-byte UTF-8 char (é) keeps `String.length` identical while changing
  // `Buffer.byteLength`. (Mirrors ical-feed-token.test.ts's multibyte case.)
  it("rejects a same-length multibyte-swapped token without throwing (never a 500)", () => {
    const tok = signQuoteToken(SECRET, BASE);
    const lastChar = tok.at(-1) as string;
    const multibyteChar = lastChar === "é" ? "è" : "é";
    const swapped = `${tok.slice(0, -1)}${multibyteChar}`;
    expect(swapped.length).toBe(tok.length);
    expect(Buffer.byteLength(swapped)).not.toBe(Buffer.byteLength(tok));
    expect(() => verifyQuoteToken(SECRET, swapped, BASE)).not.toThrow();
    expect(verifyQuoteToken(SECRET, swapped, BASE)).toBe(false);
  });
});
