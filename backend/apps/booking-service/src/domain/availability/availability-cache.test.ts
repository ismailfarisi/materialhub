import { describe, expect, it } from "bun:test";
import { AvailabilityCache, type RedisLike } from "./availability-cache.ts";
import type { Interval } from "./interval-math.ts";

// In-memory fake honouring the RedisLike surface: one HASH per staff-day, whose
// fields are timezones (EX/expire ignored).
function fakeRedis(opts?: { failOn?: "hGet" | "hSet" | "del" }) {
  const store = new Map<string, Map<string, string>>();
  const boom = (op: string) => {
    if (opts?.failOn === op) throw new Error(`redis ${op} failed`);
  };
  const client: RedisLike & { store: Map<string, Map<string, string>> } = {
    store,
    async hGet(key, field) {
      boom("hGet");
      return store.get(key)?.get(field) ?? null;
    },
    async hSet(key, field, value) {
      boom("hSet");
      const h = store.get(key) ?? new Map<string, string>();
      h.set(field, value);
      store.set(key, h);
    },
    async expire() {
      return 1;
    },
    async del(keys) {
      boom("del");
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) store.delete(k);
    },
  };
  return client;
}

const TZ = "Asia/Dubai";
const windows: Interval[] = [
  { start: new Date("2026-07-10T05:00:00Z"), end: new Date("2026-07-10T09:00:00Z") },
];

describe("AvailabilityCache", () => {
  it("computes and stores on a miss", async () => {
    const redis = fakeRedis();
    const cache = new AvailabilityCache(redis);
    let calls = 0;
    const out = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      calls++;
      return windows;
    });
    expect(calls).toBe(1);
    expect(out[0]!.start.toISOString()).toBe("2026-07-10T05:00:00.000Z");
    expect(redis.store.get("avail:staff-1:2026-07-10")?.has(TZ)).toBe(true);
  });

  it("returns the cached value on a hit without recomputing", async () => {
    const redis = fakeRedis();
    const cache = new AvailabilityCache(redis);
    await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => windows);
    let secondCalls = 0;
    const out = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      secondCalls++;
      return [];
    });
    expect(secondCalls).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]!.end.toISOString()).toBe("2026-07-10T09:00:00.000Z");
  });

  it("invalidate clears the day so the next read recomputes", async () => {
    const redis = fakeRedis();
    const cache = new AvailabilityCache(redis);
    await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => windows);
    await cache.invalidate("staff-1", ["2026-07-10"]);
    expect(redis.store.has("avail:staff-1:2026-07-10")).toBe(false);
    let recomputed = 0;
    await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      recomputed++;
      return windows;
    });
    expect(recomputed).toBe(1);
  });

  it("degrades gracefully with no Redis (always computes)", async () => {
    const cache = new AvailabilityCache(null);
    let calls = 0;
    const out = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      calls++;
      return windows;
    });
    const again = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      calls++;
      return windows;
    });
    expect(calls).toBe(2); // no cache → recomputes each time
    expect(out).toHaveLength(1);
    expect(again).toHaveLength(1);
  });

  it("keys per staff+day", () => {
    const cache = new AvailabilityCache(null);
    expect(cache.key("abc", "2026-07-10")).toBe("avail:abc:2026-07-10");
  });
});

// Finding #4: the cached windows are derived from dayRangeUtc(day, timezone),
// so the same local-day label denotes a different UTC span per zone.
describe("AvailabilityCache timezone discrimination", () => {
  it("does not serve a Dubai-computed day to a London request", async () => {
    const redis = fakeRedis();
    const cache = new AvailabilityCache(redis);
    const dubai: Interval[] = [
      { start: new Date("2026-07-19T20:00:00Z"), end: new Date("2026-07-20T20:00:00Z") },
    ];
    const london: Interval[] = [
      { start: new Date("2026-07-20T23:00:00Z"), end: new Date("2026-07-21T23:00:00Z") },
    ];
    await cache.getOrCompute("staff-1", "2026-07-20", "Asia/Dubai", async () => dubai);
    let londonComputed = 0;
    const out = await cache.getOrCompute("staff-1", "2026-07-20", "Europe/London", async () => {
      londonComputed++;
      return london;
    });
    expect(londonComputed).toBe(1);
    expect(out[0]!.start.toISOString()).toBe("2026-07-20T23:00:00.000Z");
  });

  it("invalidate drops every timezone's copy of the day in one call", async () => {
    const redis = fakeRedis();
    const cache = new AvailabilityCache(redis);
    await cache.getOrCompute("staff-1", "2026-07-20", "Asia/Dubai", async () => windows);
    await cache.getOrCompute("staff-1", "2026-07-20", "Europe/London", async () => windows);
    expect(redis.store.get("avail:staff-1:2026-07-20")?.size).toBe(2);
    await cache.invalidate("staff-1", ["2026-07-20"]);
    expect(redis.store.has("avail:staff-1:2026-07-20")).toBe(false);
  });
});

// Finding #2: the documented graceful degradation must hold for command
// failures, not just connect failures.
describe("AvailabilityCache degradation on command failure", () => {
  it("falls through to compute when the read rejects", async () => {
    const cache = new AvailabilityCache(fakeRedis({ failOn: "hGet" }));
    let calls = 0;
    const out = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      calls++;
      return windows;
    });
    expect(calls).toBe(1);
    expect(out).toHaveLength(1);
  });

  it("still returns computed windows when the write rejects", async () => {
    const cache = new AvailabilityCache(fakeRedis({ failOn: "hSet" }));
    const out = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => windows);
    expect(out[0]!.start.toISOString()).toBe("2026-07-10T05:00:00.000Z");
  });

  it("never throws out of invalidate when the DEL rejects", async () => {
    const cache = new AvailabilityCache(fakeRedis({ failOn: "del" }));
    // The caller has already committed its write; a cache failure must not turn
    // that success into a 500 (a retried create would duplicate the row).
    await cache.invalidate("staff-1", ["2026-07-10"]);
    await cache.invalidateRange(
      "staff-1",
      new Date("2026-07-10T09:00:00Z"),
      new Date("2026-07-10T17:00:00Z"),
    );
  });

  it("goes blind (read-through, no writes) after a failed invalidation", async () => {
    const redis = fakeRedis({ failOn: "del" });
    const cache = new AvailabilityCache(redis);
    // Seed a value, then fail its invalidation: the stale entry may still exist,
    // so subsequent reads must recompute rather than serve it.
    redis.store.set("avail:staff-1:2026-07-10", new Map([[TZ, JSON.stringify([])]]));
    await cache.invalidate("staff-1", ["2026-07-10"]);
    let calls = 0;
    const out = await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => {
      calls++;
      return windows;
    });
    expect(calls).toBe(1);
    expect(out).toHaveLength(1);
  });
});

describe("AvailabilityCache.getOrComputeMany", () => {
  it("computes only the missing days and returns every requested day", async () => {
    const redis = fakeRedis();
    const cache = new AvailabilityCache(redis);
    await cache.getOrCompute("staff-1", "2026-07-10", TZ, async () => windows);
    const computedDays: string[] = [];
    const out = await cache.getOrComputeMany(
      "staff-1",
      TZ,
      ["2026-07-10", "2026-07-11", "2026-07-12"],
      async (day) => {
        computedDays.push(day);
        return windows;
      },
    );
    expect(computedDays).toEqual(["2026-07-11", "2026-07-12"]);
    expect(out.size).toBe(3);
    expect(out.get("2026-07-10")).toHaveLength(1);
  });

  it("returns an empty map for an empty day list without touching Redis", async () => {
    const cache = new AvailabilityCache(fakeRedis({ failOn: "hGet" }));
    const out = await cache.getOrComputeMany("staff-1", TZ, [], async () => windows);
    expect(out.size).toBe(0);
  });
});
