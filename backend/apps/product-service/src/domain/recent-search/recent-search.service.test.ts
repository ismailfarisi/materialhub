import { describe, expect, test } from "bun:test";

const fakeNow = new Date("2026-05-03T12:00:00Z");

function makeFakeRepo(initial: any[] = []) {
  let rows = [...initial];
  let nextId = 1;
  return {
    upsert: async (row: any) => {
      const existing = rows.find((r) => r.user_id === row.user_id && r.query === row.query);
      if (existing) {
        existing.last_used_at = row.last_used_at;
      } else {
        rows.push({ id: `r${nextId++}`, ...row, created_at: fakeNow });
      }
    },
    count: async ({ where }: any) => rows.filter((r) => r.user_id === where.user_id).length,
    find: async ({ where, order, take }: any) => {
      let filtered = rows.filter((r) => r.user_id === where.user_id);
      filtered =
        order?.last_used_at === "ASC"
          ? filtered.sort((a, b) => a.last_used_at - b.last_used_at)
          : filtered.sort((a, b) => b.last_used_at - a.last_used_at);
      return take ? filtered.slice(0, take) : filtered;
    },
    remove: async (toRemove: any[]) => {
      rows = rows.filter((r) => !toRemove.find((x) => x.id === r.id));
    },
    delete: async (where: any) => {
      rows = rows.filter(
        (r) => !(r.user_id === where.user_id && (where.query == null || r.query === where.query)),
      );
    },
    _rows: () => rows,
  };
}

const { RecentSearchService } = await import("./recent-search.service.ts");

describe("RecentSearchService", () => {
  test("record() inserts a new entry", async () => {
    const repo = makeFakeRepo();
    const svc = new RecentSearchService(repo as any);
    await svc.record("u1", "dior");
    expect(repo._rows()).toHaveLength(1);
    expect(repo._rows()[0].query).toBe("dior");
  });

  test("record() bumps last_used_at on duplicate (no second row)", async () => {
    const repo = makeFakeRepo([
      {
        id: "r1",
        user_id: "u1",
        query: "dior",
        last_used_at: new Date("2020-01-01T00:00:00Z"),
      },
    ]);
    const svc = new RecentSearchService(repo as any);
    await svc.record("u1", "dior");
    expect(repo._rows()).toHaveLength(1);
    expect(repo._rows()[0].last_used_at.getTime()).toBeGreaterThan(
      new Date("2020-01-01").getTime(),
    );
  });

  test("record() caps to 10 entries per user, dropping oldest", async () => {
    const seed = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      user_id: "u1",
      query: `q${i}`,
      last_used_at: new Date(2026, 0, i + 1),
    }));
    const repo = makeFakeRepo(seed);
    const svc = new RecentSearchService(repo as any);
    await svc.record("u1", "newest");
    const rows = repo._rows();
    expect(rows).toHaveLength(10);
    expect(rows.find((r) => r.query === "q0")).toBeUndefined();
    expect(rows.find((r) => r.query === "newest")).toBeDefined();
  });

  test("list() returns up to N most recent for the user", async () => {
    const seed = [
      { id: "r1", user_id: "u1", query: "old", last_used_at: new Date("2026-01-01") },
      { id: "r2", user_id: "u1", query: "new", last_used_at: new Date("2026-05-01") },
      { id: "r3", user_id: "u2", query: "other-user", last_used_at: new Date("2026-05-01") },
    ];
    const repo = makeFakeRepo(seed);
    const svc = new RecentSearchService(repo as any);
    const out = await svc.list("u1", 5);
    expect(out.map((r: any) => r.query)).toEqual(["new", "old"]);
  });

  test("clear() with query removes only that row; without query removes all", async () => {
    const repo = makeFakeRepo([
      { id: "r1", user_id: "u1", query: "a", last_used_at: new Date() },
      { id: "r2", user_id: "u1", query: "b", last_used_at: new Date() },
    ]);
    const svc = new RecentSearchService(repo as any);
    await svc.clear("u1", "a");
    expect(repo._rows().map((r) => r.query)).toEqual(["b"]);
    await svc.clear("u1");
    expect(repo._rows()).toHaveLength(0);
  });
});
