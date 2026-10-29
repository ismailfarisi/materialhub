import { describe, expect, it, mock } from "bun:test";
import { PayoutBalanceRail } from "./payout-balance-rail.ts";

/**
 * R4 (payout correctness) — the structurally identical sibling of
 * `getAdminSummary.total_pending_fils`: both sum `commissions.vendor_earning`
 * for `status='pending'`, and both were missing `payout_id IS NULL`. Here the
 * consequence is worse than a wrong dashboard tile: a vendor could fund a reel
 * licence out of earnings a draft payout had already claimed and was about to
 * transfer, spending the same fils twice.
 */
describe("PayoutBalanceRail — availability excludes claimed commissions", () => {
  function makeManager() {
    const queries: string[] = [];
    const manager: any = {
      query: mock((sql: string) => {
        queries.push(sql);
        return Promise.resolve([{ v: "0" }]);
      }),
    };
    return { manager, queries };
  }

  it("scopes the earnings sum to unclaimed, undeleted commissions", async () => {
    const rail = new PayoutBalanceRail();
    const { manager, queries } = makeManager();

    await rail.availableFils("vendor-1", manager);

    const earned = queries.find((q) => q.includes("SUM(vendor_earning)"));
    expect(earned).toContain("status = 'pending'");
    expect(earned).toContain("payout_id IS NULL");
    expect(earned).toContain("deleted_at IS NULL");
  });

  it("locks exactly the rows it counts, so a concurrent draft cannot claim them mid-hold", async () => {
    const rail = new PayoutBalanceRail();
    const { manager, queries } = makeManager();

    await rail.hold({
      vendorId: "vendor-1",
      amountFils: 0,
      manager,
    } as any);

    const lock = queries.find((q) => q.includes("FOR UPDATE"));
    expect(lock).toContain("payout_id IS NULL");
    expect(lock).toContain("deleted_at IS NULL");
  });
});
