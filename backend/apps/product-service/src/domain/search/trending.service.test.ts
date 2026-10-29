import { describe, expect, test } from "bun:test";

function makeFakeRedis() {
  const sorted: Record<string, Map<string, number>> = {};
  return {
    multi() {
      const ops: Array<() => void> = [];
      const self: any = {
        zincrby(key: string, by: number, member: string) {
          ops.push(() => {
            sorted[key] ??= new Map();
            sorted[key].set(member, (sorted[key].get(member) ?? 0) + by);
          });
          return self;
        },
        expire() {
          return self;
        },
        async exec() {
          for (const op of ops) op();
        },
      };
      return self;
    },
    async zunionstore(dest: string, _n: number, ...keys: string[]) {
      sorted[dest] = new Map();
      for (const k of keys) {
        for (const [m, s] of sorted[k] ?? []) {
          sorted[dest].set(m, (sorted[dest].get(m) ?? 0) + s);
        }
      }
    },
    async expire() {},
    async zrevrange(key: string, start: number, stop: number, _withScores: string) {
      const list = [...(sorted[key] ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
      const out: string[] = [];
      for (const [m, s] of list.slice(start, stop + 1)) {
        out.push(m, String(s));
      }
      return out;
    },
    _sorted: sorted,
  };
}

const { TrendingSearchService } = await import("./trending.service.ts");

describe("TrendingSearchService", () => {
  test("record() increments score in current week's sorted set", async () => {
    const r = makeFakeRedis();
    const svc = new TrendingSearchService(r as any);
    await svc.record("dior");
    await svc.record("dior");
    await svc.record("oud");
    const list = await svc.list(10);
    const dior = list.find((x) => x.query === "dior")!;
    const oud = list.find((x) => x.query === "oud")!;
    expect(dior.count).toBe(2);
    expect(oud.count).toBe(1);
    expect(list.indexOf(dior)).toBeLessThan(list.indexOf(oud));
  });

  test("record() lowercases and trims", async () => {
    const r = makeFakeRedis();
    const svc = new TrendingSearchService(r as any);
    await svc.record("  Dior  ");
    await svc.record("dior");
    const list = await svc.list(10);
    expect(list).toEqual([{ query: "dior", count: 2 }]);
  });

  test("record() ignores empty/whitespace queries", async () => {
    const r = makeFakeRedis();
    const svc = new TrendingSearchService(r as any);
    await svc.record("");
    await svc.record("   ");
    const list = await svc.list(10);
    expect(list).toEqual([]);
  });
});
