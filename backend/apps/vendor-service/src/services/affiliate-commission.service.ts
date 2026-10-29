import {
  AffiliateAttribution,
  AffiliateCommission,
  AffiliateCommissionStatus,
  type AffiliateCommissionType,
  AppDataSource,
  Order,
  type OrderItem,
  ReelAttribution,
  ReelCommission,
  VendorAffiliate,
  VendorAffiliateStatus,
} from "@materialhub/database";
import type { EntityManager, Repository } from "typeorm";
import { AffiliateWalletService } from "./affiliate-wallet.service.ts";

/** Pure commission math. `value` is bps when percentage, fils when fixed. */
export function computeAffiliateCommissionFils(
  grossFils: number,
  type: AffiliateCommissionType | "percentage" | "fixed",
  value: number,
): number {
  if (grossFils <= 0) return 0;
  if (type === "fixed") return Math.min(value, grossFils);
  return Math.round((grossFils * value) / 10000);
}

export interface SnapshotItemDeps {
  /** Injectable clock for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

/** Cap per sweep so a single maturation run can't hold thousands of locks. */
const TRANSITION_BATCH_SIZE = 500;

export class AffiliateCommissionService {
  constructor(private readonly wallet: AffiliateWalletService = new AffiliateWalletService()) {}

  // Lazily-initialized repo, cached on the instance. Only assigned when
  // falsy so tests can pre-set `(svc as any).commissionRepo = mockRepo`
  // before calling a method — the seam getRepos() relies on.
  private commissionRepo?: Repository<AffiliateCommission>;

  private getRepos(): { commissionRepo: Repository<AffiliateCommission> } {
    if (!this.commissionRepo) {
      this.commissionRepo = AppDataSource.getRepository(AffiliateCommission);
    }
    return { commissionRepo: this.commissionRepo };
  }

  /**
   * Snapshot pending affiliate commissions for a paid order.
   *
   * For each order item, opens its own transaction and delegates to
   * {@link snapshotItem}: idempotent via the unique `order_item_id` index —
   * a crash mid-item rolls back atomically and a retry re-evaluates cleanly
   * from scratch (the next attempt either finds the existing row or nothing
   * was written yet).
   */
  async snapshotForOrder(orderId: string): Promise<AffiliateCommission[]> {
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: orderId },
      relations: ["items"],
    });
    if (!order) return [];

    const created: AffiliateCommission[] = [];
    for (const item of order.items ?? []) {
      const result = await AppDataSource.transaction((manager) =>
        this.snapshotItem(manager, order, item),
      );
      if (result) created.push(result);
    }
    return created;
  }

  /**
   * Exposed (not private) so unit tests can drive it with a fake
   * `EntityManager` without mocking the `AppDataSource` statics (brittle
   * under bun) — mirrors reels-service's `payout.service.executePayout`
   * seam. Must run inside a DB transaction; {@link snapshotForOrder} is
   * responsible for that.
   *
   * All reads AND writes for this single order item go through the same
   * `manager`, so the whole read-decide-write sequence for the item is one
   * atomic unit.
   *
   * PRECEDENCE RULE (verbatim): an active reel/creator attribution takes
   * precedence over an affiliate attribution for the same order item — the
   * creator wins the tie. Concretely: if an unconsumed, unexpired
   * `reel_attribution` OR any `reel_commission` exists for that
   * `(user, product)`/`order_item`, SKIP the affiliate snapshot for that
   * item (do not create an affiliate commission, do not consume the
   * affiliate attribution — it simply expires). Affiliate selection itself
   * is LAST-CLICK: the most recent unconsumed, unexpired affiliate
   * attribution for the item's vendor (and product, or store-wide) wins.
   *
   * NOTE: attribution matching is `aa.user_id = :userId` (the order's
   * buyer). This intentionally attributes only logged-in buyers, matching
   * the reels precedent — guest orders (user_id present but attribution
   * recorded under a session_id) will not match, and SQL NULL-comparison
   * safely prevents any cross-matching. This is an accepted v1 limitation,
   * not a bug.
   */
  async snapshotItem(
    manager: EntityManager,
    order: Order,
    item: OrderItem,
    deps: SnapshotItemDeps = {},
  ): Promise<AffiliateCommission | null> {
    const now = deps.now ?? new Date();

    const commissionRepo = manager.getRepository(AffiliateCommission);
    const attributionRepo = manager.getRepository(AffiliateAttribution);
    const affiliateRepo = manager.getRepository(VendorAffiliate);
    const reelAttrRepo = manager.getRepository(ReelAttribution);
    const reelCommRepo = manager.getRepository(ReelCommission);

    // Idempotency: already snapshotted for this item?
    const existing = await commissionRepo.findOne({ where: { order_item_id: item.id } });
    if (existing) return existing;

    // (1) PRECEDENCE — creator wins the tie.
    const reelCommission = await reelCommRepo.findOne({ where: { order_item_id: item.id } });
    if (reelCommission) return null;

    const reelAttribution = await reelAttrRepo
      .createQueryBuilder("ra")
      .where("ra.user_id = :userId", { userId: order.user_id })
      .andWhere("ra.product_id = :productId", { productId: item.product_id })
      .andWhere("ra.expires_at > :now", { now })
      .andWhere("ra.consumed_order_item_id IS NULL")
      .limit(1)
      .getOne();
    if (reelAttribution) return null;

    // (2) LAST-CLICK affiliate attribution for this item's vendor.
    const attribution = await attributionRepo
      .createQueryBuilder("aa")
      .where("aa.user_id = :userId", { userId: order.user_id })
      .andWhere("aa.vendor_id = :vendorId", { vendorId: item.vendor_id })
      .andWhere("(aa.product_id = :productId OR aa.product_id IS NULL)", {
        productId: item.product_id,
      })
      .andWhere("aa.expires_at > :now", { now })
      .andWhere("aa.consumed_order_item_id IS NULL")
      .orderBy("aa.clicked_at", "DESC")
      .limit(1)
      .getOne();
    if (!attribution) return null;

    const affiliate = await affiliateRepo.findOne({
      where: { id: attribution.vendor_affiliate_id },
    });
    if (!affiliate || affiliate.status !== VendorAffiliateStatus.active) return null;

    const grossFils =
      typeof item.line_total === "number" && Number.isFinite(item.line_total)
        ? Number(item.line_total)
        : Number(item.unit_price) * Number(item.quantity);
    const commissionFils = computeAffiliateCommissionFils(
      grossFils,
      affiliate.commission_type,
      affiliate.commission_value,
    );

    const row = commissionRepo.create({
      vendor_affiliate_id: affiliate.id,
      vendor_id: item.vendor_id,
      attribution_id: attribution.id,
      order_id: order.id,
      vendor_order_id: item.vendor_order_id,
      order_item_id: item.id,
      product_id: item.product_id,
      gross_fils: String(grossFils),
      commission_type_snapshot: affiliate.commission_type,
      commission_value_snapshot: affiliate.commission_value,
      commission_fils: String(commissionFils),
      status: AffiliateCommissionStatus.pending,
    } as Partial<AffiliateCommission>);

    const saved = await commissionRepo.save(row);

    // Consume the attribution so it can't be double-spent by a later retry
    // or a second item on the same order.
    await attributionRepo.update({ id: attribution.id }, { consumed_order_item_id: item.id });

    // Deduct the affiliate cut from the vendor's earning snapshot (vendor
    // margin). `computeAffiliateCommissionFils` computes on the gross
    // `line_total` (VAT-inclusive) but the DEDUCTION comes out of the
    // vendor's net `vendor_earning`, clamped at 0 — the affiliate cut is
    // bounded by what the vendor would have earned, so the platform is
    // never out of pocket.
    if (commissionFils > 0) {
      await manager.query(
        `UPDATE "commissions" SET "vendor_earning" = GREATEST("vendor_earning" - $1, 0)
         WHERE "order_item_id" = $2`,
        [commissionFils, item.id],
      );
    }

    return saved;
  }

  /**
   * Stamp `eligible_at` on the order's `pending` affiliate commission rows
   * once the order has been delivered, so the eligibility-transition job
   * (pending -> earned, out of scope here) knows when the return window
   * closes.
   */
  async setEligibility(
    orderId: string,
    deliveredAt: Date,
    returnWindowDays: number,
  ): Promise<void> {
    const { commissionRepo } = this.getRepos();
    const eligibleAt = new Date(deliveredAt.getTime() + returnWindowDays * 86_400_000);
    await commissionRepo.update(
      { order_id: orderId, status: AffiliateCommissionStatus.pending },
      { eligible_at: eligibleAt },
    );
  }

  /**
   * Void the order's still-`pending` affiliate commissions on refund.
   *
   * Reversal only touches `pending` rows — `earned`/`paid` commissions are
   * locked in (money already in the affiliate wallet); a post-maturation
   * refund is out of scope for this slice.
   *
   * NOTE (money asymmetry, intentional): this is status-only — it does NOT
   * restore the `commissions.vendor_earning` that {@link snapshotItem}
   * deducted when the pending commission was created. That's fine because
   * this method fires on ORDER REFUND (Task 7's voidAffiliateCommissions
   * job), and a refunded order's own `commissions` row is voided separately
   * by the order-service refund flow — so the vendor isn't paid for that
   * item regardless of whether we restore `vendor_earning` here.
   */
  async voidPendingForOrder(orderId: string, reason: string): Promise<void> {
    const { commissionRepo } = this.getRepos();
    await commissionRepo.update(
      { order_id: orderId, status: AffiliateCommissionStatus.pending },
      { status: AffiliateCommissionStatus.reversed, reversed_reason: reason },
    );
  }

  // Overridable seam for tests; production uses AppDataSource.transaction.
  protected runInTransaction<T>(fn: (m: EntityManager) => Promise<T>): Promise<T> {
    return AppDataSource.transaction(fn);
  }

  /**
   * Mature `pending` affiliate commissions whose return window has closed
   * (`eligible_at <= now`) into `earned`, crediting the affiliate's wallet
   * in the same transaction as the status flip.
   *
   * Row selection uses `pessimistic_write` + `skip_locked` so concurrent
   * sweeps (or an overlapping cron retry) never contend on the same row —
   * each sweep just picks up whatever isn't currently locked. A commission
   * whose affiliate has no `user_id` (invite never accepted) is skipped
   * entirely; there's no payee to credit.
   */
  async transitionEligibleToEarned(now: Date = new Date()): Promise<number> {
    return this.runInTransaction(async (manager) => {
      const commissionRepo = manager.getRepository(AffiliateCommission);
      const affiliateRepo = manager.getRepository(VendorAffiliate);
      const eligible = await commissionRepo
        .createQueryBuilder("ac")
        .where("ac.status = :status", { status: AffiliateCommissionStatus.pending })
        .andWhere("ac.eligible_at IS NOT NULL")
        .andWhere("ac.eligible_at <= :now", { now })
        .orderBy("ac.eligible_at", "ASC")
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .limit(TRANSITION_BATCH_SIZE)
        .getMany();

      let processed = 0;
      for (const commission of eligible) {
        const affiliate = await affiliateRepo.findOne({
          where: { id: commission.vendor_affiliate_id },
        });
        if (!affiliate?.user_id) continue; // cannot credit an unaccepted invite
        const walletTxn = await this.wallet.credit({
          userId: affiliate.user_id,
          amount: Number(commission.commission_fils),
          transactionType: "affiliate_commission_credit",
          referenceType: "affiliate",
          referenceId: commission.id,
          manager,
        });
        const result = await commissionRepo.update(
          { id: commission.id, status: AffiliateCommissionStatus.pending },
          {
            status: AffiliateCommissionStatus.earned,
            earned_at: now,
            wallet_transaction_id: walletTxn.id,
          },
        );
        if (!result.affected) throw new Error("affiliate_commission_already_claimed");
        processed += 1;
      }
      return processed;
    });
  }
}
