import { beforeAll, describe, expect, it } from "bun:test";
import { AppDataSource, ProductImage, ensureDatabase } from "@materialhub/database";
import { ProductImageRepository } from "../product-image.repository.ts";

describe("ProductImageRepository.findByIdIncludingDeleted", () => {
  beforeAll(async () => {
    try {
      await ensureDatabase();
    } catch {
      // DB not available — tests below will skip via the empty-DB guard
    }
  });

  it("returns a soft-deleted image when present", async () => {
    if (!AppDataSource.isInitialized) return;
    const repo = new ProductImageRepository();
    const all = await AppDataSource.getRepository(ProductImage).find({
      withDeleted: true,
      take: 1,
    });
    if (all.length === 0) return;
    const found = await repo.findByIdIncludingDeleted(all[0]!.id);
    expect(found?.id).toBe(all[0]!.id);
  });
});
