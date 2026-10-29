import { describe, expect, it } from "bun:test";
import { ServiceSearchReindexService } from "./service-search-reindex.service.ts";

const OFFERINGS = [
  {
    id: "o1",
    vendor_id: "v1",
    status: "published",
    name: "A",
    slug: "a",
    location_mode: "either",
    payment_mode: "deposit",
    price_fils: 100,
    duration_minutes: 30,
    created_at: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "o2",
    vendor_id: "v2",
    status: "published",
    name: "B",
    slug: "b",
    location_mode: "home_visit",
    payment_mode: "prepay",
    price_fils: 200,
    duration_minutes: 60,
    created_at: "2026-07-02T00:00:00.000Z",
  },
];

function makeAdapter(existingIds: string[] = []) {
  const indexed: any[] = [];
  const removed: string[] = [];
  let ensured = false;
  let recreated = false;
  const adapter = {
    ensureCollection: async () => {
      ensured = true;
    },
    recreateCollection: async () => {
      recreated = true;
    },
    indexOffering: async (doc: any) => {
      indexed.push(doc);
    },
    listIndexedIds: async () => existingIds,
    removeOffering: async (id: string) => {
      removed.push(id);
    },
  };
  return { adapter, indexed, removed, wasEnsured: () => ensured, wasRecreated: () => recreated };
}

function makeService(
  existingIds: string[] = [],
  overrides: { filterStillPublished?: (ids: string[]) => Promise<Set<string>> } = {},
) {
  const { adapter, indexed, removed, wasEnsured, wasRecreated } = makeAdapter(existingIds);
  const svc = new ServiceSearchReindexService(adapter as any, {
    loadPublishedBatch: async (offset: number) => (offset === 0 ? OFFERINGS : []),
    resolveAreasForVendors: async (ids: string[]) =>
      new Map(ids.map((id) => [id, { premises: [], homeVisit: [] }])),
    loadRatings: async () => new Map(),
    // Default: nothing is still published — candidates are genuinely stale,
    // matching the pre-fix prune behavior for existing tests.
    filterStillPublished: overrides.filterStillPublished ?? (async () => new Set<string>()),
  });
  return { svc, indexed, removed, wasEnsured, wasRecreated };
}

describe("ServiceSearchReindexService", () => {
  it("upserts in place — ensures the collection but never drops it", async () => {
    const { svc, indexed, wasEnsured, wasRecreated } = makeService(["o1", "o2"]);
    const result = await svc.reindexAll();
    expect(wasEnsured()).toBe(true);
    expect(wasRecreated()).toBe(false);
    expect(result.indexed).toBe(2);
    expect(indexed.map((d) => d.id)).toEqual(["o1", "o2"]);
  });

  it("prunes documents Typesense still has that were not indexed this pass", async () => {
    const { svc, removed } = makeService(["o1", "o2", "o3"]);
    const result = await svc.reindexAll();
    expect(result.pruned).toBe(1);
    expect(removed).toEqual(["o3"]);
  });

  it("is a no-op prune when nothing is stale", async () => {
    const { svc, removed } = makeService(["o1", "o2"]);
    const result = await svc.reindexAll();
    expect(result.pruned).toBe(0);
    expect(removed).toEqual([]);
  });

  it("does not prune a candidate that Postgres still shows as published (mid-run publish race)", async () => {
    // o3 is not in indexedIds (this pass's DB scan never saw it — e.g. it was
    // published by the concurrent incremental-sync worker after the scan
    // moved past its page) but IS still published per the DB re-check, so it
    // must survive the prune.
    const { svc, removed } = makeService(["o1", "o2", "o3"], {
      filterStillPublished: async (ids) => {
        expect(ids).toEqual(["o3"]);
        return new Set(["o3"]);
      },
    });
    const result = await svc.reindexAll();
    expect(result.pruned).toBe(0);
    expect(removed).toEqual([]);
  });

  it("prunes a candidate that is genuinely gone, and counts it in `pruned`", async () => {
    const { svc, removed } = makeService(["o1", "o2", "o3"], {
      filterStillPublished: async () => new Set<string>(),
    });
    const result = await svc.reindexAll();
    expect(result.pruned).toBe(1);
    expect(removed).toEqual(["o3"]);
  });

  it("skips the DB re-check entirely when there are zero prune candidates", async () => {
    const { svc, removed } = makeService(["o1", "o2"], {
      filterStillPublished: async () => {
        throw new Error("filterStillPublished must not be called with zero candidates");
      },
    });
    const result = await svc.reindexAll();
    expect(result.pruned).toBe(0);
    expect(removed).toEqual([]);
  });

  it("resolves areas once per batch, not once per offering", async () => {
    let calls = 0;
    const adapter = {
      ensureCollection: async () => {},
      recreateCollection: async () => {},
      indexOffering: async () => {},
      listIndexedIds: async () => [],
      removeOffering: async () => {},
    };
    const svc = new ServiceSearchReindexService(adapter as any, {
      loadPublishedBatch: async (offset: number) => (offset === 0 ? OFFERINGS : []),
      resolveAreasForVendors: async (ids: string[]) => {
        calls += 1;
        return new Map(ids.map((id) => [id, { premises: [], homeVisit: [] }]));
      },
      loadRatings: async () => new Map(),
    });
    await svc.reindexAll();
    expect(calls).toBe(1);
  });
});
