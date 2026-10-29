import { describe, expect, it } from "bun:test";
import { cutoffFromDays, sweepIntegrationData } from "./retention-delete.cron.ts";

describe("cutoffFromDays", () => {
  const now = new Date("2026-04-28T12:00:00Z");

  it("subtracts the given days from now", () => {
    const cutoff = cutoffFromDays(365, now);
    expect(cutoff.toISOString()).toBe("2025-04-28T12:00:00.000Z");
  });

  it("handles 90 days correctly", () => {
    const cutoff = cutoffFromDays(90, now);
    expect(cutoff.toISOString()).toBe("2026-01-28T12:00:00.000Z");
  });

  it("rejects nothing on 0 days (returns now)", () => {
    const cutoff = cutoffFromDays(0, now);
    expect(cutoff.toISOString()).toBe(now.toISOString());
  });
});

describe("sweepIntegrationData — per-table counts", () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  function makeFakeDataSource(perTableAffected: Record<string, number>) {
    return {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        const tableMatch = sql.match(/DELETE FROM (\w+)/);
        const table = tableMatch?.[1] ?? "";
        const affected = perTableAffected[table] ?? 0;
        return [[], affected];
      },
    };
  }

  it("issues three DELETEs (one per table) gated by the same cutoff", async () => {
    queries.length = 0;
    const fakeDs = makeFakeDataSource({
      vendor_integration_deliveries: 5,
      channel_deliveries: 12,
      channel_feed_runs: 3,
    });
    const cutoff = new Date("2025-06-01T00:00:00Z");
    const result = await sweepIntegrationData(cutoff, fakeDs as any);
    expect(queries).toHaveLength(3);
    expect(queries.map((q) => q.sql)).toEqual([
      "DELETE FROM vendor_integration_deliveries WHERE created_at < $1",
      "DELETE FROM channel_deliveries WHERE created_at < $1",
      "DELETE FROM channel_feed_runs WHERE created_at < $1",
    ]);
    for (const q of queries) {
      expect(q.params).toEqual([cutoff]);
    }
    expect(result).toEqual({
      cutoff: cutoff.toISOString(),
      vendor_integration_deliveries: 5,
      channel_deliveries: 12,
      channel_feed_runs: 3,
    });
  });
});
