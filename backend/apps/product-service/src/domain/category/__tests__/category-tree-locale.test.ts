import { describe, expect, test } from "bun:test";
import { treeCacheKey } from "../category-cache.service.ts";
import { CategoryController } from "../category.controller.ts";

describe("public category tree per locale", () => {
  function controller() {
    const calls: string[] = [];
    const cache = {
      getTree: async (locale: string) => {
        calls.push(locale);
        return [];
      },
    };
    const service = { getTree: async () => [] };
    return { calls, c: new CategoryController(service as any, cache as any) };
  }

  test("serves the cached tree for the requested locale (Accept-Language or ?locale=)", async () => {
    const { calls, c } = controller();
    await c.getTree({ locale: "ar-AE,ar;q=0.9,en;q=0.8" });
    await c.getTree({ locale: "ar" });
    await c.getTree({});
    await c.getTree({ locale: "fr" });
    expect(calls).toEqual(["ar", "ar", "en", "en"]);
  });

  test("cache keys include the locale; English keeps the original key", () => {
    expect(treeCacheKey("en")).toBe("materialhub:product:categories:tree");
    expect(treeCacheKey("ar")).toBe("materialhub:product:categories:tree:ar");
  });
});

describe("storefront revalidation after category edits", () => {
  function build(revalidate: (tags: string[]) => Promise<unknown>) {
    const service = {
      update: async () => ({ id: "c1", slug: "kraft-paper", is_active: false }),
      remove: async () => ({ id: "c1", slug: "kraft-paper" }),
      create: async () => ({ id: "c2", slug: "greyboard" }),
      reorder: async () => undefined,
    };
    const cache = { invalidate: async () => undefined };
    return new CategoryController(service as any, cache as any, revalidate);
  }

  test("disable / delete / create revalidate the category page, the tree and the header", async () => {
    const calls: string[][] = [];
    const c = build(async (tags) => calls.push(tags));
    await c.update("c1", { is_active: false });
    await c.remove("c1");
    await c.create({ name: "Greyboard" });
    await c.reorder([]);
    expect(calls).toEqual([
      ["category:kraft-paper", "categories", "header-navigation"],
      ["category:kraft-paper", "categories", "header-navigation"],
      ["category:greyboard", "categories", "header-navigation"],
      ["categories", "header-navigation"],
    ]);
  });

  test("a failing revalidation never fails the admin action", async () => {
    const c = build(async () => {
      throw new Error("storefront down");
    });
    expect((await c.update("c1", { is_active: false }))?.slug).toBe("kraft-paper");
    await c.remove("c1");
  });
});
