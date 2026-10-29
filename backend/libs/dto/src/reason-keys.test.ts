import { describe, expect, it } from "bun:test";
import { REASON_KEYS, assertReasonKey, isReasonKey } from "./reason-keys.ts";

describe("reason-keys registry", () => {
  it("exposes the spec-required keys", () => {
    expect(REASON_KEYS).toContain("payment.cod.over_threshold");
    expect(REASON_KEYS).toContain("checkout.error.no_eligible_payment_methods");
    expect(REASON_KEYS).toContain("shipping.same_day.zone_unsupported");
    expect(REASON_KEYS).toContain("checkout.error.quote_token_stale");
  });

  it("validates known and rejects unknown keys", () => {
    expect(isReasonKey("payment.cod.over_threshold")).toBe(true);
    expect(isReasonKey("not.a.key")).toBe(false);
    expect(() => assertReasonKey("not.a.key")).toThrow();
  });
});
