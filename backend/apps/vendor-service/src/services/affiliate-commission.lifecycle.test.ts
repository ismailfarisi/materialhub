import { describe, expect, it, mock } from "bun:test";
import { AffiliateCommissionService } from "./affiliate-commission.service.ts";

function withRepo(commissionRepo: any) {
  const svc = new AffiliateCommissionService();
  (svc as any).commissionRepo = commissionRepo; // seam: getRepos() returns the cached instance
  return svc;
}

describe("AffiliateCommissionService lifecycle", () => {
  it("setEligibility stamps eligible_at = delivered + window on pending rows", async () => {
    const commissionRepo = {
      update: mock(async (_criteria: unknown, _partial: unknown) => ({ affected: 2 })),
    };
    const svc = withRepo(commissionRepo);
    const delivered = new Date("2026-07-01T00:00:00.000Z");
    await svc.setEligibility("o-1", delivered, 7);
    const [where, patch] = commissionRepo.update.mock.calls[0]!;
    expect(where).toEqual({ order_id: "o-1", status: "pending" });
    expect(new Date((patch as any).eligible_at).toISOString()).toBe("2026-07-08T00:00:00.000Z");
  });

  it("voidPendingForOrder flips pending rows to reversed with a reason", async () => {
    const commissionRepo = {
      update: mock(async (_criteria: unknown, _partial: unknown) => ({ affected: 1 })),
    };
    const svc = withRepo(commissionRepo);
    await svc.voidPendingForOrder("o-2", "order_refunded");
    expect(commissionRepo.update).toHaveBeenCalledWith(
      { order_id: "o-2", status: "pending" },
      { status: "reversed", reversed_reason: "order_refunded" },
    );
  });
});
