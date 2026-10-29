import { describe, expect, it } from "vitest";
import { computeCancelEstimate } from "./cancel-estimate";
import type { Booking } from "./types";

type EstimateInput = Parameters<typeof computeCancelEstimate>[0];

/**
 * All times are explicit — `computeCancelEstimate` takes `now` as an
 * argument, so nothing here depends on the wall clock.
 */
const STARTS_AT = "2026-08-01T10:00:00.000Z";
const HOUR_MS = 60 * 60 * 1000;

function booking(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return {
    starts_at: STARTS_AT,
    cancellation_window_hours: 24,
    cancellation_refund_policy: "percent" as Booking["cancellation_refund_policy"],
    cancellation_penalty_percent: 50,
    deposit_fils: 10_000, // AED 100.00
    price_fils: 40_000, // AED 400.00
    payment_mode: "deposit" as Booking["payment_mode"],
    amount_paid_fils: 0,
    escrow_hold_id: null,
    ...overrides,
  };
}

/** `now` such that exactly `hours` remain before starts_at. */
function nowWithHoursLeft(hours: number): Date {
  return new Date(new Date(STARTS_AT).getTime() - hours * HOUR_MS);
}

describe("computeCancelEstimate — cancellation window boundary", () => {
  it("treats the EXACT window boundary as still inside the window", () => {
    // 24h before a 24h-window booking: boundary-inclusive (>=), matching the
    // backend's isWithinWindow. This is the instant customers land on when a
    // reminder email says "cancel free until <time>".
    const estimate = computeCancelEstimate(booking(), nowWithHoursLeft(24));

    expect(estimate.withinWindow).toBe(true);
    expect(estimate.kind).toBe("full_refund_deposit");
    expect(estimate.amountFils).toBe(10_000);
  });

  it("falls out of the window one millisecond past the boundary", () => {
    const oneMsLate = new Date(nowWithHoursLeft(24).getTime() + 1);
    const estimate = computeCancelEstimate(booking(), oneMsLate);

    expect(estimate.withinWindow).toBe(false);
    // 50% of the AED 100 deposit — a penalty now applies.
    expect(estimate.kind).toBe("penalty_percent");
    expect(estimate.amountFils).toBe(5_000);
  });

  it("stays inside the window one millisecond before the boundary", () => {
    const oneMsEarly = new Date(nowWithHoursLeft(24).getTime() - 1);

    expect(computeCancelEstimate(booking(), oneMsEarly).withinWindow).toBe(true);
  });

  it("is out of window once the appointment start has already passed", () => {
    const afterStart = new Date(new Date(STARTS_AT).getTime() + HOUR_MS);

    expect(computeCancelEstimate(booking(), afterStart).withinWindow).toBe(false);
  });

  it("honours a zero-hour window (in-window right up to the start instant)", () => {
    const zeroWindow = booking({ cancellation_window_hours: 0 });

    expect(computeCancelEstimate(zeroWindow, new Date(STARTS_AT)).withinWindow).toBe(true);
    expect(
      computeCancelEstimate(zeroWindow, new Date(new Date(STARTS_AT).getTime() + 1)).withinWindow,
    ).toBe(false);
  });
});

describe("computeCancelEstimate — inside the window", () => {
  const inWindow = nowWithHoursLeft(48);

  it("refunds the deposit in full for deposit-mode bookings, whatever the policy", () => {
    for (const policy of ["full", "deposit_forfeit", "percent"] as const) {
      const estimate = computeCancelEstimate(
        booking({ cancellation_refund_policy: policy }),
        inWindow,
      );
      expect({ policy, ...estimate }).toMatchObject({
        kind: "full_refund_deposit",
        amountFils: 10_000,
      });
    }
  });

  it("reports no charge for prepay and pay_at_venue (nothing was captured up front)", () => {
    for (const mode of ["prepay", "pay_at_venue"] as const) {
      const estimate = computeCancelEstimate(booking({ payment_mode: mode }), inWindow);
      expect({ mode, ...estimate }).toMatchObject({ kind: "no_charge", amountFils: 0 });
    }
  });
});

describe("computeCancelEstimate — deposit mode, outside the window", () => {
  const outOfWindow = nowWithHoursLeft(1);

  it("bases the percent penalty on the DEPOSIT, never the full service price", () => {
    // Regression guard for the bug fixed in 9007bb4e: a 50% penalty on a
    // AED 100 deposit is AED 50 — not AED 200 (50% of the AED 400 price),
    // which is more than the customer ever paid.
    const estimate = computeCancelEstimate(
      booking({ cancellation_penalty_percent: 50, deposit_fils: 10_000, price_fils: 40_000 }),
      outOfWindow,
    );

    expect(estimate.kind).toBe("penalty_percent");
    expect(estimate.amountFils).toBe(5_000);
    expect(estimate.penaltyPercent).toBe(50);
  });

  it("never forfeits more than the deposit, even at a >100% penalty", () => {
    const estimate = computeCancelEstimate(
      booking({ cancellation_penalty_percent: 150, deposit_fils: 10_000 }),
      outOfWindow,
    );

    expect(estimate.amountFils).toBe(10_000);
  });

  it("rounds the percent penalty to a whole fil", () => {
    // 33% of 10_001 fils = 3300.33 -> 3300
    const estimate = computeCancelEstimate(
      booking({ cancellation_penalty_percent: 33, deposit_fils: 10_001 }),
      outOfWindow,
    );

    expect(estimate.amountFils).toBe(3_300);
    expect(Number.isInteger(estimate.amountFils)).toBe(true);
  });

  it("treats a null penalty percent as 0%", () => {
    const estimate = computeCancelEstimate(
      booking({ cancellation_penalty_percent: null }),
      outOfWindow,
    );

    expect(estimate.amountFils).toBe(0);
    expect(estimate.penaltyPercent).toBe(0);
  });

  it("forfeits the whole deposit under the deposit_forfeit policy", () => {
    const estimate = computeCancelEstimate(
      booking({ cancellation_refund_policy: "deposit_forfeit" }),
      outOfWindow,
    );

    expect(estimate.kind).toBe("forfeit_deposit");
    expect(estimate.amountFils).toBe(10_000);
  });

  it("still refunds the deposit in full under the 'full' policy", () => {
    const estimate = computeCancelEstimate(
      booking({ cancellation_refund_policy: "full" }),
      outOfWindow,
    );

    expect(estimate.kind).toBe("full_refund_deposit");
    expect(estimate.amountFils).toBe(10_000);
  });
});

describe("computeCancelEstimate — prepay and pay_at_venue, outside the window", () => {
  const outOfWindow = nowWithHoursLeft(1);

  it("charges nothing for pay_at_venue regardless of policy or penalty", () => {
    for (const policy of ["full", "deposit_forfeit", "percent"] as const) {
      const estimate = computeCancelEstimate(
        booking({
          payment_mode: "pay_at_venue",
          cancellation_refund_policy: policy,
          cancellation_penalty_percent: 100,
        }),
        outOfWindow,
      );
      expect({ policy, ...estimate }).toMatchObject({ kind: "no_charge", amountFils: 0 });
    }
  });

  it("hedges the prepay percent penalty as a conditional ceiling on the full price", () => {
    // The client cannot know whether the background authorization job has
    // run, so it must render a range, not a single asserted number.
    const estimate = computeCancelEstimate(
      booking({
        payment_mode: "prepay",
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 25,
        price_fils: 40_000,
      }),
      outOfWindow,
    );

    expect(estimate.kind).toBe("penalty_percent_prepay_conditional");
    expect(estimate.amountFils).toBe(10_000); // 25% of AED 400
    expect(estimate.penaltyPercent).toBe(25);
  });

  it("charges nothing for prepay under the 'full' policy", () => {
    const estimate = computeCancelEstimate(
      booking({ payment_mode: "prepay", cancellation_refund_policy: "full" }),
      outOfWindow,
    );

    expect(estimate).toMatchObject({ kind: "no_charge", amountFils: 0 });
  });

  it("charges nothing for prepay + deposit_forfeit when no deposit was snapshotted", () => {
    // deposit_fils is only ever set for deposit-mode bookings, so the normal
    // prepay case forfeits nothing.
    const estimate = computeCancelEstimate(
      booking({
        payment_mode: "prepay",
        cancellation_refund_policy: "deposit_forfeit",
        deposit_fils: 0,
      }),
      outOfWindow,
    );

    expect(estimate).toMatchObject({ kind: "no_charge", amountFils: 0 });
  });

  it("hedges prepay + deposit_forfeit when a deposit was unusually snapshotted", () => {
    const estimate = computeCancelEstimate(
      booking({
        payment_mode: "prepay",
        cancellation_refund_policy: "deposit_forfeit",
        deposit_fils: 7_500,
        price_fils: 40_000,
      }),
      outOfWindow,
    );

    expect(estimate.kind).toBe("penalty_percent_prepay_conditional");
    expect(estimate.amountFils).toBe(7_500);
  });

  it("never returns a negative forfeit when amount_paid_fils exceeds the price", () => {
    const estimate = computeCancelEstimate(
      booking({
        payment_mode: "prepay",
        cancellation_refund_policy: "percent",
        cancellation_penalty_percent: 50,
        price_fils: 40_000,
        amount_paid_fils: 50_000,
      }),
      outOfWindow,
    );

    expect(estimate.amountFils).toBe(0);
  });
});
