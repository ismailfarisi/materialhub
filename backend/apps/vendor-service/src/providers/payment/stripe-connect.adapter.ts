import Stripe from "stripe";
import type {
  AccountStatus,
  PaymentProviderAdapter,
  WebhookResult,
} from "./payment-provider.interface.ts";

export class StripeConnectAdapter implements PaymentProviderAdapter {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createConnectedAccount(vendor: {
    id: string;
    business_email: string;
    business_name: string;
    country: string;
  }): Promise<{ providerId: string }> {
    const account = await this.stripe.accounts.create({
      type: "express",
      email: vendor.business_email,
      business_profile: { name: vendor.business_name },
      country: vendor.country || "AE",
      metadata: { vendor_id: vendor.id },
    });
    return { providerId: account.id };
  }

  async generateOnboardingUrl(
    providerId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: providerId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return link.url;
  }

  async getAccountStatus(providerId: string): Promise<AccountStatus> {
    const account = await this.stripe.accounts.retrieve(providerId);
    return {
      providerId: account.id,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    };
  }

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookResult> {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

    if (event.type !== "account.updated") {
      return {
        eventType: event.type,
        accountId: "",
        status: {
          providerId: "",
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
        },
      };
    }

    const account = event.data.object as Stripe.Account;
    return {
      eventType: event.type,
      accountId: account.id,
      status: {
        providerId: account.id,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
      },
    };
  }
}
