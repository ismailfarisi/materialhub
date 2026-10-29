import { ReelLicenseFundingSource } from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
import type { FundingRail, HoldInput, HoldResult } from "./funding-rail.ts";

/**
 * Narrow seam over Stripe so tests can inject a fake (mirrors NoopStripePayoutInitiator).
 * Manual-capture PaymentIntent = native escrow: authorize at hold, capture on accept,
 * cancel on release. Card auths last ~7d, matching the offer TTL.
 */
export interface ChargeGateway {
  authorize(input: {
    amountFils: number;
    currency: string;
    paymentMethodId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ paymentIntentId: string; status: "requires_capture" | "requires_action" }>;
  capture(input: { paymentIntentId: string }): Promise<void>;
  cancel(input: { paymentIntentId: string }): Promise<void>;
}

export class StripeChargeRail implements FundingRail {
  readonly source = ReelLicenseFundingSource.stripe;
  constructor(private readonly gateway: ChargeGateway) {}

  async hold(input: HoldInput): Promise<HoldResult> {
    if (!input.paymentMethodId) throw new BadRequestError("payment_method_required");
    const res = await this.gateway.authorize({
      amountFils: input.amountFils,
      currency: "aed",
      paymentMethodId: input.paymentMethodId,
      idempotencyKey: input.idempotencyKey,
      metadata: { vendor_id: input.vendorId, purpose: "reel_license_escrow" },
    });
    if (res.status !== "requires_capture") {
      // 3DS/SCA or a decline — do not create an active offer; client must retry.
      throw new BadRequestError(`card_authorization_failed:${res.status}`);
    }
    return {
      funding_source: this.source,
      amount_fils: input.amountFils,
      stripe_payment_intent_id: res.paymentIntentId,
      idempotency_key: input.idempotencyKey,
    };
  }

  async capture(ref: { stripePaymentIntentId?: string | null }): Promise<void> {
    if (ref.stripePaymentIntentId)
      await this.gateway.capture({ paymentIntentId: ref.stripePaymentIntentId });
  }
  async release(ref: { stripePaymentIntentId?: string | null }): Promise<void> {
    if (ref.stripePaymentIntentId)
      await this.gateway.cancel({ paymentIntentId: ref.stripePaymentIntentId });
  }
}

/** Real Stripe binding. apiVersion + secret match order-service/container.ts. */
export class StripeChargeGateway implements ChargeGateway {
  // biome-ignore lint/suspicious/noExplicitAny: Stripe is dynamically imported to avoid a hard dep when unconfigured.
  constructor(private readonly stripe: any) {}
  async authorize(input: {
    amountFils: number;
    currency: string;
    paymentMethodId: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ paymentIntentId: string; status: "requires_capture" | "requires_action" }> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: input.amountFils,
        currency: input.currency,
        capture_method: "manual",
        confirm: true,
        payment_method: input.paymentMethodId,
        metadata: input.metadata,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      paymentIntentId: pi.id,
      status: pi.status === "requires_capture" ? "requires_capture" : "requires_action",
    };
  }
  async capture(input: { paymentIntentId: string }) {
    await this.stripe.paymentIntents.capture(input.paymentIntentId);
  }
  async cancel(input: { paymentIntentId: string }) {
    await this.stripe.paymentIntents.cancel(input.paymentIntentId);
  }
}

/** Test double — deterministic, no network. Used by the integration test. */
export class FakeChargeGateway implements ChargeGateway {
  public authorizations: string[] = [];
  public captures: string[] = [];
  public cancels: string[] = [];
  public nextStatus: "requires_capture" | "requires_action" = "requires_capture";
  async authorize(input: { idempotencyKey: string }) {
    const id = `pi_fake_${input.idempotencyKey}`;
    this.authorizations.push(id);
    return { paymentIntentId: id, status: this.nextStatus };
  }
  async capture(input: { paymentIntentId: string }) {
    this.captures.push(input.paymentIntentId);
  }
  async cancel(input: { paymentIntentId: string }) {
    this.cancels.push(input.paymentIntentId);
  }
}
