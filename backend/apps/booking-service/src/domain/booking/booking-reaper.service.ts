import {
  type Booking,
  BookingStatus,
  type Payment,
  PaymentStatus,
  ServicePaymentMode,
} from "@materialhub/database";
import { LessThan, type Repository } from "typeorm";
import type { BookingPaymentClient } from "./booking-payment.client.ts";
import type { BookingStatusService } from "./booking-status.service.ts";

// Reaper always acts as the system actor (spec §5.3: "reaper/timeout" edge) —
// mirrors the `{ id: null, role: "system" }` shape BookingStatusService's own
// tests use for system-driven transitions (confirm()'s webhook entry point,
// booking-status.service.integration.test.ts's expired-transition case).
// actor_id on booking_status_history is a nullable uuid column, so a literal
// non-uuid string (e.g. "system") would fail the insert — null + role=system
// is how "no human actor" is represented throughout this codebase.
const SYSTEM_ACTOR = { id: null, role: "system" as const };

// Payment statuses that mean the customer's money has ALREADY left their card
// (or already moved on to a refund). A deposit booking sitting in one of these
// must never be expired-and-voided — see settleDepositBeforeExpiry.
const MONEY_ALREADY_MOVED: ReadonlySet<string> = new Set<string>([
  PaymentStatus.captured,
  PaymentStatus.authorized,
  PaymentStatus.refunded,
  PaymentStatus.partially_refunded,
]);

export interface ReapSummary {
  scanned: number;
  expired: number;
  skipped: number;
  errored: number;
}

/**
 * Expires abandoned bookings stuck in `pending_payment` past
 * `windowMinutes` (config.bookings.pendingExpiryMinutes), freeing the slot
 * they hold via `BookingStatusService.transition` (Phase 4 Task 6 — that
 * call already releases the `staff_engagement` and invalidates the
 * availability cache internally; this service never touches the engagement
 * directly). After the booking is durably `expired`, it makes a
 * BEST-EFFORT attempt to void any outstanding Stripe hold via
 * `BookingPaymentClient` (money stays in order-service — this never talks
 * to Stripe directly): a deposit booking's uncaptured PaymentIntent gets
 * voided; a prepay booking's SetupIntent holds no money at all (it's a
 * saved-card verification, not a charge) and `BookingPaymentClient` has no
 * setup-intent-cancel method, so that leg is cleanup-only and is skipped
 * with a log line rather than attempted.
 *
 * Order matters, mirrored from the Task 7 brief: the slot is freed
 * UNCONDITIONALLY (the transition happens first); the payment void is
 * strictly best-effort afterward — a void failure is logged and counted in
 * `errored` but never un-expires the booking or blocks the sweep from
 * continuing to the next candidate (mirrors
 * PendingOrderReaperService.reapExpired's per-item try/catch).
 */
export class BookingReaperService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly paymentRepo: Repository<Payment>,
    private readonly statusService: BookingStatusService,
    private readonly paymentClient: BookingPaymentClient,
    private readonly windowMinutes: number,
  ) {}

  /**
   * PHASE 7 REVIEW FIX #8 — bounded pagination. This used to take a single
   * page of 100 per 5-minute cron with no repeat-until-empty, so any backlog
   * above ~1200/hour could never drain and stale holds kept their slots
   * blocked indefinitely. Now it pages until a short page (or the ceiling)
   * ends the sweep.
   *
   * The ceiling is deliberate, not unbounded: a cron-driven sweep that could
   * run for an unbounded number of pages would overlap its own next tick and
   * hammer order-service. MAX_BATCHES * PAGE_SIZE (10 * 100 = 1000) is the
   * per-run cap; whatever is left is picked up by the next tick.
   *
   * Paging uses a running `skip` offset advanced by the number of candidates
   * this sweep did NOT expire (skipped/errored rows stay `pending_payment` and
   * would otherwise be re-selected by the next page's identical WHERE clause,
   * looping forever on the same rows).
   */
  async reapExpired(): Promise<ReapSummary> {
    const PAGE_SIZE = 100;
    const MAX_BATCHES = 10;
    const cutoff = new Date(Date.now() - this.windowMinutes * 60_000);

    const summary: ReapSummary = { scanned: 0, expired: 0, skipped: 0, errored: 0 };
    let skip = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const candidates = await this.bookingRepo.find({
        where: { status: BookingStatus.pending_payment, created_at: LessThan(cutoff) } as any,
        order: { created_at: "ASC" } as any,
        take: PAGE_SIZE,
        skip,
      });
      if (candidates.length === 0) break;

      summary.scanned += candidates.length;
      let leftBehind = 0;

      for (const booking of candidates) {
        const outcome = await this.reapOne(booking);
        summary[outcome]++;
        if (outcome !== "expired") leftBehind++;
      }

      // Rows we expired have left the result set; rows we left behind have
      // not — step past them so the next page makes progress.
      skip += leftBehind;
      if (candidates.length < PAGE_SIZE) break;
    }

    return summary;
  }

  /**
   * Reap exactly one candidate. Returns which summary counter to bump.
   *
   * PHASE 7 REVIEW FIX #2 — never expire a booking whose deposit was already
   * captured.
   *
   * THE BUG THIS CLOSES: this method's predecessor transitioned to `expired`
   * UNCONDITIONALLY and only then made a best-effort void. But deposit
   * PaymentIntents are CAPTURE-NOW (BookingService.create), so if Stripe's
   * `payment_intent.succeeded` webhook is merely DELAYED past
   * BOOKING_PENDING_EXPIRY_MINUTES (default 60), the customer's money is
   * already taken. `paymentClient.void` (= `paymentIntents.cancel`) then
   * ERRORS on a succeeded PI, that error was swallowed into a log line, and
   * the later webhook's `confirm()` no-ops because the booking is no longer
   * `pending_payment`. Net: customer charged, booking expired, slot resold, no
   * refund, no reconciliation record.
   *
   * WHY THE NEW ORDER CLOSES THE WINDOW: for deposit bookings the money is now
   * settled BEFORE the slot is freed, and every branch is fail-CLOSED —
   * nothing expires unless we have positive evidence no money is held:
   *
   *   1. Payment row already `captured`/`authorized`/`refunded`/
   *      `partially_refunded` -> the money side has ALREADY moved. Do not
   *      expire. Drive `statusService.confirm()` instead — that is precisely
   *      what the delayed webhook would have done, it is idempotent, and it is
   *      the semantic the rest of the service uses for "payment succeeded ⇒
   *      booking confirmed". Confirming (rather than refunding) is the right
   *      match here: the customer paid for a slot that is still theirs and
   *      still unsold, so honouring it is strictly better for them than
   *      cancelling-and-refunding a booking they wanted.
   *   2. Otherwise VOID FIRST, expire second. A void that SUCCEEDS proves the
   *      PI was uncaptured and is now cancelled — only then is it safe to free
   *      the slot. A void that THROWS (the succeeded-PI case, or order-service
   *      being down) leaves the booking `pending_payment` and counts as
   *      `errored` with a loud reconciliation-required log — the next sweep
   *      retries, and a late webhook can still confirm it. The failure is no
   *      longer swallowed into a log line while the booking expires anyway.
   *
   * prepay (SetupIntent — no money held) and pay_at_venue are unaffected and
   * keep the original expire-then-cleanup ordering.
   */
  private async reapOne(booking: Booking): Promise<"expired" | "skipped" | "errored"> {
    const bookingId = booking.id;

    if (this.holdsRealMoney(booking)) {
      const settled = await this.settleDepositBeforeExpiry(booking);
      if (settled !== "safe_to_expire") return settled;
    }

    try {
      await this.statusService.transition(
        bookingId,
        BookingStatus.expired,
        SYSTEM_ACTOR,
        `Payment not completed within ${this.windowMinutes} minutes`,
      );
    } catch (err) {
      console.error("[booking-reaper] failed to expire booking", {
        bookingId,
        error: String(err),
      });
      return "errored";
    }

    // prepay/pay_at_venue cleanup only — the deposit leg already settled its
    // money above, before the slot was freed.
    try {
      await this.logNonMoneyCleanup(booking);
    } catch (err) {
      console.error("[booking-reaper] best-effort payment cleanup failed", {
        bookingId,
        error: String(err),
      });
    }
    return "expired";
  }

  /** True only for the one mode whose PaymentIntent can hold/have taken real
   * money at `pending_payment` time: deposit (capture-now PI). */
  private holdsRealMoney(booking: Booking): boolean {
    return booking.payment_mode === ServicePaymentMode.deposit && !!booking.payment_id;
  }

  /**
   * Deposit money settlement, run BEFORE the expire transition. Returns
   * "safe_to_expire" only when we have positive evidence no money is held.
   */
  private async settleDepositBeforeExpiry(
    booking: Booking,
  ): Promise<"safe_to_expire" | "skipped" | "errored"> {
    const bookingId = booking.id;
    const payment = await this.paymentRepo.findOne({
      where: { id: booking.payment_id as string },
    });

    // (1) The money already moved — a delayed webhook, not an abandoned
    // checkout. Confirm rather than expire.
    if (payment && MONEY_ALREADY_MOVED.has(payment.status)) {
      console.warn(
        `[booking-reaper] booking ${bookingId} is past the ${this.windowMinutes}m expiry window but its deposit Payment ${payment.id} is '${payment.status}' — the money was ALREADY taken (delayed payment_intent.succeeded webhook). NOT expiring; confirming the booking instead so the customer keeps the slot they paid for.`,
      );
      try {
        await this.statusService.confirm(bookingId);
        return "skipped";
      } catch (err) {
        console.error(
          "[booking-reaper] RECONCILIATION REQUIRED: captured deposit but confirm() failed — booking left pending_payment, money is held",
          { bookingId, paymentId: payment.id, error: String(err) },
        );
        return "errored";
      }
    }

    const paymentIntentId = payment?.gateway_payment_id;
    if (!paymentIntentId) {
      // No resolvable PI: nothing this reaper can void, and no evidence money
      // was taken (an intent that never reached Stripe). Safe to expire —
      // same as the original behaviour for this case.
      return "safe_to_expire";
    }

    // (2) Void FIRST. Only a successful void proves the PI was uncaptured.
    try {
      await this.paymentClient.void({
        bookingId,
        paymentIntentId,
        reason: `Payment not completed within ${this.windowMinutes} minutes`,
      });
      return "safe_to_expire";
    } catch (err) {
      console.error(
        "[booking-reaper] RECONCILIATION REQUIRED: could not void the deposit PaymentIntent — NOT expiring this booking (the money may already be captured). Leaving it pending_payment for the next sweep / a late webhook to resolve.",
        { bookingId, paymentIntentId, error: String(err) },
      );
      return "errored";
    }
  }

  private async logNonMoneyCleanup(booking: Booking): Promise<void> {
    const { payment_mode: paymentMode, payment_id: paymentId, id: bookingId } = booking;

    // pay_at_venue never carries a payment_id (nothing was ever charged or
    // held); defensive no-op if one somehow slipped through.
    if (!paymentId || paymentMode === ServicePaymentMode.pay_at_venue) return;

    if (paymentMode === ServicePaymentMode.prepay) {
      // prepay's payment_id points at a SetupIntent — a saved-card
      // verification, not a charge. No money is held, so an abandoned
      // SetupIntent is cleanup, not a money-safety hole (Task 7 brief).
      // BookingPaymentClient has no setup-intent-cancel method (only
      // setup/authorize/intent/capture/void/refund — void wraps
      // paymentIntents.cancel, which does not accept a SetupIntent id), so
      // this leg is intentionally skipped rather than misapplied.
      console.log(
        `[booking-reaper] booking ${bookingId} is prepay — SetupIntent ${paymentId} left as-is (no money held, no cancel path on BookingPaymentClient)`,
      );
    }
  }
}
