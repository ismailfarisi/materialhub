import { describe, expect, it } from "bun:test";
import { FeedCacheClient, type RedisLike } from "./feed-cache.client.ts";

function makeFakeRedis() {
  const store = new Map<string, Map<string, number>>();
  return {
    multi: () => {
      const ops: Array<() => Promise<any>> = [];
      const m: any = {
        del: (key: string) => {
          ops.push(async () => {
            store.delete(key);
          });
          return m;
        },
        zadd: (key: string, ...args: any[]) => {
          ops.push(async () => {
            const z = store.get(key) ?? new Map();
            for (let i = 0; i < args.length; i += 2) {
              z.set(args[i + 1], Number(args[i]));
            }
            store.set(key, z);
          });
          return m;
        },
        expire: () => m,
        exec: async () => {
          for (const o of ops) await o();
          return [];
        },
      };
      return m;
    },
    zrevrange: async (key: string, start: number, stop: number) => {
      const z = store.get(key);
      if (!z) return [];
      return Array.from(z.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(start, stop + 1)
        .map(([member]) => member);
    },
  };
}

describe("FeedCacheClient", () => {
  it("setCohort + getCohort returns ids in score-descending order", async () => {
    const fake = makeFakeRedis();
    const client = new FeedCacheClient(fake as any);
    await client.setCohort("home:for_you:en:AE", [
      { reelId: "r1", score: 10 },
      { reelId: "r2", score: 50 },
      { reelId: "r3", score: 25 },
    ]);
    const ids = await client.getCohort("home:for_you:en:AE", 0, 9);
    expect(ids).toEqual(["r2", "r3", "r1"]);
  });
});

describe("FeedCacheClient.invalidateMany", () => {
  it("issues one pipelined DEL per prefixed key and no-ops on empty input", async () => {
    const deleted: string[] = [];
    const pipe = {
      del: (k: string) => {
        deleted.push(k);
        return pipe;
      },
      zadd: () => pipe,
      expire: () => pipe,
      exec: async () => [],
    };
    const redis: RedisLike = {
      multi: () => pipe,
      zrevrange: async () => [],
      del: async () => 0,
    };
    const cache = new FeedCacheClient(redis);

    await cache.invalidateMany([]);
    expect(deleted).toEqual([]);

    await cache.invalidateMany(["category:a:en:AE", "category:b:ar:AE"]);
    expect(deleted).toEqual(["reels:cohort:category:a:en:AE", "reels:cohort:category:b:ar:AE"]);
  });
});
