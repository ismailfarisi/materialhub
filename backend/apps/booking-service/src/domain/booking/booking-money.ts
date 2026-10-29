// booking-money.ts
//
// Small shared money helpers for the confirmed-booking terminal flows that move
// money per the SNAPSHOTTED policy (cancel.service.ts, no-show.service.ts). Both
// are siblings in domain/booking/ and derive "how much was actually taken/held"
// and "which Stripe PaymentIntent backs the authorization" identically — this
// module is the one place that logic lives so the two services can't drift.
//
// Deliberately NOT folded into either service (the brief: "do not fold no-show
// into cancel"): each service owns its own window/policy DECISION and its own
// gateway ACTION switch (the reference_type + the semantics differ — an
// out-of-window cancel VOIDs a zero-forfeit prepay hold, a no-show has no window
// at all). This module only shares the two mechanical, side-effect-light bits.
import { type Booking, type Payment, ServicePaymentMode } from "@materialhub/database";
import type { Repository } from "typeorm";

// The recoverable/held amount per payment_mode, derived from the booking's
// snapshot columns — NOT from `amount_paid_fils`, which is never written back
// after creation (defaults to 0, no confirm/deposit-capture path updates it),
// so it can't be the basis for refund/forfeit math. See cancel.service.ts's
// header for the full rationale.
//   - deposit:             deposit_fils   (captured at booking time)
//   - prepay (authorized): price_fils - amount_paid_fils  (the off-session
//                          manual-capture authorization hold on escrow_hold_id)
//   - prepay (unauthorized) / pay_at_venue: 0 (nothing taken or held)
export interface RecoverableAmount {
  amountPaidFils: number;
  isPrepayAuthorized: boolean;
}

export function deriveRecoverableAmount(booking: Booking): RecoverableAmount {
  const isPrepayAuthorized =
    booking.payment_mode === ServicePaymentMode.prepay && !!booking.escrow_hold_id;

  let amountPaidFils = 0;
  if (booking.payment_mode === ServicePaymentMode.deposit) {
    amountPaidFils = booking.deposit_fils;
  } else if (isPrepayAuthorized) {
    amountPaidFils = Math.max(booking.price_fils - booking.amount_paid_fils, 0);
  }

  return { amountPaidFils, isPrepayAuthorized };
}

// Resolve the authorization Payment ROW id (escrow_hold_id) to the Stripe
// PaymentIntent id the void/capture endpoints need — scoped by booking_id
// (defence-in-depth), mirroring BookingCompletionService.onCompleted. Returns
// null (and logs) when there's no hold / no gateway id, so callers skip the
// gateway call gracefully rather than throwing.
export async function resolveAuthPi(
  paymentRepo: Repository<Payment>,
  booking: Booking,
  logPrefix: string,
): Promise<string | null> {
  if (!booking.escrow_hold_id) return null;
  const payment = await paymentRepo.findOne({
    where: { id: booking.escrow_hold_id, booking_id: booking.id } as never,
  });
  const pi = payment?.gateway_payment_id ?? null;
  if (!pi) {
    console.warn(
      `${logPrefix} booking ${booking.id} escrow_hold_id ${booking.escrow_hold_id} has no gateway_payment_id — cannot void/capture the authorization`,
    );
  }
  return pi;
}
