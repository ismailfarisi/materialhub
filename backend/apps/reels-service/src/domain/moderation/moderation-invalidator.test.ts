import { describe, expect, it } from "bun:test";
import { collectCategorySeedIdsForReel } from "./moderation.service.ts";

describe("collectCategorySeedIdsForReel", () => {
  it("returns the distinct category_ids of every product tagged on the reel", async () => {
    const query = async <T>(_sql: string, _params: unknown[]): Promise<T> =>
      [
        { category_id: "cat-1" },
        { category_id: "cat-2" },
        { category_id: "cat-1" },
      ] as unknown as T;
    const ids = await collectCategorySeedIdsForReel("reel-xyz", { query });
    expect(ids.sort()).toEqual(["cat-1", "cat-2"]);
  });

  it("returns an empty array when the reel has no tags", async () => {
    const query = async <T>(_sql: string, _params: unknown[]): Promise<T> => [] as unknown as T;
    const ids = await collectCategorySeedIdsForReel("reel-none", { query });
    expect(ids).toEqual([]);
  });
});
