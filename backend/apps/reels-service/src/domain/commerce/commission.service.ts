import {
  AppDataSource,
  type Order,
  OrderItem,
  ReelAttribution,
  ReelCommission,
  ReelCommissionStatus,
  Vendor,
} from "@materialhub/database";
import type { Repository } from "typeorm";
import { CreatorWalletService } from "./creator-wallet.service.ts";

/** Subsidy share during the bootstrap window — platform eats half the commission. */
const SUBSIDY_SHARE = 0.5;
/** Max commissions processed per `transitionEligibleToEarned` invocation. */
const TRANSITION_BATCH_SIZE = 500;

export interface ListForCreatorResult {
  items: ReelCommission[];
  nextCursor: string | null;
}

export interface CreatorSummaryRow {
  status: string;
  total_fils: string;
  count: number;
}

export class CommissionService {
  private attributionRepo!: Repository<ReelAttribution>;
  private orderItemRepo!: Repository<OrderItem>;
  private vendorRepo!: Repository<Vendor>;
  private commissionRepo!: Repository<ReelCommission>;

  constructor(private readonly wallet: CreatorWalletService = new CreatorWalletService()) {}

  private getRepos() {
    if (!this.attributionRepo) this.attributionRepo = AppDataSource.getRepository(ReelAttribution);
    if (!this.commissionRepo) this.commissionRepo = AppDataSource.getRepository(ReelCommission);
    if (!this.orderItemRepo) this.orderItemRepo = AppDataSource.getRepository(OrderItem);
    if (!this.vendorRepo) this.vendorRepo = AppDataSource.getRepository(Vendor);
    return {
      attributionRepo: this.attributionRepo,
      orderItemRepo: this.orderItemRepo,
      vendorRepo: this.vendorRepo,
      commissionRepo: this.commissionRepo,
    };
  }

  /**
   * For each item in an order, find the most recent unconsumed, unexpired
   * attribution and create a pending ReelCommission snapshot. Marks the
   * attribution as consumed on success.
   *
   * Idempotency: this method is invoked by a BullMQ worker with
   * `attempts: 5`. If a previous attempt partially completed (e.g. saved
   * the commission for item 1 but the process died before processing
   * item 2), the retry MUST be able to pick up where it left off without
   * tripping the `uq_reel_commissions_order_item` UNIQUE constraint on
   * the already-saved row.
   *
   * Strategy:
   * 1. Probe `commissionRepo.findOne({ order_item_id })` before doing any
   *    work. If a row exists, skip the save — but still repair the
   *    attribution's `consumed_order_item_id` if the previous attempt
   *    died between save and attribution update. Without this repair an
   *    un-consumed attribution could be reused by a different future
   *    order, producing a duplicate commission for the creator.
   * 2. For the normal (no existing commission) path, wrap the
   *    commission save and the attribution consume in a per-item
   *    transaction so a mid-flight crash rolls both back atomically.
   *    The retry will then see "no existing commission" and re-run the
   *    whole pair cleanly.
   *
   * We intentionally do NOT use a try/catch around the save to catch
   * duplicate-key errors — TypeORM wraps the Postgres error and the
   * error class depends on the driver, which is brittle. A pre-save
   * existence probe is one extra indexed lookup and far cleaner.
   */
  async createFromOrder(order: Order): Promise<void> {
    const { attributionRepo, vendorRepo, commissionRepo } = this.getRepos();

    const items = order.items ?? [];
    const now = new Date();

    for (const item of items) {
      const attribution = await attributionRepo
        .createQueryBuilder("ra")
        .where("ra.user_id = :userId", { userId: order.user_id })
        .andWhere("ra.product_id = :productId", { productId: item.product_id })
        .andWhere("ra.expires_at > :now", { now })
        .andWhere("ra.consumed_order_item_id IS NULL")
        .orderBy("ra.tapped_at", "DESC")
        .limit(1)
        .getOne();

      if (!attribution) continue;

      const vendor = await vendorRepo.findOne({ where: { id: item.vendor_id } });
      if (!vendor || !vendor.reels_program_joined_at) continue;

      // Idempotency guard: a previous attempt may have saved a commission
      // for this order_item. If so, skip the save and just ensure the
      // attribution update completed (repair in-between-crash state).
      const existing = await commissionRepo.findOne({
        where: { order_item_id: item.id },
      });
      if (existing) {
        if (!attribution.consumed_order_item_id) {
          await attributionRepo.update(
            { id: attribution.id, tapped_at: attribution.tapped_at },
            { consumed_order_item_id: item.id },
          );
        }
        continue;
      }

      const itemPriceFils =
        typeof item.line_total === "number" && Number.isFinite(item.line_total)
          ? Number(item.line_total)
          : Number(item.unit_price) * Number(item.quantity);

      const rate = Number(vendor.reels_commission_rate);
      const gross = Math.round(itemPriceFils * rate);

      const subsidyActive =
        vendor.reels_subsidy_ends_at &&
        new Date(vendor.reels_subsidy_ends_at).getTime() > now.getTime();
      const subsidyShare = subsidyActive ? SUBSIDY_SHARE : 0;
      const platformSubsidy = Math.round(gross * subsidyShare);
      const vendorShare = gross - platformSubsidy;

      const row = commissionRepo.create({
        creator_id: attribution.creator_id,
        reel_id: attribution.reel_id,
        attribution_id: attribution.id,
        order_id: order.id,
        order_item_id: item.id,
        vendor_id: item.vendor_id,
        product_id: item.product_id,
        item_price_fils: String(itemPriceFils),
        commission_rate_snapshot: String(rate),
        subsidy_share_snapshot: String(subsidyShare),
        gross_commission_fils: String(gross),
        vendor_share_fils: String(vendorShare),
        platform_subsidy_fils: String(platformSubsidy),
        status: ReelCommissionStatus.pending,
      } as Partial<ReelCommission>);

      // Per-item transaction: the commission save and the attribution
      // consume must be atomic so a mid-flight crash doesn't leave the
      // attribution un-consumed with a saved commission pointing at it.
      await AppDataSource.transaction(async (manager) => {
        await manager.getRepository(ReelCommission).save(row);
        await manager
          .getRepository(ReelAttribution)
          .update(
            { id: attribution.id, tapped_at: attribution.tapped_at },
            { consumed_order_item_id: item.id },
          );
      });
    }
  }

  /**
   * Set eligible_at on all pending commissions for a delivered order.
   */
  async setEligibility(
    orderId: string,
    deliveredAt: Date,
    returnWindowDays: number,
  ): Promise<void> {
    const { commissionRepo } = this.getRepos();
    const eligibleAt = new Date(deliveredAt.getTime() + returnWindowDays * 86_400_000);
    await commissionRepo.update(
      { order_id: orderId, status: ReelCommissionStatus.pending },
      { eligible_at: eligibleAt },
    );
  }

  /**
   * Void all pending commissions for an order (refund/dispute).
   */
  async voidPendingForOrder(orderId: string, reason: string): Promise<void> {
    const { commissionRepo } = this.getRepos();
    await commissionRepo.update(
      { order_id: orderId, status: ReelCommissionStatus.pending },
      { status: ReelCommissionStatus.voided, voided_reason: reason },
    );
  }

  /**
   * Move any pending commission whose `eligible_at` has passed into the
   * `earned` state by crediting the creator's wallet. Up to
   * `TRANSITION_BATCH_SIZE` per run. Returns the count of commissions
   * processed.
   *
   * Design notes:
   * - Single outer transaction for the whole batch. `FOR UPDATE SKIP LOCKED`
   *   on a SelectQueryBuilder is rejected by TypeORM with
   *   `PessimisticLockTransactionRequiredError` unless the query executes
   *   inside an active transaction, so the entire method body runs inside
   *   `AppDataSource.transaction`. The batch holds the row locks on up to
   *   `TRANSITION_BATCH_SIZE` rows for the duration of processing; for M3's
   *   volume (dozens/day) this is fine. M4 can revisit if a single batch
   *   ever grows long enough for the held locks to matter.
   * - Wallet credit and status flip share the transaction manager, so they
   *   are atomic per row AND atomic across the whole batch.
   * - Trade-off: if any row fails the entire batch rolls back. That's
   *   acceptable for M3 — a failure is either transient (the caller retries
   *   the whole job) or a real bug (we want to halt and alert, not lose
   *   progress on some rows).
   * - Concurrency: `SKIP LOCKED` means parallel workers partition the work
   *   cleanly without contending on the same rows. The per-row status guard
   *   on the update is kept as defence-in-depth in case a future callsite
   *   adds a parallel claim path that bypasses the lock.
   */
  async transitionEligibleToEarned(now: Date = new Date()): Promise<number> {
    return AppDataSource.transaction(async (manager) => {
      const commissionRepo = manager.getRepository(ReelCommission);
      const eligible = await commissionRepo
        .createQueryBuilder("rc")
        .where("rc.status = :status", { status: ReelCommissionStatus.pending })
        .andWhere("rc.eligible_at IS NOT NULL")
        .andWhere("rc.eligible_at <= :now", { now })
        .orderBy("rc.eligible_at", "ASC")
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .limit(TRANSITION_BATCH_SIZE)
        .getMany();

      let processed = 0;
      for (const commission of eligible) {
        const walletTxn = await this.wallet.credit({
          userId: commission.creator_id,
          amount: Number(commission.gross_commission_fils),
          transactionType: "reels_commission_credit",
          referenceType: "reel_commission",
          referenceId: commission.id,
          manager,
        });

        const result = await commissionRepo.update(
          // Status guard: defence in depth. Unreachable under SKIP LOCKED in
          // the current codebase, but kept in case a future callsite adds a
          // parallel claim path that bypasses the lock.
          { id: commission.id, status: ReelCommissionStatus.pending },
          {
            status: ReelCommissionStatus.earned,
            earned_at: now,
            wallet_transaction_id: walletTxn.id,
          },
        );

        if (!result.affected || result.affected === 0) {
          throw new Error("commission_already_claimed");
        }
        processed += 1;
      }
      return processed;
    });
  }

  /**
   * Cursor-paginated list of commissions for a creator (newest first).
   * Cursor is the oldest returned row's `created_at.toISOString()`.
   */
  async listForCreator(
    creatorId: string,
    status?: ReelCommissionStatus,
    cursor?: string,
    limit = 20,
  ): Promise<ListForCreatorResult> {
    const { commissionRepo } = this.getRepos();
    const qb = commissionRepo
      .createQueryBuilder("rc")
      .where("rc.creator_id = :creatorId", { creatorId })
      .orderBy("rc.created_at", "DESC")
      .addOrderBy("rc.id", "DESC")
      .limit(limit + 1);

    if (status) qb.andWhere("rc.status = :status", { status });
    if (cursor) qb.andWhere("rc.created_at < :cursor", { cursor: new Date(cursor) });

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? (items[items.length - 1] as ReelCommission).created_at.toISOString()
        : null;
    return { items, nextCursor };
  }

  /**
   * Aggregate totals for a creator grouped by status.
   */
  async creatorSummary(creatorId: string): Promise<CreatorSummaryRow[]> {
    const { commissionRepo } = this.getRepos();
    const rows = await commissionRepo
      .createQueryBuilder("rc")
      .select("rc.status", "status")
      .addSelect("SUM(rc.gross_commission_fils)::bigint", "total_fils")
      .addSelect("COUNT(*)::int", "count")
      .where("rc.creator_id = :creatorId", { creatorId })
      .groupBy("rc.status")
      .getRawMany<{ status: string; total_fils: string; count: number }>();
    return rows;
  }
}
