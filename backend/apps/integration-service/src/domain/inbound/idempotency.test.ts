import { describe, expect, it } from "bun:test";
import { computeIdempotencyKey } from "./idempotency.ts";

describe("computeIdempotencyKey", () => {
  it("uses the explicit header when present", () => {
    expect(computeIdempotencyKey("explicit-key", '{"x":1}')).toBe("explicit-key");
  });

  it("falls back to a body sha256 hex when header missing", () => {
    const k = computeIdempotencyKey(null, '{"x":1}');
    expect(k).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is deterministic on body hash", () => {
    expect(computeIdempotencyKey(null, "x")).toBe(computeIdempotencyKey(null, "x"));
  });

  it("differs across bodies", () => {
    expect(computeIdempotencyKey(null, "a")).not.toBe(computeIdempotencyKey(null, "b"));
  });
});
