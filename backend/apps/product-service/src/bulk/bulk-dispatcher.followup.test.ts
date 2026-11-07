import { describe, expect, test } from "bun:test";
import { enqueueSearchReindexFollowUp } from "./bulk-dispatcher.worker.ts";

describe("bulk search-reindex follow-up", () => {
  test("goes to the search-sync queue as upsert_by_product_id", async () => {
    const calls: unknown[] = [];
    await enqueueSearchReindexFollowUp({ productId: "p-1" }, async (d) => {
      calls.push(d);
    });
    expect(calls).toEqual([{ type: "upsert_by_product_id", productId: "p-1" }]);
  });

  test("ignores a payload without a product id", async () => {
    const calls: unknown[] = [];
    await enqueueSearchReindexFollowUp({}, async (d) => {
      calls.push(d);
    });
    expect(calls).toEqual([]);
  });
});
