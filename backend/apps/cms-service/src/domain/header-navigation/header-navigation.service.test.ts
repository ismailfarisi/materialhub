import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import { HeaderNavigationService } from "./header-navigation.service.ts";

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";

// In-memory stand-in for the HeaderNavigationConfig repository. This suite runs
// without a live Postgres (CI has none), so we override AppDataSource's
// getRepository/transaction with a fake backed by a plain array — the same
// mocked-repo pattern the rest of the cms-service suite uses. Previously these
// tests hit a real DB and only "passed" because turbo cached them; any change
// to @materialhub/database busts that cache and surfaced the ECONNREFUSED.
function makeFakeRepo() {
  const rows: any[] = [];
  let seq = 0;
  const isNull = (v: unknown) => v === null || v === undefined;
  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    if (where.status !== undefined && row.status !== where.status) return false;
    // where.deleted_at is IsNull() — treat presence as "must be non-deleted".
    if ("deleted_at" in where && !isNull(row.deleted_at)) return false;
    return true;
  };
  return {
    rows,
    findOne: async ({ where }: any) =>
      rows.find((r) => isNull(r.deleted_at) && matches(r, where)) ?? null,
    find: async (opts?: any) => rows.filter((r) => isNull(r.deleted_at) && matches(r, opts?.where)),
    create: (data: any) => ({ ...data }),
    save: async (entity: any) => {
      if (!entity.id) {
        entity.id = `hn-${++seq}`;
        rows.push(entity);
      } else if (!rows.includes(entity)) {
        const idx = rows.findIndex((r) => r.id === entity.id);
        if (idx >= 0) rows[idx] = entity;
        else rows.push(entity);
      }
      return entity;
    },
    softRemove: async (entity: any) => {
      entity.deleted_at = new Date();
      return entity;
    },
  };
}

describe("HeaderNavigationService", () => {
  let service: HeaderNavigationService;
  let fake: ReturnType<typeof makeFakeRepo>;
  let originalGetRepository: typeof AppDataSource.getRepository;
  let originalTransaction: typeof AppDataSource.transaction;

  beforeEach(() => {
    fake = makeFakeRepo();
    originalGetRepository = AppDataSource.getRepository;
    originalTransaction = AppDataSource.transaction;
    // biome-ignore lint/suspicious/noExplicitAny: test double for the DataSource
    (AppDataSource as any).getRepository = () => fake;
    // biome-ignore lint/suspicious/noExplicitAny: test double for the DataSource
    (AppDataSource as any).transaction = async (cb: any) => cb({ getRepository: () => fake });
    service = new HeaderNavigationService();
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: restore the real methods
    (AppDataSource as any).getRepository = originalGetRepository;
    // biome-ignore lint/suspicious/noExplicitAny: restore the real methods
    (AppDataSource as any).transaction = originalTransaction;
  });

  it("returns null when no draft and no published exist", async () => {
    expect(await service.getDraft()).toBeNull();
    expect(await service.getPublished()).toBeNull();
  });

  it("upsertDraft creates the draft row when none exists", async () => {
    const draft = await service.upsertDraft({ tabs: [] }, ADMIN_ID);
    expect(draft.status).toBe("draft");
    expect(draft.config.tabs).toEqual([]);
    expect(draft.version).toBe(1);
  });

  it("upsertDraft updates the existing draft instead of creating a second", async () => {
    await service.upsertDraft({ tabs: [] }, ADMIN_ID);
    const second = await service.upsertDraft({ tabs: [validCategoryTab()] }, ADMIN_ID);
    const all = await fake.find();
    expect(all.length).toBe(1);
    expect(second.config.tabs.length).toBe(1);
  });

  it("publish promotes the draft to published and increments version", async () => {
    await service.upsertDraft({ tabs: [validCategoryTab()] }, ADMIN_ID);
    const published = await service.publish(ADMIN_ID);
    expect(published.status).toBe("published");
    expect(published.published_at).toBeInstanceOf(Date);
    expect(published.version).toBe(1);
    // publish() intentionally re-creates a draft mirroring what was published
    // (so the editor stays populated) — getDraft is non-null and carries the
    // just-published config.
    const draft = await service.getDraft();
    expect(draft).not.toBeNull();
    expect(draft?.config.tabs.length).toBe(1);
  });

  it("publishing a second time bumps the version", async () => {
    await service.upsertDraft({ tabs: [] }, ADMIN_ID);
    await service.publish(ADMIN_ID);
    await service.upsertDraft({ tabs: [validCategoryTab()] }, ADMIN_ID);
    const second = await service.publish(ADMIN_ID);
    expect(second.version).toBe(2);
  });

  it("rejects more than 11 tabs", async () => {
    const tabs = Array.from({ length: 12 }, (_, i) => ({
      ...validCategoryTab(),
      id: `tab-${i}`,
      position: i,
    }));
    await expect(service.upsertDraft({ tabs }, ADMIN_ID)).rejects.toThrow(/at most 11 tabs/);
  });

  it("rejects more than 7 category tabs", async () => {
    const tabs = Array.from({ length: 8 }, (_, i) => ({
      ...validCategoryTab(),
      id: `tab-${i}`,
      position: i,
    }));
    await expect(service.upsertDraft({ tabs }, ADMIN_ID)).rejects.toThrow(
      /at most 7 category tabs/,
    );
  });

  it("rejects more than 10 brand_ids per tab", async () => {
    const tab = {
      ...validCategoryTab(),
      brand_list: {
        ...validCategoryTab().brand_list,
        brand_ids: Array.from({ length: 11 }, (_, i) => `b-${i}`),
      },
    };
    await expect(service.upsertDraft({ tabs: [tab] }, ADMIN_ID)).rejects.toThrow(
      /at most 10 brands/,
    );
  });

  it("rejects more than 3 promo_tiles per tab", async () => {
    const tab = {
      ...validCategoryTab(),
      promo_tiles: Array.from({ length: 4 }, (_, i) => ({
        id: `t-${i}`,
        image_url: "https://x/y.jpg",
        title: { en: "x" },
        cta_text: { en: "y" },
        href: "/z",
      })),
    };
    await expect(service.upsertDraft({ tabs: [tab] }, ADMIN_ID)).rejects.toThrow(
      /at most 3 promo tiles/,
    );
  });

  it("rejects category tab with null category_id", async () => {
    const tab = { ...validCategoryTab(), category_id: null };
    await expect(service.upsertDraft({ tabs: [tab] }, ADMIN_ID)).rejects.toThrow(
      /category_id required/,
    );
  });

  it("rejects custom tab with null href_override", async () => {
    const tab = {
      ...validCategoryTab(),
      kind: "custom" as const,
      category_id: null,
      href_override: null,
    };
    await expect(service.upsertDraft({ tabs: [tab] }, ADMIN_ID)).rejects.toThrow(
      /href_override required/,
    );
  });
});

function validCategoryTab() {
  return {
    id: "tab-1",
    kind: "category" as const,
    category_id: "00000000-0000-0000-0000-000000000010",
    href_override: null,
    label: { en: "Makeup" },
    show_subcategories: true,
    enabled: true,
    position: 0,
    brand_list: {
      title: { en: "New in Brands" },
      see_all_href: "/brands?category=makeup",
      brand_ids: [],
    },
    promo_tiles: [],
  };
}
