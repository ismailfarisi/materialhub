import { describe, expect, it } from "bun:test";
import { orderMembers, paginate } from "./collection-order.ts";

describe("orderMembers", () => {
  it("pins first in order, then rule matches, minus excludes and dupes", () => {
    const out = orderMembers({
      pinIds: ["p1", "p2"],
      ruleIds: ["p2", "r1", "r2", "x1"],
      excludeIds: ["x1"],
      cap: 100,
    });
    expect(out).toEqual(["p1", "p2", "r1", "r2"]);
  });

  it("drops excluded pins", () => {
    const out = orderMembers({ pinIds: ["p1", "x1"], ruleIds: [], excludeIds: ["x1"], cap: 100 });
    expect(out).toEqual(["p1"]);
  });

  it("applies the cap", () => {
    const out = orderMembers({
      pinIds: ["p1", "p2", "p3"],
      ruleIds: ["r1", "r2"],
      excludeIds: [],
      cap: 4,
    });
    expect(out).toEqual(["p1", "p2", "p3", "r1"]);
  });
});

describe("paginate", () => {
  it("slices a page (1-indexed)", () => {
    expect(paginate(["a", "b", "c", "d", "e"], 2, 2)).toEqual(["c", "d"]);
  });

  it("returns [] for non-positive page numbers", () => {
    expect(paginate(["a", "b", "c"], 0, 2)).toEqual([]);
    expect(paginate(["a", "b", "c"], -1, 2)).toEqual([]);
  });
});
