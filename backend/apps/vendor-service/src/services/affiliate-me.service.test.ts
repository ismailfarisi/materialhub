import { describe, expect, it, mock } from "bun:test";
import { AffiliateMeService } from "./affiliate-me.service.ts";

describe("AffiliateMeService", () => {
  it("earningsSummary groups the user's commissions by status", async () => {
    const rows = [{ status: "earned", total_fils: "3000", count: 2 }];
    const commissionRepo = {
      createQueryBuilder: () => ({
        select() {
          return this;
        },
        addSelect() {
          return this;
        },
        innerJoin() {
          return this;
        },
        where() {
          return this;
        },
        groupBy() {
          return this;
        },
        getRawMany: async () => rows,
      }),
    };
    const svc = new AffiliateMeService({} as any, commissionRepo as any);
    expect(await svc.earningsSummary("u1")).toEqual(rows);
  });

  it("assertOwnsAffiliate throws when the affiliate belongs to another user", async () => {
    const affiliateRepo = { findOne: mock(async () => ({ id: "aff-1", user_id: "other" })) };
    const svc = new AffiliateMeService(affiliateRepo as any, {} as any);
    await expect(svc.assertOwnsAffiliate("u1", "aff-1")).rejects.toThrow();
  });
});
