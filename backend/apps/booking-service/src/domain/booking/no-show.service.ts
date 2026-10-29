// no-show.service.ts
//
// Phase 5 Task 5 (spec §5.3 "no_show (admin) --> forfeit per policy"). A vendor/
// location-admin/platform-admin marks a confirmed booking as a no-show; the
// customer forfeits per the SNAPSHOTTED policy (via the pure computeNoShow) and
// the derived per-vendor strike count (StrikeService) ticks up — feeding the
// pay_at_venue gate. Separate file mirroring cancel.service.ts — one
// responsibility per file (the brief: "do not fold no-show into cancel").
//
// ── Window rule (HARD, spec §5.3 + Task 5b) ──────────────────────────────────
// No-show is markable ONLY between `starts_at` and the auto-complete moment
// (`ends_at + graceHours`, the EXACT fire-time computeAutoCompleteFireTime uses):
//   - before starts_at            -> 422 (the appointment hasn't happened yet)
//   - at/after ends_at + grace    -> 422 (the booking is/should be auto-completed
//                                    and immutable except by support)
// Bounds are checked BEFORE any money moves; the `confirmed -> no_show` edge in
// BookingStatusService.ALLOWED_TRANSITIONS is the state-machine backstop (an
// already-terminal booking 422s there regardless).
//
// ── Money basis / ordering (MIRRORS cancel.service.ts) ───────────────────────
// The recoverable/held amount per payment_mode comes from deriveRecoverableAmount
// (booking-money.ts) — NOT amount_paid_fils, which is never written back. The
// slot is NOT freed on no_show (its time has already passed — BookingStatusService
// leaves the engagement untouched for the no_show edge, verified), so unlike
// cancel there is no in-window/actor-bypass path: a no-show ALWAYS applies the
// per-policy forfeit computeNoShow returns. Money movement is strictly
// best-effort and runs AFTER the transition, so a gateway failure never
// un-marks the no-show (an uncaptured authorization auto-expires at Stripe in
// ~7 days — the same safety property cancel/the reaper rely on).
import {
  type Booking,
  BookingStatus,
  NotificationType,
  type Payment,
  ServicePaymentMode,
} from "@materialhub/database";
import { ForbiddenError, HttpError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { computeAutoCompleteFireTime } from "./booking-autocomplete.service.ts";
import { deriveRecoverableAmount, resolveAuthPi } from "./booking-money.ts";
import type {
  BookingPaymentCaptureInput,
  BookingPaymentCaptureResult,
  BookingPaymentRefundInput,
  BookingPaymentRefundResult,
  BookingPaymentVoidInput,
  BookingPaymentVoidResult,
} from "./booking-payment.client.ts";
import { computeNoShow } from "./booking-policy.ts";
import {
  type BookingActor,
  type BookingStatusService,
  InvalidBookingTransitionError,
} from "./booking-status.service.ts";

// Narrow DI seam (mirrors cancel.service.ts's CancelPaymentClient) — this file
// never imports the concrete BookingPaymentClient; it only needs void/capture/
// refund.
export interface NoShowPaymentClient {
  void(input: BookingPaymentVoidInput): Promise<BookingPaymentVoidResult>;
  capture(input: BookingPaymentCaptureInput): Promise<BookingPaymentCaptureResult>;
  refund(input: BookingPaymentRefundInput): Promise<BookingPaymentRefundResult>;
}
export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}

export interface MarkNoShowInput {
  // Optional marker-supplied note, appended to the audit reason.
  reason?: string | null;
  // Edge-stamped "now" for testability (mirrors CancelInput.now).
  now?: Date;
}

// The money action actually taken against the gateway (recorded in the audit
// note + returned for the API response / tests). Same shape as cancel's.
export type NoShowMoneyAction =
  | "none" // pay_at_venue / prepay never authorized / full-forfeit deposit (nothing to move)
  | "void" // prepay authorized, `full` policy (no penalty) — release the hold
  | "partial_capture" // prepay authorized, penalty kept, remainder auto-releases
  | "refund"; // deposit — keep the penalty, refund the remainder

export interface MarkNoShowResult {
  booking: Booking;
  forfeitFils: number;
  refundFils: number;
  action: NoShowMoneyAction;
  policy: string;
}

// A dedicated 422 for the window rule (before starts_at / after the
// auto-complete moment), distinct from the state-machine's
// invalid_booking_transition so the wire code is a greppable `no_show_window`.
export class NoShowWindowError extends HttpError {
  constructor(message: string) {
    super(422, message, "no_show_window");
  }
}

interface MoneyDecision {
  forfeitFils: number;
  refundFils: number;
  action: NoShowMoneyAction;
  policy: string;
}

export class NoShowService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly paymentRepo: Repository<Payment>,
    private readonly statusService: BookingStatusService,
    private readonly paymentClient: NoShowPaymentClient,
    private readonly notificationQueue: NotificationEventQueueLike,
    private readonly graceHours: number,
    private readonly appBaseUrl: string,
  ) {}

  /**
   * Mark `bookingId` as a no-show. Marking actor MUST be non-customer
   * (vendor/location-admin/platform-admin — the route's requireRole is the
   * primary gate; this Forbidden throw is defence-in-depth). Loads by id only
   * (no customer-ownership scoping — the caller is staff, not the booking's
   * customer).
   */
  async markNoShow(
    bookingId: string,
    actor: BookingActor,
    input: MarkNoShowInput = {},
  ): Promise<MarkNoShowResult> {
    const now = input.now ?? new Date();

    if (actor.role === "customer") {
      throw new ForbiddenError("Only vendor/admin staff can mark a booking as a no-show");
    }

    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    // Only a confirmed booking can be no-showed (spec §5.3 — the only source of
    // the confirmed->no_show edge). Fail BEFORE any money moves, reusing the
    // state machine's own error so callers get the same 422.
    if (booking.status !== BookingStatus.confirmed) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.no_show);
    }

    // Window rule — markable ONLY in [starts_at, ends_at + grace).
    const startsAt = new Date(booking.starts_at);
    if (now.getTime() < startsAt.getTime()) {
      throw new NoShowWindowError("Cannot mark no-show before the appointment start time");
    }
    const autoCompleteAt = computeAutoCompleteFireTime(
      { ends_at: new Date(booking.ends_at) },
      this.graceHours,
    );
    if (now.getTime() >= autoCompleteAt.getTime()) {
      throw new NoShowWindowError(
        "Cannot mark no-show after the auto-complete moment (ends_at + grace) — the booking is completed/immutable",
      );
    }

    const decision = this.decideMoney(booking);

    // Record the forfeit in the single status-history row's `reason` (no new
    // columns / migration). The transition leaves the engagement untouched (the
    // slot's time has already elapsed) — verified in BookingStatusService.
    const reason = this.buildReason(actor, decision, input.reason ?? null);
    const updated = await this.statusService.transition(
      bookingId,
      BookingStatus.no_show,
      actor,
      reason,
    );

    // Best-effort money AFTER the transition (mirrors cancel).
    await this.applyMoney(booking, decision);

    // Notification (emission only — Task 8 owns templates).
    await this.emitNotification(updated, decision);

    return {
      booking: updated,
      forfeitFils: decision.forfeitFils,
      refundFils: decision.refundFils,
      action: decision.action,
      policy: decision.policy,
    };
  }

  // Pure decision: run computeNoShow (always applies the per-policy forfeit —
  // a no-show has no "window" of its own) against the mode-correct recoverable
  // amount, then pick the concrete gateway action.
  private decideMoney(booking: Booking): MoneyDecision {
    const { amountPaidFils, isPrepayAuthorized } = deriveRecoverableAmount(booking);

    const { forfeitFils } = computeNoShow({
      policySnapshot: {
        cancellation_window_hours: booking.cancellation_window_hours,
        cancellation_refund_policy: booking.cancellation_refund_policy,
        cancellation_penalty_percent: booking.cancellation_penalty_percent,
      },
      amountPaidFils,
      depositFils: booking.deposit_fils,
    });
    const refundFils = amountPaidFils - forfeitFils;

    return {
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
  ): NoShowMoneyAction {
    if (booking.payment_mode === ServicePaymentMode.pay_at_venue) return "none";
    if (booking.payment_mode === ServicePaymentMode.prepay) {
      if (!isPrepayAuthorized) return "none"; // SetupIntent only — nothing held
      // Penalty kept: capture it (partial), remainder auto-releases. Otherwise
      // (`full` policy, no penalty) void the whole authorization.
      return forfeitFils > 0 ? "partial_capture" : "void";
    }
    // deposit: keep the forfeit; refund the remainder if any (percent policy),
    // else nothing to move (deposit_forfeit keeps the whole deposit).
    return refundFils > 0 ? "refund" : "none";
  }

  // Best-effort gateway movement (never throws into the caller — the booking is
  // already durably no_show; a failure is logged for ops follow-up).
  private async applyMoney(booking: Booking, decision: MoneyDecision): Promise<void> {
    try {
      switch (decision.action) {
        case "none":
          // deposit_forfeit / full-deposit-forfeit: the deposit was captured at
          // booking time and is simply KEPT (nothing to move). pay_at_venue:
          // nothing was ever collected — the money is owed in person and the
          // strike is the marketplace's recourse. prepay-unauthorized: only a
          // SetupIntent exists (no money held).
          return;
        case "void": {
          const pi = await resolveAuthPi(this.paymentRepo, booking, "[no-show]");
          if (!pi) return;
          await this.paymentClient.void({
            bookingId: booking.id,
            paymentIntentId: pi,
            reason: "Booking no-show — no penalty under policy, releasing the prepay authorization",
          });
          return;
        }
        case "partial_capture": {
          const pi = await resolveAuthPi(this.paymentRepo, booking, "[no-show]");
          if (!pi) return;
          // Capture ONLY the forfeit; Stripe auto-releases the remainder of a
          // manual-capture PI when amount_to_capture < authorized.
          await this.paymentClient.capture({
            bookingId: booking.id,
            paymentIntentId: pi,
            amountFils: decision.forfeitFils,
          });
          return;
        }
        case "refund":
          // Deposit remainder refund — RefundService resolves the captured
          // deposit Payment row by booking_id internally and caps at its amount.
          // No free-text `reason` (order-service forwards it to Stripe's refund
          // `reason`, which only accepts an enum). Tagged no_show_reversal.
          await this.paymentClient.refund({
            bookingId: booking.id,
            amountFils: decision.refundFils,
            referenceType: "no_show_reversal",
            referenceId: booking.id,
          });
          return;
      }
    } catch (err) {
      console.error(
        `[no-show] best-effort ${decision.action} failed for booking ${booking.id} (forfeit=${decision.forfeitFils}, refund=${decision.refundFils}) — booking is no_show; any uncaptured authorization auto-expires at Stripe (~7d), a failed refund needs ops follow-up`,
        err,
      );
    }
  }

  private buildReason(
    actor: BookingActor,
    decision: MoneyDecision,
    markerReason: string | null,
  ): string {
    const base =
      `Marked no-show by ${actor.role}; policy=${decision.policy}; ` +
      `forfeit=${decision.forfeitFils} fils, refund=${decision.refundFils} fils; action=${decision.action}`;
    return markerReason ? `${base} — ${markerReason}` : base;
  }

  // spec §5.3 (amended): the booking_no_show notification to the customer must
  // carry the penalty breakdown (forfeit/refund/policy/action) AND a dispute/
  // support deep link. Emission only — Task 8 owns the actual template.
  private async emitNotification(booking: Booking, decision: MoneyDecision): Promise<void> {
    const disputeUrl = `${this.appBaseUrl.replace(/\/$/, "")}/support/bookings/${booking.id}`;
    const variables = {
      service_name: booking.service_name,
      booking_number: booking.booking_number,
      starts_at: new Date(booking.starts_at).toISOString(),
      ends_at: new Date(booking.ends_at).toISOString(),
      policy: decision.policy,
      forfeit_fils: String(decision.forfeitFils),
      refund_fils: String(decision.refundFils),
      dispute_url: disputeUrl,
    };
    const data = {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      vendorId: booking.vendor_id,
      startsAt: new Date(booking.starts_at).toISOString(),
      endsAt: new Date(booking.ends_at).toISOString(),
      serviceName: booking.service_name,
      // Penalty breakdown (spec §5.3 amended).
      penalty: {
        policy: decision.policy,
        forfeitFils: decision.forfeitFils,
        refundFils: decision.refundFils,
        action: decision.action,
      },
      // Dispute/support deep link (spec §5.3 amended).
      disputeUrl,
    };

    try {
      await this.notificationQueue.add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_no_show,
        variables,
        data,
      });
    } catch (err) {
      console.warn(`[no-show] failed to emit customer booking_no_show for ${booking.id}`, err);
    }
  }
}
