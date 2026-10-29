import crypto from "node:crypto";
import {
  AppDataSource,
  ReelCommission,
  ReelCommissionStatus,
  SiteSetting,
} from "@materialhub/database";
import { type EntityManager, In } from "typeorm";
import type { CreatorWalletService } from "./creator-wallet.service.ts";

/**
 * Stripe Connect payout handoff. The production adapter lives (or will
 * live) alongside vendor-service's existing Stripe Connect plumbing; this
 * interface is the narrow seam the reels service depends on so we don't
 * duplicate real Stripe API calls here. For M3 the production binding is
 * {@link NoopStripePayoutInitiator}; real wiring is deferred to M4.
 */
export interface StripePayoutInitiator {
  initiate(input: {
    userId: string;
    amountFils: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ externalRef: string }>;
}

export interface RequestPayoutResult {
  amountFils: number;
  status: "queued";
  externalRef: string;
}

const THRESHOLD_SETTING_KEY = "reels_payout_threshold_fils";
/** AED 200 in fils. Used when the site_settings row is missing or invalid. */
const DEFAULT_THRESHOLD_FILS = 20000;

/**
 * Cash-payout orchestrator for creator earnings.
 *
 * When a creator requests payout the service:
 *   1. Reads the threshold from `site_settings` (default 20000 fils / AED 200).
 *   2. Performs a cheap pre-flight balance read to short-circuit if the
 *      creator is clearly below threshold (avoids opening a DB transaction).
 *   3. Inside a single DB transaction:
 *        - SELECTs the creator's `earned` reel_commissions FOR UPDATE,
 *          which is the authoritative set to pay out. The sum of their
 *          `gross_commission_fils` is the payout amount — there is no
 *          separate "balance" read that could go stale relative to the
 *          set of commissions being flipped.
 *        - Re-checks the sum against the threshold (authoritative check).
 *        - Flips those specific commission rows by id to `paid_out`.
 *        - Debits the wallet (ledger row + `user.wallet_balance`) via
 *          CreatorWalletService, sharing the same EntityManager.
 *        - Hands off to the injected Stripe initiator.
 *
 * Why per-row id-based update: the previous implementation updated by
 * `{creator_id, status: earned}`, which races with the
 * `transitionEligibleToEarned` cron. If a new commission flipped to
 * `earned` between the balance read and the payout update, it would be
 * marked `paid_out` but the wallet debit (based on the stale balance)
 * wouldn't cover it. Loading the exact id set inside the transaction
 * closes the race.
 *
 * The Stripe call is deliberately inside the transaction for M3 because the
 * production binding is a noop ({@link NoopStripePayoutInitiator}); once M4
 * wires a real Stripe transfer we must move the initiator call outside the
 * transaction so a failed API call doesn't roll back the DB state after the
 * money has already moved.
 */
export class PayoutService {
  constructor(
    private readonly wallet: CreatorWalletService,
    private readonly stripe: StripePayoutInitiator,
  ) {}

  /**
   * Reads `site_settings.reels_payout_threshold_fils`, falling back to
   * {@link DEFAULT_THRESHOLD_FILS} if the row is missing or non-numeric.
   * Matches the AttributionService default-handling pattern.
   */
  async getThresholdFils(): Promise<number> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({
      where: { key: THRESHOLD_SETTING_KEY },
    });
    const raw = row?.value ?? "";
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD_FILS;
  }

  async requestPayout(creatorId: string): Promise<RequestPayoutResult> {
    const threshold = await this.getThresholdFils();
    // Quick short-circuit so we don't open a DB transaction for a creator
    // who is clearly below threshold. The authoritative check runs inside
    // the transaction below against the locked commission rows.
    const quickBalance = await this.wallet.getBalance(creatorId);
    if (quickBalance < threshold) {
      throw new Error(`payout_below_threshold:${threshold}`);
    }

    return AppDataSource.transaction(async (manager) => {
      const commissionRepo = manager.getRepository(ReelCommission);

      // Lock the exact set of earned commissions we're about to pay out.
      // Using `pessimistic_write` prevents a parallel payout request for
      // the same creator from grabbing the same rows; the second request
      // will wait, then see the rows in `paid_out` state and fail the
      // inner threshold check.
      const earned = await commissionRepo
        .createQueryBuilder("rc")
        .where("rc.creator_id = :creatorId", { creatorId })
        .andWhere("rc.status = :status", { status: ReelCommissionStatus.earned })
        .setLock("pessimistic_write")
        .getMany();

      const amountFils = earned.reduce((sum, row) => sum + Number(row.gross_commission_fils), 0);

      if (amountFils < threshold) {
        throw new Error(`payout_below_threshold:${threshold}`);
      }

      return this.executePayout(manager, creatorId, amountFils, earned);
    });
  }

  /**
   * Internal — exposed (not private) so unit tests can drive it with a fake
   * EntityManager without having to mock `AppDataSource.transaction`. Must
   * run inside a DB transaction: callers are responsible for that; see
   * {@link requestPayout}.
   *
   * `earned` is the exact set of commissions to flip to `paid_out`; callers
   * must load it under a pessimistic write lock so no concurrent writer can
   * mutate these rows between the load and this update. The `amountFils`
   * parameter must equal the sum of `earned[].gross_commission_fils` — it's
   * kept as a separate parameter only so tests and future callers don't have
   * to re-sum.
   */
  async executePayout(
    manager: EntityManager,
    creatorId: string,
    amountFils: number,
    earned: ReelCommission[],
  ): Promise<RequestPayoutResult> {
    const payoutId = crypto.randomUUID();

    // 1. Flip the exact set of commissions we loaded under lock, not all
    //    `earned`-status rows for this creator. Any commission that
    //    transitions to `earned` after our lock acquisition is intentionally
    //    left untouched; it becomes part of the NEXT payout.
    if (earned.length > 0) {
      await manager
        .getRepository(ReelCommission)
        .update({ id: In(earned.map((c) => c.id)) }, { status: ReelCommissionStatus.paid_out });
    }

    // 2. Debit the wallet in the same transaction. CreatorWalletService
    //    takes the pessimistic write lock on the user row and writes a
    //    negative ledger entry atomically with the balance update.
    await this.wallet.debit({
      userId: creatorId,
      amount: amountFils,
      transactionType: "reels_payout_debit",
      referenceType: "reels_payout",
      referenceId: payoutId,
      manager,
    });

    // 3. Stripe Connect handoff.
    // M4 TODO: move this outside the transaction once real Stripe wiring
    // lands. For now the noop adapter makes it safe to keep inside — no
    // real money moves, so a rollback here has no external side-effect.
    const { externalRef } = await this.stripe.initiate({
      userId: creatorId,
      amountFils,
      currency: "AED",
      idempotencyKey: payoutId,
    });

    return { amountFils, status: "queued", externalRef };
  }
}

/**
 * M3 production binding for {@link StripePayoutInitiator}. Does NOT make a
 * real Stripe API call — just returns a synthetic external ref so the
 * wallet ledger and commission rows carry a non-empty reference. Real
 * Stripe Connect wiring (transfers.create on the creator's connected
 * account) lands in M4.
 */
export class NoopStripePayoutInitiator implements StripePayoutInitiator {
  async initiate(input: {
    userId: string;
    amountFils: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ externalRef: string }> {
    // eslint-disable-next-line no-console
    console.log("[payout] stripe initiator (noop)", input);
    return { externalRef: `stub_${input.idempotencyKey}` };
  }
}
