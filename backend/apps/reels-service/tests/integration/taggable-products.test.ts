import { describe, expect, it } from "bun:test";
import {
  type TaggableProductRow,
  TaggableProductsService,
  type UserContext,
} from "../../src/domain/reels/taggable-products.service.ts";

type FetcherProduct = Omit<TaggableProductRow, "source">;

function makeService(opts: {
  purchased?: FetcherProduct[];
  vendor?: FetcherProduct[];
  permissions?: FetcherProduct[];
  userVendorId?: string | null;
  userPermissions?: UserContext["permissions"];
}) {
  return new TaggableProductsService({
    fetchDelivered: async () => opts.purchased ?? [],
    fetchVendorProducts: async () => opts.vendor ?? [],
    fetchPermissionProducts: async () => opts.permissions ?? [],
    loadUserContext: async () => ({
      vendorId: opts.userVendorId ?? null,
      permissions: opts.userPermissions ?? [],
    }),
  });
}

describe("integration: TaggableProductsService end-to-end shapes", () => {
  it("customer with 2 delivered sees both (returned filtered by fetcher)", async () => {
    const service = makeService({
      purchased: [
        {
          product_id: "p1",
          name: "Kept",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: "2026-04-03T00:00:00Z",
        },
        {
          product_id: "p2",
          name: "Also kept",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: "2026-03-30T00:00:00Z",
        },
      ],
    });
    const out = await service.list({ userId: "u1", q: "", limit: 10 });
    expect(out.items.map((r) => r.product_id)).toEqual(["p1", "p2"]);
  });

  it("vendor user with empty q sees vendor catalog rows", async () => {
    const service = makeService({
      purchased: [],
      vendor: [
        {
          product_id: "v1",
          name: "Vendor thing",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: null,
        },
      ],
      userVendorId: "vendor-1",
    });
    const out = await service.list({ userId: "u1", q: "", limit: 10 });
    expect(out.items.map((r) => r.product_id)).toEqual(["v1"]);
    expect(out.items.map((r) => r.source)).toEqual(["vendor_owned"]);
  });

  it("vendor user with non-empty q sees merged sources", async () => {
    const service = makeService({
      purchased: [],
      vendor: [
        {
          product_id: "v1",
          name: "Vendor thing",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: null,
        },
      ],
      userVendorId: "vendor-1",
    });
    const out = await service.list({ userId: "u1", q: "thing", limit: 10 });
    expect(out.items.map((r) => r.source)).toEqual(["vendor_owned"]);
  });

  it("customer with specific_brand permission sees permission rows on non-empty q", async () => {
    const service = makeService({
      permissions: [
        {
          product_id: "brand-p1",
          name: "Brand product",
          thumbnail_url: null,
          variant_label: null,
          delivered_at: null,
        },
      ],
      userPermissions: [
        {
          scope: "specific_brand",
          brand_id: "b1",
          vendor_id: null,
          product_ids: null,
          expires_at: null,
        },
      ],
    });
    const out = await service.list({ userId: "u1", q: "brand", limit: 10 });
    expect(out.items.map((r) => r.source)).toEqual(["permission"]);
  });
});
