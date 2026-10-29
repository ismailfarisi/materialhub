import crypto from "node:crypto";
import {
  AffiliateCommission,
  AffiliateCommissionStatus,
  AppDataSource,
  SiteSetting,
} from "@materialhub/database";
import { type EntityManager, In } from "typeorm";
import type { AffiliateWalletService } from "./affiliate-wallet.service.ts";

export interface AffiliatePayoutInitiator {
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

const THRESHOLD_SETTING_KEY = "affiliate_payout_threshold_fils";
const DEFAULT_THRESHOLD_FILS = 20000; // AED 200

export class AffiliatePayoutService {
  constructor(
    private readonly wallet: AffiliateWalletService,
    private readonly initiator: AffiliatePayoutInitiator,
  ) {}

  async getThresholdFils(): Promise<number> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({
      where: { key: THRESHOLD_SETTING_KEY },
    });
    const parsed = Number.parseInt(row?.value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD_FILS;
  }

  async requestPayout(userId: string): Promise<RequestPayoutResult> {
    const threshold = await this.getThresholdFils();
    const quick = await this.wallet.getBalance(userId);
    if (quick < threshold) throw new Error(`payout_below_threshold:${threshold}`);

    return AppDataSource.transaction(async (manager) => {
      const commissionRepo = manager.getRepository(AffiliateCommission);
      // Earned commissions payable to this user (join to the affiliate they own).
      const earned = await commissionRepo
        .createQueryBuilder("ac")
        .innerJoin("vendor_affiliates", "va", "va.id = ac.vendor_affiliate_id")
        .where("va.user_id = :userId", { userId })
        .andWhere("ac.status = :status", { status: AffiliateCommissionStatus.earned })
        // Scope FOR UPDATE to affiliate_commissions only ("ac"); without the
        // lockTables arg Postgres locks the joined vendor_affiliates rows too,
        // needlessly contending with concurrent invite/suspend on the affiliate.
        .setLock("pessimistic_write", undefined, ["ac"])
        .getMany();

      const amountFils = earned.reduce((s, r) => s + Number(r.commission_fils), 0);
      if (amountFils < threshold) throw new Error(`payout_below_threshold:${threshold}`);
      return this.executePayout(manager, userId, amountFils, earned);
    });
  }

  async executePayout(
    manager: EntityManager,
    userId: string,
    amountFils: number,
    earned: AffiliateCommission[],
  ): Promise<RequestPayoutResult> {
    const payoutId = crypto.randomUUID();
    if (earned.length > 0) {
      await manager
        .getRepository(AffiliateCommission)
        .update({ id: In(earned.map((c) => c.id)) }, { status: AffiliateCommissionStatus.paid });
    }
    await this.wallet.debit({
      userId,
      amount: amountFils,
      transactionType: "affiliate_payout_debit",
      referenceType: "affiliate_payout",
      referenceId: payoutId,
      manager,
    });
    const { externalRef } = await this.initiator.initiate({
      userId,
      amountFils,
      currency: "AED",
      idempotencyKey: payoutId,
    });
    return { amountFils, status: "queued", externalRef };
  }
}

export class NoopAffiliatePayoutInitiator implements AffiliatePayoutInitiator {
  async initiate(input: {
    userId: string;
    amountFils: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ externalRef: string }> {
    console.log("[affiliate-payout] initiator (noop)", input);
    return { externalRef: `stub_${input.idempotencyKey}` };
  }
}
