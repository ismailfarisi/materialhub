import { describe, expect, it, mock } from "bun:test";
import { CategoryMapService } from "./category-map.service.ts";

function repoStub(rows: any[]) {
  return {
    find: mock(async (opts: any) =>
      rows.filter((r) => r.channel_id === opts?.where?.channel_id && !r.deleted_at),
    ),
    findOne: mock(
      async (opts: any) =>
        rows.find(
          (r) =>
            r.channel_id === opts?.where?.channel_id &&
            r.category_id === opts?.where?.category_id &&
            !r.deleted_at,
        ) ?? null,
    ),
    save: mock(async (row: any) => {
      if (!row.id) {
        row.id = `map-${rows.length + 1}`;
        rows.push(row);
      }
      return row;
    }),
    softDelete: mock(async (id: string) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.deleted_at = new Date();
      return { affected: r ? 1 : 0 };
    }),
  };
}

describe("CategoryMapService.upsert", () => {
  it("creates a new mapping when none exists", async () => {
    const rows: any[] = [];
    const svc = new CategoryMapService(repoStub(rows) as any);
    const m = await svc.upsert("ch1", "cat1", "499676", "Apparel > Cosmetics");
    expect(m.external_category_id).toBe("499676");
    expect(rows).toHaveLength(1);
  });

  it("updates the existing mapping for the same channel+category", async () => {
    const rows: any[] = [
      {
        id: "map-1",
        channel_id: "ch1",
        category_id: "cat1",
        external_category_id: "old",
        deleted_at: null,
      },
    ];
    const svc = new CategoryMapService(repoStub(rows) as any);
    const m = await svc.upsert("ch1", "cat1", "new", null);
    expect(m.id).toBe("map-1");
    expect(m.external_category_id).toBe("new");
    expect(rows).toHaveLength(1);
  });
});

describe("CategoryMapService.list", () => {
  it("returns only the channel's mappings", async () => {
    const rows: any[] = [
      {
        id: "m1",
        channel_id: "ch1",
        category_id: "cat1",
        external_category_id: "a",
        deleted_at: null,
      },
      {
        id: "m2",
        channel_id: "ch2",
        category_id: "cat2",
        external_category_id: "b",
        deleted_at: null,
      },
    ];
    const svc = new CategoryMapService(repoStub(rows) as any);
    const list = await svc.list("ch1");
    expect(list.map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("CategoryMapService.remove", () => {
  it("soft-deletes a mapping", async () => {
    const rows: any[] = [
      {
        id: "m1",
        channel_id: "ch1",
        category_id: "cat1",
        external_category_id: "a",
        deleted_at: null,
      },
    ];
    const svc = new CategoryMapService(repoStub(rows) as any);
    expect(await svc.remove("m1")).toBe(true);
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it("returns false when the mapping does not exist", async () => {
    const rows: any[] = [];
    const svc = new CategoryMapService(repoStub(rows) as any);
    expect(await svc.remove("nope")).toBe(false);
  });
});
