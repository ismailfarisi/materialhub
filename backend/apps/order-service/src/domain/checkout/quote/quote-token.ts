import { createHmac, timingSafeEqual } from "node:crypto";

export interface QuoteTokenInputs {
  cartHash: string;
  addressId: string | null;
  userId: string | null;
  rulesEpoch: number;
  fxCapturedAt: string;
  issuedAt: string;
}

function macPayload(i: QuoteTokenInputs): string {
  return [
    i.cartHash,
    i.addressId ?? "no_address",
    i.userId ?? "guest",
    String(i.rulesEpoch),
    i.fxCapturedAt,
    i.issuedAt,
  ].join("|");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signQuoteToken(secret: string, inputs: QuoteTokenInputs): string {
  const mac = createHmac("sha256", secret).update(macPayload(inputs)).digest().subarray(0, 16);
  return `q_${b64url(mac)}.${inputs.issuedAt}`;
}

export function parseIssuedAt(token: string): string | null {
  if (!token.startsWith("q_")) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  return token.slice(dot + 1);
}

export function verifyQuoteToken(secret: string, token: string, inputs: QuoteTokenInputs): boolean {
  const expected = signQuoteToken(secret, inputs);
  // Length pre-check on the BUFFERS' byte length, NOT the strings' UTF-16
  // `.length`. timingSafeEqual throws (not returns false) on a byte-length
  // mismatch, and a crafted token can have an equal `String.length` but a
  // different UTF-8 byte length (e.g. one ASCII char swapped for a 2-byte
  // multibyte char) — comparing string `.length` passes that guard while
  // timingSafeEqual still throws on the resulting byte-length mismatch,
  // turning a bad token into a 500. Build Buffers first, pre-check on their
  // byte length. (Same fix already applied to booking-service's
  // ical-feed-token.ts; ported here.)
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
}
