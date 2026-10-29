import { describe, expect, it, mock } from "bun:test";
import { FeedCacheClient, type RedisLike } from "./feed-cache.client.ts";
import { FeedService } from "./feed.service.ts";

describe("FeedService.getHomeFeedForYou", () => {
  it("returns ranked reels filtered for already-viewed by user", async () => {
    const fakeCache = {
      getCohort: mock(async () => ["r1", "r2", "r3", "r4", "r5"]),
    };
    const fakeViewRepo = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        where: function () {
          return this;
        },
        andWhere: function () {
          return this;
        },
        getRawMany: async () => [{ reel_id: "r2" }, { reel_id: "r4" }],
      }),
    };
    const fakeReelRepo = {
      findByIds: async (ids: string[]) =>
        ids.map((id) => ({
          id,
          status: "approved",
          published_at: new Date(),
        })),
    };
    const service = new FeedService(fakeCache as any, fakeViewRepo as any, fakeReelRepo as any);
    const result = await service.getHomeFeed({
      tab: "for_you",
      language: "en",
      country: "AE",
      userId: "user-1",
      limit: 20,
    });
    const returnedIds = result.reels.map((r) => r.id);
    expect(returnedIds).not.toContain("r2");
    expect(returnedIds).not.toContain("r4");
    expect(returnedIds).toEqual(["r1", "r3", "r5"]);
  });

  it("anonymous viewer gets full cohort without dedup", async () => {
    const fakeCache = { getCohort: mock(async () => ["r1", "r2", "r3"]) };
    const fakeViewRepo = {
      createQueryBuilder: () => {
        throw new Error("should not call");
      },
    };
    const fakeReelRepo = {
      findByIds: async (ids: string[]) =>
        ids.map((id) => ({
          id,
          status: "approved",
          published_at: new Date(),
        })),
    };
    const service = new FeedService(fakeCache as any, fakeViewRepo as any, fakeReelRepo as any);
    const result = await service.getHomeFeed({
      tab: "for_you",
      language: "en",
      country: "AE",
      userId: null,
      limit: 20,
    });
    expect(result.reels.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });
});

function makeCacheStub(): FeedCacheClient {
  const pipe = {
    del: () => pipe,
    zadd: () => pipe,
    expire: () => pipe,
    exec: async () => [],
  };
  const redis: RedisLike = {
    multi: () => pipe,
    zrevrange: async () => [],
    del: async () => 0,
  };
  return new FeedCacheClient(redis);
}

describe("FeedService.resolveCategory", () => {
  it("looks up by id, caches result, and serves subsequent calls from memory", async () => {
    let dbHits = 0;
    const svc = new FeedService(makeCacheStub());
    (svc as any).categoryLookup = async (ref: { id?: string; slug?: string }) => {
      dbHits++;
      if (ref.id === "cat-1") return { id: "cat-1", slug: "beauty", path: "/beauty" };
      return null;
    };

    const first = await (svc as any).resolveCategory({ id: "cat-1" });
    const second = await (svc as any).resolveCategory({ id: "cat-1" });
    const third = await (svc as any).resolveCategory({ slug: "beauty" });

    expect(first).toEqual({ id: "cat-1", path: "/beauty" });
    expect(second).toEqual({ id: "cat-1", path: "/beauty" });
    expect(third).toEqual({ id: "cat-1", path: "/beauty" });
    expect(dbHits).toBe(1);
  });

  it("throws unknown_category when lookup returns null", async () => {
    const svc = new FeedService(makeCacheStub());
    (svc as any).categoryLookup = async () => null;
    await expect((svc as any).resolveCategory({ slug: "nope" })).rejects.toThrow(
      "unknown_category",
    );
  });

  it("rejects refs with both id and slug", async () => {
    const svc = new FeedService(makeCacheStub());
    await expect((svc as any).resolveCategory({ id: "x", slug: "y" })).rejects.toThrow(
      "category_ref_exclusive",
    );
  });

  it("rejects refs with neither id nor slug", async () => {
    const svc = new FeedService(makeCacheStub());
    await expect((svc as any).resolveCategory({})).rejects.toThrow("category_ref_required");
  });
});

describe("FeedService.getCategoryFeed", () => {
  it("returns reels in cohort order on cache hit, filtered by seen set", async () => {
    const pipe = { del: () => pipe, zadd: () => pipe, expire: () => pipe, exec: async () => [] };
    const redis: RedisLike = {
      multi: () => pipe,
      zrevrange: async () => ["r1", "r2", "r3"],
      del: async () => 0,
    };
    const cache = new FeedCacheClient(redis);
    const svc = new FeedService(cache);
    (svc as any).categoryLookup = async () => ({ id: "cat-1", slug: "beauty", path: "/beauty" });

    (svc as any).viewRepo = {
      createQueryBuilder: () => ({
        select: () => ({
          where: () => ({
            andWhere: () => ({ getRawMany: async () => [{ reel_id: "r2" }] }),
          }),
        }),
      }),
    };
    (svc as any).reelRepo = {
      findByIds: async (ids: string[]) =>
        ids.map((id) => ({ id, published_at: new Date("2026-01-01") })),
    };

    const res = await svc.getCategoryFeed(
      { id: "cat-1" },
      { userId: "user-a", limit: 5, language: "en", country: "AE" },
    );

    expect(res.reels.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(res.nextCursor).toBe("3");
  });
});

describe("FeedService.getProductFeed author_kind filter", () => {
  // Build a fake reelRepo whose createQueryBuilder records the parameters
  // passed via .where()/.andWhere() and returns a canned set of rows. The
  // shape of the returned row only matters in that .id needs to exist.
  function buildFilteredRepoStub(rows: Array<{ id: string; author_kind: string }>) {
    const params: Record<string, unknown> = {};
    let limitArg = 0;
    let offsetArg = 0;
    const captured = { params, limit: () => limitArg, offset: () => offsetArg };
    const repo = {
      createQueryBuilder: () => {
        const qb: any = {
          innerJoin: () => qb,
          where: (_sql: string, p: Record<string, unknown>) => {
            Object.assign(params, p);
            return qb;
          },
          andWhere: (_sql: string, p?: Record<string, unknown>) => {
            if (p) Object.assign(params, p);
            return qb;
          },
          orderBy: () => qb,
          offset: (n: number) => {
            offsetArg = n;
            return qb;
          },
          limit: (n: number) => {
            limitArg = n;
            return qb;
          },
          getMany: async () => rows,
        };
        return qb;
      },
    };
    return { repo, captured };
  }

  it("authorKind=creator filters to creator-only and bypasses the cohort cache", async () => {
    const cache = {
      getCohort: mock(async () => {
        throw new Error("should not call getCohort when filtered");
      }),
    };
    const { repo, captured } = buildFilteredRepoStub([
      { id: "rc1", author_kind: "creator" },
      { id: "rc2", author_kind: "creator" },
    ]);
    const svc = new FeedService(cache as any, {} as any, repo as any);

    const res = await svc.getProductFeed("00000000-0000-0000-0000-000000000001", {
      userId: null,
      limit: 10,
      authorKind: "creator",
    });

    expect((cache.getCohort as any).mock.calls.length).toBe(0);
    expect(captured.params.ak).toBe("creator");
    expect(captured.params.status).toBe("approved");
    expect(captured.params.pid).toBe("00000000-0000-0000-0000-000000000001");
    expect(captured.limit()).toBe(11);
    expect(captured.offset()).toBe(0);
    expect(res.reels.map((r: any) => r.id)).toEqual(["rc1", "rc2"]);
    expect(res.nextCursor).toBeNull();
  });

  it("authorKind=customer filters to customer-only", async () => {
    const cache = { getCohort: mock(async () => []) };
    const { repo, captured } = buildFilteredRepoStub([{ id: "rb1", author_kind: "customer" }]);
    const svc = new FeedService(cache as any, {} as any, repo as any);

    const res = await svc.getProductFeed("00000000-0000-0000-0000-000000000002", {
      userId: "user-x",
      limit: 5,
      authorKind: "customer",
    });

    expect(captured.params.ak).toBe("customer");
    expect(res.reels.map((r: any) => r.id)).toEqual(["rb1"]);
  });

  it("authorKind=house filters to house-only", async () => {
    const cache = { getCohort: mock(async () => []) };
    const { repo, captured } = buildFilteredRepoStub([{ id: "rh1", author_kind: "house" }]);
    const svc = new FeedService(cache as any, {} as any, repo as any);

    const res = await svc.getProductFeed("00000000-0000-0000-0000-000000000003", {
      userId: null,
      limit: 5,
      authorKind: "house",
    });

    expect(captured.params.ak).toBe("house");
    expect(res.reels.map((r: any) => r.id)).toEqual(["rh1"]);
  });

  it("emits next cursor when filtered query returns more than limit", async () => {
    const cache = { getCohort: mock(async () => []) };
    // 4 rows when asking for limit=3 -> should slice to 3 and emit nextCursor.
    const { repo } = buildFilteredRepoStub([
      { id: "rc1", author_kind: "creator" },
      { id: "rc2", author_kind: "creator" },
      { id: "rc3", author_kind: "creator" },
      { id: "rc4", author_kind: "creator" },
    ]);
    const svc = new FeedService(cache as any, {} as any, repo as any);

    const res = await svc.getProductFeed("00000000-0000-0000-0000-000000000004", {
      userId: null,
      cursor: "10",
      limit: 3,
      authorKind: "creator",
    });

    expect(res.reels.map((r: any) => r.id)).toEqual(["rc1", "rc2", "rc3"]);
    // offset 10 + 3 returned items = 13.
    expect(res.nextCursor).toBe("13");
  });

  it("no authorKind runs the legacy cache+DB path (cache hit)", async () => {
    const cache = {
      getCohort: mock(async () => ["r1", "r2", "r3"]),
    };
    const fakeViewRepo = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        where: function () {
          return this;
        },
        andWhere: function () {
          return this;
        },
        getRawMany: async () => [],
      }),
    };
    const fakeReelRepo = {
      findByIds: async (ids: string[]) => ids.map((id) => ({ id })),
    };
    const svc = new FeedService(cache as any, fakeViewRepo as any, fakeReelRepo as any);

    const res = await svc.getProductFeed("00000000-0000-0000-0000-000000000005", {
      userId: "user-z",
      limit: 5,
    });

    expect((cache.getCohort as any).mock.calls.length).toBe(1);
    // The cohort key for the unfiltered branch is `product:<id>` with no suffix.
    expect((cache.getCohort as any).mock.calls[0][0]).toBe(
      "product:00000000-0000-0000-0000-000000000005",
    );
    expect(res.reels.map((r: any) => r.id)).toEqual(["r1", "r2", "r3"]);
  });
});

describe("FeedService.getCategoryFeed cache-miss", () => {
  it("falls back to live SQL when Redis cohort is empty", async () => {
    const pipe = { del: () => pipe, zadd: () => pipe, expire: () => pipe, exec: async () => [] };
    const redis: RedisLike = {
      multi: () => pipe,
      zrevrange: async () => [],
      del: async () => 0,
    };
    const cache = new FeedCacheClient(redis);
    const svc = new FeedService(cache);
    (svc as any).categoryLookup = async () => ({ id: "cat-1", slug: "beauty", path: "/beauty" });

    const captured: { path?: string; lang?: string; limit?: number } = {};
    const rows = [
      { id: "r1", published_at: new Date("2026-01-01") },
      { id: "r2", published_at: new Date("2026-01-02") },
    ];
    (svc as any).reelRepo = {
      createQueryBuilder: () => {
        const params: Record<string, unknown> = {};
        const qb: any = {
          innerJoin: () => qb,
          where: () => qb,
          andWhere: (_sql: string, p: Record<string, unknown>) => {
            Object.assign(params, p);
            return qb;
          },
          groupBy: () => qb,
          orderBy: () => qb,
          limit: (n: number) => {
            captured.limit = n;
            return qb;
          },
          offset: () => qb,
          getMany: async () => {
            captured.path = params.path as string;
            captured.lang = params.lang as string;
            return rows;
          },
        };
        return qb;
      },
    };

    const res = await svc.getCategoryFeed(
      { id: "cat-1" },
      { userId: null, limit: 2, language: "en", country: "AE" },
    );

    expect(captured.path).toBe("/beauty%");
    expect(captured.lang).toBe("en");
    expect(captured.limit).toBe(3);
    expect(res.reels.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(res.nextCursor).toBeNull();
  });
});
