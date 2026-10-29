import { describe, expect, it, mock } from "bun:test";
import { AffiliateWalletService } from "./affiliate-wallet.service.ts";

function makeManager(userBalance: number) {
  const user = { id: "u1", wallet_balance: userBalance };
  const userRepo = {
    createQueryBuilder: () => ({
      where() {
        return this;
      },
      setLock() {
        return this;
      },
      getOne: async () => user,
    }),
    update: mock(async () => ({ affected: 1 })),
  };
  const txnRepo = {
    create: mock((x: any) => x),
    save: mock(async (x: any) => ({ id: "txn-1", ...x })),
  };
  const manager = {
    getRepository: (entity: any) =>
      entity?.name === "WalletTransaction" || entity === "WalletTransaction" ? txnRepo : userRepo,
  } as any;
  return { manager, userRepo, txnRepo, user };
}

describe("AffiliateWalletService", () => {
  it("credit inserts a positive ledger row and bumps the balance", async () => {
    const { manager, userRepo, txnRepo } = makeManager(1000);
    const svc = new AffiliateWalletService();
    const txn = await svc.credit({
      userId: "u1",
      amount: 500,
      transactionType: "affiliate_commission_credit",
      referenceType: "affiliate",
      referenceId: "c1",
      manager,
    });
    expect(txn.amount).toBe(500);
    expect(txn.balance_after).toBe(1500);
    expect(userRepo.update).toHaveBeenCalledWith({ id: "u1" }, { wallet_balance: 1500 });
    expect(txnRepo.create.mock.calls[0]?.[0].reference_type).toBe("affiliate");
  });

  it("debit inserts a negative row and decrements the balance", async () => {
    const { manager, userRepo } = makeManager(1000);
    const svc = new AffiliateWalletService();
    const txn = await svc.debit({
      userId: "u1",
      amount: 400,
      transactionType: "affiliate_payout_debit",
      referenceType: "affiliate_payout",
      referenceId: "p1",
      manager,
    });
    expect(txn.amount).toBe(-400);
    expect(txn.balance_after).toBe(600);
    expect(userRepo.update).toHaveBeenCalledWith({ id: "u1" }, { wallet_balance: 600 });
  });

  it("debit throws insufficient_balance when under-funded", async () => {
    const { manager } = makeManager(100);
    const svc = new AffiliateWalletService();
    await expect(
      svc.debit({
        userId: "u1",
        amount: 400,
        transactionType: "affiliate_payout_debit",
        referenceType: "affiliate_payout",
        referenceId: "p1",
        manager,
      }),
    ).rejects.toThrow("insufficient_balance");
  });
});
