// cancel.service.ts
//
// Phase 5 Task 4 (spec §5.3 "cancelled (customer/admin) --> refund per policy").
// A confirmed booking is cancelled; the slot is freed and the money outcome is
// driven by the SNAPSHOTTED cancellation policy via the pure
// BookingPolicyCalculator (booking-policy.ts). Separate file mirroring
// reschedule.service.ts — one responsibility per file.
//
// ── Ordering (mirrors BookingReaperService.reapExpired) ──────────────────────
// The slot is freed UNCONDITIONALLY first, via
// BookingStatusService.transition(bookingId, cancelled, actor). That single
// call: (a) writes the ONE booking_status_history audit row (with our
// refund/forfeit-bearing `reason`), (b) releases the staff_engagement (frees
// the slot + invalidates the availability cache), and (c) fires the stale
// delayed-job CLEANUP for ALL THREE jobs (booking-auth, auto-complete,
// reminders) — because container.ts constructs bookingStatusService with all
// three hooks wired, its `cancelled` cleanup branch removes every one (verified:
// booking-status.service.ts's reachedCleanupTargetStatus block). So unlike
// reschedule (which must RE-TIME jobs for a new slot), cancel needs no explicit
// job calls here — removal is exactly what the terminal transition already does.
//
// The money movement is strictly BEST-EFFORT and runs AFTER the transition, so
// a void/capture/refund failure never un-cancels the booking or strands the
// slot (an unvoided uncaptured PI auto-expires at Stripe in ~7 days — the same
// safety property BookingReaperService.voidOutstandingPayment and
// BookingAuthService.rescheduleBookingAuthJob rely on). A failure is logged
// loudly for ops follow-up (there is no self-serve retry — the booking is no
// longer `confirmed`).
//
// ── Money basis (what was actually taken/held) ──────────────────────────────
// `booking.amount_paid_fils` is CURRENTLY never written back after creation
// (it defaults to 0 and no confirm/deposit-capture path updates it), so it is
// NOT a reliable basis for the refund/forfeit math. Instead the recoverable
// amount is derived per payment_mode from the snapshot columns:
//   - deposit:            deposit_fils   (the amount captured at booking time —
//                         BookingService.create() creates the deposit intent for
//                         exactly `depositFils`).
//   - prepay (authorized): price_fils - amount_paid_fils  (the off-session
//                         manual-capture authorization hold — mirrors
//                         BookingAuthService.authorizeNow's own amount).
//   - prepay (unauthorized) / pay_at_venue: 0 (nothing taken or held).
// That derived amount is passed to computeCancellation as `amountPaidFils`,
// which the pure calculator caps every forfeit against.
import {
  type Booking,
  BookingStatus,
  NotificationType,
  type Payment,
  ServicePaymentMode,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { deriveRecoverableAmount, resolveAuthPi } from "./booking-money.ts";
import type {
  BookingPaymentCaptureInput,
  BookingPaymentCaptureResult,
  BookingPaymentRefundInput,
  BookingPaymentRefundResult,
  BookingPaymentVoidInput,
  BookingPaymentVoidResult,
} from "./booking-payment.client.ts";
import { computeCancellation } from "./booking-policy.ts";
import {
  type BookingActor,
  type BookingStatusService,
  InvalidBookingTransitionError,
} from "./booking-status.service.ts";

// ── Narrow DI seams (mirrors reschedule.service.ts) — this file never imports
// the concrete BookingPaymentClient; it only needs void/capture/refund. ──────
export interface CancelPaymentClient {
  void(input: BookingPaymentVoidInput): Promise<BookingPaymentVoidResult>;
  capture(input: BookingPaymentCaptureInput): Promise<BookingPaymentCaptureResult>;
  refund(input: BookingPaymentRefundInput): Promise<BookingPaymentRefundResult>;
}
export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}
// Resolves a vendor's notifiable user id (owner/manager) for the vendor-facing
// cancellation notification. Optional — when unwired the vendor notification is
// simply skipped (best-effort; the customer notification always fires).
export interface VendorOwnerLookup {
  findOwnerUserId(vendorId: string): Promise<string | null>;
}

export interface CancelInput {
  // Optional customer-supplied cancellation reason, appended to the audit note.
  reason?: string | null;
  // Edge-stamped "now" for testability (mirrors RescheduleInput.now).
  now?: Date;
}

// The money action actually taken against the payment gateway (recorded in the
// audit note + returned for the API response / tests).
export type CancelMoneyAction =
  | "none" // pay_at_venue, or prepay never authorized (nothing to move)
  | "void" // prepay authorized, full release (in-window / no forfeit)
  | "partial_capture" // prepay authorized, out-of-window forfeit kept, remainder auto-releases
  | "refund"; // deposit refunded (full in-window, or remainder out-of-window)

export interface CancelResult {
  booking: Booking;
  withinWindow: boolean;
  refundFils: number;
  forfeitFils: number;
  action: CancelMoneyAction;
}

// Internal money decision derived from the policy calc + payment_mode.
interface MoneyDecision {
  withinWindow: boolean;
  refundFils: number;
  forfeitFils: number;
  action: CancelMoneyAction;
  policy: string;
}

export class CancelService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly paymentRepo: Repository<Payment>,
    private readonly statusService: BookingStatusService,
    private readonly paymentClient: CancelPaymentClient,
    private readonly notificationQueue: NotificationEventQueueLike,
    private readonly vendorOwnerLookup?: VendorOwnerLookup,
  ) {}

  /**
   * Cancel `bookingId`. `actor.role === "customer"` incurs the snapshotted
   * cancellation policy (out-of-window customer cancel is ALLOWED but forfeits
   * per policy — the deal, unlike reschedule which 422s). Any non-customer
   * actor (vendor / location-admin / platform-admin) BYPASSES the window and
   * gets a full refund regardless (a vendor-side cancel must not penalise the
   * customer; spec §7 "admin any time"). Ownership scoping matches the read
   * endpoints: a customer can only cancel their OWN booking (a booking that
   * exists but isn't theirs reads as 404).
   */
  async cancel(
    bookingId: string,
    actor: BookingActor,
    input: CancelInput = {},
  ): Promise<CancelResult> {
    const now = input.now ?? new Date();

    // Guard the ownership predicate: a customer actor with a falsy id would make
    // `customer_user_id: undefined` DROP that filter, silently widening the
    // lookup to ANY booking by id (a customer cancelling someone else's
    // booking). A customer must always carry an id — fail loud instead.
    if (actor.role === "customer" && !actor.id) {
      throw new BadRequestError("A customer actor must have an id");
    }

    // Ownership-scoped load (customer sees only own; admin/vendor by id).
    const booking =
      actor.role === "customer"
        ? await this.bookingRepo.findOne({
            where: { id: bookingId, customer_user_id: actor.id ?? undefined },
          })
        : await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    // Only a confirmed booking can be cancelled (spec §5.3 — the only source of
    // the confirmed->cancelled edge). pending_payment is the reaper's job;
    // completed/cancelled/expired/no_show are terminal. Reuse the state
    // machine's own error type so callers get the same 422
    // invalid_booking_transition, and fail BEFORE any money is moved.
    if (booking.status !== BookingStatus.confirmed) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.cancelled);
    }

    const decision = this.decideMoney(booking, actor, now);

    // Free the slot + write history + remove all three delayed jobs. The
    // refund/forfeit outcome is recorded in this single history row's `reason`
    // (the brief: "record forfeit/refund in the status-history record at
    // minimum" — no new columns / migration in this task).
    const reason = this.buildReason(actor, decision, input.reason ?? null);
    const updated = await this.statusService.transition(
      bookingId,
      BookingStatus.cancelled,
      actor,
      reason,
    );

    // Best-effort money movement AFTER the slot is freed (mirrors the reaper).
    await this.applyMoney(booking, decision);

    // Notifications (emission only — Task 8 owns templates).
    await this.emitNotifications(updated, decision);

    return {
      booking: updated,
      withinWindow: decision.withinWindow,
      refundFils: decision.refundFils,
      forfeitFils: decision.forfeitFils,
      action: decision.action,
    };
  }

  // ── Pure-ish decision: run the policy calc against the mode-correct
  // recoverable amount, then decide the concrete gateway action. ────────────
  private decideMoney(booking: Booking, actor: BookingActor, now: Date): MoneyDecision {
    const bypassWindow = actor.role !== "customer";

    // Recoverable/held amount per mode (see booking-money.ts — amount_paid_fils
    // is never written back so it can't be the basis).
    const { amountPaidFils, isPrepayAuthorized } = deriveRecoverableAmount(booking);

    const calc = computeCancellation({
      policySnapshot: {
        cancellation_window_hours: booking.cancellation_window_hours,
        cancellation_refund_policy: booking.cancellation_refund_policy,
        cancellation_penalty_percent: booking.cancellation_penalty_percent,
      },
      now,
      startsAt: new Date(booking.starts_at),
      amountPaidFils,
      depositFils: booking.deposit_fils,
    });

    // Non-customer actors bypass the window -> treat as in-window (full refund,
    // no forfeit) regardless of what the calc computed.
    const withinWindow = bypassWindow ? true : calc.withinWindow;
    const forfeitFils = withinWindow ? 0 : calc.forfeitFils;
    const refundFils = amountPaidFils - forfeitFils;

    return {
      withinWindow,
      forfeitFils,
      refundFils,
      action: this.resolveAction(booking, isPrepayAuthorized, forfeitFils, refundFils),
      policy: booking.cancellation_refund_policy,
    };
  }

  private resolveAction(
    booking: Booking,
    isPrepayAuthorized: boolean,
    forfeitFils: number,
    refundFils: number,
  ): CancelMoneyAction {
    if (booking.payment_mode === ServicePaymentMode.pay_at_venue) return "none";
    if (booking.payment_mode === ServicePaymentMode.prepay) {
      if (!isPrepayAuthorized) return "none"; // SetupIntent only — nothing held
      // Out-of-window forfeit: capture the penalty (partial), remainder
      // auto-releases. Otherwise void the whole authorization.
      return forfeitFils > 0 ? "partial_capture" : "void";
    }
    // deposit: refund the (remaining) amount if any, else keep the forfeit.
    return refundFils > 0 ? "refund" : "none";
  }

  // ── Best-effort gateway movement (never throws into the caller — the booking
  // is already durably cancelled; a failure is logged for ops follow-up). ────
  private async applyMoney(booking: Booking, decision: MoneyDecision): Promise<void> {
    try {
      switch (decision.action) {
        case "none":
          if (booking.payment_mode === ServicePaymentMode.prepay && !booking.escrow_hold_id) {
            // Prepay confirmed but never authorized (booked before the
            // booking-auth job fired, or the off-session auth failed). Only a
            // SetupIntent exists — a saved-card verification, no money held, and
            // BookingPaymentClient has no setup-intent-cancel path (same as
            // BookingReaperService's prepay leg). Nothing to void.
            console.log(
              `[cancel] prepay booking ${booking.id} not yet authorized — nothing to void (SetupIntent holds no money)`,
            );
          }
          return;
        case "void": {
          const pi = await resolveAuthPi(this.paymentRepo, booking, "[cancel]");
          if (!pi) return;
          await this.paymentClient.void({
            bookingId: booking.id,
            paymentIntentId: pi,
            reason: "Booking cancelled — releasing the prepay authorization",
          });
          return;
        }
        case "partial_capture": {
          const pi = await resolveAuthPi(this.paymentRepo, booking, "[cancel]");
          if (!pi) return;
          // Capture ONLY the forfeit; Stripe auto-releases the remainder of a
          // manual-capture PI when amount_to_capture < authorized
          // (order-service /internal/booking-payments/capture forwards
          // amount_fils as amount_to_capture — verified Phase 4 Task 2).
          await this.paymentClient.capture({
            bookingId: booking.id,
            paymentIntentId: pi,
            amountFils: decision.forfeitFils,
          });
          return;
        }
        case "refund":
          // Deposit refund — RefundService resolves the captured deposit
          // Payment row by booking_id internally (no PI id needed) and caps at
          // its amount. Deliberately NO free-text `reason`: order-service's
          // RefundService forwards `reason` straight to Stripe's refund `reason`
          // param, which only accepts duplicate|fraudulent|requested_by_customer
          // — a prose string 400s there. The human-readable in/out-window +
          // refund/forfeit detail is already recorded on the booking_status_history
          // row; the refund itself is tagged via reference_type="cancellation".
          await this.paymentClient.refund({
            bookingId: booking.id,
            amountFils: decision.refundFils,
            referenceType: "cancellation",
            referenceId: booking.id,
          });
          return;
      }
    } catch (err) {
      console.error(
        `[cancel] best-effort ${decision.action} failed for booking ${booking.id} (refund=${decision.refundFils}, forfeit=${decision.forfeitFils}) — booking is cancelled; any uncaptured authorization auto-expires at Stripe (~7d), a failed refund needs ops follow-up`,
        err,
      );
    }
  }

  private buildReason(
    actor: BookingActor,
    decision: MoneyDecision,
    customerReason: string | null,
  ): string {
    const windowLabel = decision.withinWindow ? "in-window" : "out-of-window";
    const base =
      `Cancelled by ${actor.role} (${windowLabel}); policy=${decision.policy}; ` +
      `refund=${decision.refundFils} fils, forfeit=${decision.forfeitFils} fils; action=${decision.action}`;
    return customerReason ? `${base} — ${customerReason}` : base;
  }

  // Task 8 fix: the money action (void/partial_capture/refund/none) — WITHOUT
  // this a template can't tell "authorization hold released, customer never
  // charged" (void) apart from "money refunded" (refund), and a never-charged
  // customer must never be told they were "refunded AED X". Additive: mirrors
  // no-show.service.ts's `penalty.action` (that one nests under `penalty`
  // because it also carries `policy`; cancel has no analogous wrapper object
  // today, so `action` sits top-level on both variables — a flat string the
  // template can switch on directly — and data, for parity/debuggability).
  private async emitNotifications(booking: Booking, decision: MoneyDecision): Promise<void> {
    const variables = {
      service_name: booking.service_name,
      booking_number: booking.booking_number,
      starts_at: new Date(booking.starts_at).toISOString(),
      ends_at: new Date(booking.ends_at).toISOString(),
      refund_fils: String(decision.refundFils),
      forfeit_fils: String(decision.forfeitFils),
      action: decision.action,
    };
    const data = {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      vendorId: booking.vendor_id,
      startsAt: new Date(booking.starts_at).toISOString(),
      endsAt: new Date(booking.ends_at).toISOString(),
      serviceName: booking.service_name,
      withinWindow: decision.withinWindow,
      refundFils: decision.refundFils,
      forfeitFils: decision.forfeitFils,
      action: decision.action,
    };

    try {
      await this.notificationQueue.add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_cancelled,
        variables,
        data,
      });
    } catch (err) {
      console.warn(`[cancel] failed to emit customer booking_cancelled for ${booking.id}`, err);
    }

    if (!this.vendorOwnerLookup) return;
    try {
      const vendorUserId = await this.vendorOwnerLookup.findOwnerUserId(booking.vendor_id);
      if (!vendorUserId) return;
      await this.notificationQueue.add("notification-event", {
        userId: vendorUserId,
        notificationType: NotificationType.vendor_booking_cancelled,
        variables,
        data: { ...data, customerUserId: booking.customer_user_id },
      });
    } catch (err) {
      console.warn(
        `[cancel] failed to emit vendor vendor_booking_cancelled for ${booking.id}`,
        err,
      );
    }
  }
}
