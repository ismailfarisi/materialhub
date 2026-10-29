import { describe, expect, it, mock } from "bun:test";
import {
  TaggableProductsService,
  TaggableProductsUnavailableError,
} from "./taggable-products.service.ts";

function svc(overrides: Partial<any> = {}) {
  return new TaggableProductsService({
    fetchDelivered: mock(async () => []),
    fetchVendorProducts: mock(async () => []),
    fetchPermissionProducts: mock(async () => []),
    loadUserContext: mock(async (_userId: string, activeVendorId: string | null) => ({
      vendorId: activeVendorId,
      permissions: [],
    })),
    ...overrides,
  });
}

const vendorRow = (id: string, name: string) => ({
  product_id: id,
  name,
  thumbnail_url: null,
  variant_label: null,
  delivered_at: null,
});

describe("TaggableProductsService.list — vendor path (catalog only)", () => {
  it("returns the full vendor catalog on empty q without touching orders/permissions", async () => {
    const fetchDelivered = mock(async () => []);
    const fetchPermissionProducts = mock(async () => []);
    const fetchVendorProducts = mock(async () => [
      vendorRow("p1", "First"),
      vendorRow("p2", "Second"),
    ]);
    const service = svc({ fetchDelivered, fetchPermissionProducts, fetchVendorProducts });

    const out = await service.list({ userId: "u1", activeVendorId: "v1", q: "", limit: 10 });

    expect(out.items.map((r) => r.product_id)).toEqual(["p1", "p2"]);
    expect(out.items.every((r) => r.source === "vendor_owned")).toBe(true);
    expect(out.partialSources).toEqual([]);
    expect(fetchVendorProducts).toHaveBeenCalledTimes(1);
    expect(fetchDelivered).toHaveBeenCalledTimes(0);
    expect(fetchPermissionProducts).toHaveBeenCalledTimes(0);
  });

  it("returns filtered vendor catalog on a search query", async () => {
    const fetchDelivered = mock(async () => []);
    const fetchVendorProducts = mock(async () => [vendorRow("p3", "Serum")]);
    const service = svc({ fetchDelivered, fetchVendorProducts });

    const out = await service.list({ userId: "u1", activeVendorId: "v1", q: "ser", limit: 10 });

    expect(out.items.map((r) => r.product_id)).toEqual(["p3"]);
    expect(out.items[0]!.source).toBe("vendor_owned");
    expect(fetchDelivered).toHaveBeenCalledTimes(0);
  });

  it("respects the limit for the vendor catalog", async () => {
    const fetchVendorProducts = mock(async () =>
      Array.from({ length: 8 }, (_, i) => vendorRow(`v${i}`, `V${i}`)),
    );
    const service = svc({ fetchVendorProducts });
    const out = await service.list({ userId: "u1", activeVendorId: "v1", q: "", limit: 5 });
    expect(out.items).toHaveLength(5);
  });

  it("throws TaggableProductsUnavailableError when the vendor catalog fetch fails", async () => {
    const fetchVendorProducts = mock(async () => {
      throw new Error("product boom");
    });
    const service = svc({ fetchVendorProducts });
    await expect(
      service.list({ userId: "u1", activeVendorId: "v1", q: "", limit: 10 }),
    ).rejects.toBeInstanceOf(TaggableProductsUnavailableError);
  });
});

describe("TaggableProductsService.list — customer path (no active vendor)", () => {
  it("returns purchased rows on empty q (no permission fetch)", async () => {
    const permFetch = mock(async () => []);
    const service = svc({
      fetchDelivered: mock(async () => [
        {
          product_id: "p1",
          name: "First",
          thumbnail_url: null,
          variant_label: "A",
          delivered_at: "2026-04-03T00:00:00Z",
        },
        {
          product_id: "p2",
          name: "Second",
          thumbnail_url: null,
          variant_label: "B",
          delivered_at: "2026-04-01T00:00:00Z",
        },
      ]),
      fetchPermissionProducts: permFetch,
    });
    const out = await service.list({ userId: "u1", activeVendorId: null, q: "", limit: 10 });
    expect(out.items.map((r) => r.product_id)).toEqual(["p1", "p2"]);
    expect(out.items.every((r) => r.source === "purchased")).toBe(true);
    expect(permFetch).toHaveBeenCalledTimes(0);
  });

  it("merges purchased + permission on a search query (purchased wins on dup)", async () => {
    const service = svc({
      fetchDelivered: mock(async () => [
        {
          product_id: "p1",
          name: "From purchase",
          thumbnail_url: "bought.jpg",
          variant_label: "Red",
          delivered_at: "2026-04-03T00:00:00Z",
        },
      ]),
      fetchPermissionProducts: mock(async () => [
        {
          product_id: "p1",
          name: "From permission",
          thumbnail_url: "perm.jpg",
          variant_label: null,
          delivered_at: null,
        },
        {
          product_id: "perm2",
          name: "Perm",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: null,
        },
      ]),
      loadUserContext: mock(async (_u: string, _v: string | null) => ({
        vendorId: null,
        permissions: [{ scope: "any_product", expires_at: null } as any],
      })),
    });
    const out = await service.list({ userId: "u1", activeVendorId: null, q: "x", limit: 10 });
    expect(out.items.map((r) => r.product_id)).toEqual(["p1", "perm2"]);
    expect(out.items[0]!.source).toBe("purchased");
    expect(out.items[0]!.thumbnail_url).toBe("bought.jpg");
  });

  it("skips expired permissions", async () => {
    const permFetch = mock(async () => []);
    const expired = new Date(Date.now() - 60_000).toISOString();
    const service = svc({
      fetchPermissionProducts: permFetch,
      loadUserContext: mock(async (_u: string, _v: string | null) => ({
        vendorId: null,
        permissions: [{ scope: "any_product", expires_at: expired } as any],
      })),
    });
    await service.list({ userId: "u1", activeVendorId: null, q: "x", limit: 10 });
    expect(permFetch).toHaveBeenCalledTimes(0);
  });

  it("throws when order-service fails on empty-q path (no fallback)", async () => {
    const service = svc({
      fetchDelivered: mock(async () => {
        throw new Error("order boom");
      }),
    });
    await expect(
      service.list({ userId: "u1", activeVendorId: null, q: "", limit: 10 }),
    ).rejects.toBeInstanceOf(TaggableProductsUnavailableError);
  });

  it("throws when all customer sources fail on a search query", async () => {
    const service = svc({
      fetchDelivered: mock(async () => {
        throw new Error("order boom");
      }),
      fetchPermissionProducts: mock(async () => {
        throw new Error("product boom");
      }),
      loadUserContext: mock(async (_u: string, _v: string | null) => ({
        vendorId: null,
        permissions: [{ scope: "any_product", expires_at: null } as any],
      })),
    });
    await expect(
      service.list({ userId: "u1", activeVendorId: null, q: "x", limit: 10 }),
    ).rejects.toBeInstanceOf(TaggableProductsUnavailableError);
  });

  it("degrades when only order-service fails but permissions succeed", async () => {
    const service = svc({
      fetchDelivered: mock(async () => {
        throw new Error("order boom");
      }),
      fetchPermissionProducts: mock(async () => [
        {
          product_id: "perm1",
          name: "Perm",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: null,
        },
      ]),
      loadUserContext: mock(async (_u: string, _v: string | null) => ({
        vendorId: null,
        permissions: [{ scope: "any_product", expires_at: null } as any],
      })),
    });
    const out = await service.list({ userId: "u1", activeVendorId: null, q: "x", limit: 10 });
    expect(out.items.map((r) => r.product_id)).toEqual(["perm1"]);
    expect(out.partialSources).toContain("order");
  });
});
