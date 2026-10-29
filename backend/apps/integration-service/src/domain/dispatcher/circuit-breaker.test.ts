import { describe, expect, it } from "bun:test";
import { evaluateCircuit } from "./circuit-breaker.ts";

describe("evaluateCircuit", () => {
  const now = Date.parse("2026-04-27T10:00:00Z");

  it("does not trip below threshold", () => {
    const failures = Array.from({ length: 19 }, (_, i) => now - i * 1000);
    const r = evaluateCircuit({ failures, now, windowMs: 5 * 60_000, threshold: 20 });
    expect(r.tripped).toBe(false);
    expect(r.count).toBe(19);
  });

  it("trips at exactly the threshold", () => {
    const failures = Array.from({ length: 20 }, (_, i) => now - i * 1000);
    const r = evaluateCircuit({ failures, now, windowMs: 5 * 60_000, threshold: 20 });
    expect(r.tripped).toBe(true);
    expect(r.count).toBe(20);
    expect(r.degradedUntil).toBe(now + 10 * 60_000);
  });

  it("ignores failures outside the window", () => {
    const fresh = Array.from({ length: 5 }, (_, i) => now - i * 1000);
    const stale = Array.from({ length: 100 }, (_, i) => now - 10 * 60_000 - i * 1000);
    const r = evaluateCircuit({
      failures: [...fresh, ...stale],
      now,
      windowMs: 5 * 60_000,
      threshold: 20,
    });
    expect(r.tripped).toBe(false);
  });
});
