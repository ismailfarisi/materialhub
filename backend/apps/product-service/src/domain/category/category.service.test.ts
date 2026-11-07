import { describe, expect, test } from "bun:test";
import { CategoryService, applyCategoryTranslation, categoryLocale } from "./category.service.ts";

const buildCat = (id: string, parent_id: string | null = null) => ({
  id,
  name: id,
  slug: id,
  parent_id,
  is_active: true,
  sort_order: 0,
  path: parent_id ? `${parent_id}.${id}` : id,
  depth: parent_id ? 1 : 0,
});

describe("CategoryService.getTree", () => {
  test("returns full tree when no vendorId provided", async () => {
    const service = new CategoryService();
    Object.defineProperty(service, "repo", {
      get: () => ({
        find: async () => [
          buildCat("electronics"),
          buildCat("phones", "electronics"),
          buildCat("books"),
        ],
      }),
      configurable: true,
    });

    const tree = await service.getTree();
    expect(tree.map((n: any) => n.id).sort()).toEqual(["books", "electronics"]);
    const electronics = tree.find((n: any) => n.id === "electronics")!;
    expect(electronics.children.map((c: any) => c.id)).toEqual(["phones"]);
  });

  test("when vendorId provided, prunes tree to vendor categories + ancestors", async () => {
    const service = new CategoryService();
    Object.defineProperty(service, "repo", {
      get: () => ({
        find: async () => [
          buildCat("electronics"),
          buildCat("phones", "electronics"),
          buildCat("laptops", "electronics"),
          buildCat("books"),
        ],
      }),
      configurable: true,
    });
    // Override the SQL-level helper rather than monkey-patch AppDataSource.
    (service as any).collectVendorCategoryIds = async () => new Set(["electronics", "phones"]); // vendor sells phones; electronics is its ancestor

    const tree = await service.getTree({ vendorId: "vendor-1" });
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.id).toBe("electronics");
    expect(root.children.map((c: any) => c.id)).toEqual(["phones"]);
  });

  test("when vendor has no products in any category, returns empty tree", async () => {
    const service = new CategoryService();
    Object.defineProperty(service, "repo", {
      get: () => ({
        find: async () => [buildCat("electronics"), buildCat("books")],
      }),
      configurable: true,
    });
    (service as any).collectVendorCategoryIds = async () => new Set();

    const tree = await service.getTree({ vendorId: "vendor-1" });
    expect(tree).toEqual([]);
  });
});

describe("CategoryService.update scalar fields", () => {
  function serviceWithCategory(stored: any) {
    const service = new CategoryService();
    const saved: any[] = [];
    Object.defineProperty(service, "repo", {
      get: () => ({
        findOne: async () => ({ ...stored }),
        save: async (c: any) => {
          saved.push(c);
          return c;
        },
      }),
      configurable: true,
    });
    // No translations in these tests
    (service as any).upsertTranslations = async () => {};
    return { service, saved };
  }

  test("persists is_featured, description, meta and commission", async () => {
    const { service, saved } = serviceWithCategory({
      id: "c1",
      name: "Skincare",
      parent_id: null,
      is_active: true,
    });
    await service.update("c1", {
      is_featured: true,
      description: "Glow",
      meta_title: "Skincare UAE",
      commission_rate: 12.5,
    });
    expect(saved[0].is_featured).toBe(true);
    expect(saved[0].description).toBe("Glow");
    expect(saved[0].meta_title).toBe("Skincare UAE");
    expect(saved[0].commission_rate).toBe(12.5);
  });

  test("rejects commission_rate above 100", async () => {
    const { service } = serviceWithCategory({ id: "c1", name: "X", parent_id: null });
    await expect(service.update("c1", { commission_rate: 250 })).rejects.toThrow(
      /between 0 and 100/,
    );
  });

  test("accepts commission_rate of 0 and 100", async () => {
    const { service, saved } = serviceWithCategory({ id: "c1", name: "X", parent_id: null });
    await service.update("c1", { commission_rate: 0 });
    expect(saved[0].commission_rate).toBe(0);
    saved.length = 0;
    await service.update("c1", { commission_rate: 100 });
    expect(saved[0].commission_rate).toBe(100);
  });

  test("accepts null commission_rate to clear override", async () => {
    const { service, saved } = serviceWithCategory({
      id: "c1",
      name: "X",
      parent_id: null,
      commission_rate: 12,
    });
    await service.update("c1", { commission_rate: null });
    expect(saved[0].commission_rate).toBeNull();
  });
});

describe("CategoryService.getTree includeInactive", () => {
  test("excludes inactive by default, includes them when includeInactive=true", async () => {
    const buildService = (capture: { where?: any; translationCalls?: number }) => {
      const service = new CategoryService();
      Object.defineProperty(service, "repo", {
        get: () => ({
          find: async (opts: any) => {
            capture.where = opts.where;
            const all = [
              { id: "active", name: "A", parent_id: null, is_active: true },
              { id: "hidden", name: "H", parent_id: null, is_active: false },
            ];
            if (opts.where && opts.where.is_active === true) {
              return all.filter((c) => c.is_active);
            }
            return all;
          },
        }),
        configurable: true,
      });
      capture.translationCalls = 0;
      (service as any).loadTranslations = async () => {
        capture.translationCalls = (capture.translationCalls ?? 0) + 1;
        return new Map();
      };
      return service;
    };

    const cap1: { where?: any; translationCalls?: number } = {};
    const def = await buildService(cap1).getTree();
    expect(def.map((n: any) => n.id)).toEqual(["active"]);
    expect(cap1.where).toEqual({ is_active: true });
    expect(cap1.translationCalls).toBe(0);

    const cap2: { where?: any; translationCalls?: number } = {};
    const all = await buildService(cap2).getTree({ includeInactive: true });
    expect(all.map((n: any) => n.id).sort()).toEqual(["active", "hidden"]);
    expect(cap2.translationCalls).toBe(1);
  });
});

describe("CategoryService.upsertTranslations", () => {
  function serviceWithTranslationRepo() {
    const service = new CategoryService();
    const rows: any[] = []; // simulated table
    const repo = {
      findOne: async ({ where }: any) =>
        rows.find((r) => r.category_id === where.category_id && r.locale === where.locale) ?? null,
      save: async (r: any) => {
        const idx = rows.findIndex((x) => x.category_id === r.category_id && x.locale === r.locale);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
        else rows.push({ ...r });
        return r;
      },
      create: (r: any) => r,
      remove: async (r: any) => {
        const idx = rows.findIndex((x) => x.category_id === r.category_id && x.locale === r.locale);
        if (idx >= 0) rows.splice(idx, 1);
      },
    };
    Object.defineProperty(service, "translationRepo", {
      get: () => repo,
      configurable: true,
    });
    return { service, rows };
  }

  test("inserts a new translation", async () => {
    const { service, rows } = serviceWithTranslationRepo();
    await (service as any).upsertTranslations("c1", [{ locale: "ar", name: "العناية بالبشرة" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category_id: "c1", locale: "ar", name: "العناية بالبشرة" });
  });

  test("updates an existing translation by (category_id, locale)", async () => {
    const { service, rows } = serviceWithTranslationRepo();
    rows.push({ category_id: "c1", locale: "ar", name: "old", description: null });
    await (service as any).upsertTranslations("c1", [
      { locale: "ar", name: "new", description: "desc" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("new");
    expect(rows[0].description).toBe("desc");
  });

  test("blank name removes an existing translation", async () => {
    const { service, rows } = serviceWithTranslationRepo();
    rows.push({ category_id: "c1", locale: "hi", name: "x", description: null });
    await (service as any).upsertTranslations("c1", [{ locale: "hi", name: "   " }]);
    expect(rows).toHaveLength(0);
  });

  test("revives a soft-deleted translation instead of inserting a duplicate", async () => {
    const { service, rows } = serviceWithTranslationRepo();
    rows.push({
      category_id: "c1",
      locale: "ar",
      name: "stale",
      description: null,
      deleted_at: new Date("2020-01-01T00:00:00Z"),
    });
    await (service as any).upsertTranslations("c1", [{ locale: "ar", name: "fresh" }]);
    expect(rows).toHaveLength(1); // revived in place, not duplicated
    expect(rows[0].name).toBe("fresh");
    expect(rows[0].deleted_at).toBeNull();
  });
});

describe("CategoryService.getBySlug (public)", () => {
  function serviceWith(rows: any[], translations: any[] = []) {
    const service = new CategoryService();
    const calls: any[] = [];
    Object.defineProperty(service, "repo", {
      get: () => ({
        findOne: async ({ where }: any) => {
          calls.push(where);
          return (
            rows.find((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v)) ?? null
          );
        },
        find: async ({ where }: any) =>
          rows.filter((r) => r.parent_id === where.parent_id && r.is_active === where.is_active),
      }),
      configurable: true,
    });
    Object.defineProperty(service, "translationRepo", {
      get: () => ({ find: async () => translations }),
      configurable: true,
    });
    return { service, calls };
  }

  const papers = {
    ...buildCat("papers"),
    name: "Papers",
    description: "All papers",
    meta_title: null,
    meta_description: null,
  };
  const kraft = {
    ...buildCat("kraft", "papers"),
    name: "Kraft paper",
    description: "Brown kraft",
    meta_title: "Kraft",
    meta_description: null,
  };
  const hidden = { ...buildCat("hidden", "papers"), name: "Hidden", is_active: false };

  test("404s an inactive category", async () => {
    const { service } = serviceWith([papers, hidden]);
    await expect(service.getBySlug("hidden")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("serves English without loading translations", async () => {
    const { service } = serviceWith([papers, kraft]);
    const res: any = await service.getBySlug("kraft", { locale: "en-US,en;q=0.9" });
    expect(res.name).toBe("Kraft paper");
    expect(res.locale).toBe("en");
    expect(res.breadcrumb.map((b: any) => b.name)).toEqual(["Papers", "Kraft paper"]);
  });

  test("serves the Arabic translation for locale ar, falling back per field", async () => {
    const { service } = serviceWith(
      [papers, kraft],
      [
        {
          category_id: "kraft",
          locale: "ar",
          name: "ورق كرافت",
          description: "",
          meta_title: "كرافت",
          meta_description: null,
        },
        {
          category_id: "papers",
          locale: "ar",
          name: "الورق",
          description: null,
          meta_title: null,
          meta_description: null,
        },
      ],
    );
    const res: any = await service.getBySlug("kraft", { locale: "ar-AE,ar;q=0.9" });
    expect(res.name).toBe("ورق كرافت");
    expect(res.description).toBe("Brown kraft");
    expect(res.meta_title).toBe("كرافت");
    expect(res.locale).toBe("ar");
    expect(res.breadcrumb.map((b: any) => b.name)).toEqual(["الورق", "ورق كرافت"]);
  });

  test("locale parsing", () => {
    expect(categoryLocale("ar")).toBe("ar");
    expect(categoryLocale("AR-ae, en;q=0.5")).toBe("ar");
    expect(categoryLocale(undefined)).toBe("en");
    expect(categoryLocale("*")).toBe("en");
    expect(applyCategoryTranslation({ name: "A" }, null)).toEqual({ name: "A" });
  });
});

describe("CategoryService.getTree locale", () => {
  const rows = [
    { id: "papers", name: "Papers & Boards", slug: "papers", parent_id: null, is_active: true },
    { id: "kraft", name: "Kraft paper", slug: "kraft", parent_id: "papers", is_active: true },
    { id: "foils", name: "Foils", slug: "foils", parent_id: null, is_active: true },
  ];
  function build(capture: { locales: string[] }) {
    const service = new CategoryService();
    Object.defineProperty(service, "repo", {
      get: () => ({ find: async () => rows.map((r) => ({ ...r })) }),
      configurable: true,
    });
    Object.defineProperty(service, "translationRepo", {
      get: () => ({
        find: async ({ where }: any) => {
          capture.locales.push(where.locale);
          return where.locale === "ar"
            ? [
                { category_id: "papers", name: "الورق والألواح", description: null },
                { category_id: "kraft", name: "ورق كرافت", description: null },
                { category_id: "foils", name: " ", description: null },
              ]
            : [];
        },
      }),
      configurable: true,
    });
    return service;
  }

  test("an Arabic tree carries translated names, English where none (or blank)", async () => {
    const capture = { locales: [] as string[] };
    const tree: any[] = await build(capture).getTree({ locale: "ar-AE,ar;q=0.9" });
    expect(capture.locales).toEqual(["ar"]);
    const papers = tree.find((n) => n.id === "papers");
    expect(papers.name).toBe("الورق والألواح");
    expect(papers.children[0].name).toBe("ورق كرافت");
    expect(papers.slug).toBe("papers");
    expect(tree.find((n) => n.id === "foils").name).toBe("Foils");
  });

  test("English and the admin tree never look up locale translations", async () => {
    const capture = { locales: [] as string[] };
    const service = build(capture);
    (service as any).loadTranslations = async () => new Map();
    const en: any[] = await service.getTree({ locale: "en" });
    expect(en.find((n) => n.id === "papers").name).toBe("Papers & Boards");
    const admin: any[] = await service.getTree({ includeInactive: true, locale: "ar" });
    expect(admin.find((n) => n.id === "papers").name).toBe("Papers & Boards");
    expect(capture.locales).toEqual([]);
  });
});
