// booking-auth.service.ts
//
// Phase 4 Task 7b (spec §5.2 "Prepay auth timing") — the prepay off-session
// re-authorization job. Prepay bookings confirm with NO money held (a
// SetupIntent just verifies + saves the card, Task 5). This service is what
// actually creates the off-session manual-capture PaymentIntent, timed so it
// can never expire before `completed` captures it (Stripe card
// authorizations are valid ~7 days).
//
// Money boundary (spec §3): this NEVER talks to Stripe directly — it calls
// `BookingPaymentClient.authorize()`, which is a thin HTTP wrapper around
// order-service's `/internal/booking-payments/authorize` route (Task 2). The
// one piece of Stripe-shaped data booking-service DOES read directly is the
// `payments` row itself (`stripe_customer_id`/`payment_method_id` inside
// `gateway_response`) — booking-service and order-service already share one
// Postgres instance and booking-reaper.service.ts already reads
// `payments.gateway_payment_id` the same way to resolve a deposit's PI id.
// That is a read of already-stored, non-money data, not a write and not a
// Stripe call.
import { config } from "@materialhub/config";
import type { Booking } from "@materialhub/database";
import { BookingStatus, NotificationType, ServicePaymentMode } from "@materialhub/database";
import type {
  BookingPaymentAuthorizeInput,
  BookingPaymentAuthorizeResult,
  BookingPaymentVoidInput,
  BookingPaymentVoidResult,
} from "./booking-payment.client.ts";

// ─── Fire-time math (pure — no Date.now() here; the caller stamps "now" at
// the edge when it schedules, per the Phase 4 plan's Self-Review checklist) ──

const HOUR_MS = 3_600_000;

// Stripe's documented off-session card-authorization validity ceiling
// (spec preamble: "Stripe card auths expire after ~7 days").
export const STRIPE_AUTH_VALIDITY_HOURS = 7 * 24; // 168h

// Stay this far inside that ceiling: GENUINE slack beyond the true capture
// deadline (see AUTO_COMPLETE_DELAY_HOURS below) — buffer against, e.g., the
// capture job itself running a little late.
export const AUTH_SAFETY_MARGIN_HOURS = 24;

// spec §5.3 "Auto-complete": a delayed job transitions a still-`confirmed`
// booking to `completed` at `ends_at + 24h` (NOT at `ends_at` itself) — that
// auto-complete moment, not `ends_at`, is what actually triggers capture
// (spec §5.2 step 3: "On `completed` — capture ..."). Any clamp math that
// forgets this +24h tail understates the true auth-fire -> capture span by
// 24h, silently eating the entire AUTH_SAFETY_MARGIN_HOURS margin above.
//
// COUPLING (must stay aligned): this hardcoded 24h MUST equal the DEPLOYED
// auto-complete grace. That grace is config-driven and env-OVERRIDABLE via
// BOOKING_AUTOCOMPLETE_GRACE_HOURS (config.bookings.autoCompleteGraceHours,
// default 24h — see booking-autocomplete.service.ts's
// DEFAULT_AUTO_COMPLETE_GRACE_HOURS). If an operator raises that env grace
// without also bumping this constant, the clamp here assumes capture happens
// EARLIER than it really does, eating into AUTH_SAFETY_MARGIN_HOURS — so the
// two are deliberately NOT wired to read each other (per the Phase 5 brief);
// changing one requires consciously changing the other.
export const AUTO_COMPLETE_DELAY_HOURS = 24;

/**
 * PHASE 7 REVIEW FIX #9 — enforce the coupling documented above instead of
 * merely commenting it.
 *
 * `AUTO_COMPLETE_DELAY_HOURS` is hardcoded here, but the grace it MUST equal
 * is env-overridable (`BOOKING_AUTOCOMPLETE_GRACE_HOURS` ->
 * `config.bookings.autoCompleteGraceHours`). An operator raising that env
 * without touching this constant silently makes every clamp in this file
 * assume capture happens EARLIER than it really does — quietly eating the
 * whole AUTH_SAFETY_MARGIN_HOURS (24h) cushion and letting Stripe
 * authorizations expire before auto-complete ever captures them. That is a
 * silent money loss discoverable only after the fact.
 *
 * Fail CLOSED at boot instead: booking-service is the only importer of this
 * module, so the blast radius of the throw is exactly the service that would
 * otherwise mint uncapturable authorizations. Exported (and called at module
 * scope below) so it is unit-testable without touching process.env.
 */
export function assertAutoCompleteGraceAligned(configuredGraceHours: number): void {
  if (configuredGraceHours !== AUTO_COMPLETE_DELAY_HOURS) {
    throw new Error(
      `[booking-auth] BOOKING_AUTOCOMPLETE_GRACE_HOURS is ${configuredGraceHours}h but booking-auth.service.ts's AUTO_COMPLETE_DELAY_HOURS is ${AUTO_COMPLETE_DELAY_HOURS}h. These MUST be equal: the auth fire-time clamp derives the capture deadline from AUTO_COMPLETE_DELAY_HOURS, so a larger deployed grace means authorizations are minted assuming an earlier capture than actually happens, consuming AUTH_SAFETY_MARGIN_HOURS and risking auths that expire at Stripe before capture. Update the constant to match the env (or unset the env) before starting booking-service.`,
    );
  }
}

assertAutoCompleteGraceAligned(config.bookings.autoCompleteGraceHours);

// The hard cap on the auth-fire -> TRUE-capture-deadline span this service
// will ever schedule for: 168h - 24h = 144h (6 days). Capture deadline here
// means `starts_at + duration + AUTO_COMPLETE_DELAY_HOURS` (see
// computeAuthFireTime) — the actual moment `completed` captures the auth, not
// `ends_at`. Holding the fire->true-deadline span to <=144h guarantees a
// genuine AUTH_SAFETY_MARGIN_HOURS (24h) of headroom remains before Stripe's
// ~7-day (168h) raw authorization ceiling, no matter how generous a vendor's
// `cancellation_window_hours` or how long `duration_minutes` is.
export const MAX_AUTH_TO_CAPTURE_HOURS = STRIPE_AUTH_VALIDITY_HOURS - AUTH_SAFETY_MARGIN_HOURS;

// Minimum grace given to a customer between an authorize FAILURE (sync or
// async) and the follow-up auto-cancel, even if the booking's own
// cancellation-window deadline has already passed by the time the failure is
// handled (e.g. an inline authorize attempted right at booking time, deep
// inside the window).
export const FOLLOW_UP_MIN_GRACE_HOURS = 1;

export interface AuthFireTimeInput {
  starts_at: Date;
  duration_minutes: number;
  cancellation_window_hours: number;
}

/**
 * spec §5.2 step 2 fire-time formula:
 *
 *     fireAt = starts_at - (cancellation_window_hours + 24h)
 *
 * ...clamped so the auth-to-capture span (fireAt -> the TRUE capture
 * deadline) never exceeds MAX_AUTH_TO_CAPTURE_HOURS (144h). The true capture
 * deadline is NOT `starts_at + duration` (`ends_at`) — spec §5.3
 * "Auto-complete" fires at `ends_at + AUTO_COMPLETE_DELAY_HOURS` (24h), and
 * THAT auto-complete transition to `completed` is what actually triggers
 * capture (spec §5.2 step 3). So:
 *
 *     captureDeadline    = starts_at + duration_minutes + AUTO_COMPLETE_DELAY_HOURS
 *     earliestSafeFireAt = captureDeadline - MAX_AUTH_TO_CAPTURE_HOURS   (144h)
 *     fireAt             = max(naiveFireAt, earliestSafeFireAt)
 *
 * Net: (fireAt -> captureDeadline) <= 144h always, which leaves
 * AUTH_SAFETY_MARGIN_HOURS (24h) of genuine headroom before Stripe's ~7-day
 * (168h) raw authorization ceiling — even for a booking whose naive fire time
 * would otherwise land right at (or past) that ceiling. A vendor policy with
 * an unusually long `cancellation_window_hours` (e.g. a multi-week
 * cancellation window), or an unusually long `duration_minutes`, would
 * otherwise push the naive fire time (or the true capture deadline) close
 * enough to Stripe's ~7-day validity that a Stripe auth minted that early
 * could expire before `completed` ever tries to capture it. Rather than
 * reject the booking (self-review explicitly allows "assert OR clamp";
 * throwing here would break booking confirm entirely for a merely-generous
 * vendor policy), this pulls the fire time LATER — closer to `starts_at` —
 * just far enough to land back inside the safe window. This is a pure
 * function of the booking's own snapshotted fields; the caller passes `now`
 * in separately only to decide inline-vs-scheduled (see
 * `BookingAuthService.scheduleForConfirm`).
 */
export function computeAuthFireTime(booking: AuthFireTimeInput): Date {
  const leadHours = booking.cancellation_window_hours + 24;
  const naiveFireAt = new Date(booking.starts_at.getTime() - leadHours * HOUR_MS);

  // The TRUE capture deadline (spec §5.3): auto-complete (and therefore
  // capture) happens at `ends_at + 24h`, not at `ends_at` itself.
  const captureDeadline = new Date(
    booking.starts_at.getTime() +
      booking.duration_minutes * 60_000 +
      AUTO_COMPLETE_DELAY_HOURS * HOUR_MS,
  );
  const earliestSafeFireAt = new Date(
    captureDeadline.getTime() - MAX_AUTH_TO_CAPTURE_HOURS * HOUR_MS,
  );

  return naiveFireAt.getTime() < earliestSafeFireAt.getTime() ? earliestSafeFireAt : naiveFireAt;
}

/**
 * The follow-up auto-cancel check (spec §5.2 "Auth failure"): fires at
 * `starts_at - cancellation_window_hours` (exactly the auth fire time's own
 * +24h anchor offset later) UNLESS that policy deadline has already passed
 * (or is too close) by the time a failure is actually being handled — in
 * which case it's pulled forward to `now + FOLLOW_UP_MIN_GRACE_HOURS` so the
 * customer always gets at least a short grace window to retry with a new
 * card before the slot is auto-released, and the follow-up job can never be
 * scheduled in the past.
 */
export function computeFollowUpFireTime(booking: AuthFireTimeInput, now: Date): Date {
  const policyFireAt = new Date(
    booking.starts_at.getTime() - booking.cancellation_window_hours * HOUR_MS,
  );
  const minFireAt = new Date(now.getTime() + FOLLOW_UP_MIN_GRACE_HOURS * HOUR_MS);
  return policyFireAt.getTime() > minFireAt.getTime() ? policyFireAt : minFireAt;
}

/**
 * The TRUE capture deadline for a booking (spec §5.3 "Auto-complete"): the
 * moment `completed` actually captures the prepay authorization —
 * `ends_at + AUTO_COMPLETE_DELAY_HOURS` — NOT `ends_at` itself. Same formula
 * computeAuthFireTime derives internally from starts_at + duration; exposed
 * here for the reschedule carry-over check (rescheduleBookingAuthJob), which
 * has the (new) ends_at at hand directly.
 */
export function computeCaptureDeadline(booking: { ends_at: Date | string }): Date {
  return new Date(new Date(booking.ends_at).getTime() + AUTO_COMPLETE_DELAY_HOURS * HOUR_MS);
}

/**
 * Whether an authorization minted at `authCreatedAt` can still safely cover a
 * capture at `captureDeadline` — i.e. the mint->capture span stays within
 * MAX_AUTH_TO_CAPTURE_HOURS (144h), preserving the same
 * AUTH_SAFETY_MARGIN_HOURS (24h) of headroom inside Stripe's ~7-day (168h)
 * raw validity that computeAuthFireTime's own clamp guarantees for freshly
 * scheduled auths. Used by rescheduleBookingAuthJob: a reschedule that pushes
 * the capture deadline past this bound must void + re-authorize rather than
 * carry the (would-expire) auth over.
 */
export function authSupportsCaptureDeadline(authCreatedAt: Date, captureDeadline: Date): boolean {
  return captureDeadline.getTime() <= authCreatedAt.getTime() + MAX_AUTH_TO_CAPTURE_HOURS * HOUR_MS;
}

// ─── DI seams (narrow interfaces so this file never imports the concrete
// BookingStatusService/BookingPaymentClient/TypeORM Repository classes —
// booking-status.service.ts injects itself as a StatusTransitioner and vice
// versa via BookingAuthHook, avoiding a circular module import between the
// two files) ─────────────────────────────────────────────────────────────

export interface StatusTransitioner {
  transition(
    bookingId: string,
    to: BookingStatus,
    actor: { id: string | null; role: "system" },
    reason?: string,
  ): Promise<Booking>;
}

export interface AuthPaymentClient {
  authorize(input: BookingPaymentAuthorizeInput): Promise<BookingPaymentAuthorizeResult>;
  // Task 3 (reschedule): voids a stale authorization whose validity a
  // far-future reschedule has outrun, before re-entering the standard auth
  // scheduling path. The real BookingPaymentClient.void already has this
  // exact shape (order-service /internal/booking-payments/void).
  void(input: BookingPaymentVoidInput): Promise<BookingPaymentVoidResult>;
}

export interface BookingAuthQueueLike {
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
  // Used only to dedupe the payment-failure notify (see handleAuthFailure) —
  // truthy/falsy existence check, not queue introspection. The real BullMQ
  // `Queue.getJob` already has this exact shape.
  getJob(jobId: string): Promise<unknown>;
}

// Phase 5 Task 8's seam for the `booking_payment_failed` notification (mirrors
// cancel.service.ts's/no-show.service.ts's own per-file NotificationEventQueueLike
// — same shared "notification-events" BullMQ queue, just a narrow interface so
// this file never imports the concrete Queue class). Optional: a missing queue
// just means notifyPaymentFailed logs and no-ops (mirrors every other optional
// DI seam on this branch).
export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}

export interface BookingRepoLike {
  findOne(opts: { where: { id: string } }): Promise<Booking | null>;
  // Narrowed to the one field this service ever writes (rather than
  // `Partial<Booking>`) — TypeORM's real `Repository.update` partialEntity
  // parameter is a `QueryDeepPartialEntity<Booking>`, which is NOT assignable
  // from a plain `Partial<Booking>` for jsonb-typed columns like
  // `customer_address` (their deep-partial shape differs), so a wider
  // `Partial<Booking>` here would make the real `Repository<Booking>` fail
  // to structurally satisfy this interface at the container.ts call site.
  // `null` because rescheduleBookingAuthJob clears a stale (voided) hold ref.
  //
  // Phase 5 final review Fix 4: the criteria widened to carry an optional
  // `status` so authorizeNow's post-authorize escrow_hold_id write can be a
  // GUARDED conditional update (`WHERE id = :id AND status = 'confirmed'`) —
  // it must not stamp a fresh authorization onto a booking a cancel/no-show
  // flipped to a terminal state during the Stripe round-trip. The return type
  // exposes `affected` (TypeORM's UpdateResult satisfies it structurally) so
  // that method can detect the raced-away 0-row case and void the just-minted
  // PI. rescheduleBookingAuthJob's own `{ id }`-only clear still satisfies this
  // (status optional) and ignores the returned affected count.
  update(
    criteria: { id: string; status?: BookingStatus },
    partial: { escrow_hold_id: string | null },
  ): Promise<{ affected?: number | null }>;
}

export interface PaymentRepoLike {
  findOne(opts: { where: { id: string } }): Promise<{
    gateway_response: Record<string, unknown> | null;
    // Set on authorization Payment rows (the PI id the reaper/completion also
    // read); optional in the seam so existing fakes/rows without it still fit.
    gateway_payment_id?: string | null;
    // Auth mint time — drives the reschedule carry-over validity check.
    created_at?: Date;
  } | null>;
}

const SYSTEM_ACTOR = { id: null, role: "system" as const };

// jobId naming: conceptually "auth:{bookingId}" / "auth-followup:{bookingId}"
// per the Task 7b brief and spec §5.2 (mirroring the Phase 5 reminder job-id
// pattern), but the INSTALLED bullmq version (5.79.x) rejects a custom jobId
// containing a colon unless splitting on `:` yields exactly 3 parts (its
// job-scheduler repeatable-job convention — see
// node_modules/bullmq/dist/cjs/classes/job.js's validateOptions: "Custom Id
// cannot contain :"), which a plain `auth:{uuid}` (2 parts) trips. Using `_`
// as the separator instead keeps the same semantic prefix/bookingId shape
// while satisfying that constraint.
function authJobId(bookingId: string): string {
  return `auth_${bookingId}`;
}
function followUpJobId(bookingId: string): string {
  return `auth-followup_${bookingId}`;
}

/**
 * The prepay off-session-auth job body (Task 7b). Two entry points wire into
 * this from BookingStatusService (via the BookingAuthHook interface it
 * defines):
 *
 *   - `scheduleForConfirm` — called once, from `confirm()`, only for prepay
 *     bookings. Computes the fire time and either enqueues the delayed
 *     `auth:{bookingId}` job or (booking created inside the window)
 *     authorizes inline right there.
 *   - `handleAsyncAuthFailure` — called from `handlePaymentFailed()` when the
 *     webhook-routed `payment_intent.payment_failed`/`.canceled` event is for
 *     an already-`confirmed` prepay booking (i.e. the off-session re-auth
 *     itself failed, not the original setup/deposit attempt) — routes
 *     through the exact same notify + follow-up-cancel logic the sync
 *     failure path (`authorizeNow`) uses, so the two failure sources never
 *     diverge.
 *
 * The BullMQ Worker (booking-auth.job.ts) that actually processes the
 * `auth:{id}`/`auth-followup:{id}` jobs delegates straight to
 * `runAuthorizeJob`/`runFollowUpCancelJob` below.
 */
export class BookingAuthService {
  constructor(
    private readonly bookingRepo: BookingRepoLike,
    private readonly paymentRepo: PaymentRepoLike,
    private readonly paymentClient: AuthPaymentClient,
    private readonly statusService: StatusTransitioner,
    private readonly queue: BookingAuthQueueLike,
    // Phase 5 Task 8 — optional (trailing) so every existing positional
    // construction of this class (tests, container.ts pre-Task-8) keeps
    // compiling unchanged; a missing queue just means notifyPaymentFailed
    // logs and no-ops, same posture as this file's other optional seams.
    private readonly notificationQueue?: NotificationEventQueueLike,
    private readonly appBaseUrl?: string,
  ) {}

  async scheduleForConfirm(booking: Booking, now: Date = new Date()): Promise<void> {
    const fireAt = computeAuthFireTime(booking);

    if (fireAt.getTime() <= now.getTime()) {
      // Booked inside the window — spec §5.2: "Bookings created inside that
      // window authorize immediately at creation instead."
      await this.authorizeNow(booking);
      return;
    }

    const delay = fireAt.getTime() - now.getTime();
    await this.queue.add(
      "authorize",
      { bookingId: booking.id },
      { jobId: authJobId(booking.id), delay, removeOnComplete: 500, removeOnFail: 500 },
    );
  }

  /** BullMQ Worker entry point for the delayed `auth:{bookingId}` job. */
  async runAuthorizeJob(bookingId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) {
      console.warn(`[booking-auth] booking ${bookingId} not found — skipping authorize job`);
      return;
    }
    if (booking.status !== BookingStatus.confirmed) {
      // The booking was cancelled/expired/rescheduled before this delayed
      // job fired — removeBookingAuthJob (called from
      // BookingStatusService.transitionGuarded on cancel/expire) SHOULD have
      // already removed this job, but this guard covers the race where the
      // job was already dequeued/running by the time the cancel landed.
      console.log(
        `[booking-auth] booking ${bookingId} is ${booking.status} (not confirmed) — skipping authorize job`,
      );
      return;
    }
    if (booking.escrow_hold_id) {
      console.log(`[booking-auth] booking ${bookingId} already authorized — skipping`);
      return;
    }
    await this.authorizeNow(booking);
  }

  /** BullMQ Worker entry point for the delayed `auth-followup:{bookingId}` job. */
  async runFollowUpCancelJob(bookingId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) return;
    if (booking.escrow_hold_id) {
      console.log(
        `[booking-auth] booking ${bookingId} was authorized before the follow-up deadline — no auto-cancel needed`,
      );
      return;
    }
    if (booking.status !== BookingStatus.confirmed) {
      // Already terminal (cancelled by the customer, expired, etc) — nothing
      // to do.
      return;
    }

    await this.statusService.transition(
      bookingId,
      BookingStatus.cancelled,
      SYSTEM_ACTOR,
      "Prepay off-session authorization was not resolved before the cancellation window — auto-cancelled to free the slot",
    );

    // PHASE 7 REVIEW FIX #7 — tell the customer their slot is gone.
    //
    // THE BUG THIS CLOSES: this path transitions straight through
    // `statusService.transition(..., cancelled, ...)` rather than through
    // CancelService, and BookingStatusService's transition emits NO
    // cancellation notification of its own — so the customer's booking simply
    // vanished, with nothing but the earlier `booking_payment_failed` mail
    // (which promised a chance to pay, not a cancellation) to explain it.
    //
    // Emitted from here rather than by routing through CancelService
    // deliberately: CancelService owns the customer/admin-initiated cancel
    // (window policy, forfeit math, refund/void decisions) and this is a
    // system auto-cancel of a booking on which NOTHING was ever collected —
    // deriveRecoverableAmount is 0 for an unauthorized prepay, so there is no
    // money for CancelService to move and its policy layer has nothing to
    // decide. What was actually missing was only the notification, so that is
    // all this adds. Best-effort/emission-only, matching every other notify on
    // this class: a notification failure must never un-cancel the booking or
    // fail the job.
    this.notifyAutoCancelled(booking);
  }

  /** Fix #7's `booking_cancelled` emission — see runFollowUpCancelJob. */
  private notifyAutoCancelled(booking: Booking): void {
    console.log(
      `[booking-auth] booking_cancelled (auto-cancel after unresolved off-session authorization): booking ${booking.id}, customer ${booking.customer_user_id}`,
    );
    if (!this.notificationQueue) return;
    const reason =
      "Your payment could not be authorized before the cancellation deadline, so this booking was cancelled and the slot released.";
    this.notificationQueue
      .add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_cancelled,
        variables: {
          service_name: booking.service_name,
          booking_number: booking.booking_number,
          starts_at: new Date(booking.starts_at).toISOString(),
          reason,
        },
        data: {
          bookingId: booking.id,
          bookingNumber: booking.booking_number,
          vendorId: booking.vendor_id,
          serviceName: booking.service_name,
          startsAt: new Date(booking.starts_at).toISOString(),
          reason,
          cancelledBy: "system",
        },
      })
      .catch((err) => {
        console.warn(`[booking-auth] failed to emit booking_cancelled for ${booking.id}`, err);
      });
  }

  /** The async webhook-failure entry point (see class docstring). */
  async handleAsyncAuthFailure(booking: Booking, reason: string): Promise<void> {
    await this.handleAuthFailure(booking.id, reason);
  }

  /**
   * Re-time the prepay off-session-auth job for a booking whose slot has
   * changed (Phase 5 Task 3 reschedule). The confirmed->rescheduled
   * transition already removed the stale `auth_{id}`/`auth-followup_{id}`
   * jobs (keyed to the OLD slot) via removeBookingAuthJob; the leading remove
   * here is a defensive no-op on top of that (BullMQ remove is idempotent)
   * and guarantees scheduleForConfirm's `queue.add` isn't silently swallowed
   * by a still-present same-id job. Non-prepay bookings never had an auth job
   * — remove-only.
   *
   * For a prepay booking, three cases (`booking` carries the NEW times):
   *
   *   1. NOT yet authorized (`escrow_hold_id` unset): re-enter the standard
   *      scheduling path at the new timing — delayed job at
   *      `new starts_at - (cancellation_window + 24h)` (clamped), or inline
   *      authorize if that moment has already passed.
   *   2. Already authorized AND the existing auth still covers the NEW
   *      capture deadline (`new ends_at + 24h` within
   *      MAX_AUTH_TO_CAPTURE_HOURS of the auth Payment row's created_at —
   *      the same 144h bound computeAuthFireTime's clamp guarantees, keeping
   *      the 24h safety margin inside Stripe's ~7-day validity): the
   *      authorization carries over unchanged (spec/brief: "payment carries
   *      over — no refund/charge on reschedule"). Nothing to do.
   *   3. Already authorized but the reschedule pushed the capture deadline
   *      BEYOND what the existing auth can support (reachable whenever
   *      reschedule_window_hours < cancellation_window_hours + 24h — the
   *      normal config — lets an already-authorized booking move weeks out):
   *      carrying the auth over would let it silently expire before
   *      auto-complete captures it (vendor performs the service, capture
   *      fails). Instead: void the stale authorization (best-effort — an
   *      unvoided uncaptured PI auto-expires at Stripe in ~7 days, so a
   *      failed void never strands money, it just holds the customer's card
   *      a few extra days), clear `escrow_hold_id` (the ONLY ref Task 9's
   *      capture path reads — BookingCompletionService resolves
   *      escrow_hold_id -> payments.gateway_payment_id, so clearing it
   *      guarantees the voided PI can never be picked up for capture), then
   *      re-enter the standard scheduling path at the new timing. The saved
   *      SetupIntent payment method (booking.payment_id, untouched) makes
   *      the fresh off-session re-auth possible; an inline re-auth failure
   *      flows through authorizeNow's existing handleAuthFailure
   *      (booking_payment_failed notify + follow-up auto-cancel), never
   *      thrown into the reschedule flow.
   *
   *   A missing/created_at-less auth Payment row is treated as case 3
   *   (cannot verify the auth's remaining validity -> conservatively
   *   re-authorize; the void is skipped since there is no PI id to void).
   */
  async rescheduleBookingAuthJob(booking: Booking, now: Date = new Date()): Promise<void> {
    await this.removeBookingAuthJob(booking.id);
    if (booking.payment_mode !== ServicePaymentMode.prepay) return;

    if (!booking.escrow_hold_id) {
      await this.scheduleForConfirm(booking, now);
      return;
    }

    const payment = await this.paymentRepo.findOne({ where: { id: booking.escrow_hold_id } });
    const captureDeadline = computeCaptureDeadline(booking);
    const authCreatedAt = payment?.created_at ? new Date(payment.created_at) : null;

    if (authCreatedAt && authSupportsCaptureDeadline(authCreatedAt, captureDeadline)) {
      // Case 2 — the existing authorization still safely covers the new
      // capture deadline; payment carries over unchanged.
      return;
    }

    // Case 3 — void + re-auth at the new timing.
    const paymentIntentId = payment?.gateway_payment_id ?? null;
    if (paymentIntentId) {
      try {
        await this.paymentClient.void({
          bookingId: booking.id,
          paymentIntentId,
          reason:
            "Rescheduled beyond the existing authorization's validity — re-authorizing at the new timing",
        });
      } catch (err) {
        console.warn(
          `[booking-auth] failed to void stale auth PI ${paymentIntentId} for rescheduled booking ${booking.id} — it will auto-expire at Stripe (~7d)`,
          err,
        );
      }
    } else {
      console.warn(
        `[booking-auth] rescheduled booking ${booking.id} has escrow_hold_id ${booking.escrow_hold_id} but no resolvable auth PI — skipping void, re-authorizing fresh`,
      );
    }

    // Clear the hold ref BEFORE re-scheduling: (a) the capture path
    // (BookingCompletionService) must never resolve the voided PI, and
    // (b) runAuthorizeJob's own "already authorized — skipping" guard reads
    // this field fresh from the DB when the delayed job fires.
    await this.bookingRepo.update({ id: booking.id }, { escrow_hold_id: null });
    booking.escrow_hold_id = null;

    await this.scheduleForConfirm(booking, now);
  }

  /** Removes both jobs for a booking — called defensively from
   * BookingStatusService's cancelled/expired transition path so a terminal
   * booking never leaves a dangling delayed job behind (Phase 5 owns the
   * actual customer/admin cancel ROUTE; this wiring just makes sure whatever
   * calls `transition(..., cancelled|expired, ...)` cleans up after itself).
   * Best-effort per job id — BullMQ throws if a job is currently locked/
   * active (e.g. this exact follow-up job removing itself while it runs), so
   * each removal is isolated and logged rather than allowed to fail the
   * other or the caller's transition. */
  async removeBookingAuthJob(bookingId: string): Promise<void> {
    await Promise.all([
      this.removeJobBestEffort(authJobId(bookingId)),
      this.removeJobBestEffort(followUpJobId(bookingId)),
    ]);
  }

  private async removeJobBestEffort(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch (err) {
      console.warn(`[booking-auth] failed to remove job ${jobId}`, err);
    }
  }

  private async authorizeNow(booking: Booking): Promise<void> {
    // PHASE 7 REVIEW FIX #6 — nothing outstanding means nothing to authorize.
    //
    // THE BUG THIS CLOSES: the amount below used to be
    // `Math.max(price_fils - amount_paid_fils, 1)`. For a free/promotional
    // prepay offering (price_fils 0, or fully pre-paid) that floor minted a
    // real 1-fil off-session hold on the customer's card for a booking that
    // owes nothing. It also DESYNCED this file from
    // `deriveRecoverableAmount` (booking-money.ts), which has no floor and
    // returns 0 — so cancel/no-show resolved `action: "void"` against a hold
    // whose size they had computed as zero.
    //
    // Skipping outright (rather than flooring) is correct: with no outstanding
    // balance there is nothing for `completed` to capture, so there is nothing
    // an authorization could protect. This is NOT an auth failure — there is
    // no card problem and nothing for the customer to fix — so it must not go
    // through handleAuthFailure (that would email a payment-failure notice and
    // schedule an auto-cancel for a perfectly valid free booking).
    const outstandingFils = Math.max(booking.price_fils - booking.amount_paid_fils, 0);
    if (outstandingFils === 0) {
      console.log(
        `[booking-auth] booking ${booking.id} has no outstanding balance (price ${booking.price_fils} fils, paid ${booking.amount_paid_fils} fils) — skipping off-session authorization entirely`,
      );
      return;
    }

    const saved = await this.getSavedPaymentMethod(booking);
    if (!saved) {
      await this.handleAuthFailure(
        booking.id,
        "No saved payment method on file for off-session authorization",
      );
      return;
    }

    // Phase 6: customer_user_id is nullable (manual walk-in/phone bookings —
    // 1782390000000). Unreachable in practice for this method: a manual
    // booking is always pay_at_venue (never prepay, so scheduleForConfirm
    // never schedules THIS job for one) and never has a payment_id, so the
    // `!saved` branch above already returns first. Kept as an explicit guard
    // (not a cast) so a null customer_user_id fails loud here instead of
    // silently reaching order-service with `userId: null`.
    if (!booking.customer_user_id) {
      await this.handleAuthFailure(
        booking.id,
        "Booking has no customer_user_id — cannot authorize an off-session payment",
      );
      return;
    }

    let result: BookingPaymentAuthorizeResult;
    try {
      result = await this.paymentClient.authorize({
        bookingId: booking.id,
        userId: booking.customer_user_id,
        stripeCustomerId: saved.stripeCustomerId,
        paymentMethodId: saved.paymentMethodId,
        // Fix #6: no `Math.max(..., 1)` floor — the zero case returned above,
        // so this is always > 0 and always agrees with
        // deriveRecoverableAmount's unfloored math (booking-money.ts).
        amountFils: outstandingFils,
        currency: "AED",
      });
    } catch (err) {
      // Sync failure (network/order-service down/validation) — same failure
      // path as a business-level decline.
      await this.handleAuthFailure(
        booking.id,
        err instanceof Error ? err.message : "Off-session authorization request failed",
      );
      return;
    }

    if (result.status === "requires_capture") {
      // Phase 5 final review Fix 4: GUARDED write. A cancel/no-show landing
      // during the authorize round-trip above sees no escrow_hold_id yet
      // (action "none"), wins the terminal transition, and frees the slot —
      // then this unconditional stamp would strand the freshly-minted
      // authorization on a cancelled/no_show booking (a ~7-day card hold with
      // nothing to void it). Conditioning on `status = 'confirmed'` means the
      // write no-ops (`affected === 0`) when the booking already moved on; in
      // that case, best-effort void the PI we just created (an unvoided
      // uncaptured PI auto-expires at Stripe in ~7 days, so a failed void never
      // strands money — it just holds the card a few extra days). Covers both
      // the delayed auth job and the reschedule inline re-auth (both funnel
      // through here).
      const upd = await this.bookingRepo.update(
        { id: booking.id, status: BookingStatus.confirmed },
        { escrow_hold_id: result.paymentId },
      );
      if (upd.affected === 0) {
        console.warn(
          `[booking-auth] booking ${booking.id} left 'confirmed' during the authorize round-trip (cancel/no-show won) — voiding the just-minted PI ${result.paymentIntentId}`,
        );
        try {
          await this.paymentClient.void({
            bookingId: booking.id,
            paymentIntentId: result.paymentIntentId,
            reason:
              "Booking left 'confirmed' before the off-session authorization could be recorded — releasing the orphaned hold",
          });
        } catch (err) {
          console.warn(
            `[booking-auth] failed to void orphaned auth PI ${result.paymentIntentId} for booking ${booking.id} — it will auto-expire at Stripe (~7d)`,
            err,
          );
        }
        return;
      }
      console.log(
        `[booking-auth] booking ${booking.id} authorized off-session (PI ${result.paymentIntentId})`,
      );
      return;
    }

    // A business-outcome decline/SCA-required result, not a thrown error —
    // BookingPaymentClient.authorize() (order-service's
    // createBookingOffSessionAuthorization) deliberately returns these
    // rather than throwing (see that method's docstring).
    await this.handleAuthFailure(
      booking.id,
      result.failureReason ?? `Off-session authorization returned status "${result.status}"`,
    );
  }

  /** Shared by both the sync (authorizeNow) and async (handleAsyncAuthFailure
   * / webhook) failure paths — re-fetches the booking fresh so a
   * late-arriving webhook can't act on stale in-memory state (e.g. a retry
   * that already succeeded in the meantime). */
  private async handleAuthFailure(bookingId: string, reason: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) return;
    if (booking.escrow_hold_id) return; // already authorized since — nothing to do
    if (booking.status !== BookingStatus.confirmed) return; // already terminal

    // Dedupe notify across the sync (authorizeNow decline/throw) and async
    // (webhook payment_intent.payment_failed -> handlePaymentFailed ->
    // handleAsyncAuthFailure) failure paths — Stripe delivers the webhook
    // independently of the sync authorize() call's own outcome, so BOTH
    // paths can reach here for the SAME failed off-session attempt. Rather
    // than add a new booking column/migration just to remember "already
    // notified", reuse the follow-up-cancel job (`auth-followup_{id}`) this
    // same method schedules a few lines down: it's created on the FIRST
    // failure and left alone until it fires or is removed, so its mere
    // existence IS the "already handled" marker. `queue.add` below is itself
    // idempotent on a jobId that already exists (BullMQ no-ops rather than
    // duplicating), so only the notify needs an explicit guard.
    const alreadyNotified = await this.followUpJobAlreadyScheduled(bookingId);
    if (!alreadyNotified) {
      this.notifyPaymentFailed(booking, reason);
    }

    const followUpAt = computeFollowUpFireTime(booking, new Date());
    await this.queue.add(
      "follow-up-cancel",
      { bookingId },
      {
        jobId: followUpJobId(bookingId),
        delay: Math.max(followUpAt.getTime() - Date.now(), 0),
        // PHASE 7 REVIEW FIX #5 — the follow-up job's own existence is used as
        // the "already notified about this failure" marker (see
        // followUpJobAlreadyScheduled above), so it MUST NOT outlive the
        // failure it represents.
        //
        // THE BUG THIS CLOSES: with `removeOnComplete: 500` a COMPLETED
        // follow-up job — including the extremely common case where it ran,
        // found the booking fine, and no-op'd — stayed in the completed set
        // and left the marker behind FOREVER. A LATER, unrelated auth failure
        // on the same booking then (a) skipped `notifyPaymentFailed` because
        // the stale marker read as "already notified", AND (b) had its
        // `queue.add` below silently no-op'd by BullMQ's existing-jobId
        // semantics — so no auto-cancel was scheduled either. Both halves of
        // the failure handling were suppressed by a job that had already done
        // its work.
        //
        // Retaining NEITHER terminal state is the fix with the least blast
        // radius: it is a two-value change confined to this job's options, it
        // needs no new column/migration, and it makes the marker mean exactly
        // what the dedupe check assumes — "a follow-up auto-cancel is
        // genuinely still pending". `removeOnFail` has to go too for the same
        // reason: an exhausted-retry job parked in the failed set is just as
        // permanent a false marker as a completed one (and now more reachable,
        // since fix #3 gave this queue `attempts: 3`). Failure visibility is
        // preserved by this service's own error logging rather than by
        // retained job records.
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  private async followUpJobAlreadyScheduled(bookingId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(followUpJobId(bookingId));
      return Boolean(job);
    } catch (err) {
      // Fail OPEN: a queue-read hiccup should never silently suppress a
      // legitimate customer notification — worst case on a transient Redis
      // blip is one duplicate notify, not zero.
      console.warn(
        `[booking-auth] failed to check existing follow-up job for booking ${bookingId} — notifying anyway`,
        err,
      );
      return false;
    }
  }

  private async getSavedPaymentMethod(
    booking: Booking,
  ): Promise<{ stripeCustomerId: string; paymentMethodId: string } | null> {
    if (!booking.payment_id) return null;
    const payment = await this.paymentRepo.findOne({ where: { id: booking.payment_id } });
    const gw = (payment?.gateway_response ?? {}) as Record<string, unknown>;
    const stripeCustomerId = gw.stripe_customer_id;
    const paymentMethodId = gw.payment_method_id;
    if (typeof stripeCustomerId !== "string" || typeof paymentMethodId !== "string") return null;
    return { stripeCustomerId, paymentMethodId };
  }

  // Phase 5 Task 8: the `booking_payment_failed` notification (email +
  // in-app, pay-now link — amended spec). Fired once per off-session
  // authorization failure (deduped by handleAuthFailure's caller, see that
  // method's comment) for BOTH the sync (authorizeNow decline/throw) and
  // async (webhook) failure paths. Emission only — best-effort, never thrown
  // (mirrors cancel/no-show's own emitNotifications): a notify failure must
  // never block the follow-up-cancel scheduling this runs alongside.
  private notifyPaymentFailed(booking: Booking, reason: string): void {
    console.log(
      `[booking-auth] booking_payment_failed: booking ${booking.id}, customer ${booking.customer_user_id}, reason=${reason}`,
    );
    if (!this.notificationQueue) return;
    const payNowUrl = `${(this.appBaseUrl ?? "").replace(/\/$/, "")}/bookings/${booking.id}`;
    this.notificationQueue
      .add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_payment_failed,
        variables: {
          service_name: booking.service_name,
          booking_number: booking.booking_number,
          starts_at: new Date(booking.starts_at).toISOString(),
          reason,
          pay_now_url: payNowUrl,
        },
        data: {
          bookingId: booking.id,
          bookingNumber: booking.booking_number,
          vendorId: booking.vendor_id,
          serviceName: booking.service_name,
          startsAt: new Date(booking.starts_at).toISOString(),
          reason,
          payNowUrl,
        },
      })
      .catch((err) => {
        console.warn(`[booking-auth] failed to emit booking_payment_failed for ${booking.id}`, err);
      });
  }
}
