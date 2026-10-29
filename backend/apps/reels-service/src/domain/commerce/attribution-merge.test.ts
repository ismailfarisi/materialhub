import { describe, expect, it } from "bun:test";
import { AttributionMergeService } from "./attribution-merge.service.ts";

describe("AttributionMergeService.mergeGuestToUser", () => {
  it("runs three SQL statements in one transaction", async () => {
    const queries: string[] = [];
    const params: unknown[][] = [];
    const mgr = {
      query: (sql: string, p: unknown[]) => {
        queries.push(sql);
        params.push(p);
        return Promise.resolve([]);
      },
    };
    const dataSource = {
      transaction: (cb: (m: any) => Promise<any>) => cb(mgr),
    };
    const svc = new AttributionMergeService(dataSource as any);

    await svc.mergeGuestToUser("s1", "u1");

    expect(queries).toHaveLength(3);
    // 1: delete conflicting anon views
    expect(queries[0]).toMatch(/DELETE FROM "reel_views"/);
    expect(queries[0]).toMatch(/EXISTS/);
    // 2: update remaining anon views
    expect(queries[1]).toMatch(/UPDATE "reel_views"/);
    expect(queries[1]).toMatch(/SET "user_id" = \$2/);
    // 3: update anon attributions
    expect(queries[2]).toMatch(/UPDATE "reel_attributions"/);

    for (const p of params) {
      expect(p).toEqual(["s1", "u1"]);
    }
  });

  it("no-ops cleanly for an unknown session (passes params, DB returns 0 rows)", async () => {
    const mgr = { query: () => Promise.resolve([]) };
    const dataSource = {
      transaction: (cb: (m: any) => Promise<any>) => cb(mgr),
    };
    const svc = new AttributionMergeService(dataSource as any);

    await expect(svc.mergeGuestToUser("unknown", "u1")).resolves.toBeUndefined();
  });
});
