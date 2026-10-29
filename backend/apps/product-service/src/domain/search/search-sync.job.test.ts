import { beforeEach, describe, expect, it, mock } from "bun:test";
import { SearchSyncProcessor } from "./search-sync.job.ts";

describe("SearchSyncProcessor", () => {
  const mockIndex = mock((..._args: any[]) => Promise.resolve());
  const mockRemove = mock(() => Promise.resolve());
  const mockSearchService = { indexProduct: mockIndex, removeProduct: mockRemove } as any;
  // Stub deps so the processor doesn't hit a real DB.
  const noProductDeps = {
    loadProduct: async () => null,
  };

  beforeEach(() => {
    mockIndex.mockClear();
    mockRemove.mockClear();
  });

  it("indexes product on upsert event", async () => {
    const processor = new SearchSyncProcessor(mockSearchService, noProductDeps);
    const product = { id: "p1", name: "Test", status: "published" };
    await processor.process({ data: { type: "upsert", product } } as any);
    expect(mockIndex).toHaveBeenCalledWith(product);
  });

  it("removes product on delete event", async () => {
    const processor = new SearchSyncProcessor(mockSearchService, noProductDeps);
    await processor.process({ data: { type: "delete", productId: "p1" } } as any);
    expect(mockRemove).toHaveBeenCalledWith("p1");
  });

  it("skips indexing for non-published products", async () => {
    const processor = new SearchSyncProcessor(mockSearchService, noProductDeps);
    const product = { id: "p1", name: "Draft", status: "draft" };
    await processor.process({ data: { type: "upsert", product } } as any);
    expect(mockRemove).toHaveBeenCalledWith("p1");
    expect(mockIndex).not.toHaveBeenCalled();
  });

  it("upsert_by_product_id reloads product then indexes", async () => {
    const product = { id: "p2", name: "Loaded", status: "published" };
    const processor = new SearchSyncProcessor(mockSearchService, {
      loadProduct: async (id: string) => (id === "p2" ? product : null),
    });
    await processor.process({
      data: { type: "upsert_by_product_id", productId: "p2" },
    } as any);
    expect(mockIndex).toHaveBeenCalledWith(product);
  });

  it("upsert_by_product_id removes from index when product gone", async () => {
    const processor = new SearchSyncProcessor(mockSearchService, noProductDeps);
    await processor.process({
      data: { type: "upsert_by_product_id", productId: "p3" },
    } as any);
    expect(mockRemove).toHaveBeenCalledWith("p3");
    expect(mockIndex).not.toHaveBeenCalled();
  });
});
