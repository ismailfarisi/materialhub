import {
  Booking,
  BookingStatus,
  BookingStatusHistory,
  NotificationType,
  ServicePaymentMode,
  StaffEngagement,
} from "@materialhub/database";
import { HttpError, NotFoundError } from "@materialhub/plugins";
import { IsNull, type Repository } from "typeorm";
import type { AvailabilityCache } from "../availability/availability-cache.ts";
import { EngagementService } from "../engagement/engagement.service.ts";

export type BookingActorRole = "customer" | "vendor" | "admin" | "system";

export interface BookingActor {
  id: string | null;
  role: BookingActorRole;
}

// Task 7b's seam into BookingAuthService — a narrow interface (not an import
// of the concrete class) so this file and booking-auth.service.ts never
// import each other, even though the real BookingAuthService needs to call
// BACK into this class's `transition()` (as a StatusTransitioner) to
// auto-cancel on follow-up failure. Both sides are wired together only in
// container.ts (the composition root).
export interface BookingAuthHook {
  scheduleForConfirm(booking: Booking): Promise<void>;
  handleAsyncAuthFailure(booking: Booking, reason: string): Promise<void>;
  removeBookingAuthJob(bookingId: string): Promise<void>;
}

// Phase 4 Task 9's seam into BookingCompletionService (booking-completion.service.ts)
// — money-critical (capture + commission accrual), so unlike BookingAuthHook's
// fire-and-forget cleanup calls, `completeBooking()` AWAITS this and
// propagates a failure to its own caller (see that method's comment). Kept as
// a narrow interface (not a concrete import) for the same reason as
// BookingAuthHook: avoids a module import cycle and keeps this file usable
// in isolation (tests construct BookingStatusService with no completionHook
// at all, in which case completeBooking() logs and no-ops the money side —
// see fireCompletionHook).
export interface BookingCompletionHook {
  // `firstCompletion` distinguishes the WINNING pending->completed transition
  // (true) from a re-fire on an already-`completed` booking (false — a
  // capture/accrual retry, or a lost concurrent-completion race). The
  // capture/commission side runs on BOTH (it's idempotent server-side); the
  // customer-facing completion notifications fire ONLY when `firstCompletion`
  // (Phase 5 final review Fix 3 — see BookingCompletionService.onCompleted).
  onCompleted(booking: Booking, context: { firstCompletion: boolean }): Promise<void>;
}

// Phase 5 Task 5b's seam into BookingAutoCompleteService
// (booking-autocomplete.service.ts) — a narrow interface for the same reason
// as BookingAuthHook: avoids a module import cycle (BookingAutoCompleteService
// calls BACK into this class's `completeBooking()` as a CompletionTransitioner
// when its delayed job fires), and keeps this file usable in isolation
// (existing tests construct BookingStatusService with no autoCompleteHook at
// all, in which case `enqueuePostConfirmHooks` logs and no-ops — see
// `fireAutoCompleteHook`). Wired together only in container.ts.
export interface BookingAutoCompleteHook {
  scheduleForConfirm(booking: Booking): Promise<void>;
  removeAutoCompleteJob(bookingId: string): Promise<void>;
}

// Phase 5 Task 6's seam into ReminderScheduler (reminder-scheduler.ts) — a
// narrow interface for the same reason as BookingAutoCompleteHook: keeps this
// file usable in isolation (existing tests construct BookingStatusService
// with no reminderHook at all, in which case `enqueuePostConfirmHooks` no-ops
// for the reminder leg — see `fireReminderHook`). Wired together only in
// container.ts. Unlike BookingAuthHook/BookingAutoCompleteHook, nothing calls
// BACK into BookingStatusService from ReminderScheduler (a fired reminder job
// only reads the booking + emits a notification event, it never transitions
// status), so there's no value-level cycle to break with late binding here —
// container.ts can construct ReminderScheduler before BookingStatusService if
// it wants, though it currently follows the same late-binding style as the
// other two hooks for consistency.
export interface BookingReminderHook {
  scheduleForConfirm(booking: Booking): Promise<void>;
  removeReminderJobs(bookingId: string): Promise<void>;
}

// Phase 5 Task 8 seams (mirrors cancel.service.ts's/reschedule.service.ts's
// own per-file NotificationEventQueueLike/VendorOwnerLookup — same shared
// "notification-events" BullMQ queue, narrow interfaces so this file never
// imports the concrete Queue/repository classes). Both optional: a missing
// queue simply skips the confirm-time notifications (mirrors every other
// optional hook on this class), and a missing vendorOwnerLookup just skips
// the vendor-facing `vendor_new_booking` notify (customer's `booking_confirmed`
// still fires).
export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}
export interface VendorOwnerLookup {
  findOwnerUserId(vendorId: string): Promise<string | null>;
}

// Mirrors PayAtVenueUnavailableError's shape (booking.service.ts) — a
// dedicated HttpError subclass rather than the generic
// UnprocessableEntityError, so the wire code is a clear, greppable
// `invalid_booking_transition` instead of the shared `UNPROCESSABLE_ENTITY`.
export class InvalidBookingTransitionError extends HttpError {
  constructor(from: BookingStatus, to: BookingStatus) {
    super(
      422,
      `Cannot transition booking from '${from}' to '${to}'`,
      "invalid_booking_transition",
      { from, to },
    );
  }
}

// spec §5.3 — the state machine's ONLY legal edges:
//
//   pending_payment --pay/setup ok--> confirmed
//   pending_payment --reaper/timeout--> expired
//   confirmed --admin/auto-complete--> completed
//   confirmed --admin--> no_show
//   confirmed --in-window--> rescheduled --> confirmed (new slot)
//   confirmed --customer/admin--> cancelled
//
// Any pair not listed here is illegal. completed/cancelled/expired/no_show
// are terminal — no outgoing edges (support overrides are explicitly out of
// scope per the Task 6 brief).
// Exported so the CI-running unit suite (booking-status.service.test.ts) can
// assert the FULL legal/illegal matrix table-driven, with no DB — this is a
// plain data structure and the state machine's single source of truth, so it
// is the highest-value thing in this file to pin down.
export const ALLOWED_TRANSITIONS: Record<BookingStatus, ReadonlySet<BookingStatus>> = {
  [BookingStatus.pending_payment]: new Set([BookingStatus.confirmed, BookingStatus.expired]),
  [BookingStatus.confirmed]: new Set([
    BookingStatus.completed,
    BookingStatus.no_show,
    BookingStatus.rescheduled,
    BookingStatus.cancelled,
  ]),
  [BookingStatus.rescheduled]: new Set([BookingStatus.confirmed]),
  [BookingStatus.cancelled]: new Set(),
  [BookingStatus.completed]: new Set(),
  [BookingStatus.no_show]: new Set(),
  [BookingStatus.expired]: new Set(),
};

/**
 * The booking state machine (Phase 4 Task 6, spec §5.3). The single place
 * that validates a status transition, writes the `booking_status_history`
 * audit row, and keeps the 1:1 `staff_engagement` in sync — every other
 * confirm/cancel/complete/no-show/reschedule call site (webhook handler,
 * reaper, admin routes, Phase 5 auto-complete) is expected to go through
 * `transition()` rather than mutating `booking.status` directly.
 *
 * `EngagementService.confirm/release` already invalidate the availability
 * cache internally (`setStatus` -> `invalidate`, see engagement.service.ts),
 * so `transition()` invalidates the cache exactly once per slot-freeing/
 * slot-claiming edge by calling those methods — never invalidates directly
 * itself, and never calls them for `completed`/`no_show` (the slot's time
 * has already elapsed; nothing to free or reclaim).
 */
export class BookingStatusService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly cache?: AvailabilityCache,
    private readonly bookingAuthHook?: BookingAuthHook,
    private readonly completionHook?: BookingCompletionHook,
    private readonly autoCompleteHook?: BookingAutoCompleteHook,
    private readonly reminderHook?: BookingReminderHook,
    // Phase 5 Task 8 — trailing + optional so every existing positional
    // construction (tests, container.ts pre-Task-8) keeps compiling
    // unchanged.
    private readonly notificationQueue?: NotificationEventQueueLike,
    private readonly vendorOwnerLookup?: VendorOwnerLookup,
  ) {}

  async transition(
    bookingId: string,
    to: BookingStatus,
    actor: BookingActor,
    reason?: string,
  ): Promise<Booking> {
    const { booking } = await this.transitionGuarded(bookingId, to, actor, reason, {
      noopIfAlreadyTarget: false,
    });
    return booking;
  }

  // Shared guarded core for transition()/confirm(). Reads `from` OUTSIDE the
  // transaction (to fail fast on an illegal edge before opening a tx) but
  // that read is just an optimistic hint — the actual status change is a
  // CONDITIONAL UPDATE inside the transaction (`WHERE id = :id AND status =
  // :from AND deleted_at IS NULL`), so a concurrent caller that changed the
  // row between our pre-tx read and this guarded UPDATE (e.g. two racing
  // Stripe webhook deliveries both calling confirm(), or an admin no_show
  // racing a customer cancel) cannot both win: only the caller whose UPDATE
  // actually matches a row (`affected === 1`) writes history and syncs the
  // engagement.
  //
  // `noopIfAlreadyTarget` (set only by confirm()) governs what happens on the
  // losing side (`affected !== 1`): if the row's CURRENT status (re-read
  // inside the tx) is already the target `to` state, that's the
  // webhook-retry / lost-race case — return the current booking as a safe
  // no-op instead of throwing, so confirm() never double-writes history or
  // double-fires its seams. A normal transition() call (flag false) always
  // throws InvalidBookingTransitionError on the losing side — the caller
  // raced and lost.
  private async transitionGuarded(
    bookingId: string,
    to: BookingStatus,
    actor: BookingActor,
    reason: string | undefined,
    options: { noopIfAlreadyTarget: boolean },
  ): Promise<{ booking: Booking; wroteHistory: boolean }> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    const from = booking.status;

    // Second no-op window: this pre-tx read itself can land AFTER a
    // concurrent winner has already committed (e.g. confirm()'s own early
    // "already confirmed" check upstream passed while pending_payment, but
    // by the time THIS read runs the other caller already flipped + committed
    // the row) — `from === to` here isn't a listed edge (no self-loops in
    // ALLOWED_TRANSITIONS), so without this check it would incorrectly throw
    // InvalidBookingTransitionError instead of the safe no-op confirm()
    // promises. The in-tx guard below (`affected !== 1`) covers the OTHER
    // race window, where both callers' pre-tx reads land before either
    // commits.
    if (options.noopIfAlreadyTarget && from === to) {
      return { booking, wroteHistory: false };
    }

    if (!ALLOWED_TRANSITIONS[from]?.has(to)) {
      throw new InvalidBookingTransitionError(from, to);
    }

    const result = await this.bookingRepo.manager.transaction(async (manager) => {
      const bookingRepoTx = manager.getRepository(Booking);
      const historyRepo = manager.getRepository(BookingStatusHistory);
      const engagementRepo = manager.getRepository(StaffEngagement);
      const engagementService = new EngagementService(engagementRepo, this.cache);

      // The atomic guard: only matches (and flips) the row if it's still in
      // the `from` state we validated against above. No new column needed —
      // the status value itself is the concurrency guard.
      const result = await bookingRepoTx.update(
        { id: bookingId, status: from, deleted_at: IsNull() },
        { status: to },
      );

      if (result.affected !== 1) {
        const current = await bookingRepoTx.findOne({ where: { id: bookingId } });
        if (options.noopIfAlreadyTarget && current?.status === to) {
          // Lost the race, but to the SAME target state we were headed for
          // (e.g. two concurrent Stripe webhook deliveries both confirming)
          // — the other caller already wrote history + synced the
          // engagement. Safe no-op: no second history row, no seam refire.
          return { booking: current, wroteHistory: false };
        }
        throw new InvalidBookingTransitionError(current?.status ?? from, to);
      }

      await historyRepo.save(
        historyRepo.create({
          booking_id: bookingId,
          from_status: from,
          to_status: to,
          actor_id: actor.id,
          actor_role: actor.role,
          reason: reason ?? null,
        }),
      );

      // Engagement sync (spec §5.3 / Task 6 brief step 3):
      if (to === BookingStatus.confirmed) {
        // Covers BOTH pending_payment->confirmed (webhook/pay_at_venue) and
        // rescheduled->confirmed (the transient-marker edge) — idempotent
        // (setStatus is a plain UPDATE) even if Phase 5's reschedule flow
        // already confirmed the engagement itself.
        await engagementService.confirm(booking.engagement_id);
      } else if (to === BookingStatus.cancelled || to === BookingStatus.expired) {
        // Frees the slot for resale (spec §5.3: reaper/timeout, customer/admin
        // cancel).
        //
        // Releasing the authorization is deliberately NOT done here — this
        // method only frees the slot. Every route that reaches a terminal
        // status owns its own money movement, and both are wired:
        //   - confirmed -> cancelled: CancelBookingService.applyMoney() voids
        //     the auth PI (action "void"), captures only the forfeit
        //     (action "partial_capture", Stripe auto-releases the remainder),
        //     or refunds a captured deposit — best-effort, AFTER this
        //     transition, so a gateway failure never un-cancels the booking.
        //   - pending_payment -> expired: BookingReaperService
        //     .settleDepositBeforeExpiry() settles the deposit PI BEFORE
        //     driving this edge (Phase 7 review fix #2 — a deposit PI is
        //     capture-now, so it must be proven voided, or the booking
        //     confirmed instead, before the slot is freed). prepay at that
        //     stage is a SetupIntent — no money held — so its leg is cleanup,
        //     not a money-safety hole.
        // ALLOWED_TRANSITIONS admits no other edge into cancelled/expired, so
        // there is no path that strands an authorization here. Any NEW caller
        // that transitions to a terminal status must handle its own void /
        // capture / refund the same way.
        await engagementService.release(booking.engagement_id);
      }
      // to === completed | no_show: engagement stays as-is — the slot's time
      // has already been consumed, so there's nothing to release/reclaim and
      // no cache entry needs invalidating for a day that's already elapsed.
      // to === rescheduled: leave engagement handling to Phase 5's reschedule
      // flow (new hold + slot_range UPDATE) — this task only allows the
      // transition + history row, per the brief.

      const updated = await bookingRepoTx.findOne({ where: { id: bookingId } });
      return { booking: updated as Booking, wroteHistory: true };
    });

    // Task 7b: a terminal booking must never leave a dangling
    // `auth:{id}`/`auth-followup:{id}` delayed job behind — e.g. the reaper
    // expiring a pending_payment booking, or a customer cancelling via
    // CancelBookingService before their prepay auth ever fired. Also removed
    // on `rescheduled`: that job is keyed to the OLD `starts_at`, so leaving
    // it in place would authorize/auto-cancel at the wrong time once the
    // booking moves to a new slot.
    //
    // The `rescheduled` edge IS driven in production now: RescheduleService
    // transitions confirmed -> rescheduled -> confirmed and then calls
    // `rescheduleBookingAuthJob(updated, now)` to re-arm the job against the
    // NEW `starts_at`. This removal only clears the STALE job; it does not
    // itself re-schedule, so that re-arm call remains RescheduleService's
    // responsibility (as it is for any future caller of this edge).
    // Deliberately OUTSIDE the transaction above (a BullMQ/Redis round-trip
    // has no business holding a DB transaction/lock open, mirrors
    // BookingReaperService's own payment-void-is-best-effort-and-after
    // ordering) and only on an actual state flip (`wroteHistory`) reaching
    // one of these statuses — never on the safe no-op branch, which means
    // some OTHER caller already handled cleanup.
    const reachedCleanupTargetStatus =
      result.wroteHistory &&
      (to === BookingStatus.cancelled ||
        to === BookingStatus.expired ||
        to === BookingStatus.rescheduled);

    if (reachedCleanupTargetStatus && this.bookingAuthHook) {
      this.bookingAuthHook.removeBookingAuthJob(bookingId).catch((err) => {
        console.error(`[booking-status] removeBookingAuthJob failed for booking ${bookingId}`, err);
      });
    }

    // Phase 5 Task 5b: the auto-complete job is scheduled at CONFIRM time for
    // EVERY confirmed booking (not just prepay — see enqueuePostConfirmHooks),
    // so it needs the exact same dangling-job cleanup bookingAuthHook already
    // gets above: a pending_payment->expired booking never had one scheduled
    // (harmless no-op remove), a confirmed->cancelled booking DID have one
    // scheduled and must not auto-complete a booking the customer/admin just
    // cancelled, and confirmed->rescheduled's job is keyed to the OLD
    // `ends_at` — RescheduleService re-arms it for the NEW `ends_at` via
    // `rescheduleAutoCompleteJob` after both transitions (same contract as
    // the bookingAuthHook branch above).
    if (reachedCleanupTargetStatus && this.autoCompleteHook) {
      this.autoCompleteHook.removeAutoCompleteJob(bookingId).catch((err) => {
        console.error(
          `[booking-status] removeAutoCompleteJob failed for booking ${bookingId}`,
          err,
        );
      });
    }

    // Phase 5 Task 6: reminder jobs get the exact same dangling-job cleanup
    // as the autoCompleteHook/bookingAuthHook above — a confirmed->cancelled
    // booking must not remind a customer about a booking they just
    // cancelled, and confirmed->rescheduled's jobs are keyed to the OLD
    // `starts_at` — RescheduleService re-arms them for the NEW `starts_at`
    // via `rescheduleReminderJobs` after both transitions (same contract as
    // the bookingAuthHook branch above).
    if (reachedCleanupTargetStatus && this.reminderHook) {
      this.reminderHook.removeReminderJobs(bookingId).catch((err) => {
        console.error(`[booking-status] removeReminderJobs failed for booking ${bookingId}`, err);
      });
    }

    return result;
  }

  /**
   * PHASE 7 REVIEW FIX #1 — the ATOMIC `confirmed -> rescheduled -> confirmed`
   * pair (spec §5.3 reschedule), replacing RescheduleService's two independent
   * `transition()` calls.
   *
   * THE BUG THIS CLOSES: those two calls were two separate committed
   * transactions with no outer transaction and no compensation. Between them
   * the row was durably `rescheduled` — and `rescheduled` is a DEAD END in
   * practice:
   *   - `ALLOWED_TRANSITIONS[rescheduled]` admits only `confirmed`, and the
   *     ONLY producer of that edge was the second call itself.
   *   - cancel / no-show / reschedule all hard-require `status === confirmed`.
   *   - `confirm()` no-ops for anything that isn't `pending_payment`.
   *   - BookingReaperService only scans `pending_payment`.
   * So a crash / pod-roll / connection drop between the two commits left the
   * booking unreachable by EVERY api and job: slot blocked forever, the Stripe
   * authorization left open, and — worst — the `rescheduled` cleanup branch
   * above had ALREADY torn down the auth / auto-complete / reminder jobs while
   * RescheduleService's re-arm (which runs after BOTH transitions) never ran.
   *
   * WHY THIS CLOSES THE WINDOW: both conditional UPDATEs and both history rows
   * commit inside ONE transaction, so `rescheduled` is never a COMMITTED state
   * — no crash can be observed with the row parked there. The transaction
   * either commits whole (booking is `confirmed` on its new slot, with both
   * audit rows) or rolls back whole (booking is `confirmed`, untouched). Either
   * outcome is a state every existing api and job can already act on, so there
   * is no longer any instant at which the booking is strandable.
   *
   * Both edges are still validated against ALLOWED_TRANSITIONS (this method
   * grants no new edge — it just refuses to leave the intermediate one
   * durable), both history rows are still written, and the delayed-job cleanup
   * still fires after commit exactly as the `rescheduled` branch did, so
   * RescheduleService's re-arm contract is unchanged.
   */
  async transitionThroughRescheduled(
    bookingId: string,
    actor: BookingActor,
    reason?: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    const from = booking.status;

    // Validate BOTH legs up front against the same table `transition()` uses —
    // this method must never become a back door that grants an edge the state
    // machine doesn't already allow.
    if (!ALLOWED_TRANSITIONS[from]?.has(BookingStatus.rescheduled)) {
      throw new InvalidBookingTransitionError(from, BookingStatus.rescheduled);
    }
    if (!ALLOWED_TRANSITIONS[BookingStatus.rescheduled]?.has(BookingStatus.confirmed)) {
      throw new InvalidBookingTransitionError(BookingStatus.rescheduled, BookingStatus.confirmed);
    }

    const updated = await this.bookingRepo.manager.transaction(async (manager) => {
      const bookingRepoTx = manager.getRepository(Booking);
      const historyRepo = manager.getRepository(BookingStatusHistory);
      const engagementRepo = manager.getRepository(StaffEngagement);
      const engagementService = new EngagementService(engagementRepo, this.cache);

      // Leg 1: confirmed -> rescheduled. Same atomic status-as-guard as
      // transitionGuarded — a concurrent cancel/no-show that already flipped
      // the row loses us the UPDATE and we throw, rolling everything back.
      const toRescheduled = await bookingRepoTx.update(
        { id: bookingId, status: from, deleted_at: IsNull() },
        { status: BookingStatus.rescheduled },
      );
      if (toRescheduled.affected !== 1) {
        const current = await bookingRepoTx.findOne({ where: { id: bookingId } });
        throw new InvalidBookingTransitionError(current?.status ?? from, BookingStatus.rescheduled);
      }
      await historyRepo.save(
        historyRepo.create({
          booking_id: bookingId,
          from_status: from,
          to_status: BookingStatus.rescheduled,
          actor_id: actor.id,
          actor_role: actor.role,
          reason: reason ?? null,
        }),
      );

      // Leg 2: rescheduled -> confirmed, in the SAME transaction. Nothing
      // outside this transaction can have observed the intermediate state, so
      // this UPDATE can only fail on a genuine infrastructure error — which
      // rolls leg 1 back with it.
      const toConfirmed = await bookingRepoTx.update(
        { id: bookingId, status: BookingStatus.rescheduled, deleted_at: IsNull() },
        { status: BookingStatus.confirmed },
      );
      if (toConfirmed.affected !== 1) {
        const current = await bookingRepoTx.findOne({ where: { id: bookingId } });
        throw new InvalidBookingTransitionError(
          current?.status ?? BookingStatus.rescheduled,
          BookingStatus.confirmed,
        );
      }
      await historyRepo.save(
        historyRepo.create({
          booking_id: bookingId,
          from_status: BookingStatus.rescheduled,
          to_status: BookingStatus.confirmed,
          actor_id: actor.id,
          actor_role: actor.role,
          reason: reason ?? null,
        }),
      );

      // Same engagement sync the `to === confirmed` branch of transitionGuarded
      // performs (idempotent — RescheduleService's own engagement move already
      // committed before this runs).
      await engagementService.confirm(booking.engagement_id);

      return (await bookingRepoTx.findOne({ where: { id: bookingId } })) as Booking;
    });

    // Post-commit delayed-job cleanup — identical to what the `rescheduled`
    // leg of transitionGuarded fired, and for the same reason: every job left
    // over is keyed to the OLD slot. RescheduleService re-arms all three
    // against the NEW slot immediately after this returns (unchanged
    // contract). Deliberately outside the transaction (Redis round-trips have
    // no business holding a DB lock open).
    this.fireDelayedJobCleanup(bookingId);

    return updated;
  }

  // Shared best-effort teardown of the three per-booking delayed jobs. Used by
  // transitionGuarded's cancelled/expired/rescheduled branch and by
  // transitionThroughRescheduled, so the two can't drift on what a slot-moving
  // or terminal transition tears down.
  private fireDelayedJobCleanup(bookingId: string): void {
    if (this.bookingAuthHook) {
      this.bookingAuthHook.removeBookingAuthJob(bookingId).catch((err) => {
        console.error(`[booking-status] removeBookingAuthJob failed for booking ${bookingId}`, err);
      });
    }
    if (this.autoCompleteHook) {
      this.autoCompleteHook.removeAutoCompleteJob(bookingId).catch((err) => {
        console.error(
          `[booking-status] removeAutoCompleteJob failed for booking ${bookingId}`,
          err,
        );
      });
    }
    if (this.reminderHook) {
      this.reminderHook.removeReminderJobs(bookingId).catch((err) => {
        console.error(`[booking-status] removeReminderJobs failed for booking ${bookingId}`, err);
      });
    }
  }

  /**
   * The webhook-success entry point (prepay=SetupIntent succeeded,
   * deposit=captured — Task 3 calls this). Transitions
   * `pending_payment -> confirmed` with `actor = system`, then fires the
   * seams below. Idempotent: Stripe webhooks retry under at-least-once
   * delivery, so a booking that's already `confirmed` is a safe no-op rather
   * than an `InvalidBookingTransitionError` throw.
   *
   * FINAL REVIEW FIX: widened from "no-op only when already confirmed" to
   * "no-op for ANY status other than pending_payment". Two cross-task races
   * land a late Stripe `payment_intent.succeeded` / `setup_intent.succeeded`
   * here (carrying `metadata.booking_id`) after the booking has already
   * moved on to a DIFFERENT non-confirmed status:
   *   - Task 9 completion: capturing the prepay authorization PI flips that
   *     PI to `succeeded` -> Stripe fires `payment_intent.succeeded` ->
   *     order-service's webhook routes it here -> but the booking is
   *     ALREADY `completed` (completion transitions to `completed` BEFORE
   *     the capture happens). This fires on EVERY prepay completion — the
   *     mainline path, not an edge case.
   *   - Reaper-vs-late-webhook race: the reaper expires (or a future
   *     Phase 5 cancel-with-refund cancels) a `pending_payment` booking,
   *     and its late setup_intent/payment_intent then succeeds anyway ->
   *     confirm() sees `expired`/`cancelled`.
   * Previously only `status === confirmed` short-circuited; every OTHER
   * non-pending_payment status fell through to
   * `transitionGuarded(..., confirmed, ...)`, and terminal statuses have no
   * outgoing edge in `ALLOWED_TRANSITIONS` -> `InvalidBookingTransitionError`
   * (422) -> the webhook handler marked the event `failed` and Stripe
   * retried FOREVER. This guard now treats anything other than
   * `pending_payment` as a safe, non-throwing no-op — it does NOT re-run the
   * transition, re-write history, or re-fire the confirm seams
   * (scheduleBookingAuthJob / enqueuePostConfirmHooks).
   */
  async confirm(bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    if (booking.status !== BookingStatus.pending_payment) {
      if (booking.status !== BookingStatus.confirmed) {
        // Not the common "duplicate confirm webhook" case (already
        // confirmed) — this is a stale/irrelevant payment event arriving
        // for a booking that has since moved to a terminal (or rescheduled)
        // status. Useful operational signal, not an error: log and no-op.
        console.info(
          `[booking-status] confirm(): booking ${bookingId} is '${booking.status}' (not pending_payment) — stale/irrelevant payment event, safe no-op`,
        );
      }
      return booking;
    }

    // `noopIfAlreadyTarget: true` is what makes this correct under TRUE
    // concurrency, not just this pre-tx check above: two simultaneous
    // confirm() calls can both pass this early check (both read
    // pending_payment), but only one wins the guarded UPDATE inside
    // transitionGuarded — the other gets `wroteHistory: false` back instead
    // of a thrown InvalidBookingTransitionError.
    const { booking: confirmed, wroteHistory } = await this.transitionGuarded(
      bookingId,
      BookingStatus.confirmed,
      { id: null, role: "system" },
      undefined,
      { noopIfAlreadyTarget: true },
    );

    if (!wroteHistory) {
      // Lost the race to another concurrent confirm() (e.g. duplicate Stripe
      // webhook delivery) — that caller already fired the seams below.
      // Firing them again here would double-schedule the booking-auth job
      // and double-enqueue post-confirm hooks.
      return confirmed;
    }

    if (confirmed.payment_mode === ServicePaymentMode.prepay) {
      await this.scheduleBookingAuthJob(confirmed);
    }
    await this.postConfirm(confirmed);

    return confirmed;
  }

  /**
   * The pay_at_venue immediate-confirm entry point (Phase 5 final review Fix 1).
   * pay_at_venue bookings are confirmed synchronously at create time — there's
   * no payment webhook to drive confirm() — so BookingService.create routes them
   * here instead. Mirrors confirm()'s guarded shape exactly: the
   * pending_payment->confirmed change is the same CONDITIONAL UPDATE
   * (noopIfAlreadyTarget), and postConfirm fires ONLY on the WINNING transition
   * (`wroteHistory`), so a duplicate/losing call never double-schedules the
   * auto-complete/reminder jobs or double-emits the confirm notifications.
   *
   * FINAL REVIEW FIX 1: before this, BookingService held its OWN bare
   * BookingStatusService (no hooks) and called `transition()` — which never
   * fires enqueuePostConfirmHooks/emitConfirmNotifications — so pay_at_venue
   * bookings got NO auto-complete job (never completed -> zombie, commission
   * never accrued, review 403 forever), NO reminders, and NO
   * booking_confirmed/vendor_new_booking. Routing pay_at_venue through this
   * method on the container's fully-wired instance closes that gap and keeps the
   * two confirm paths from drifting (both now funnel post-confirm work through
   * `postConfirm`). Unlike confirm(), pay_at_venue is never prepay, so there's no
   * scheduleBookingAuthJob leg here.
   */
  async confirmPayAtVenue(
    bookingId: string,
    actor: BookingActor,
    reason = "pay_at_venue auto-confirm",
  ): Promise<Booking> {
    const { booking, wroteHistory } = await this.transitionGuarded(
      bookingId,
      BookingStatus.confirmed,
      actor,
      reason,
      { noopIfAlreadyTarget: true },
    );

    if (wroteHistory) {
      await this.postConfirm(booking);
    }

    return booking;
  }

  /**
   * The shared post-confirm side-effect surface (Phase 5 final review Fix 1):
   * schedules the auto-complete + reminder jobs (enqueuePostConfirmHooks) and
   * emits the booking_confirmed/vendor_new_booking notifications
   * (emitConfirmNotifications). Called by BOTH confirm() (deposit/prepay webhook
   * path) and confirmPayAtVenue() (pay_at_venue immediate path) so the two
   * confirm paths can't diverge on what a freshly-confirmed booking gets. MUST
   * be called only on a WINNING transition — both callers gate it on
   * `wroteHistory` so a lost-race/duplicate confirm never re-fires these.
   */
  async postConfirm(booking: Booking): Promise<void> {
    await this.enqueuePostConfirmHooks(booking);
    await this.emitConfirmNotifications(booking);
  }

  // Phase 5 Task 8: `booking_confirmed` (customer) + `vendor_new_booking`
  // (vendor owner) — fired once, only on an ACTUAL confirm transition
  // (`wroteHistory` gates the caller above, mirroring enqueuePostConfirmHooks'
  // own placement so a lost-race duplicate confirm() call never double-fires
  // these either). Emission only (mirrors cancel/no-show/reschedule's own
  // emitNotifications) — never thrown into confirm()'s caller; a notify
  // failure must not fail the webhook confirm call.
  private async emitConfirmNotifications(booking: Booking): Promise<void> {
    if (!this.notificationQueue) return;

    const variables = {
      bookingId: booking.id,
      service_name: booking.service_name,
      booking_number: booking.booking_number,
      starts_at: new Date(booking.starts_at).toISOString(),
      ends_at: new Date(booking.ends_at).toISOString(),
    };
    const data = {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      vendorId: booking.vendor_id,
      startsAt: new Date(booking.starts_at).toISOString(),
      endsAt: new Date(booking.ends_at).toISOString(),
      serviceName: booking.service_name,
      paymentMode: booking.payment_mode,
    };

    try {
      await this.notificationQueue.add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_confirmed,
        variables,
        data,
      });
    } catch (err) {
      console.warn(
        `[booking-status] failed to emit customer booking_confirmed for ${booking.id}`,
        err,
      );
    }

    if (!this.vendorOwnerLookup) return;
    try {
      const vendorUserId = await this.vendorOwnerLookup.findOwnerUserId(booking.vendor_id);
      if (!vendorUserId) return;
      await this.notificationQueue.add("notification-event", {
        userId: vendorUserId,
        notificationType: NotificationType.vendor_new_booking,
        variables,
        data: { ...data, customerUserId: booking.customer_user_id },
      });
    } catch (err) {
      console.warn(
        `[booking-status] failed to emit vendor vendor_new_booking for ${booking.id}`,
        err,
      );
    }
  }

  /**
   * The completed-transition entry point (Phase 4 Task 9; spec §5.3 "On
   * completed — capture ... commission ... accrued"). Today the only caller
   * is admin-marking (no dedicated HTTP route yet — Phase 5 builds that
   * surface); Phase 5's auto-complete job will call this SAME method later,
   * per the Task 9 brief.
   *
   * Deliberately a dedicated wrapper (mirrors `confirm()`'s relationship to
   * `transitionGuarded`) rather than callers using the generic `transition()`
   * directly, for one reason `confirm()` doesn't need to solve: `completed`
   * has NO outgoing edges and no self-loop in ALLOWED_TRANSITIONS, so a raw
   * `transition(id, completed, ...)` call against an already-`completed`
   * booking throws `InvalidBookingTransitionError` — there is no way for a
   * caller to retry a failed capture/accrual through that path. This method
   * IS that retry path: completing an already-completed booking re-fires the
   * completion hook (capture + commission accrual) instead of throwing,
   * which is safe because BookingPaymentClient.complete's order-service
   * endpoint is idempotent (skips the Stripe capture if already captured,
   * skips the commission insert if a row already exists for this
   * booking_id) — satisfying the Task 9 brief's "completing an
   * already-completed booking (or a retried call) must NOT double-capture
   * or double-accrue".
   *
   * Unlike `scheduleBookingAuthJob` (caught, never rethrown — a downstream
   * concern with its own failure path), a `completionHook` failure IS
   * rethrown here: the state transition has already durably committed
   * (the booking is `completed` in the DB either way), so rethrowing only
   * signals "the money side didn't finish, call completeBooking() again"
   * to whatever caller is driving completion (admin route / Phase 5
   * auto-complete job) — it does not undo the transition.
   */
  async completeBooking(bookingId: string, actor: BookingActor, reason?: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    if (booking.status === BookingStatus.completed) {
      // Already `completed` before we even opened a transition — a retry (the
      // auto-complete job re-running after a mid-flight capture failure) or a
      // manual re-complete. Re-fire the capture/accrual hook (idempotent), but
      // NOT as a first completion: the notifications already went out on the
      // original winning transition (Phase 5 final review Fix 3).
      await this.fireCompletionHook(booking, false);
      return booking;
    }

    // noopIfAlreadyTarget: true — two concurrent completeBooking() calls
    // (e.g. an admin click racing Phase 5's auto-complete job) can both pass
    // the pre-tx `from` check; only one wins the guarded UPDATE. The loser
    // gets the current (already-completed) row back instead of a thrown
    // InvalidBookingTransitionError — and BOTH branches fire the completion
    // hook below (unlike confirm()'s booking-auth scheduling, which is NOT
    // safe to re-fire, capture-and-accrue IS idempotent server-side, so
    // there's no harm re-invoking it if the winner's own hook call is still
    // in flight or previously failed).
    const { booking: completed, wroteHistory } = await this.transitionGuarded(
      bookingId,
      BookingStatus.completed,
      actor,
      reason,
      { noopIfAlreadyTarget: true },
    );

    // `wroteHistory` gates first-vs-retry: the WINNING transition emits the
    // completion notifications; a concurrent-completion race LOSER (wroteHistory
    // false, row already completed) re-fires only the idempotent capture/accrual
    // — no duplicate notifications (Phase 5 final review Fix 3).
    await this.fireCompletionHook(completed, wroteHistory);

    return completed;
  }

  private async fireCompletionHook(booking: Booking, firstCompletion: boolean): Promise<void> {
    if (!this.completionHook) {
      console.log(
        `[booking-status] no completionHook wired — skipping capture/accrual for booking ${booking.id}`,
      );
      return;
    }
    await this.completionHook.onCompleted(booking, { firstCompletion });
  }

  /**
   * The webhook-failure entry point (Task 3 — `setup_intent`/`payment_intent`
   * failed or was canceled with `metadata.booking_id`; also the landing spot
   * for Task 7b's off-session re-auth failure outcome per the Task 3 brief).
   * Deliberately THIN here: it does NOT transition the booking itself. For a
   * booking still `pending_payment` (the initial setup/deposit attempt
   * failed), the Task 7 reaper will expire it on its normal timeout rather
   * than this racing that decision — unchanged from Task 3.
   *
   * For an already-`confirmed` prepay booking, this IS the off-session
   * re-auth failure outcome (spec §5.2 "Auth failure") arriving via the
   * webhook (`payment_intent.payment_failed`/`.canceled` ->
   * order-service -> here) — the async counterpart of
   * `BookingAuthService.authorizeNow`'s own sync failure handling. Both
   * routes through the SAME `bookingAuthHook.handleAsyncAuthFailure` /
   * `authorizeNow`'s private `handleAuthFailure`, so notify + schedule the
   * T-(cancellation_window) follow-up auto-cancel only ever happens once
   * per failure, never duplicated between the sync and async paths.
   */
  async handlePaymentFailed(bookingId: string, reason?: string | null): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    if (
      booking.status === BookingStatus.confirmed &&
      booking.payment_mode === ServicePaymentMode.prepay
    ) {
      if (this.bookingAuthHook) {
        try {
          await this.bookingAuthHook.handleAsyncAuthFailure(
            booking,
            reason ?? "Off-session authorization failed",
          );
        } catch (err) {
          console.error(
            `[booking-status] handlePaymentFailed: bookingAuthHook.handleAsyncAuthFailure failed for booking ${bookingId}`,
            err,
          );
        }
      } else {
        console.log(
          `[booking-status] payment failure for confirmed prepay booking ${bookingId} but no bookingAuthHook wired — cannot notify/schedule follow-up cancel`,
        );
      }
    } else {
      console.log(
        `[booking-status] payment failure for booking ${bookingId} (status=${booking.status}, ` +
          `payment_mode=${booking.payment_mode}, reason=${reason ?? "unknown"}) — no action, the reaper will expire it if still pending`,
      );
    }

    return booking;
  }

  // Task 7b (spec §5.2 prepay late-auth timing): on confirm of a PREPAY
  // booking, schedule the delayed `booking-auth` BullMQ job (job id
  // `auth:{bookingId}`) to fire at `starts_at - (cancellation_window_hours +
  // 24h)`, clamped to stay within Stripe's ~7-day auth validity of the
  // capture point (or authorize inline if that moment has already passed —
  // booked inside the window). Delegates to BookingAuthService via the
  // `bookingAuthHook` seam (container.ts wires the real one); a plain
  // console.log no-op when nothing is wired keeps this class usable in
  // isolation (e.g. BookingService's own internal pay_at_venue-only
  // instance, which never reaches this method in practice, and existing
  // tests that stub this method directly). Failures are caught here (not
  // rethrown) — confirm() has already durably confirmed the booking by the
  // time this runs, and an auth-scheduling failure is a downstream payment
  // concern with its own failure path, not a reason to fail the webhook
  // confirm call.
  async scheduleBookingAuthJob(booking: Booking): Promise<void> {
    if (!this.bookingAuthHook) {
      console.log(
        `[booking-status] no bookingAuthHook wired — skipping booking-auth scheduling for booking ${booking.id}`,
      );
      return;
    }
    try {
      await this.bookingAuthHook.scheduleForConfirm(booking);
    } catch (err) {
      console.error(
        `[booking-status] scheduleBookingAuthJob failed for booking ${booking.id}`,
        err,
      );
    }
  }

  // Seam for Phase 5 (reminders, auto-complete scheduling, notifications).
  // Task 5b fills in auto-complete scheduling here — fired for EVERY
  // confirmed booking regardless of payment_mode (spec §5.3 "Auto-complete"
  // closes the review-veto for ALL bookings, not just prepay ones: a vendor
  // can't block a review, or commission accrual, by never marking
  // completion). Task 6 fills in reminder scheduling (T-24h/T-1h). The
  // confirm-time notifications themselves are NOT here — they live in
  // emitConfirmNotifications(), and postConfirm() is the single entry point
  // that fires both, so callers can't get one without the other.
  // Deliberately awaited by confirm()
  // but never rethrown here (mirrors scheduleBookingAuthJob) — both are
  // downstream concerns with their own failure paths, not a reason to fail
  // the webhook confirm call.
  async enqueuePostConfirmHooks(booking: Booking): Promise<void> {
    await this.fireAutoCompleteHook(booking);
    await this.fireReminderHook(booking);
  }

  private async fireAutoCompleteHook(booking: Booking): Promise<void> {
    if (!this.autoCompleteHook) {
      console.log(
        `[booking-status] no autoCompleteHook wired — skipping auto-complete scheduling for booking ${booking.id}`,
      );
      return;
    }
    try {
      await this.autoCompleteHook.scheduleForConfirm(booking);
    } catch (err) {
      console.error(`[booking-status] fireAutoCompleteHook failed for booking ${booking.id}`, err);
    }
  }

  private async fireReminderHook(booking: Booking): Promise<void> {
    if (!this.reminderHook) {
      console.log(
        `[booking-status] no reminderHook wired — skipping reminder scheduling for booking ${booking.id}`,
      );
      return;
    }
    try {
      await this.reminderHook.scheduleForConfirm(booking);
    } catch (err) {
      console.error(`[booking-status] fireReminderHook failed for booking ${booking.id}`, err);
    }
  }
}
