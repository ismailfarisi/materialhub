import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  AppDataSource,
  Brand,
  Category,
  type HeaderNavConfig,
  HeaderNavigationConfig,
} from "@materialhub/database";
import type { FindOperator } from "typeorm";
import { HeaderNavigationResolverService } from "./header-navigation-resolver.service.ts";

const makeupId = "00000000-0000-0000-0000-000000000101";
const lipstickId = "00000000-0000-0000-0000-000000000102";
const moonglazeId = "00000000-0000-0000-0000-000000000201";

describe("HeaderNavigationResolverService", () => {
  let resolver: HeaderNavigationResolverService;
  let publishedConfig: HeaderNavConfig | null;
  let getRepositorySpy: ReturnType<typeof spyOn>;
  type RepositoryMock = ReturnType<typeof AppDataSource.getRepository>;

  const makeup = {
    id: makeupId,
    name: "Makeup",
    slug: "makeup",
    is_active: true,
    depth: 0,
    deleted_at: null,
  } as Category;
  const lipstick = {
    id: lipstickId,
    name: "Lipstick",
    slug: "lipstick",
    is_active: true,
    depth: 1,
    parent_id: makeupId,
    deleted_at: null,
  } as Category;
  const moonglaze = {
    id: moonglazeId,
    name: "Moonglaze",
    slug: "moonglaze",
    is_active: true,
  } as Brand;

  beforeEach(() => {
    publishedConfig = null;
    resolver = new HeaderNavigationResolverService();
    getRepositorySpy = spyOn(AppDataSource, "getRepository").mockImplementation(((
      entity: unknown,
    ) => {
      if (entity === HeaderNavigationConfig) {
        return {
          findOne: async () =>
            publishedConfig
              ? {
                  id: "published-header-nav",
                  version: 1,
                  status: "published",
                  config: publishedConfig,
                  deleted_at: null,
                }
              : null,
        } as unknown as RepositoryMock;
      }

      if (entity === Category) {
        return {
          find: async (options: { where?: { parent_id?: FindOperator<unknown> } }) => {
            const parentOp = options?.where?.parent_id;
            if (parentOp?.type === "isNull") return [makeup];
            if (parentOp) return [lipstick];
            return publishedConfig?.tabs.some((tab) => tab.category_id === makeupId)
              ? [makeup]
              : [];
          },
        } as unknown as RepositoryMock;
      }

      if (entity === Brand) {
        return {
          find: async () =>
            publishedConfig?.tabs.some((tab) => tab.brand_list.brand_ids.includes(moonglazeId))
              ? [moonglaze]
              : [],
        } as unknown as RepositoryMock;
      }

      throw new Error(`Unexpected repository: ${String(entity)}`);
    }) as unknown as typeof AppDataSource.getRepository);
  });

  afterEach(() => {
    getRepositorySpy.mockRestore();
  });

  it("falls back to the category tree when no published config exists", async () => {
    const result = await resolver.resolve("en");
    expect(result.version).toBe(0);
    expect(result.tabs.length).toBe(1);
    const tab = result.tabs[0];
    if (!tab) throw new Error("Expected fallback tab");
    expect(tab.kind).toBe("category");
    expect(tab.label).toBe("Makeup");
    expect(tab.href).toBe("/c/makeup");
    expect(tab.subcategories[0]).toEqual({
      label: "View All",
      href: "/c/makeup",
      highlight: true,
    });
    expect(tab.subcategories[1]).toEqual({
      label: "New in Makeup",
      href: "/search?category=makeup&sort=newest",
    });
    expect(tab.subcategories[2]).toEqual({ label: "Lipstick", href: "/c/lipstick" });
    expect(tab.brand_list.brands).toEqual([]);
    expect(tab.promo_tiles).toEqual([]);
  });

  it("fallback localizes View All / New in labels", async () => {
    const result = await resolver.resolve("ar");
    expect(result.tabs[0]?.subcategories[0]?.label).toBe("عرض الكل");
    expect(result.tabs[0]?.subcategories[1]?.label).toBe("جديد في Makeup");
  });

  it("resolves a category tab with View All + New in + children + brand list + promos", async () => {
    publishedConfig = {
      tabs: [
        {
          id: "tab-1",
          kind: "category",
          category_id: makeupId,
          href_override: null,
          label: { en: "Makeup", ar: "Makeup AR" },
          show_subcategories: true,
          enabled: true,
          position: 0,
          brand_list: {
            title: { en: "New in Brands", ar: "New in Brands AR" },
            see_all_href: "/brands?category=makeup",
            brand_ids: [moonglazeId],
          },
          promo_tiles: [
            {
              id: "p1",
              image_url: "https://cdn/x.jpg",
              title: { en: "YSL", ar: "YSL AR" },
              cta_text: { en: "Shop now", ar: "Shop now AR" },
              href: "/vendor/ysl",
            },
          ],
        },
      ],
    };

    const result = await resolver.resolve("en");
    expect(result.tabs.length).toBe(1);
    const tab = result.tabs[0];
    if (!tab) throw new Error("Expected resolved tab");
    expect(tab.label).toBe("Makeup");
    expect(tab.href).toBe("/c/makeup");

    expect(tab.subcategories.length).toBe(3);
    expect(tab.subcategories[0]).toEqual({
      label: "View All",
      href: "/c/makeup",
      highlight: true,
    });
    expect(tab.subcategories[1]).toEqual({
      label: "New in Makeup",
      href: "/search?category=makeup&sort=newest",
    });
    expect(tab.subcategories[2]).toEqual({
      label: "Lipstick",
      href: "/c/lipstick",
    });

    expect(tab.brand_list.title).toBe("New in Brands");
    expect(tab.brand_list.brands).toEqual([
      { id: moonglazeId, name: "Moonglaze", href: "/vendor/moonglaze" },
    ]);

    expect(tab.promo_tiles[0]?.title).toBe("YSL");
  });

  it("falls back to en when requested locale missing", async () => {
    publishedConfig = {
      tabs: [
        {
          id: "tab-1",
          kind: "category",
          category_id: makeupId,
          href_override: null,
          label: { en: "Makeup" },
          show_subcategories: false,
          enabled: true,
          position: 0,
          brand_list: {
            title: { en: "x" },
            see_all_href: "/",
            brand_ids: [],
          },
          promo_tiles: [],
        },
      ],
    };

    const result = await resolver.resolve("ar");
    expect(result.tabs[0]?.label).toBe("Makeup");
  });

  it("drops disabled tabs", async () => {
    publishedConfig = {
      tabs: [
        {
          id: "tab-1",
          kind: "category",
          category_id: makeupId,
          href_override: null,
          label: { en: "Makeup" },
          show_subcategories: false,
          enabled: false,
          position: 0,
          brand_list: {
            title: { en: "x" },
            see_all_href: "/",
            brand_ids: [],
          },
          promo_tiles: [],
        },
      ],
    };

    const result = await resolver.resolve("en");
    expect(result.tabs).toEqual([]);
  });

  it("drops a category tab whose category was deleted", async () => {
    publishedConfig = {
      tabs: [
        {
          id: "tab-1",
          kind: "category",
          category_id: "00000000-0000-0000-0000-deadbeef0000",
          href_override: null,
          label: { en: "Ghost" },
          show_subcategories: false,
          enabled: true,
          position: 0,
          brand_list: {
            title: { en: "x" },
            see_all_href: "/",
            brand_ids: [],
          },
          promo_tiles: [],
        },
      ],
    };

    const result = await resolver.resolve("en");
    expect(result.tabs).toEqual([]);
  });

  it("drops missing brand_ids from brand list silently", async () => {
    publishedConfig = {
      tabs: [
        {
          id: "tab-1",
          kind: "category",
          category_id: makeupId,
          href_override: null,
          label: { en: "Makeup" },
          show_subcategories: false,
          enabled: true,
          position: 0,
          brand_list: {
            title: { en: "Brands" },
            see_all_href: "/",
            brand_ids: [moonglazeId, "00000000-0000-0000-0000-deadbeef0000"],
          },
          promo_tiles: [],
        },
      ],
    };

    const result = await resolver.resolve("en");
    expect(result.tabs[0]?.brand_list.brands.length).toBe(1);
    expect(result.tabs[0]?.brand_list.brands[0]?.name).toBe("Moonglaze");
  });

  it("custom tab uses href_override and has empty subcategories", async () => {
    publishedConfig = {
      tabs: [
        {
          id: "tab-2",
          kind: "custom",
          category_id: null,
          href_override: "/promotions/new",
          label: { en: "New" },
          show_subcategories: false,
          enabled: true,
          position: 0,
          brand_list: {
            title: { en: "x" },
            see_all_href: "/",
            brand_ids: [],
          },
          promo_tiles: [],
        },
      ],
    };

    const result = await resolver.resolve("en");
    expect(result.tabs[0]?.href).toBe("/promotions/new");
    expect(result.tabs[0]?.subcategories).toEqual([]);
  });
});
