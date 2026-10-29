import { describe, expect, it } from "bun:test";
import { computeMemberIds } from "./collection-membership.service.ts";

describe("computeMemberIds", () => {
  it("union of pins + rule matches, minus excludes, capped", () => {
    expect(
      computeMemberIds({
        pinIds: ["p1", "p2"],
        ruleIds: ["p2", "r1"],
        excludeIds: ["r1"],
        cap: 100,
      }),
    ).toEqual(["p1", "p2"]);
  });
});
