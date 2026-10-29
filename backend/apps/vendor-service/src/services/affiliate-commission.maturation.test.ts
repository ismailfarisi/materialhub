import { describe, expect, it, mock } from "bun:test";
import { AffiliateCommissionService } from "./affiliate-commission.service.ts";

// Drive transitionEligibleToEarned with a fake manager + injected wallet.
describe("AffiliateCommissionService.transitionEligibleToEarned", () => {
  it("credits the wallet and flips eligible pending rows to earned", async () => {
    const eligible = [
      { id: "c1", vendor_affiliate_id: null, commission_fils: "1500" },
      { id: "c2", vendor_affiliate_id: null, commission_fils: "500" },
    ];
    // affiliate lookup returns the payee user id
    const affiliateRepo = { findOne: mock(async () => ({ id: "a1", user_id: "u1" })) };
    const commissionRepo = {
      createQueryBuilder: () => ({
        where() {
          return this;
        },
        andWhere() {
          return this;
        },
        orderBy() {
          return this;
        },
        setLock() {
          return this;
        },
        setOnLocked() {
          return this;
        },
        limit() {
          return this;
        },
        getMany: async () => eligible,
      }),
      update: mock(async (_criteria: unknown, _partial: unknown) => ({ affected: 1 })),
    };
    const manager = {
      getRepository: (e: any) =>
        String(e).includes("VendorAffiliate") ? affiliateRepo : commissionRepo,
    };
    const wallet = { credit: mock(async () => ({ id: "txn-1" })) } as any;
    const svc = new AffiliateCommissionService(wallet);
    (svc as any).runInTransaction = async (fn: any) => fn(manager); // seam, see Step 3
    const n = await svc.transitionEligibleToEarned(new Date());
    expect(n).toBe(2);
    expect(wallet.credit).toHaveBeenCalledTimes(2);
    expect(wallet.credit.mock.calls[0][0].amount).toBe(1500);
    expect(wallet.credit.mock.calls[0][0].referenceType).toBe("affiliate");
    const [, patch] = commissionRepo.update.mock.calls[0]!;
    expect((patch as any).status).toBe("earned");
  });
});
