import { describe, expect, it } from "bun:test";
import { computeAffectedCohortKeys } from "./category-cohort-invalidator.ts";

describe("computeAffectedCohortKeys", () => {
  it("produces the cross-product of ancestor ids × hot (lang, country) rows", () => {
    const keys = computeAffectedCohortKeys({
      ancestorCategoryIds: ["cat-a", "cat-b"],
      hotRows: [
        { category_id: "cat-a", language_code: "en", country_code: "AE" },
        { category_id: "cat-a", language_code: "ar", country_code: "AE" },
        { category_id: "cat-z", language_code: "en", country_code: "AE" },
      ],
    });
    expect(keys.sort()).toEqual(["category:cat-a:ar:AE", "category:cat-a:en:AE"]);
  });

  it("returns [] when no ancestor overlaps the hot set", () => {
    const keys = computeAffectedCohortKeys({
      ancestorCategoryIds: ["cold-1"],
      hotRows: [{ category_id: "hot-1", language_code: "en", country_code: "AE" }],
    });
    expect(keys).toEqual([]);
  });
});
