import { describe, expect, it } from "bun:test";
import { resolveSkuList } from "./collection-sku-resolver.service.ts";

describe("resolveSkuList", () => {
  it("preserves input order, reports unmatched and duplicates", () => {
    const skuToId = new Map([
      ["A", "p-a"],
      ["B", "p-b"],
    ]);
    const r = resolveSkuList(["A", "B", "A", "Z"], (s) => skuToId.get(s) ?? null);
    expect(r.matched).toEqual([
      { sku: "A", id: "p-a" },
      { sku: "B", id: "p-b" },
    ]);
    expect(r.duplicates).toEqual(["A"]);
    expect(r.unmatched).toEqual(["Z"]);
  });
});
