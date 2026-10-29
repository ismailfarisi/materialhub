import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { parseSignatureHeader, verifyCloudflareSignature } from "./webhook.routes.ts";

describe("parseSignatureHeader", () => {
  it("parses a valid Cloudflare Stream signature header", () => {
    const parsed = parseSignatureHeader("time=1700000000,sig1=abc123");
    expect(parsed).toEqual({ timestamp: 1700000000, sig1: "abc123" });
  });

  it("parses with extra whitespace", () => {
    const parsed = parseSignatureHeader(" time=1700000000 , sig1=abc123 ");
    expect(parsed).toEqual({ timestamp: 1700000000, sig1: "abc123" });
  });

  it("returns null when time is missing", () => {
    expect(parseSignatureHeader("sig1=abc123")).toBeNull();
  });

  it("returns null when sig1 is missing", () => {
    expect(parseSignatureHeader("time=1700000000")).toBeNull();
  });

  it("returns null when time is not a number", () => {
    expect(parseSignatureHeader("time=notanumber,sig1=abc")).toBeNull();
  });

  it("returns null for an empty header", () => {
    expect(parseSignatureHeader("")).toBeNull();
  });
});

describe("verifyCloudflareSignature", () => {
  const SECRET = "0123456789abcdef0123456789abcdef";
  const RAW_BODY = '{"eventType":"video.ready","data":{"uid":"test"}}';

  function makeSignedHeader(
    secret: string,
    body: string,
    timestampSec: number,
    tamper = false,
  ): string {
    const signedPayload = `${timestampSec}.${body}`;
    let sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
    if (tamper) {
      // Flip the first character to produce a wrong-but-same-length signature.
      sig = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
    }
    return `time=${timestampSec},sig1=${sig}`;
  }

  it("accepts a correctly signed fresh request", () => {
    const now = Date.now();
    const header = makeSignedHeader(SECRET, RAW_BODY, Math.floor(now / 1000));
    const result = verifyCloudflareSignature(SECRET, header, RAW_BODY, now);
    expect(result).toEqual({ valid: true });
  });

  it("rejects a malformed header", () => {
    const result = verifyCloudflareSignature(SECRET, "garbage", RAW_BODY);
    expect(result).toEqual({ valid: false, reason: "malformed_signature_header" });
  });

  it("rejects a signature older than 5 minutes", () => {
    const now = Date.now();
    const oldTs = Math.floor(now / 1000) - 301; // 5m 1s ago
    const header = makeSignedHeader(SECRET, RAW_BODY, oldTs);
    const result = verifyCloudflareSignature(SECRET, header, RAW_BODY, now);
    expect(result).toEqual({ valid: false, reason: "stale_signature" });
  });

  it("rejects a signature from 10 minutes in the future", () => {
    const now = Date.now();
    const futureTs = Math.floor(now / 1000) + 600;
    const header = makeSignedHeader(SECRET, RAW_BODY, futureTs);
    const result = verifyCloudflareSignature(SECRET, header, RAW_BODY, now);
    expect(result).toEqual({ valid: false, reason: "stale_signature" });
  });

  it("rejects a tampered signature (wrong hex)", () => {
    const now = Date.now();
    const header = makeSignedHeader(SECRET, RAW_BODY, Math.floor(now / 1000), true);
    const result = verifyCloudflareSignature(SECRET, header, RAW_BODY, now);
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejects when body has been modified after signing", () => {
    const now = Date.now();
    const header = makeSignedHeader(SECRET, RAW_BODY, Math.floor(now / 1000));
    const modifiedBody = RAW_BODY.replace("test", "test-modified");
    const result = verifyCloudflareSignature(SECRET, header, modifiedBody, now);
    // The hex digest is still the same length, so it hits signature_mismatch.
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejects when sig1 length is wrong", () => {
    const header = `time=${Math.floor(Date.now() / 1000)},sig1=short`;
    const result = verifyCloudflareSignature(SECRET, header, RAW_BODY);
    expect(result).toEqual({ valid: false, reason: "signature_length_mismatch" });
  });

  it("rejects a signature signed with a different secret", () => {
    const now = Date.now();
    const wrongSecret = "ffffffffffffffffffffffffffffffff";
    const header = makeSignedHeader(wrongSecret, RAW_BODY, Math.floor(now / 1000));
    const result = verifyCloudflareSignature(SECRET, header, RAW_BODY, now);
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });
});
