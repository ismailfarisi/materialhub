// booking-completion.service.ts
import {
  type Booking,
  NotificationType,
  type Payment,
  ServicePaymentMode,
} from "@materialhub/database";
import type { Repository } from "typeorm";
import type { BookingPaymentClient } from "./booking-payment.client.ts";
import type { BookingCompletionHook } from "./booking-status.service.ts";

// Phase 5 Task 8 seam (mirrors cancel.service.ts's/booking-status.service.ts's
// own per-file NotificationEventQueueLike — same shared "notification-events"
// BullMQ queue). Optional: a missing queue just skips the completion-time
// notifications (mirrors every other optional DI seam on this branch).
export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}

/**
 * PHASE 7 REVIEW FIX #4 — thrown when a PREPAY booking reaches completion with
 * no capturable authorization.
 *
 * THE BUG THIS CLOSES: the old code logged a warning and STILL called
 * `paymentClient.complete({ paymentIntentId: null, ... })`. VERIFIED against
 * order-service's `/internal/booking-payments/complete`
 * (apps/order-service/src/routes/internal-booking-payment.routes.ts): a null
 * `payment_intent_id` skips the Stripe capture entirely but STILL runs
 * `commissionService.createForBookingInTx` — i.e. it posts the commission /
 * payout accrual regardless. So a prepay booking whose auth job died (very
 * reachable before fix #3 gave that queue any retries at all) auto-completed
 * at ends_at+24h with ZERO collected and the vendor credited anyway.
 *
 * Throwing rather than logging is deliberate and matches
 * `BookingStatusService.completeBooking`'s documented contract: the status
 * transition has ALREADY durably committed, so a throw here does not undo the
 * completion — it signals "the money side did not finish, call
 * completeBooking() again". The auto-complete queue's `attempts: 3` retries
 * it, and an exhausted job lands in BullMQ's failed set, which IS the
 * reconciliation record. Either the missing authorization gets resolved and a
 * later retry captures + accrues correctly, or a human sees a failed job —
 * both strictly better than silently crediting the vendor for money nobody
 * ever collected.
 */
export class BookingCompletionUnpaidError extends Error {
  readonly code = "booking_completion_no_captured_payment";
  constructor(
    readonly bookingId: string,
    detail: string,
  ) {
    super(
      `Refusing to accrue commission for prepay booking ${bookingId}: ${detail}. The service was completed but no payment was captured — this booking needs reconciliation (re-authorize and retry completion, or write it off) before the vendor can be credited.`,
    );
    this.name = "BookingCompletionUnpaidError";
  }
}

/**
 * The concrete `BookingCompletionHook` fired by
 * `BookingStatusService.completeBooking()` (Phase 4 Task 9; spec §5.2 step 3
 * / §5.3 "On completed — capture ... commission ... accrued"). Money stays in
 * order-service (spec §3) — this never talks to Stripe directly, it only
 * resolves WHICH PaymentIntent to capture and delegates to
 * `BookingPaymentClient.complete`.
 *
 * PI resolution mirrors BookingReaperService.settleDepositBeforeExpiry /
 * BookingAuthService's own lookups: booking-service reads the shared
 * `payments` table directly (same Postgres via `@materialhub/database`, read-only)
 * rather than exposing a new order-service lookup endpoint for a single
 * column. Task 7b's `BookingAuthService.runAuthorizeJob` stores the
 * authorization PaymentIntent's Payment-ROW id on `booking.escrow_hold_id`
 * (NOT `booking.payment_id`, which for prepay points at the SetupIntent
 * instead) — so `escrow_hold_id -> payments.id -> gateway_payment_id` is the
 * one true path to the PI capture needs.
 */
export class BookingCompletionService implements BookingCompletionHook {
  constructor(
    private readonly paymentRepo: Repository<Payment>,
    private readonly paymentClient: BookingPaymentClient,
    // Phase 5 Task 8 — trailing + optional so every existing positional
    // construction (tests, container.ts pre-Task-8) keeps compiling
    // unchanged.
    private readonly notificationQueue?: NotificationEventQueueLike,
  ) {}

  async onCompleted(
    booking: Booking,
    context: { firstCompletion: boolean } = { firstCompletion: true },
  ): Promise<void> {
    // C1 (Task 0B review): a MANUAL walk-in/phone booking completes
    // CAPACITY-ONLY. The status/history/engagement transition already committed
    // in BookingStatusService.completeBooking BEFORE this hook fires; this
    // money-and-notification hook must be a no-op for it. MaterialHub never
    // collected money for a walk-in (no marketplace customer, no PaymentIntent,
    // pay_at_venue cash paid in person, commission_fils 0), so calling
    // paymentClient.complete would post a zero-commission accrual row crediting
    // the vendor the walk-in's full net for money the platform never touched —
    // exactly the payout-for-nothing defect the review flagged. The
    // customer-facing booking_completed / booking_review_request notifications
    // also have no recipient (customer_user_id is null). We detect the manual
    // source with the SAME predicate reschedule.service.ts uses to REJECT a
    // manual reschedule (customer_user_id NULL <=> source walk_in/phone, see
    // booking.entity.ts) — here we complete instead of reject. Covers BOTH
    // callers that reach this hook: the vendor manage-complete route and the
    // system auto-complete job (both funnel through completeBooking ->
    // fireCompletionHook -> onCompleted). Marketplace bookings always carry a
    // customer_user_id, so their capture/commission/notification path is
    // byte-for-byte unchanged.
    if (!booking.customer_user_id) {
      console.log(
        `[booking-completion] booking ${booking.id} is a manual walk-in/phone booking (no marketplace customer) — completing capacity-only: no capture, no commission accrual, no payout, no customer notification`,
      );
      return;
    }

    let paymentIntentId: string | null = null;

    if (booking.payment_mode === ServicePaymentMode.prepay) {
      if (booking.escrow_hold_id) {
        // Scoped by booking_id too (defense-in-depth, mirrors
        // BookingPaymentClient.captureBookingPayment/voidBookingPayment's
        // `{ booking_id, gateway_payment_id }` keying) — escrow_hold_id is
        // trusted internal state (set only by this booking's own auth job),
        // so this hardens rather than fixes a real bug.
        const payment = await this.paymentRepo.findOne({
          where: { id: booking.escrow_hold_id, booking_id: booking.id },
        });
        paymentIntentId = payment?.gateway_payment_id ?? null;
        if (!paymentIntentId) {
          // PHASE 7 REVIEW FIX #4 (see BookingCompletionUnpaidError): an
          // escrow_hold_id whose Payment row carries no gateway_payment_id is
          // an authorization we cannot capture. Falling through would post the
          // commission accrual with paymentIntentId null — crediting the
          // vendor for money that was never collected.
          throw new BookingCompletionUnpaidError(
            booking.id,
            `escrow_hold_id ${booking.escrow_hold_id} has no gateway_payment_id on its Payment row, so the authorization cannot be captured`,
          );
        }
      } else {
        // PHASE 7 REVIEW FIX #4: the booking-auth job never authorized this
        // booking (it died — very reachable before fix #3 gave that queue
        // retries — or the off-session authorization failed and was never
        // retried). There is NOTHING to capture, so completing here would
        // accrue commission against zero collected revenue.
        //
        // The previous behaviour ("commission still accrues per spec, the
        // service was rendered regardless") is wrong on the money side: spec
        // §5.2 step 3 accrues commission ON CAPTURE, and order-service's
        // /complete happily inserts the commission row when
        // payment_intent_id is null. Fail loudly instead — see the error
        // class's docstring for why throwing is safe here (the status
        // transition has already committed; this only signals "retry the
        // money side").
        throw new BookingCompletionUnpaidError(
          booking.id,
          "no escrow_hold_id at completion — the off-session authorization was never created or never succeeded",
        );
      }
    }
    // deposit: already captured at booking time (BookingService.create's
    // capture-now intent) — nothing to capture again here.
    // pay_at_venue: paid in person, never touches Stripe — nothing to capture.

    await this.paymentClient.complete({
      bookingId: booking.id,
      paymentIntentId,
      vendorId: booking.vendor_id,
      commissionRate: Number(booking.commission_rate),
      commissionFils: booking.commission_fils,
      // Review fix: threads the booking's snapshotted commission TYPE
      // through so a fixed-rate vendor's accrued row is labeled "fixed"
      // (with its fils CAP) instead of order-service hardcoding
      // "percentage" for every booking-sourced commission row.
      commissionType: booking.commission_type,
      priceFils: booking.price_fils,
      vatFils: booking.vat_fils,
    });

    // Phase 5 Task 8: `booking_completed` + `booking_review_request` — fired
    // AFTER the capture/commission call above succeeds (a failed capture
    // rethrows out of onCompleted before reaching here, so the customer is
    // never told a booking is "done" — with a request to review it — while
    // BookingStatusService.completeBooking's own retry contract is still
    // trying to make the money side succeed). Emission only, best-effort
    // (mirrors cancel/no-show/reschedule's own emitNotifications) — never
    // thrown into the caller, which already durably completed the booking.
    //
    // Phase 5 final review Fix 3: gated on `firstCompletion` — the completion
    // hook is deliberately re-firable (completeBooking re-invokes it on an
    // already-`completed` booking so a capture that failed mid-flight can be
    // retried idempotently), but the customer notifications must NOT re-send on
    // every retry. Only the WINNING pending->completed transition passes
    // `firstCompletion: true`; a lost concurrent-completion race or a
    // capture-retry re-fire passes `false` and captures/accrues silently.
    // ACCEPTED TRADE-OFF: because these notifications sit AFTER the capture
    // above, a winning transition whose capture THREW rethrows here before
    // notifying, and the subsequent retry (already `completed` ->
    // `firstCompletion: false`) will re-attempt the capture but NOT the
    // notifications — so in the rare "winning capture failed, retry captured"
    // path the customer isn't emailed. That's the deliberate cost of not
    // double-notifying on the common retry path; the booking is durably
    // completed either way and the missing notify is an ops-followup, not a
    // money-loss.
    if (context.firstCompletion) {
      await this.emitCompletionNotifications(booking);
    }
  }

  private async emitCompletionNotifications(booking: Booking): Promise<void> {
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
    };

    try {
      await this.notificationQueue.add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_completed,
        variables,
        data,
      });
    } catch (err) {
      console.warn(
        `[booking-completion] failed to emit customer booking_completed for ${booking.id}`,
        err,
      );
    }

    try {
      await this.notificationQueue.add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_review_request,
        variables,
        data,
      });
    } catch (err) {
      console.warn(
        `[booking-completion] failed to emit customer booking_review_request for ${booking.id}`,
        err,
      );
    }
  }
}
