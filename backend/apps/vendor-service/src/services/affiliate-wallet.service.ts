import { AppDataSource, User, WalletTransaction } from "@materialhub/database";
import type { EntityManager } from "typeorm";

/**
 * INTENTIONAL PER-SERVICE CLONE.
 *
 * This is a near-verbatim clone of reels-service's `CreatorWalletService`
 * (backend/apps/reels-service/src/domain/commerce/creator-wallet.service.ts).
 * vendor-service cannot import across microservice boundaries, and both
 * services operate on the same shared `users.wallet_balance` column and
 * `wallet_transactions` table via `@materialhub/database`. Duplicating this
 * ~100-line ledger primitive per-service is a deliberate tradeoff to avoid
 * a cross-service runtime dependency — this is DRY-exempt by microservice
 * boundary, not an oversight. If the ledger semantics change, update BOTH
 * `creator-wallet.service.ts` and this file together.
 *
 * Sign convention for wallet_transactions rows written by this service:
 *   - `credit` stores `amount = +ctx.amount` (positive)
 *   - `debit`  stores `amount = -ctx.amount` (negative)
 * The authoritative wallet balance lives on `user.wallet_balance`; this
 * service always mutates that column inside the same transaction as the
 * ledger insert, under a `SELECT ... FOR UPDATE` lock on the user row.
 * `wallet_transactions` is the immutable history, not the balance source.
 *
 * This service stays generic — it does NOT hardcode `reference_type`.
 * Affiliate callers pass `referenceType: "affiliate"` (or similar) and
 * transaction-type strings like `"affiliate_commission_credit"` /
 * `"affiliate_payout_debit"` via `LedgerContext`.
 */
export interface LedgerContext {
  userId: string;
  /** Positive integer fils; sign is implicit from credit/debit method */
  amount: number;
  /** e.g. "affiliate_commission_credit" or "affiliate_payout_debit" */
  transactionType: string;
  referenceType: string;
  referenceId: string;
  description?: string;
  orderId?: string | null;
  /** Optional caller-provided transaction manager for in-transaction writes */
  manager?: EntityManager;
}

export class AffiliateWalletService {
  /**
   * Returns the current balance for a user by reading `user.wallet_balance`
   * directly — this is the authoritative balance column mutated by every
   * wallet writer in the codebase. Returns 0 if the user doesn't exist.
   */
  async getBalance(userId: string, manager?: EntityManager): Promise<number> {
    const userRepo = manager ? manager.getRepository(User) : AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    return user?.wallet_balance ?? 0;
  }

  /**
   * Insert a positive ledger row, bump `user.wallet_balance`, return the new row.
   * Runs inside `ctx.manager` when provided; otherwise opens its own transaction.
   */
  async credit(ctx: LedgerContext): Promise<WalletTransaction> {
    return this.writeLedger(ctx, "credit");
  }

  /**
   * Insert a negative ledger row, decrement `user.wallet_balance`, return the
   * new row. Throws `insufficient_balance` if the user's current balance is
   * less than `ctx.amount`. Runs inside `ctx.manager` when provided; otherwise
   * opens its own transaction.
   */
  async debit(ctx: LedgerContext): Promise<WalletTransaction> {
    return this.writeLedger(ctx, "debit");
  }

  private async writeLedger(
    ctx: LedgerContext,
    direction: "credit" | "debit",
  ): Promise<WalletTransaction> {
    if (ctx.manager) {
      return this.writeLedgerWithManager(ctx.manager, ctx, direction);
    }
    return AppDataSource.transaction((mgr) => this.writeLedgerWithManager(mgr, ctx, direction));
  }

  private async writeLedgerWithManager(
    manager: EntityManager,
    ctx: LedgerContext,
    direction: "credit" | "debit",
  ): Promise<WalletTransaction> {
    const userRepo = manager.getRepository(User);
    const txnRepo = manager.getRepository(WalletTransaction);

    // Pessimistic write-lock on the user row — matches the pattern used by
    // return.service.ts and referral-reward.service.ts (and reels-service's
    // creator-wallet.service.ts). Serializes concurrent wallet writers for
    // the same user.
    const user = await userRepo
      .createQueryBuilder("u")
      .where("u.id = :id", { id: ctx.userId })
      .setLock("pessimistic_write")
      .getOne();

    if (!user) {
      throw new Error("user_not_found");
    }

    const balanceBefore = user.wallet_balance ?? 0;
    let balanceAfter: number;
    let signedAmount: number;

    if (direction === "credit") {
      balanceAfter = balanceBefore + ctx.amount;
      signedAmount = ctx.amount;
    } else {
      if (balanceBefore < ctx.amount) {
        throw new Error("insufficient_balance");
      }
      balanceAfter = balanceBefore - ctx.amount;
      signedAmount = -ctx.amount;
    }

    const row = txnRepo.create({
      user_id: ctx.userId,
      amount: signedAmount,
      currency: "AED",
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      transaction_type: ctx.transactionType,
      order_id: ctx.orderId ?? null,
      reference_type: ctx.referenceType,
      reference_id: ctx.referenceId,
      description: ctx.description ?? null,
    } as Partial<WalletTransaction>);

    const saved = await txnRepo.save(row);

    // Authoritative balance lives on the User row. Keep it in sync with the
    // ledger so downstream readers (web wallet page, payout service) get the
    // right number even if they read User directly.
    await userRepo.update({ id: ctx.userId }, { wallet_balance: balanceAfter });

    return saved;
  }
}
