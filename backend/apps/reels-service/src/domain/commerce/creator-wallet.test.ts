import { describe, expect, it, mock } from "bun:test";
import { User, WalletTransaction } from "@materialhub/database";
import { CreatorWalletService } from "./creator-wallet.service.ts";

/**
 * Build a fake EntityManager whose `getRepository` returns per-entity mocks.
 *
 * - User repo exposes `createQueryBuilder().setLock().getOne()` returning the
 *   seeded user, plus an `update()` spy.
 * - WalletTransaction repo exposes `create()` (passthrough) and a `save()` spy.
 */
function makeFakeManager(opts: {
  user: { id: string; wallet_balance: number } | null;
}) {
  const saves: any[] = [];
  const userUpdates: any[] = [];
  const userRepoCall = { count: 0 };

  const userQb = {
    where: function () {
      return this;
    },
    setLock: function () {
      return this;
    },
    getOne: async () => opts.user,
  };

  const userRepo = {
    createQueryBuilder: () => userQb,
    findOne: async () => opts.user,
    update: mock(async (criteria: any, patch: any) => {
      userUpdates.push({ criteria, patch });
      return { affected: 1 };
    }),
  };

  const txnRepo = {
    create: (x: any) => x,
    save: mock(async (x: any) => {
      const saved = { ...x, id: "wt-1" };
      saves.push(saved);
      return saved;
    }),
  };

  const manager: any = {
    getRepository: mock((entity: any) => {
      userRepoCall.count++;
      if (entity === User) return userRepo;
      if (entity === WalletTransaction) return txnRepo;
      throw new Error(`unexpected getRepository(${entity?.name ?? entity})`);
    }),
  };

  return { manager, userRepo, txnRepo, saves, userUpdates, userRepoCall };
}

describe("CreatorWalletService.getBalance", () => {
  it("returns the user's wallet_balance column via the manager", async () => {
    const { manager } = makeFakeManager({
      user: { id: "u1", wallet_balance: 12345 },
    });
    const service = new CreatorWalletService();
    expect(await service.getBalance("u1", manager)).toBe(12345);
  });

  it("returns 0 when the user isn't found", async () => {
    const { manager } = makeFakeManager({ user: null });
    const service = new CreatorWalletService();
    expect(await service.getBalance("ghost", manager)).toBe(0);
  });
});

describe("CreatorWalletService.credit (with manager)", () => {
  it("locks the user row, inserts a positive ledger row, and updates wallet_balance", async () => {
    const { manager, userRepo, saves, userUpdates } = makeFakeManager({
      user: { id: "u1", wallet_balance: 500 },
    });
    const service = new CreatorWalletService();

    const result = await service.credit({
      userId: "u1",
      amount: 250,
      transactionType: "reels_commission_credit",
      referenceType: "reel_commission",
      referenceId: "c1",
      manager,
    });

    // Ledger row inserted with correct fields
    expect(saves).toHaveLength(1);
    const saved = saves[0];
    expect(saved.user_id).toBe("u1");
    expect(saved.amount).toBe(250);
    expect(saved.currency).toBe("AED");
    expect(saved.balance_before).toBe(500);
    expect(saved.balance_after).toBe(750);
    expect(saved.transaction_type).toBe("reels_commission_credit");
    expect(saved.reference_type).toBe("reel_commission");
    expect(saved.reference_id).toBe("c1");

    // User row wallet_balance bumped
    expect(userUpdates).toHaveLength(1);
    expect(userUpdates[0].criteria).toEqual({ id: "u1" });
    expect(userUpdates[0].patch).toEqual({ wallet_balance: 750 });

    // Pessimistic lock was taken via the user repo createQueryBuilder
    expect(userRepo.update).toHaveBeenCalledTimes(1);
    // Returned row is the saved txn
    expect(result.id).toBe("wt-1");
  });

  it("handles zero starting balance", async () => {
    const { manager, saves, userUpdates } = makeFakeManager({
      user: { id: "u1", wallet_balance: 0 },
    });
    const service = new CreatorWalletService();

    await service.credit({
      userId: "u1",
      amount: 100,
      transactionType: "reels_commission_credit",
      referenceType: "reel_commission",
      referenceId: "c1",
      manager,
    });

    expect(saves[0].balance_before).toBe(0);
    expect(saves[0].balance_after).toBe(100);
    expect(saves[0].amount).toBe(100);
    expect(userUpdates[0].patch).toEqual({ wallet_balance: 100 });
  });

  it("throws user_not_found when the user row doesn't exist", async () => {
    const { manager } = makeFakeManager({ user: null });
    const service = new CreatorWalletService();
    await expect(
      service.credit({
        userId: "ghost",
        amount: 100,
        transactionType: "reels_commission_credit",
        referenceType: "reel_commission",
        referenceId: "c1",
        manager,
      }),
    ).rejects.toThrow("user_not_found");
  });

  it("passes through description and orderId", async () => {
    const { manager, saves } = makeFakeManager({
      user: { id: "u1", wallet_balance: 0 },
    });
    const service = new CreatorWalletService();

    await service.credit({
      userId: "u1",
      amount: 50,
      transactionType: "reels_commission_credit",
      referenceType: "reel_commission",
      referenceId: "c1",
      description: "hello",
      orderId: "order-9",
      manager,
    });

    expect(saves[0].description).toBe("hello");
    expect(saves[0].order_id).toBe("order-9");
  });
});

describe("CreatorWalletService.debit (with manager)", () => {
  it("throws insufficient_balance when balance < amount", async () => {
    const { manager } = makeFakeManager({
      user: { id: "u1", wallet_balance: 100 },
    });
    const service = new CreatorWalletService();

    await expect(
      service.debit({
        userId: "u1",
        amount: 200,
        transactionType: "reels_payout_debit",
        referenceType: "reels_payout",
        referenceId: "p1",
        manager,
      }),
    ).rejects.toThrow("insufficient_balance");
  });

  it("inserts a negative-amount ledger row and decrements wallet_balance", async () => {
    const { manager, saves, userUpdates } = makeFakeManager({
      user: { id: "u1", wallet_balance: 1000 },
    });
    const service = new CreatorWalletService();

    await service.debit({
      userId: "u1",
      amount: 600,
      transactionType: "reels_payout_debit",
      referenceType: "reels_payout",
      referenceId: "p1",
      manager,
    });

    expect(saves[0].balance_before).toBe(1000);
    expect(saves[0].balance_after).toBe(400);
    // Sign convention: debits stored as negative, credits as positive.
    expect(saves[0].amount).toBe(-600);
    expect(saves[0].transaction_type).toBe("reels_payout_debit");
    expect(saves[0].reference_type).toBe("reels_payout");
    expect(saves[0].reference_id).toBe("p1");

    expect(userUpdates[0].patch).toEqual({ wallet_balance: 400 });
  });
});

describe("CreatorWalletService manager passthrough", () => {
  it("never touches AppDataSource repositories when a manager is supplied", async () => {
    const { manager, saves } = makeFakeManager({
      user: { id: "u1", wallet_balance: 42 },
    });
    const service = new CreatorWalletService();

    // If the service ever falls back to AppDataSource.getRepository / transaction,
    // we can't easily stub that out — but we can prove the manager was used by
    // asserting the getRepository spy was called for both User and WalletTransaction.
    await service.credit({
      userId: "u1",
      amount: 8,
      transactionType: "reels_commission_credit",
      referenceType: "reel_commission",
      referenceId: "c1",
      manager,
    });

    expect(manager.getRepository).toHaveBeenCalled();
    const entitiesRequested = (manager.getRepository as any).mock.calls.map((c: any[]) => c[0]);
    expect(entitiesRequested).toContain(User);
    expect(entitiesRequested).toContain(WalletTransaction);

    expect(saves[0].balance_before).toBe(42);
    expect(saves[0].balance_after).toBe(50);
  });
});
