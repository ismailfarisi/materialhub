import { type Static, Type } from "@sinclair/typebox";

// ─── order-service internal booking-payment endpoints (Phase 4 Task 2) ─────
// Money stays in order-service (spec §3); booking-service calls these via the
// internalServiceAuth JWT mechanism (iss=booking-service). Every body carries
// `booking_id` so order-service can stamp `payments.booking_id` (order_id
// stays null — chk_payments_order_or_booking) and Stripe metadata carries it
// too, so webhooks (Task 3) can route back to the right booking.

const UuidString = Type.String({ format: "uuid" });

// POST /internal/booking-payments/setup — verify + save a card off-session
// (prepay, spec §5.2 step 1). No money moves.
const StripeCustomerAddress = Type.Object({
  line1: Type.Optional(Type.String()),
  city: Type.Optional(Type.String()),
  country: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
});

export const BookingPaymentSetupBody = Type.Object({
  booking_id: UuidString,
  user_id: UuidString,
  email: Type.String({ format: "email" }),
  // Reuse an existing Stripe Customer for this user when the caller already
  // has one (e.g. a repeat booking) instead of minting a new one each time.
  stripe_customer_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  // Only used when minting a NEW Stripe Customer — some Stripe account
  // configurations (cross-border compliance) require name/address on the
  // customer for off-session charges to go through cleanly.
  name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  address: Type.Optional(Type.Union([StripeCustomerAddress, Type.Null()])),
});
export type BookingPaymentSetupBody = Static<typeof BookingPaymentSetupBody>;

// POST /internal/booking-payments/authorize — off-session manual-capture PI
// on the saved card (spec §5.2 step 2, fired by the booking-auth job).
export const BookingPaymentAuthorizeBody = Type.Object({
  booking_id: UuidString,
  user_id: UuidString,
  stripe_customer_id: Type.String(),
  payment_method_id: Type.String(),
  amount_fils: Type.Integer({ minimum: 1 }),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
});
export type BookingPaymentAuthorizeBody = Static<typeof BookingPaymentAuthorizeBody>;

// POST /internal/booking-payments/intent — capture-now PaymentIntent for a
// deposit (spec §5.2, deposit mode). Standard on-session client_secret flow.
export const BookingPaymentIntentBody = Type.Object({
  booking_id: UuidString,
  user_id: UuidString,
  amount_fils: Type.Integer({ minimum: 1 }),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  // Same cross-border compliance need as /setup — Stripe requires a
  // name/address on the PaymentIntent for some account configurations.
  name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  address: Type.Optional(Type.Union([StripeCustomerAddress, Type.Null()])),
});
export type BookingPaymentIntentBody = Static<typeof BookingPaymentIntentBody>;

// POST /internal/booking-payments/capture — capture a manual-capture PI
// (prepay auth on `completed`, spec §5.2 step 3).
export const BookingPaymentCaptureBody = Type.Object({
  booking_id: UuidString,
  payment_intent_id: Type.String(),
  amount_fils: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type BookingPaymentCaptureBody = Static<typeof BookingPaymentCaptureBody>;

// POST /internal/booking-payments/void — cancel an un-captured PI (reaper /
// cancel-before-auth path).
export const BookingPaymentVoidBody = Type.Object({
  booking_id: UuidString,
  payment_intent_id: Type.String(),
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type BookingPaymentVoidBody = Static<typeof BookingPaymentVoidBody>;

// POST /internal/booking-payments/refund — refund a captured booking payment
// (cancellation refund policy, deposit forfeiture reversal, etc).
export const BookingPaymentRefundBody = Type.Object({
  booking_id: UuidString,
  amount_fils: Type.Integer({ minimum: 1 }),
  reference_type: Type.Union([
    Type.Literal("cancellation"),
    Type.Literal("no_show_reversal"),
    Type.Literal("admin_adjustment"),
  ]),
  reference_id: Type.String(),
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type BookingPaymentRefundBody = Static<typeof BookingPaymentRefundBody>;

// POST /internal/booking-payments/complete — booking completion (Phase 4
// Task 9, spec §5.2 step 3 / §5.3 "On completed"): captures the prepay
// authorization (payment_intent_id set) or is a no-op for deposit/
// pay_at_venue (payment_intent_id omitted — deposit was already captured at
// booking time, pay_at_venue is paid in person), then accrues commission
// using the booking's SNAPSHOTTED rate/amount (never re-resolved here).
export const BookingPaymentCompleteBody = Type.Object({
  booking_id: UuidString,
  // Only for prepay — the authorized manual-capture PaymentIntent id
  // (resolved by booking-service from `booking.escrow_hold_id` -> the shared
  // `payments` table it already reads directly, mirroring
  // BookingReaperService/BookingAuthService's existing read pattern).
  payment_intent_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  vendor_id: UuidString,
  commission_rate: Type.Number({ minimum: 0 }),
  commission_fils: Type.Integer({ minimum: 0 }),
  // The booking's snapshotted commission TYPE (review fix — without this,
  // order-service hardcoded "percentage" for every booking-sourced
  // commission row, mislabeling a fixed-rate vendor's fils CAP as a
  // percent). Optional for backward compatibility with any in-flight caller
  // that predates this field; createForBookingInTx falls back to
  // "percentage" when omitted.
  commission_type: Type.Optional(
    Type.Union([Type.Literal("percentage"), Type.Literal("fixed"), Type.Literal("tiered")]),
  ),
  // booking.price_fils (gross, VAT-inclusive) / booking.vat_fils — the same
  // snapshot fields CommissionSnapshotService derived commission_fils from;
  // net-ex-VAT is computed here as price_fils - vat_fils.
  price_fils: Type.Integer({ minimum: 0 }),
  vat_fils: Type.Integer({ minimum: 0 }),
});
export type BookingPaymentCompleteBody = Static<typeof BookingPaymentCompleteBody>;
