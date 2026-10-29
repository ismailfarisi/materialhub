import { describe, expect, it } from "bun:test";
import { buildHotCategorySelectionSql } from "./refresh-hot-categories.job.ts";

describe("RefreshHotCategoriesJob — SQL shape", () => {
  it("produces an UPSERT that keeps top-level categories and hot leaves", () => {
    const sql = buildHotCategorySelectionSql({ minReelCount: 20, windowDays: 30 });
    expect(sql).toContain("reel_hot_categories");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("c.depth = 0");
    expect(sql).toContain(">= 20");
    expect(sql).toContain("30 days");
  });
});
