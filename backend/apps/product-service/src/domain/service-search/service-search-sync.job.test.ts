import { describe, expect, it } from "bun:test";
import type { Job } from "bullmq";
import { ServiceSearchSyncProcessor, enqueueServiceSearchSync } from "./service-search-sync.job.ts";

function makeHarness(offerings: Record<string, any>) {
  const indexed: string[] = [];
  const removed: string[] = [];
  const adapter = {
    indexOffering: async (doc: any) => {
      indexed.push(doc.id);
    },
    removeOffering: async (id: string) => {
      removed.push(id);
    },
  };
  const processor = new ServiceSearchSyncProcessor(adapter as any, {
    loadOffering: async (id: string) => offerings[id] ?? null,
    loadPublishedOfferingIdsForVendor: async (vendorId: string) =>
      Object.values(offerings)
        .filter((o: any) => o.vendor_id === vendorId && o.status === "published")
        .map((o: any) => o.id),
    resolveAreasForVendors: async () => new Map([["v1", { premises: [], homeVisit: [] }]]),
    loadRatings: async () => new Map(),
  });
  return { processor, indexed, removed };
}

const published = {
  id: "o1",
  vendor_id: "v1",
  status: "published",
  name: "Balayage",
  slug: "balayage-o1",
  location_mode: "at_premises",
  payment_mode: "deposit",
  price_fils: 1000,
  duration_minutes: 60,
  created_at: "2026-07-01T00:00:00.000Z",
};

describe("ServiceSearchSyncProcessor — upsert_offering", () => {
  it("indexes a published offering", async () => {
    const h = makeHarness({ o1: published });
    await h.processor.process({ data: { type: "upsert_offering", offeringId: "o1" } });
    expect(h.indexed).toEqual(["o1"]);
    expect(h.removed).toEqual([]);
  });

  it("DELETES a paused offering rather than leaving it indexed", async () => {
    const h = makeHarness({ o1: { ...published, status: "paused" } });
    await h.processor.process({ data: { type: "upsert_offering", offeringId: "o1" } });
    expect(h.indexed).toEqual([]);
    expect(h.removed).toEqual(["o1"]);
  });

  it.each(["draft", "pending_review", "rejected", "archived"])(
    "never indexes status %s",
    async (status) => {
      const h = makeHarness({ o1: { ...published, status } });
      await h.processor.process({ data: { type: "upsert_offering", offeringId: "o1" } });
      expect(h.indexed).toEqual([]);
      expect(h.removed).toEqual(["o1"]);
    },
  );

  it("removes an offering that no longer exists", async () => {
    const h = makeHarness({});
    await h.processor.process({ data: { type: "upsert_offering", offeringId: "gone" } });
    expect(h.removed).toEqual(["gone"]);
  });
});

describe("ServiceSearchSyncProcessor — resync_vendor fan-out", () => {
  it("re-indexes every published offering of that vendor", async () => {
    const h = makeHarness({
      o1: published,
      o2: { ...published, id: "o2" },
      o3: { ...published, id: "o3", status: "draft" },
      o4: { ...published, id: "o4", vendor_id: "v2" },
    });
    await h.processor.process({ data: { type: "resync_vendor", vendorId: "v1" } });
    expect(h.indexed.sort()).toEqual(["o1", "o2"]);
  });

  it("is a no-op for a vendor with no published offerings", async () => {
    const h = makeHarness({ o3: { ...published, id: "o3", status: "draft" } });
    await h.processor.process({ data: { type: "resync_vendor", vendorId: "v1" } });
    expect(h.indexed).toEqual([]);
  });
});

describe("ServiceSearchSyncProcessor — delete_offering", () => {
  it("removes without loading", async () => {
    const h = makeHarness({});
    await h.processor.process({ data: { type: "delete_offering", offeringId: "o9" } });
    expect(h.removed).toEqual(["o9"]);
  });
});

describe("enqueueServiceSearchSync — job options", () => {
  function makeFakeQueue() {
    const calls: Array<{ name: string; data: unknown; opts: any }> = [];
    const queue = {
      add: async (name: string, data: unknown, opts: any) => {
        calls.push({ name, data, opts });
        // The real Queue#add resolves with a Job; the fake only needs to
        // satisfy the return type, since callers here only inspect `calls`.
        return { name, data, opts } as unknown as Job;
      },
    };
    return { queue, calls };
  }

  it("uses vendor:<id> as the deterministic jobId for resync_vendor", async () => {
    const { queue, calls } = makeFakeQueue();
    await enqueueServiceSearchSync({ type: "resync_vendor", vendorId: "v1" }, { queue });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.opts.jobId).toBe("vendor:v1");
  });

  it("uses offering:<id> as the deterministic jobId for upsert_offering", async () => {
    const { queue, calls } = makeFakeQueue();
    await enqueueServiceSearchSync({ type: "upsert_offering", offeringId: "o1" }, { queue });
    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.opts.jobId).toBe("offering:o1");
  });

  it("uses offering:<id> as the deterministic jobId for delete_offering", async () => {
    const { queue, calls } = makeFakeQueue();
    await enqueueServiceSearchSync({ type: "delete_offering", offeringId: "o2" }, { queue });
    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.opts.jobId).toBe("offering:o2");
  });

  it("regression: removeOnComplete and removeOnFail are both true, not a retention count", async () => {
    // If these become numbers again (e.g. removeOnComplete: 100), the
    // completed job's Redis key sticks around, BullMQ's dedup-by-jobId path
    // silently swallows every later add() for the same entity, and a paused
    // service never gets removed from the search index.
    const { queue, calls } = makeFakeQueue();
    await enqueueServiceSearchSync({ type: "upsert_offering", offeringId: "o1" }, { queue });
    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.opts.removeOnComplete).toBe(true);
    expect(call?.opts.removeOnFail).toBe(true);
  });

  it("respects an explicit jobId override", async () => {
    const { queue, calls } = makeFakeQueue();
    await enqueueServiceSearchSync(
      { type: "upsert_offering", offeringId: "o1" },
      { queue, jobId: "custom:1" },
    );
    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.opts.jobId).toBe("custom:1");
  });

  // Minor-3: enqueueServiceSearchSync is awaited by ServiceOfferingService's
  // create/update/approve/reject AFTER the offering row (and, for approve(),
  // services_trusted) is already saved. A Redis blip here must not turn an
  // already-committed write into a 500 for the vendor/admin caller — mirrors
  // booking-service's notifyVendorAreasChanged (service-search-notify.ts).
  it("swallows a queue.add failure instead of propagating it to the caller", async () => {
    const queue = {
      add: async () => {
        throw new Error("ECONNREFUSED redis");
      },
    };
    await expect(
      enqueueServiceSearchSync({ type: "upsert_offering", offeringId: "o1" }, { queue }),
    ).resolves.toBeUndefined();
  });
});
