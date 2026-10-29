import { describe, expect, it } from "bun:test";
import { computeEtag, fxEpochFromCapturedAt } from "./etag.ts";

describe("computeEtag", () => {
  it("produces a strong ETag wrapped in double quotes", () => {
    const tag = computeEtag({
      cartHash: "h",
      addressId: null,
      userId: "u",
      rulesEpoch: 1,
      fxEpoch: "2026-04-17",
    });
    expect(tag).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it("changes when any input changes", () => {
    const base = {
      cartHash: "h",
      addressId: "a",
      userId: "u",
      rulesEpoch: 1,
      fxEpoch: "2026-04-17",
    };
    const t0 = computeEtag(base);
    expect(computeEtag({ ...base, cartHash: "x" })).not.toBe(t0);
    expect(computeEtag({ ...base, addressId: null })).not.toBe(t0);
    expect(computeEtag({ ...base, userId: "u2" })).not.toBe(t0);
    expect(computeEtag({ ...base, rulesEpoch: 2 })).not.toBe(t0);
    expect(computeEtag({ ...base, fxEpoch: "2026-04-18" })).not.toBe(t0);
  });

  it("fxEpochFromCapturedAt returns YYYY-MM-DD", () => {
    expect(fxEpochFromCapturedAt("2026-04-17T00:00:00.000Z")).toBe("2026-04-17");
  });
});
