import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as searchSync from "../search/search-sync.job.ts";
import { scheduleIndexUpdates, scheduleIndexUpdatesBulk } from "./effects.ts";

describe("scheduleIndexUpdates (per-deal)", () => {
  let enqueueSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    enqueueSpy = spyOn(searchSync, "enqueueSearchSync").mockImplementation(async () => {});
  });
  afterEach(() => {
    enqueueSpy.mockRestore();
  });

  test("schedules immediate sync + delayed expiry job keyed by deal id", async () => {
    const future = new Date(Date.now() + 60_000);
    await scheduleIndexUpdates("p1", "d1", future);
    expect(enqueueSpy).toHaveBeenCalledTimes(2);
    expect(enqueueSpy).toHaveBeenNthCalledWith(1, {
      type: "upsert_by_product_id",
      productId: "p1",
    });
    expect(enqueueSpy).toHaveBeenNthCalledWith(
      2,
      { type: "upsert_by_product_id", productId: "p1" },
      expect.objectContaining({ delay: expect.any(Number), jobId: "deal-expiry:d1" }),
    );
  });

  test("does not schedule a delayed job for an already-expired deal", async () => {
    const past = new Date(Date.now() - 60_000);
    await scheduleIndexUpdates("p1", "d1", past);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
  });

  test("swallows enqueue errors (logs and returns)", async () => {
    enqueueSpy.mockImplementation(async () => {
      throw new Error("redis down");
    });
    await expect(
      scheduleIndexUpdates("p1", "d1", new Date(Date.now() + 60_000)),
    ).resolves.toBeUndefined();
  });
});

describe("scheduleIndexUpdatesBulk", () => {
  let enqueueSpy: ReturnType<typeof spyOn>;
  beforeEach(() => {
    enqueueSpy = spyOn(searchSync, "enqueueSearchSync").mockImplementation(async () => {});
  });
  afterEach(() => {
    enqueueSpy.mockRestore();
  });

  test("ONE immediate sync per product (deduped) plus one delayed job per deal", async () => {
    const f1 = new Date(Date.now() + 60_000);
    const f2 = new Date(Date.now() + 120_000);
    await scheduleIndexUpdatesBulk([
      {
        productId: "p1",
        deals: [
          { id: "d1", expiresAt: f1 },
          { id: "d2", expiresAt: f2 },
        ],
      },
      { productId: "p2", deals: [{ id: "d3", expiresAt: f1 }] },
    ]);
    // 2 immediate (one per product) + 3 delayed (one per deal)
    expect(enqueueSpy).toHaveBeenCalledTimes(5);
  });

  test("duplicate productId entries in input → immediate sync still fires once per product", async () => {
    const f1 = new Date(Date.now() + 60_000);
    await scheduleIndexUpdatesBulk([
      { productId: "p1", deals: [{ id: "d1", expiresAt: f1 }] },
      { productId: "p1", deals: [{ id: "d2", expiresAt: f1 }] }, // duplicate productId
    ]);
    // Expected: 1 immediate (deduped to one for p1) + 2 delayed (one per deal) = 3 calls
    expect(enqueueSpy).toHaveBeenCalledTimes(3);
  });
});
