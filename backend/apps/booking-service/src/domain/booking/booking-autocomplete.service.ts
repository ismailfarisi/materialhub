// booking-autocomplete.service.ts
//
// Phase 5 Task 5b (spec §5.3 "Auto-complete"): a delayed BullMQ job scheduled
// at CONFIRM time for EVERY confirmed booking (all payment_modes — not just
// prepay). If the booking is still `confirmed` when the job fires (`ends_at +
// grace`), it transitions to `completed` with `actor = system`, which already
// triggers Phase 4 Task 9's capture + commission accrual
// (BookingStatusService.completeBooking -> BookingCompletionHook) and opens
// review eligibility. Closes the review-veto (a vendor can't block a review,
// or commission accrual, by never marking completion themselves) and makes
// prepay capture independent of vendor diligence.
//
// Wiring mirrors booking-auth.service.ts's shape closely (delayed job with a
// deterministic jobId, re-time/remove helpers, a narrow StatusTransitioner-
// shaped seam back into BookingStatusService to avoid a circular import) —
// see that file's own header comment for the general pattern this follows.
import type { Booking } from "@materialhub/database";
import { BookingStatus } from "@materialhub/database";

const HOUR_MS = 3_600_000;

// Default grace between `ends_at` and the auto-complete fire time (spec §5.3:
// "ends_at + 24h"). Config-driven via config.bookings.autoCompleteGraceHours
// (BOOKING_AUTOCOMPLETE_GRACE_HOURS), but the DEFAULT must stay 24h —
// booking-auth.service.ts's AUTO_COMPLETE_DELAY_HOURS constant hardcodes this
// same 24h in its own auth-fire-time clamp math (captureDeadline = starts_at
// + duration + 24h). Changing the deployed grace away from 24h without also
// updating that constant would silently desync the two: an auth job's clamp
// would assume capture happens 24h earlier/later than it actually does,
// eating into (or overstating) AUTH_SAFETY_MARGIN_HOURS. Do NOT change
// booking-auth.service.ts's constant to "read" this value — the brief is
// explicit that this task must not silently alter Phase 4's assumption.
export const DEFAULT_AUTO_COMPLETE_GRACE_HOURS = 24;

export interface AutoCompleteFireTimeInput {
  ends_at: Date;
}

/**
 * spec §5.3 fire-time formula: `fireAt = ends_at + graceHours`. Pure — no
 * `Date.now()` here; the caller stamps "now" at the edge (scheduleForConfirm)
 * per the established Phase 4 convention.
 */
export function computeAutoCompleteFireTime(
  booking: AutoCompleteFireTimeInput,
  graceHours: number,
): Date {
  return new Date(booking.ends_at.getTime() + graceHours * HOUR_MS);
}

// ─── DI seams (narrow interfaces so this file never imports the concrete
// BookingStatusService/TypeORM Repository classes — booking-status.service.ts
// injects itself as a CompletionTransitioner via the BookingAutoCompleteHook
// interface it defines, avoiding a circular module import between the two
// files, mirrored from booking-auth.service.ts's StatusTransitioner) ───────

export interface CompletionTransitioner {
  completeBooking(
    bookingId: string,
    actor: { id: string | null; role: "system" },
    reason?: string,
  ): Promise<Booking>;
}

export interface AutoCompleteQueueLike {
  add(
    name: string,
    data: unknown,
    opts?: {
      jobId?: string;
      delay?: number;
      removeOnComplete?: number | boolean;
      removeOnFail?: number | boolean;
    },
  ): Promise<unknown>;
  remove(jobId: string): Promise<unknown>;
}

export interface BookingRepoLike {
  findOne(opts: { where: { id: string } }): Promise<Booking | null>;
}

const SYSTEM_ACTOR = { id: null, role: "system" as const };

// jobId naming: the plan's `autocomplete:{bookingId}` trips the installed
// bullmq version's "Custom Id cannot contain :" validation (same constraint
// documented in booking-auth.service.ts's authJobId/followUpJobId comment) —
// `_` is the established separator on this branch.
function autoCompleteJobId(bookingId: string): string {
  return `autocomplete_${bookingId}`;
}

/**
 * The auto-complete job body (Phase 5 Task 5b). Entry points wired into this
 * from BookingStatusService (via the BookingAutoCompleteHook interface it
 * defines):
 *
 *   - `scheduleForConfirm` — called from `confirm()`'s `enqueuePostConfirmHooks`
 *     seam, for EVERY confirmed booking. Enqueues the delayed
 *     `autocomplete_{bookingId}` job at `ends_at + graceHours`.
 *   - Cleanup — `removeAutoCompleteJob` is called from
 *     `transitionGuarded`'s cancelled/expired/rescheduled cleanup branch (a
 *     terminal or rescheduled booking must never leave a dangling
 *     auto-complete job keyed to a slot that's no longer live).
 *
 * `rescheduleAutoCompleteJob` has no caller yet on this branch — Tasks 3/4
 * (reschedule/cancel routes) don't exist. It's exposed as a clean seam for
 * those tasks: once a booking's `ends_at` changes (reschedule-completion),
 * the flow driving that MUST call this with the booking's NEW `ends_at` (the
 * cleanup branch above only REMOVES the stale job on the `rescheduled`
 * transition; it does not know the new slot to re-schedule for).
 *
 * The BullMQ Worker (booking-autocomplete.job.ts) that actually processes the
 * `autocomplete_{id}` job delegates straight to `runAutoCompleteJob` below.
 */
export class BookingAutoCompleteService {
  constructor(
    private readonly bookingRepo: BookingRepoLike,
    private readonly statusService: CompletionTransitioner,
    private readonly queue: AutoCompleteQueueLike,
    private readonly graceHours: number = DEFAULT_AUTO_COMPLETE_GRACE_HOURS,
  ) {}

  async scheduleForConfirm(booking: Booking, now: Date = new Date()): Promise<void> {
    const fireAt = computeAutoCompleteFireTime(booking, this.graceHours);
    const delay = Math.max(fireAt.getTime() - now.getTime(), 0);
    await this.queue.add(
      "auto-complete",
      { bookingId: booking.id },
      { jobId: autoCompleteJobId(booking.id), delay, removeOnComplete: 500, removeOnFail: 500 },
    );
  }

  /**
   * Re-times the job for a booking whose `ends_at` has changed (reschedule
   * flow, Tasks 3/4). A plain `queue.add` with the SAME jobId is a no-op on
   * BullMQ when that job already exists (see booking-auth.service.ts's own
   * comment on this) — it would silently keep the OLD delay rather than
   * re-time it. So this removes the existing job first (best-effort — it's
   * fine if none existed) and then schedules fresh against the booking's
   * current `ends_at`.
   */
  async rescheduleAutoCompleteJob(booking: Booking, now: Date = new Date()): Promise<void> {
    await this.removeJobBestEffort(autoCompleteJobId(booking.id));
    await this.scheduleForConfirm(booking, now);
  }

  /** Called defensively from BookingStatusService's cancelled/expired/
   * rescheduled transition path so a booking that's no longer confirmed (or
   * moved off its old slot) never leaves a dangling delayed job behind. */
  async removeAutoCompleteJob(bookingId: string): Promise<void> {
    await this.removeJobBestEffort(autoCompleteJobId(bookingId));
  }

  private async removeJobBestEffort(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch (err) {
      console.warn(`[booking-autocomplete] failed to remove job ${jobId}`, err);
    }
  }

  /**
   * BullMQ Worker entry point for the delayed `autocomplete_{bookingId}`
   * job. Fetches the booking fresh (a delayed job's in-flight data can be
   * stale by the time it fires). A genuine failure from `completeBooking`
   * (e.g. order-service unreachable during capture) is deliberately NOT caught
   * here — it propagates so the queue's configured retry policy
   * (`attempts`/`backoff` on the booking-autocomplete queue, see
   * booking-autocomplete.job.ts — Phase 5 final review Fix 2) re-runs it,
   * mirroring BookingStatusService.completeBooking's own "rethrow, don't
   * swallow" money-side contract (see that method's docstring).
   *
   * Status handling (Phase 5 final review Fix 2 — retry-safety):
   *   - `confirmed`: the normal case — complete it (capture + accrual).
   *   - `completed`: NOT a no-op. This is exactly the retry-after-mid-flight-
   *     failure case: a prior run WON the pending->completed transition but the
   *     capture threw, so the booking is durably `completed` while the money
   *     side never finished. Route it back through completeBooking so its
   *     already-`completed` re-fire branch re-attempts the idempotent
   *     capture/accrual (skips whatever already succeeded). If this branch fell
   *     through to the graceful no-op below instead, the retry would see
   *     `completed`, skip, and the authorization would silently expire — the
   *     bug this fix closes. (Notifications are NOT re-emitted on this path —
   *     they only fire on the winning transition; see completeBooking.)
   *   - cancelled/no_show/expired: a genuine graceful no-op — the booking left
   *     `confirmed` for a terminal state before this fired (cancel/no-show, or
   *     a reaper expiry), so there's nothing to complete.
   */
  async runAutoCompleteJob(bookingId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) {
      console.warn(
        `[booking-autocomplete] booking ${bookingId} not found — skipping auto-complete job`,
      );
      return;
    }
    if (booking.status !== BookingStatus.confirmed && booking.status !== BookingStatus.completed) {
      console.log(
        `[booking-autocomplete] booking ${bookingId} is ${booking.status} (terminal, not confirmed/completed) — skipping auto-complete job`,
      );
      return;
    }

    await this.statusService.completeBooking(
      bookingId,
      SYSTEM_ACTOR,
      `Auto-completed ${this.graceHours}h after the booking window elapsed with no manual completion/cancellation`,
    );
  }
}
