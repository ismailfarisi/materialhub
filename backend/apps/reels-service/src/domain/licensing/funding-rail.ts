import type { ReelLicenseFundingSource } from "@materialhub/database";
import type { EntityManager } from "typeorm";

/** Result of placing a hold — persisted onto the escrow-hold row by LicensingService. */
export interface HoldResult {
  funding_source: ReelLicenseFundingSource;
  amount_fils: number;
  stripe_payment_intent_id?: string | null;
  idempotency_key: string;
}

/** Per-offer inputs a rail may need at hold time (e.g. Stripe payment method). */
export interface HoldInput {
  vendorId: string;
  amountFils: number;
  idempotencyKey: string;
  /** Stripe rail only: the PaymentMethod id collected client-side. */
  paymentMethodId?: string;
  manager: EntityManager;
}

/**
 * A funding rail places, captures, and releases an escrow hold of vendor funds.
 * Implementations: PayoutBalanceRail (internal reservation) and StripeChargeRail
 * (manual-capture PaymentIntent). capture()/release() receive the persisted hold row id
 * and the rail-specific reference so they can act idempotently.
 */
export interface FundingRail {
  readonly source: ReelLicenseFundingSource;
  /** Place a hold. Throws BadRequestError if it cannot (e.g. insufficient balance, auth declined). */
  hold(input: HoldInput): Promise<HoldResult>;
  /** Capture a previously-placed hold. `manager` shares the accept transaction. */
  capture(ref: {
    holdId: string;
    stripePaymentIntentId?: string | null;
    amountFils: number;
    manager: EntityManager;
  }): Promise<void>;
  /** Release a previously-placed hold (decline/expiry/cancel). */
  release(ref: {
    holdId: string;
    stripePaymentIntentId?: string | null;
    manager: EntityManager;
  }): Promise<void>;
}
