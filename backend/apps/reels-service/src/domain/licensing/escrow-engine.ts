import crypto from "node:crypto";
import {
  type ReelLicenseEscrowHold as Hold,
  ReelLicenseEscrowHold,
  type ReelLicenseFundingSource,
  ReelLicenseGrant,
  ReelLicenseHoldStatus,
  type ReelLicenseRightsScope,
} from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
import type { EntityManager } from "typeorm";
import type { CreatorWalletService } from "../commerce/creator-wallet.service.ts";
import type { FundingRail } from "./funding-rail.ts";

/**
 * A hold/grant links to EXACTLY ONE of a license offer, a brief bid, or a collab
 * application (enforced by the DB CHECK `num_nonnulls(...) = 1`).
 *
 * The `?: undefined` markers on each arm are load-bearing: they make this a
 * discriminated union, so adding an arm turns every incomplete `switch` below
 * into a compile error rather than a silent fallthrough.
 */
export type DealLink =
  | { offerId: string; bidId?: undefined; collabApplicationId?: undefined }
  | { offerId?: undefined; bidId: string; collabApplicationId?: undefined }
  | { offerId?: undefined; bidId?: undefined; collabApplicationId: string };

interface LinkColumns {
  offer_id: string | null;
  bid_id: string | null;
  collab_application_id: string | null;
}

function linkColumns(link: DealLink): LinkColumns {
  if (link.offerId !== undefined) {
    return { offer_id: link.offerId, bid_id: null, collab_application_id: null };
  }
  if (link.bidId !== undefined) {
    return { offer_id: null, bid_id: link.bidId, collab_application_id: null };
  }
  return { offer_id: null, bid_id: null, collab_application_id: link.collabApplicationId };
}

function linkWhere(
  link: DealLink,
): { offer_id: string } | { bid_id: string } | { collab_application_id: string } {
  if (link.offerId !== undefined) return { offer_id: link.offerId };
  if (link.bidId !== undefined) return { bid_id: link.bidId };
  return { collab_application_id: link.collabApplicationId };
}

export interface PlaceHoldInput {
  vendorId: string;
  fundingSource: ReelLicenseFundingSource;
  amountFils: number;
  link: DealLink;
  paymentMethodId?: string;
}

/**
 * Capture that settles straight to the creator wallet with NO license grant.
 *
 * An event appearance produces no reel, so there is nothing to grant rights
 * over — but the vendor's escrowed fee still has to reach the creator. Same fee
 * split, same hold bookkeeping, same "irreversible rail call goes last"
 * ordering as captureAndComplete; only the grant is absent.
 */
export interface CaptureToWalletInput {
  link: DealLink;
  creatorId: string;
  amountFils: number;
  hold: Hold;
  feeRate: number;
  /** Ledger classification, e.g. "collab_appearance_credit". */
  transactionType: string;
  referenceType: string;
  referenceId: string;
  description?: string;
  /** Status updates + audit events that MUST run before the irreversible capture. */
  beforeCapture?: (manager: EntityManager) => Promise<void>;
}

export interface CaptureInput {
  link: DealLink;
  vendorId: string;
  creatorId: string;
  reelId: string;
  scope: ReelLicenseRightsScope;
  amountFils: number;
  hold: Hold;
  feeRate: number;
  /** Status updates + audit events that MUST run before the irreversible rail capture. */
  beforeCapture?: (manager: EntityManager, grant: ReelLicenseGrant) => Promise<void>;
}

/**
 * Shared escrow primitives for both license offers (2a/2b) and brief bids (3a). The irreversible
 * rail op is always LAST: placeHold's rail.hold is the last line; captureAndComplete's rail.capture
 * runs after `beforeCapture`. Callers own their own status/audit writes via beforeCapture.
 */
export class EscrowEngine {
  constructor(
    private readonly rails: Record<ReelLicenseFundingSource, FundingRail>,
    private readonly wallet: CreatorWalletService,
  ) {}

  async placeHold(manager: EntityManager, input: PlaceHoldInput): Promise<Hold> {
    const rail = this.rails[input.fundingSource];
    if (!rail) throw new BadRequestError("unknown_funding_source");
    const idempotencyKey = crypto.randomUUID();
    const holdResult = await rail.hold({
      vendorId: input.vendorId,
      amountFils: input.amountFils,
      idempotencyKey,
      paymentMethodId: input.paymentMethodId,
      manager,
    });
    const holdRepo = manager.getRepository(ReelLicenseEscrowHold);
    return holdRepo.save(
      holdRepo.create({
        ...linkColumns(input.link),
        vendor_id: input.vendorId,
        funding_source: holdResult.funding_source,
        amount_fils: String(holdResult.amount_fils),
        status: ReelLicenseHoldStatus.held,
        stripe_payment_intent_id: holdResult.stripe_payment_intent_id ?? null,
        idempotency_key: holdResult.idempotency_key,
      }),
    );
  }

  async releaseActiveHold(manager: EntityManager, link: DealLink): Promise<boolean> {
    const holdRepo = manager.getRepository(ReelLicenseEscrowHold);
    const hold = await holdRepo.findOne({
      where: { ...linkWhere(link), status: ReelLicenseHoldStatus.held },
    });
    if (!hold) return false;
    await this.rails[hold.funding_source].release({
      holdId: hold.id,
      stripePaymentIntentId: hold.stripe_payment_intent_id,
      manager,
    });
    await holdRepo.update(
      { id: hold.id },
      { status: ReelLicenseHoldStatus.released, released_at: new Date() },
    );
    return true;
  }

  /**
   * Settle an escrowed amount to the creator wallet without producing a grant.
   * Used by collab types that deliver no reel (spec §7.6 event appearances).
   */
  async captureToWallet(
    manager: EntityManager,
    input: CaptureToWalletInput,
  ): Promise<{ net: number; fee: number; walletTransactionId: string }> {
    const gross = input.amountFils;
    const fee = Math.round(gross * input.feeRate);
    const net = gross - fee;

    const tx = await this.wallet.credit({
      userId: input.creatorId,
      amount: net,
      transactionType: input.transactionType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      manager,
    });
    await manager
      .getRepository(ReelLicenseEscrowHold)
      .update(
        { id: input.hold.id },
        { status: ReelLicenseHoldStatus.captured, captured_at: new Date() },
      );
    if (input.beforeCapture) await input.beforeCapture(manager);
    // Capture via rail LAST (irreversible external call) — same ordering rule as
    // captureAndComplete.
    await this.rails[input.hold.funding_source].capture({
      holdId: input.hold.id,
      stripePaymentIntentId: input.hold.stripe_payment_intent_id,
      amountFils: gross,
      manager,
    });
    return { net, fee, walletTransactionId: tx.id };
  }

  async captureAndComplete(manager: EntityManager, input: CaptureInput): Promise<ReelLicenseGrant> {
    const gross = input.amountFils;
    const fee = Math.round(gross * input.feeRate);
    const net = gross - fee;

    const grantRepo = manager.getRepository(ReelLicenseGrant);
    const grant = await grantRepo.save(
      grantRepo.create({
        ...linkColumns(input.link),
        reel_id: input.reelId,
        vendor_id: input.vendorId,
        creator_id: input.creatorId,
        scope: input.scope,
        gross_fils: String(gross),
        platform_fee_fils: String(fee),
        creator_net_fils: String(net),
        fee_rate_snapshot: input.feeRate.toFixed(4),
        terms_snapshot: { scope: input.scope },
      }),
    );
    const tx = await this.wallet.credit({
      userId: input.creatorId,
      amount: net,
      transactionType: "reels_license_credit",
      referenceType: "reels_license_grant",
      referenceId: grant.id,
      description: `License of reel ${input.reelId}`,
      manager,
    });
    await grantRepo.update({ id: grant.id }, { wallet_transaction_id: tx.id });
    await manager
      .getRepository(ReelLicenseEscrowHold)
      .update(
        { id: input.hold.id },
        { status: ReelLicenseHoldStatus.captured, captured_at: new Date() },
      );
    if (input.beforeCapture) await input.beforeCapture(manager, grant);
    // Capture via rail LAST (irreversible external call).
    await this.rails[input.hold.funding_source].capture({
      holdId: input.hold.id,
      stripePaymentIntentId: input.hold.stripe_payment_intent_id,
      amountFils: gross,
      manager,
    });
    return { ...grant, wallet_transaction_id: tx.id };
  }
}
