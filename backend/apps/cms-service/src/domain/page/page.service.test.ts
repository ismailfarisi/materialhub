import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { AppDataSource, PageStatus } from "@materialhub/database";
import { PageService } from "./page.service.ts";

describe("PageService storefront revalidation", () => {
  let stored: Record<string, unknown> | null;
  let spy: ReturnType<typeof spyOn>;
  const revalidate = mock(async (_tags: string[]) => true);

  beforeEach(() => {
    revalidate.mockClear();
    stored = {
      id: "p1",
      slug: "shipping-guide",
      status: PageStatus.published,
      published_at: new Date(),
    };
    spy = spyOn(AppDataSource, "getRepository").mockImplementation((() => ({
      findOne: async ({ where }: { where: { id?: string; slug?: string } }) =>
        where.id ? stored : null,
      save: async (p: unknown) => p,
      create: (p: unknown) => p,
      softRemove: async (p: unknown) => p,
    })) as unknown as typeof AppDataSource.getRepository);
  });
  afterEach(() => spy.mockRestore());

  it("revalidates the page on unpublish", async () => {
    await new PageService(revalidate).update("p1", { status: PageStatus.draft } as never);
    expect(revalidate).toHaveBeenCalledWith(["cms-pages", "cms-page:shipping-guide"]);
  });

  it("revalidates old and new slug on a rename", async () => {
    await new PageService(revalidate).update("p1", { slug: "delivery-guide" } as never);
    expect(revalidate).toHaveBeenCalledWith([
      "cms-pages",
      "cms-page:shipping-guide",
      "cms-page:delivery-guide",
    ]);
  });

  it("revalidates on delete and on create", async () => {
    await new PageService(revalidate).remove("p1");
    expect(revalidate).toHaveBeenLastCalledWith(["cms-pages", "cms-page:shipping-guide"]);
    await new PageService(revalidate).create(
      { title: "Sample packs", slug: "sample-packs", status: PageStatus.published } as never,
      "admin-1",
    );
    expect(revalidate).toHaveBeenLastCalledWith(["cms-pages", "cms-page:sample-packs"]);
  });

  it("never fails the admin action when revalidation fails", async () => {
    const failing = mock(async () => {
      throw new Error("storefront down");
    });
    const saved = await new PageService(failing).update("p1", {
      status: PageStatus.archived,
    } as never);
    expect((saved as { status: string }).status).toBe(PageStatus.archived);
    await new PageService(failing).remove("p1");
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
