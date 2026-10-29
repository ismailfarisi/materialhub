import type { Booking } from "./types";

/**
 * Client-side ESTIMATE of the cancel outcome, shown BEFORE the customer
 * confirms (task-3-brief.md's cancel-flow addendum). This mirrors the
 * booking-service's own cancel math — `computeCancellation`/`computeForfeit`
 * in `backend/apps/booking-service/src/domain/booking/booking-policy.ts`,
 * fed by `deriveRecoverableAmount` in `./booking-money.ts` — closely enough
 * to set expectations, but it is NOT the source of truth —
 * `POST /bookings/:id/cancel`'s response
 * (`within_window`/`refund_fils`/`forfeit_fils`/`action`) always wins once
 * the customer actually cancels; money movement there is best-effort and can
 * diverge from this estimate (e.g. a gateway hiccup).
 *
 * Rules (customer actor only — this UI never runs for admin/vendor actors):
 * - `isWithinWindow` is boundary-inclusive (>=) — cancelling AT EXACTLY
 *   `cancellation_window_hours` before `starts_at` still counts as in-window
 *   (booking-policy.ts:80-83). Inside the window: full refund of whatever
 *   was actually captured up front, regardless of policy.
 * - Outside the window, the forfeit is computed against a MODE-CORRECT
 *   recoverable amount (`amountPaidFils`, booking-money.ts:31-43), NOT
 *   `price_fils` unconditionally:
 *     - deposit mode: `amountPaidFils = deposit_fils` (captured at booking
 *       time).
 *     - prepay, authorized (`escrow_hold_id` set): `amountPaidFils =
 *       price_fils - amount_paid_fils` (the manual-capture hold; the dead
 *       `amount_paid_fils` column is always 0 in practice, so this is
 *       effectively `price_fils`).
 *     - prepay, NOT authorized (only a SetupIntent exists) / pay_at_venue:
 *       `amountPaidFils = 0` — nothing to forfeit.
 * - Per policy (booking-policy.ts's `computeForfeit`):
 *   "full" — forfeit is always 0, so still a full refund even out of window;
 *   "deposit_forfeit" — forfeit = `deposit_fils`, capped at `amountPaidFils`;
 *   "percent" — forfeit = `round(amountPaidFils * penaltyPercent / 100)`,
 *   capped at `amountPaidFils`. The basis is `amountPaidFils`, i.e. the
 *   DEPOSIT for deposit-mode bookings — never `price_fils`.
 * - Prepay's authorization state (`escrow_hold_id`) is observable on the
 *   fetched booking, but the client can't trust it as of the moment the
 *   customer actually confirms — the background authorization job
 *   (`booking-auth.job.ts`) can complete in between page-load and confirm.
 *   Rather than assert a single (possibly wrong) number for the prepay +
 *   "percent" combination, this returns a `_conditional` kind so the caller
 *   can render the honest range ("up to X if your card has already been
 *   authorized; nothing if not").  "full" and "deposit_forfeit" need no such
 *   hedge for prepay: forfeit is deterministically 0 either way ("full"
 *   always zeroes it; `deposit_fils` is only ever snapshotted for
 *   payment_mode "deposit" — see booking.service.ts — so it's 0 for prepay,
 *   and 0 capped at anything is still 0).
 */

export type CancelEstimateKind =
  | "no_charge"
  | "full_refund_deposit"
  | "forfeit_deposit"
  | "penalty_percent"
  /** Prepay + "percent" policy, out of window: the client can't reliably
   * know whether the authorization job has run by the time the customer
   * confirms — render as a hedged range, not a single asserted number. */
  | "penalty_percent_prepay_conditional";

export interface CancelEstimate {
  withinWindow: boolean;
  kind: CancelEstimateKind;
  /**
   * Meaning depends on `kind`: refund amount for full_refund_deposit,
   * forfeit for forfeit_deposit/penalty_percent, the "up to" forfeit
   * ceiling (i.e. the amount IF the prepay authorization has run) for
   * penalty_percent_prepay_conditional. Always 0 for no_charge.
   */
  amountFils: number;
  /** Only set for the penalty_percent* kinds — the raw percent for copy interpolation. */
  penaltyPercent?: number;
}

// Mirrors booking-policy.ts's computeForfeit exactly: percent/deposit_forfeit
// forfeit basis is `amountPaidFils` (mode-correct recoverable amount, NOT
// price_fils), "full" is always 0, and the result is clamped to
// [0, amountPaidFils] — a booking can never forfeit more than it actually
// paid/held.
function computeForfeitFils(
  policy: Booking["cancellation_refund_policy"],
  penaltyPercent: number,
  amountPaidFils: number,
  depositFils: number,
): number {
  let raw: number;
  switch (policy) {
    case "full":
      raw = 0;
      break;
    case "deposit_forfeit":
      raw = depositFils;
      break;
    case "percent":
      raw = Math.round(amountPaidFils * (penaltyPercent / 100));
      break;
    default:
      raw = 0;
  }
  return Math.min(Math.max(raw, 0), amountPaidFils);
}

export function computeCancelEstimate(
  booking: Pick<
    Booking,
    | "starts_at"
    | "cancellation_window_hours"
    | "cancellation_refund_policy"
    | "cancellation_penalty_percent"
    | "deposit_fils"
    | "price_fils"
    | "payment_mode"
    | "amount_paid_fils"
    | "escrow_hold_id"
  >,
  now: Date = new Date(),
): CancelEstimate {
  const startsAtMs = new Date(booking.starts_at).getTime();
  const windowMs = booking.cancellation_window_hours * 60 * 60 * 1000;
  // Boundary-inclusive, matching backend isWithinWindow (booking-policy.ts:80-83
  // — margin >= windowHours counts as within-window).
  const withinWindow = startsAtMs - now.getTime() >= windowMs;

  // Inside the window: forfeit is always 0 regardless of policy — full
  // refund of whatever was actually captured up front.
  if (withinWindow) {
    if (booking.payment_mode === "deposit") {
      return { withinWindow, kind: "full_refund_deposit", amountFils: booking.deposit_fils };
    }
    // prepay/pay_at_venue: nothing was captured up front (SetupIntent only,
    // or nothing at all) — no charge either way.
    return { withinWindow, kind: "no_charge", amountFils: 0 };
  }

  // pay_at_venue never captures anything, in or out of window.
  if (booking.payment_mode === "pay_at_venue") {
    return { withinWindow: false, kind: "no_charge", amountFils: 0 };
  }

  const penaltyPercent = booking.cancellation_penalty_percent ?? 0;
  const policy = booking.cancellation_refund_policy;

  if (booking.payment_mode === "deposit") {
    // amountPaidFils = deposit_fils for deposit-mode bookings — this is the
    // fix for the critical bug: the basis is the DEPOSIT, never price_fils.
    const amountPaidFils = booking.deposit_fils;
    if (policy === "full") {
      return { withinWindow: false, kind: "full_refund_deposit", amountFils: amountPaidFils };
    }
    const forfeitFils = computeForfeitFils(policy, penaltyPercent, amountPaidFils, booking.deposit_fils);
    if (policy === "deposit_forfeit") {
      return { withinWindow: false, kind: "forfeit_deposit", amountFils: forfeitFils };
    }
    return { withinWindow: false, kind: "penalty_percent", amountFils: forfeitFils, penaltyPercent };
  }

  // prepay, out of window.
  if (policy === "full") {
    // forfeit is always 0 for "full", regardless of authorization state.
    return { withinWindow: false, kind: "no_charge", amountFils: 0 };
  }
  if (policy === "deposit_forfeit") {
    // If deposit_fils is nonzero (unusual but legal config), hedge the
    // forfeit because authorization state is uncertain at render time.
    // Otherwise, forfeit is deterministically 0 regardless of authorization.
    if (booking.deposit_fils > 0) {
      const authorizedAmountFils = Math.max(booking.price_fils - booking.amount_paid_fils, 0);
      const forfeitIfAuthorizedFils = computeForfeitFils(
        policy,
        0,
        authorizedAmountFils,
        booking.deposit_fils,
      );
      return {
        withinWindow: false,
        kind: "penalty_percent_prepay_conditional",
        amountFils: forfeitIfAuthorizedFils,
      };
    }
    return { withinWindow: false, kind: "no_charge", amountFils: 0 };
  }

  // "percent": the forfeit basis is 0 if the authorization job hasn't run
  // yet, or (price_fils - amount_paid_fils) if it has — a state the client
  // can't fully trust by the time the customer confirms. Hedge explicitly
  // rather than assert a single number (the review's scenario B).
  const authorizedAmountFils = Math.max(booking.price_fils - booking.amount_paid_fils, 0);
  const forfeitIfAuthorizedFils = computeForfeitFils(
    "percent",
    penaltyPercent,
    authorizedAmountFils,
    booking.deposit_fils,
  );
  return {
    withinWindow: false,
    kind: "penalty_percent_prepay_conditional",
    amountFils: forfeitIfAuthorizedFils,
    penaltyPercent,
  };
}
