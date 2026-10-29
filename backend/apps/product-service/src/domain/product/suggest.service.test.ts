import { describe, expect, test } from "bun:test";

const { SuggestService } = await import("./suggest.service.ts");

describe("SuggestService.suggest", () => {
  test("returns all-empty for queries shorter than 2 characters", async () => {
    const svc = new SuggestService(
      { suggest: async () => [{ id: "p1" }] } as any,
      { find: async () => [{ id: "c1" }] } as any,
      { find: async () => [{ id: "b1" }] } as any,
    );
    const out = await svc.suggest("a");
    expect(out).toEqual({ products: [], categories: [], brands: [], did_you_mean: null });
  });

  test("returns three buckets for queries >= 2 chars", async () => {
    const svc = new SuggestService(
      {
        suggest: async () => [
          {
            id: "p1",
            slug: "dior-sauvage",
            name: "Dior Sauvage",
            image_url: null,
            price_min: 100,
            price_max: 100,
          },
        ],
      } as any,
      { find: async () => [{ id: "c1", name: "Skincare", slug: "skincare" }] } as any,
      { find: async () => [{ id: "b1", name: "Dior", slug: "dior" }] } as any,
    );
    const out = await svc.suggest("dior");
    expect(out.products).toHaveLength(1);
    expect(out.categories).toHaveLength(1);
    expect(out.brands).toHaveLength(1);
    expect(out.did_you_mean).toBe(null);
  });

  test("ILIKE pattern matches name OR slug case-insensitively", async () => {
    let captured: any;
    const svc = new SuggestService(
      { suggest: async () => [] } as any,
      {
        find: async (opts: any) => {
          captured = opts;
          return [];
        },
      } as any,
      { find: async () => [] } as any,
    );
    await svc.suggest("Dior");
    // The OR-clause is on the `where` array; verify both clauses use the
    // ILIKE operator (not Like), and carry the right case on each side.
    const where = captured.where as Array<Record<string, any>>;
    expect(where).toHaveLength(2);
    expect(where[0]!.name._type).toBe("ilike");
    expect(where[0]!.name._value).toBe("%Dior%");
    expect(where[1]!.slug._type).toBe("ilike");
    expect(where[1]!.slug._value).toBe("%dior%");
  });

  test("partial degradation: one repo failure returns empty for that bucket only", async () => {
    const svc = new SuggestService(
      {
        suggest: async () => [
          {
            id: "p1",
            slug: "dior-sauvage",
            name: "Dior Sauvage",
            image_url: null,
            price_min: 100,
            price_max: 100,
          },
        ],
      } as any,
      {
        find: async () => {
          throw new Error("DB down");
        },
      } as any,
      { find: async () => [{ id: "b1", name: "Dior", slug: "dior" }] } as any,
    );
    const out = await svc.suggest("dior");
    expect(out.products).toHaveLength(1);
    expect(out.categories).toEqual([]);
    expect(out.brands).toHaveLength(1);
  });
});
