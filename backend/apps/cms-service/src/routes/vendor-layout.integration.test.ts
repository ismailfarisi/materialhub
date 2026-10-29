/**
 * Tests for the inline layout-ownership check introduced in Phase 3a.
 *
 * These are unit-style tests that mock AppDataSource directly — the cms-service
 * has no HTTP integration test infrastructure with a live DB. The helpers
 * (`resolveLayoutId`, `assertVendorOwnsLayout`) are exported under `__` names
 * as test seams.
 */
import { describe, expect, test } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

import { __assertVendorOwnsLayout, __resolveLayoutId } from "./vendor-layout.routes.ts";

// ---------------------------------------------------------------------------
// Helper: replace AppDataSource.getRepository for the duration of a test.
// ---------------------------------------------------------------------------
// biome-ignore lint/complexity/noBannedTypes: entity classes are typed as Function in TypeORM
function withRepo(entityClass: Function, fakeRepo: object, fn: () => Promise<void>): Promise<void> {
  const original = AppDataSource.getRepository.bind(AppDataSource);
  // biome-ignore lint/complexity/noBannedTypes: entity classes are typed as Function in TypeORM
  (AppDataSource as any).getRepository = (entity: Function) => {
    if (entity === entityClass) return fakeRepo;
    return original(entity);
  };
  return fn().finally(() => {
    (AppDataSource as any).getRepository = original;
  });
}

// ---------------------------------------------------------------------------
// describe: resolveLayoutId
// ---------------------------------------------------------------------------
describe("resolveLayoutId", () => {
  test("returns params.id when present, without hitting DB", async () => {
    const result = await __resolveLayoutId({ id: "layout-abc-123" });
    expect(result).toBe("layout-abc-123");
  });

  test("returns null when both id and sectionId are absent", async () => {
    const result = await __resolveLayoutId({});
    expect(result).toBeNull();
  });

  test("resolves layoutId from sectionId via DB", async () => {
    const { LayoutSection } = await import("@materialhub/database");
    const fakeRepo = {
      findOne: async () => ({
        id: "sec-1",
        version: { layout_id: "layout-from-section" },
      }),
    };
    const out: { result: string | null } = { result: null };
    await withRepo(LayoutSection, fakeRepo, async () => {
      out.result = await __resolveLayoutId({ sectionId: "sec-1" });
    });
    expect(out.result).toBe("layout-from-section");
  });

  test("returns null when sectionId does not exist", async () => {
    const { LayoutSection } = await import("@materialhub/database");
    const fakeRepo = { findOne: async () => null };
    let result: string | null = null;
    await withRepo(LayoutSection, fakeRepo, async () => {
      result = await __resolveLayoutId({ sectionId: "no-such-section" });
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// describe: layout ownership inline check
// ---------------------------------------------------------------------------
describe("layout ownership inline check", () => {
  test("layout owned by current member.vid passes (no throw)", async () => {
    const { PageLayout } = await import("@materialhub/database");
    const fakeRepo = {
      findOne: async () => ({ id: "L1", vendor_id: "V1" }),
    };
    await withRepo(PageLayout, fakeRepo, async () => {
      // Should resolve without throwing
      await expect(__assertVendorOwnsLayout("V1", "L1")).resolves.toBeUndefined();
    });
  });

  test("foreign vendor's layout returns 403 NOT_LAYOUT_OWNER", async () => {
    const { PageLayout } = await import("@materialhub/database");
    const fakeRepo = {
      findOne: async () => ({ id: "L2", vendor_id: "V2" }),
    };
    await withRepo(PageLayout, fakeRepo, async () => {
      await expect(__assertVendorOwnsLayout("V1", "L2")).rejects.toMatchObject({
        statusCode: 403,
        code: "NOT_LAYOUT_OWNER",
        message: "You do not own this layout",
      });
    });
  });

  test("admin layout (vendor_id=null) returns 403 ADMIN_LAYOUT_FORBIDDEN", async () => {
    const { PageLayout } = await import("@materialhub/database");
    const fakeRepo = {
      findOne: async () => ({ id: "L3", vendor_id: null }),
    };
    await withRepo(PageLayout, fakeRepo, async () => {
      await expect(__assertVendorOwnsLayout("V1", "L3")).rejects.toMatchObject({
        statusCode: 403,
        code: "ADMIN_LAYOUT_FORBIDDEN",
        message: "Admin layouts cannot be edited via vendor scope",
      });
    });
  });

  test("nonexistent layout returns 404 LAYOUT_NOT_FOUND", async () => {
    const { PageLayout } = await import("@materialhub/database");
    const fakeRepo = {
      findOne: async () => null,
    };
    await withRepo(PageLayout, fakeRepo, async () => {
      await expect(
        __assertVendorOwnsLayout("V1", "00000000-0000-0000-0000-000000000000"),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "LAYOUT_NOT_FOUND",
        message: "Layout not found",
      });
    });
  });

  test("thrown errors are instances of HttpError", async () => {
    const { PageLayout } = await import("@materialhub/database");
    const fakeRepo = {
      findOne: async () => null,
    };
    let caught: unknown;
    await withRepo(PageLayout, fakeRepo, async () => {
      try {
        await __assertVendorOwnsLayout("V1", "missing-id");
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(HttpError);
  });
});
