import { AppDataSource } from "@materialhub/database";
import {
  BookingPaymentAuthorizeBody,
  BookingPaymentCaptureBody,
  BookingPaymentCompleteBody,
  BookingPaymentIntentBody,
  BookingPaymentRefundBody,
  BookingPaymentSetupBody,
  BookingPaymentVoidBody,
} from "@materialhub/dto";
import { internalServiceAuth } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

/**
 * order-service side of the booking payment boundary (spec §3, Phase 4
 * Task 2). booking-service is the only caller (over internalServiceAuth,
 * iss=booking-service) — it owns the booking row + lifecycle, this owns
 * Stripe. Every handler delegates straight to PaymentService/RefundService
 * (both already own paymentRepo + the Stripe client + Payment-row writes);
 * these routes are thin request/response plumbing, matching
 * internal-vendor-orders.routes.ts / internal-shipments.routes.ts.
 */
export const internalBookingPaymentRoutes = new Elysia({ prefix: "/internal/booking-payments" })
  .use(container)
  .use(internalServiceAuth)
  .post(
    "/setup",
    async ({ body, paymentService, set }: any) => {
      const result = await paymentService.createBookingSetupIntent({
        bookingId: body.booking_id,
        userId: body.user_id,
        email: body.email,
        stripeCustomerId: body.stripe_customer_id ?? null,
        name: body.name ?? null,
        address: body.address ?? null,
      });
      set.status = 201;
      return ok(
        {
          payment_id: result.paymentId,
          client_secret: result.clientSecret,
          setup_intent_id: result.setupIntentId,
          stripe_customer_id: result.customerId,
        },
        201,
      );
    },
    { body: BookingPaymentSetupBody },
  )
  .post(
    "/authorize",
    async ({ body, paymentService }: any) => {
      const result = await paymentService.createBookingOffSessionAuthorization({
        bookingId: body.booking_id,
        userId: body.user_id,
        stripeCustomerId: body.stripe_customer_id,
        paymentMethodId: body.payment_method_id,
        amountFils: body.amount_fils,
        currency: body.currency,
      });
      return ok({
        payment_id: result.paymentId,
        payment_intent_id: result.paymentIntentId,
        status: result.status,
        failure_reason: result.failureReason,
      });
    },
    { body: BookingPaymentAuthorizeBody },
  )
  .post(
    "/intent",
    async ({ body, paymentService, set }: any) => {
      const result = await paymentService.createBookingDepositIntent({
        bookingId: body.booking_id,
        userId: body.user_id,
        amountFils: body.amount_fils,
        currency: body.currency,
        customerName: body.name ?? null,
        customerAddress: body.address ?? null,
      });
      set.status = 201;
      return ok(
        {
          payment_id: result.paymentId,
          client_secret: result.clientSecret,
          payment_intent_id: result.paymentIntentId,
        },
        201,
      );
    },
    { body: BookingPaymentIntentBody },
  )
  .post(
    "/capture",
    async ({ body, paymentService }: any) => {
      const result = await paymentService.captureBookingPayment({
        bookingId: body.booking_id,
        paymentIntentId: body.payment_intent_id,
        amountFils: body.amount_fils,
      });
      return ok({ payment_intent_id: result.paymentIntentId, status: result.status });
    },
    { body: BookingPaymentCaptureBody },
  )
  .post(
    "/void",
    async ({ body, paymentService }: any) => {
      const result = await paymentService.voidBookingPayment({
        bookingId: body.booking_id,
        paymentIntentId: body.payment_intent_id,
        reason: body.reason,
      });
      return ok({ payment_intent_id: result.paymentIntentId, status: result.status });
    },
    { body: BookingPaymentVoidBody },
  )
  .post(
    "/refund",
    async ({ body, refundService }: any) => {
      const result = await refundService.refundBookingPayment({
        bookingId: body.booking_id,
        amount: body.amount_fils,
        referenceType: body.reference_type,
        referenceId: body.reference_id,
        reason: body.reason ?? undefined,
      });
      return ok({
        gateway: result.gateway,
        gateway_refund_id: result.gatewayRefundId,
        amount_fils: result.amount,
      });
    },
    { body: BookingPaymentRefundBody },
  )
  .post(
    "/complete",
    // Phase 4 Task 9 (spec §5.2 step 3 / §5.3 "On completed"). The Stripe
    // capture call (when payment_intent_id is present, i.e. prepay) runs
    // OUTSIDE the DB transaction — see PaymentService
    // .captureBookingPaymentStripeOnly's comment — then the payment-row
    // status update and the commission insert commit together in ONE
    // transaction. Idempotent end-to-end: a retried call with an
    // already-captured PI skips the Stripe capture, and
    // CommissionService.createForBookingInTx skips the insert if a
    // commission row already exists for this booking_id.
    //
    // No booking-completion timestamp is on the wire here (booking-service
    // calls this synchronously off its own completion transition — see
    // BookingPaymentCompleteBody's header comment — but doesn't pass a
    // timestamp), so createForBookingInTx stamps the settlement clock
    // (`settle_after`) from server "now" at insert time (C3 fix) — this
    // call happening synchronously at completion makes "now" the correct
    // proxy for "booking completed at".
    async ({ body, paymentService, commissionService }: any) => {
      const paymentIntentId: string | null = body.payment_intent_id ?? null;
      let captured = false;
      let paymentStatus: string | null = null;

      if (paymentIntentId) {
        const captureResult = await paymentService.captureBookingPaymentStripeOnly({
          bookingId: body.booking_id,
          paymentIntentId,
        });
        captured = !captureResult.alreadyCaptured;
        paymentStatus = captureResult.status;
      }

      const { commission, created } = await AppDataSource.transaction(async (manager: any) => {
        if (paymentIntentId && captured) {
          await paymentService.markBookingPaymentCapturedInTx(manager, {
            bookingId: body.booking_id,
            paymentIntentId,
          });
        }
        return commissionService.createForBookingInTx(manager, {
          bookingId: body.booking_id,
          vendorId: body.vendor_id,
          commissionRate: body.commission_rate,
          commissionAmountFils: body.commission_fils,
          commissionType: body.commission_type,
          itemTotalFils: body.price_fils,
          netExVatFils: body.price_fils - body.vat_fils,
        });
      });

      return ok({
        captured,
        payment_intent_id: paymentIntentId,
        payment_status: paymentStatus,
        commission_id: commission.id,
        commission_created: created,
      });
    },
    { body: BookingPaymentCompleteBody },
  );
