// checkout.controller.ts
import type { CheckoutService } from "./checkout.service.ts";
import type { TamaraRedirectUrls } from "./payment.service.ts";
import type { WebhookService } from "./webhook.service.ts";

export class CheckoutController {
  constructor(
    private checkoutService: CheckoutService,
    private webhookService: WebhookService,
  ) {}

  initiateCheckout(userId: string, data: any) {
    return this.checkoutService.initiateCheckout({ userId, ...data });
  }

  applyCoupon(userId: string, orderId: string | undefined, couponCode: string) {
    return this.checkoutService.applyCoupon(userId, orderId, couponCode);
  }

  previewCoupon(userId: string, couponCode: string) {
    return this.checkoutService.previewCoupon(userId, couponCode);
  }

  removeCoupon(userId: string) {
    return this.checkoutService.removeCoupon(userId);
  }

  availableCoupons(userId: string) {
    return this.checkoutService.availableCoupons(userId);
  }

  createPaymentIntent(
    orderId: string,
    userId: string,
    amount: number | undefined,
    paymentMethod: string,
    redirectUrls?: TamaraRedirectUrls,
  ) {
    return this.checkoutService.createPaymentIntent(
      orderId,
      userId,
      amount,
      paymentMethod,
      redirectUrls,
    );
  }

  /** Verifies the Stripe signature over the raw body before processing. */
  handleStripeWebhookRequest(rawBody: string, signature: string | null) {
    return this.webhookService.handleStripeWebhookRequest(rawBody, signature);
  }

  handleTamaraWebhook(tamaraToken: string | null, authorization: string | null, payload: any) {
    return this.webhookService.handleTamaraWebhook(tamaraToken, authorization, payload);
  }

  createBnplSession(
    orderId: string,
    userId: string,
    amount: number | undefined,
    provider: string,
    redirectUrls?: TamaraRedirectUrls,
  ) {
    if (provider === "tabby") {
      return this.checkoutService.createPaymentIntent(orderId, userId, amount, "tabby");
    }
    return this.checkoutService.createPaymentIntent(
      orderId,
      userId,
      amount,
      "tamara",
      redirectUrls,
    );
  }
}
