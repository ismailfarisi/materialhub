import { describe, expect, it } from "bun:test";
import { computeCancellation, computeNoShow, isWithinRescheduleWindow } from "./booking-policy.ts";
import type { CancellationPolicySnapshot } from "./booking-policy.ts";

const iso = (s: string) => new Date(s);
const startsAt = iso("2026-07-20T12:00:00Z"); // Monday noon UTC

function policy(overrides: Partial<CancellationPolicySnapshot> = {}): CancellationPolicySnapshot {
  return {
    cancellation_window_hours: 24,
    cancellation_refund_policy: "full",
    cancellation_penalty_percent: 100,
    ...overrides,
  };
}

describe("computeCancellation — in-window (always full refund, any policy)", () => {
  it("full policy, well inside the window", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_refund_policy: "full" }),
      now: iso("2026-07-18T12:00:00Z"), // 48h before starts_at
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ refundFils: 50_000, forfeitFils: 0, withinWindow: true });
  });

  it("deposit_forfeit policy, inside the window still refunds in full", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_refund_policy: "deposit_forfeit" }),
      now: iso("2026-07-18T12:00:00Z"),
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ refundFils: 50_000, forfeitFils: 0, withinWindow: true });
  });

  it("percent policy, inside the window still refunds in full", () => {
    const out = computeCancellation({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 50,
      }),
      now: iso("2026-07-18T12:00:00Z"),
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ refundFils: 50_000, forfeitFils: 0, withinWindow: true });
  });

  it("treats exactly the window boundary (now = startsAt - windowHours) as within window", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_window_hours: 24 }),
      now: iso("2026-07-19T12:00:00Z"), // exactly 24h before starts_at
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out.withinWindow).toBe(true);
  });
});

describe("computeCancellation — out-of-window", () => {
  const outOfWindowNow = iso("2026-07-20T06:00:00Z"); // 6h before starts_at, window is 24h

  it("full policy: still a full refund, no forfeit, even out of window", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_refund_policy: "full" }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ refundFils: 50_000, forfeitFils: 0, withinWindow: false });
  });

  it("deposit_forfeit policy: keeps the deposit, refunds the remainder", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_refund_policy: "deposit_forfeit" }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ refundFils: 40_000, forfeitFils: 10_000, withinWindow: false });
  });

  it("deposit_forfeit policy: caps the forfeit at amount paid when deposit exceeds it", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_refund_policy: "deposit_forfeit" }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 5_000,
      depositFils: 10_000, // pathological: deposit snapshot > amount actually paid
    });
    expect(out).toEqual({ refundFils: 0, forfeitFils: 5_000, withinWindow: false });
  });

  it("percent policy: keeps penalty percent of amount paid, refunds the remainder", () => {
    const out = computeCancellation({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 30,
      }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 0,
    });
    // 50_000 * 0.30 = 15_000 exactly.
    expect(out).toEqual({ refundFils: 35_000, forfeitFils: 15_000, withinWindow: false });
  });

  it("percent policy: rounds fractional fils using Math.round (matches CommissionService)", () => {
    const out = computeCancellation({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 15,
      }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 999,
      depositFils: 0,
    });
    // 999 * 0.15 = 149.85 -> Math.round -> 150.
    expect(out.forfeitFils).toBe(150);
    expect(out.refundFils).toBe(849);
  });

  it("percent policy: 100% penalty forfeits everything paid", () => {
    const out = computeCancellation({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 100,
      }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 12_345,
      depositFils: 0,
    });
    expect(out).toEqual({ refundFils: 0, forfeitFils: 12_345, withinWindow: false });
  });

  it("zero amount paid (pay_at_venue, nothing collected yet) forfeits nothing regardless of policy", () => {
    const out = computeCancellation({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 50,
      }),
      now: outOfWindowNow,
      startsAt,
      amountPaidFils: 0,
      depositFils: 0,
    });
    expect(out).toEqual({ refundFils: 0, forfeitFils: 0, withinWindow: false });
  });

  it("cancellation exactly at starts_at is out of window", () => {
    const out = computeCancellation({
      policySnapshot: policy({ cancellation_refund_policy: "deposit_forfeit" }),
      now: startsAt,
      startsAt,
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out.withinWindow).toBe(false);
    expect(out.forfeitFils).toBe(10_000);
  });
});

describe("computeNoShow", () => {
  it("full policy: no forfeit", () => {
    const out = computeNoShow({
      policySnapshot: policy({ cancellation_refund_policy: "full" }),
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ forfeitFils: 0 });
  });

  it("deposit_forfeit policy: forfeits the snapshotted deposit", () => {
    const out = computeNoShow({
      policySnapshot: policy({ cancellation_refund_policy: "deposit_forfeit" }),
      amountPaidFils: 50_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ forfeitFils: 10_000 });
  });

  it("deposit_forfeit policy: caps forfeit at amount paid", () => {
    const out = computeNoShow({
      policySnapshot: policy({ cancellation_refund_policy: "deposit_forfeit" }),
      amountPaidFils: 3_000,
      depositFils: 10_000,
    });
    expect(out).toEqual({ forfeitFils: 3_000 });
  });

  it("percent policy: forfeits rounded penalty percent of amount paid", () => {
    const out = computeNoShow({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 33,
      }),
      amountPaidFils: 10_000,
      depositFils: 0,
    });
    // 10_000 * 0.33 = 3300 exactly.
    expect(out).toEqual({ forfeitFils: 3_300 });
  });

  it("percent policy: rounds fractional fils the same way as cancellation", () => {
    const out = computeNoShow({
      policySnapshot: policy({
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 15,
      }),
      amountPaidFils: 999,
      depositFils: 0,
    });
    expect(out).toEqual({ forfeitFils: 150 });
  });
});

describe("isWithinRescheduleWindow (Phase 5 Task 3)", () => {
  const start = iso("2026-07-20T12:00:00Z");

  it("true when well before the window (48h out, 24h window)", () => {
    expect(isWithinRescheduleWindow(iso("2026-07-18T12:00:00Z"), start, 24)).toBe(true);
  });

  it("false when inside the window (12h out, 24h window)", () => {
    expect(isWithinRescheduleWindow(iso("2026-07-20T00:00:00Z"), start, 24)).toBe(false);
  });

  it("boundary is inclusive (now = startsAt - windowHours counts as within)", () => {
    expect(isWithinRescheduleWindow(iso("2026-07-19T12:00:00Z"), start, 24)).toBe(true);
  });

  it("false once past starts_at entirely", () => {
    expect(isWithinRescheduleWindow(iso("2026-07-20T13:00:00Z"), start, 24)).toBe(false);
  });

  it("0-hour window: any time before start is within", () => {
    expect(isWithinRescheduleWindow(iso("2026-07-20T11:59:59Z"), start, 0)).toBe(true);
  });
});
