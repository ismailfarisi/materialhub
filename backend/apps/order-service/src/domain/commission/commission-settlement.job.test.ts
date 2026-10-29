import { describe, expect, it, mock } from "bun:test";
import { runCommissionSettlement } from "./commission-settlement.job.ts";

describe("runCommissionSettlement", () => {
  it("promotes only matured held rows and reports the count", async () => {
    const query = mock(async () => [[], 3]);
    const commissionRepo = { manager: { query } } as any;

    const result = await runCommissionSettlement({ commissionRepo });

    expect(result.settled).toBe(3);
    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("status = 'held'");
    expect(sql).toContain("settle_after IS NOT NULL");
    expect(sql).toContain("settle_after <= now()");
    expect(sql).toContain("payout_id IS NULL");
  });

  it("reports zero when nothing has matured", async () => {
    const query = mock(async () => [[], 0]);
    const result = await runCommissionSettlement({
      commissionRepo: { manager: { query } } as any,
    });
    expect(result.settled).toBe(0);
  });
});
