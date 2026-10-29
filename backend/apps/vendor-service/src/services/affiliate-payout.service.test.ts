import { describe, expect, it, mock } from "bun:test";
import {
  AffiliatePayoutService,
  NoopAffiliatePayoutInitiator,
} from "./affiliate-payout.service.ts";

describe("AffiliatePayoutService.executePayout", () => {
  it("flips the loaded earned rows to paid by id and debits the wallet", async () => {
    const earned = [
      { id: "c1", commission_fils: "1500" },
      { id: "c2", commission_fils: "500" },
    ];
    const commissionRepo = {
      update: mock(async (_criteria: unknown, _partial: unknown) => ({ affected: 2 })),
    };
    const manager = { getRepository: () => commissionRepo } as any;
    const wallet = { debit: mock(async () => ({ id: "txn-1" })) } as any;
    const svc = new AffiliatePayoutService(wallet, new NoopAffiliatePayoutInitiator());
    const res = await svc.executePayout(manager, "u1", 2000, earned as any);
    expect(res).toEqual({
      amountFils: 2000,
      status: "queued",
      externalRef: expect.stringContaining("stub_"),
    });
    expect(commissionRepo.update).toHaveBeenCalled();
    const [_where, patch] = commissionRepo.update.mock.calls[0]!;
    expect((patch as any).status).toBe("paid");
    expect(wallet.debit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", amount: 2000, referenceType: "affiliate_payout" }),
    );
  });
});
