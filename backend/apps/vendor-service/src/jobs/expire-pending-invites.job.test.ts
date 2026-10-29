import { describe, expect, test } from "bun:test";
import { ExpirePendingInvitesJob } from "./expire-pending-invites.job.ts";

interface QueryCall {
  sql: string;
  params?: unknown[];
}

function buildStubDs(returnValue: unknown) {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return returnValue;
    },
  };
}

describe("ExpirePendingInvitesJob.run", () => {
  test("issues UPDATE with the correct WHERE clause", async () => {
    const ds = buildStubDs([]);
    await ExpirePendingInvitesJob.run(ds as any);
    expect(ds.calls).toHaveLength(1);
    const sql = ds.calls[0]!.sql;
    expect(sql).toContain("UPDATE vendor_members");
    expect(sql).toContain("SET deleted_at = NOW()");
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("deleted_at IS NULL");
    expect(sql).toContain("invite_expires_at < NOW() - INTERVAL '30 days'");
    expect(sql).toContain("RETURNING id");
  });

  test("returns count of soft-deleted rows", async () => {
    const ds = buildStubDs([{ id: "vm-1" }, { id: "vm-2" }, { id: "vm-3" }]);
    const result = await ExpirePendingInvitesJob.run(ds as any);
    expect(result.count).toBe(3);
  });

  test("returns count=0 when nothing matched", async () => {
    const ds = buildStubDs([]);
    const result = await ExpirePendingInvitesJob.run(ds as any);
    expect(result.count).toBe(0);
  });
});
