// Pure booking cancellation/no-show policy math — refund/forfeit decisions from
// a booking's SNAPSHOTTED cancellation policy (spec §5.3: a later vendor policy
// edit can't change a customer's existing deal). No DB, no data-source, no
// Redis, no Date.now() — every "current time" is passed in so this runs in CI
// (no Postgres) and is trivially unit-testable. Mirrors the pattern in
// ../availability/interval-math.ts.
//
// Deliberately does NOT import from @materialhub/database: that package's index
// re-exports AppDataSource (libs/database/src/data-source.ts) and side-effects
// `import "reflect-metadata"` at module load, which would make this module
// (and its test) fail without Postgres. Instead, CancellationPolicySnapshot
// mirrors the relevant `bookings` columns with a local string-literal type —
// same trick interval-math.ts uses for WeeklyRule/DateRange instead of
// importing the `staff_working_hours` entity.
//
// Design intent (phase-5 plan Task 1; booking.entity.ts field comments):
//  - Cancelling INSIDE the window always refunds in full, regardless of
//    `cancellation_refund_policy` — the policy only governs OUT-of-window
//    cancellations (and no-shows, which have no window at all).
//  - `full`            — no penalty, ever. Full refund even out of window.
//    This is the DB/API-created-offering default (the "safe" choice).
//  - `deposit_forfeit` — the snapshotted deposit (`deposit_fils`) is kept;
//    the remainder of `amount_paid_fils` is refunded.
//  - `percent`         — `cancellation_penalty_percent`% of `amount_paid_fils`
//    is kept; the remainder is refunded.
//  - Forfeit is always capped at `amountPaidFils` — a booking can never be
//    asked to forfeit more than it actually paid, even if a deposit/percent
//    snapshot is pathological relative to what was collected (e.g. a
//    still-authorizing prepay booking with amountPaidFils still 0).
//
// Rounding: percent forfeit uses `Math.round(amount * (rate / 100))` — the
// same convention as order-service's CommissionService.calculateAmount
// (apps/order-service/src/domain/commission/commission.service.ts:78) and its
// booking-service mirror, CommissionSnapshotService.resolve
// (./commission-snapshot.service.ts:94).

export type CancellationRefundPolicyValue = "full" | "deposit_forfeit" | "percent";

// Mirrors the subset of `bookings` columns (booking.entity.ts) that drive
// cancellation/no-show math. Structurally compatible with the real
// `CancellationRefundPolicy` TS enum from @materialhub/database, so callers can
// pass `booking.cancellation_refund_policy` etc. straight through without a
// cast.
export interface CancellationPolicySnapshot {
  cancellation_window_hours: number;
  cancellation_refund_policy: CancellationRefundPolicyValue;
  cancellation_penalty_percent: number;
}

export interface ComputeCancellationInput {
  policySnapshot: CancellationPolicySnapshot;
  now: Date;
  startsAt: Date;
  amountPaidFils: number;
  depositFils: number;
}

export interface ComputeCancellationResult {
  refundFils: number;
  forfeitFils: number;
  withinWindow: boolean;
}

export interface ComputeNoShowInput {
  policySnapshot: CancellationPolicySnapshot;
  amountPaidFils: number;
  depositFils: number;
}

export interface ComputeNoShowResult {
  forfeitFils: number;
}

const HOUR_MS = 3_600_000;

// In-window means cancelling at least `windowHours` before `startsAt`. The
// boundary itself counts as in-window (inclusive), matching the >= earliest
// convention interval-math.ts's applyBookingWindow uses for its min-notice
// bound.
function isWithinWindow(now: Date, startsAt: Date, windowHours: number): boolean {
  const marginMs = startsAt.getTime() - now.getTime();
  return marginMs >= windowHours * HOUR_MS;
}

// Shared out-of-window / no-show forfeit calculation — no-show has no
// "window" concept of its own (a booking either is or isn't shown up to), so
// it always applies the same per-policy forfeit that an out-of-window
// cancellation would.
function computeForfeit(
  policySnapshot: CancellationPolicySnapshot,
  amountPaidFils: number,
  depositFils: number,
): number {
  let raw: number;
  switch (policySnapshot.cancellation_refund_policy) {
    case "full":
      raw = 0;
      break;
    case "deposit_forfeit":
      raw = depositFils;
      break;
    case "percent":
      raw = Math.round(amountPaidFils * (policySnapshot.cancellation_penalty_percent / 100));
      break;
    default: {
      // Exhaustiveness guard — unreachable while CancellationRefundPolicyValue
      // covers all three cases.
      const unreachable: never = policySnapshot.cancellation_refund_policy;
      throw new Error(`Unknown cancellation_refund_policy: ${unreachable}`);
    }
  }
  // Never forfeit more than was actually paid, and never a negative amount.
  return Math.min(Math.max(raw, 0), amountPaidFils);
}

export function computeCancellation(input: ComputeCancellationInput): ComputeCancellationResult {
  const { policySnapshot, now, startsAt, amountPaidFils, depositFils } = input;
  const withinWindow = isWithinWindow(now, startsAt, policySnapshot.cancellation_window_hours);
  const forfeitFils = withinWindow
    ? 0
    : computeForfeit(policySnapshot, amountPaidFils, depositFils);
  return {
    refundFils: amountPaidFils - forfeitFils,
    forfeitFils,
    withinWindow,
  };
}

export function computeNoShow(input: ComputeNoShowInput): ComputeNoShowResult {
  const { policySnapshot, amountPaidFils, depositFils } = input;
  return { forfeitFils: computeForfeit(policySnapshot, amountPaidFils, depositFils) };
}

// Reschedule window check (Phase 5 Task 3, spec §5.3): a customer may
// self-reschedule only while still at least `rescheduleWindowHours` before
// `startsAt`. Boundary-inclusive (>=), matching isWithinWindow above and
// interval-math.ts's min-notice convention. Pure — `now` is passed in at the
// edge, never read from Date.now() here (mirrors the rest of this module).
// Vendor/admin actors bypass this entirely (enforced at the service layer,
// not here); this is only consulted for the customer path.
export function isWithinRescheduleWindow(
  now: Date,
  startsAt: Date,
  rescheduleWindowHours: number,
): boolean {
  return isWithinWindow(now, startsAt, rescheduleWindowHours);
}
