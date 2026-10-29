// payout-period.ts — pure date math, UTC throughout, no I/O.
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day));
}

/**
 * Returns the period that closed *today* for a given payout schedule, or null
 * if today is not a closing day.
 *
 * Keying off "today is a boundary" makes the daily job idempotent in the
 * ordinary case, but NOT via a duplicate-period guard on this path — there
 * isn't one here. What actually happens on a same-day rerun: the first run's
 * PayoutService.createDraft claims every payable commission in the period
 * (stamps their `payout_id`), so the second run's computePayoutTotals finds
 * `pending_count === 0` and createDraft returns null — a silent skip, because
 * there is nothing left to claim, not because a second attempt was detected
 * and rejected.
 *
 * A genuine concurrent second attempt (a scheduler bug, or a retry racing a
 * still-in-flight first run) is a different case: two createDraft calls could
 * both read the same unclaimed commissions before either claims them. That is
 * guarded at the write side instead — createDraft's claiming UPDATE only
 * claims rows still unclaimed and rolls back the whole draft if it claimed
 * fewer than expected, and a partial unique index on
 * `vendor_payouts (vendor_id, period_start, period_end)` rejects a second
 * draft for the same period outright.
 */
export const SUPPORTED_PAYOUT_SCHEDULES = ["daily", "weekly", "biweekly", "monthly"] as const;

export function closedPeriodFor(
  schedule: string,
  now: Date,
): { periodStart: string; periodEnd: string } | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = now.getUTCDate();

  // MINOR (round 4): `daily` is offered in the admin vendor form, and this
  // function used to fall through to the final `return null` for it — which
  // the draft job reads as "today is not a closing day", so every vendor on
  // a daily schedule was skipped every single night, forever, with no error
  // anywhere. Implemented rather than removed from the UI: it is four lines
  // of the same date math, and "the option exists but silently never pays"
  // is the worse failure. Every day closes the period that was yesterday.
  if (schedule === "daily") {
    const yesterday = iso(utc(y, m, day - 1));
    return { periodStart: yesterday, periodEnd: yesterday };
  }

  if (schedule === "weekly") {
    if (now.getUTCDay() !== 1) return null; // Monday
    return {
      periodStart: iso(utc(y, m, day - 7)),
      periodEnd: iso(utc(y, m, day - 1)),
    };
  }

  if (schedule === "monthly") {
    if (day !== 1) return null;
    return {
      periodStart: iso(utc(y, m - 1, 1)),
      periodEnd: iso(utc(y, m, 0)), // day 0 = last day of the previous month
    };
  }

  if (schedule === "biweekly") {
    if (day === 16) {
      return { periodStart: iso(utc(y, m, 1)), periodEnd: iso(utc(y, m, 15)) };
    }
    if (day === 1) {
      return { periodStart: iso(utc(y, m - 1, 16)), periodEnd: iso(utc(y, m, 0)) };
    }
    return null;
  }

  // An unrecognised schedule is NOT "today is not a closing day" — it means
  // this vendor can never be paid by the scheduler. Signalled distinctly so
  // the job can audit it instead of counting it as an ordinary skip.
  return null;
}

/** True for a schedule string `closedPeriodFor` actually understands. */
export function isSupportedPayoutSchedule(schedule: string): boolean {
  return (SUPPORTED_PAYOUT_SCHEDULES as readonly string[]).includes(schedule);
}
