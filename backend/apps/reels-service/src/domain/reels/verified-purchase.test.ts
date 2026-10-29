import { describe, expect, it, mock } from "bun:test";
import { ReelTaggingScope } from "@materialhub/database";
import { VerifiedPurchaseGuard } from "./verified-purchase.guard.ts";

function makeFetch(verified: boolean) {
  return mock(
    async () =>
      new Response(JSON.stringify({ data: { verified } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("VerifiedPurchaseGuard.canTag", () => {
  it("returns true for can_tag_unowned bypass (highest priority)", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: true,
      ownsVendorOfProduct: false,
      taggingPermissions: [],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("can_tag_unowned");
  });

  it("returns true for vendor-owns-product bypass", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: true,
      taggingPermissions: [],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("vendor_owns_product");
  });

  it("returns true via any_product tagging permission", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [{ scope: ReelTaggingScope.any_product } as any],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("permission_any_product");
  });

  it("returns true via brand-scoped permission matching product brand", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [{ scope: ReelTaggingScope.specific_brand, brand_id: "b1" } as any],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("permission_specific_brand");
  });

  it("returns true via vendor-scoped permission matching product vendor", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [{ scope: ReelTaggingScope.specific_vendor, vendor_id: "v1" } as any],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("permission_specific_vendor");
  });

  it("returns true via specific_products permission containing the product", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [
        { scope: ReelTaggingScope.specific_products, product_ids: ["p1", "p2"] } as any,
      ],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("permission_specific_products");
  });

  it("skips expired tagging permissions", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const expired = new Date(Date.now() - 1000);
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [{ scope: ReelTaggingScope.any_product, expires_at: expired } as any],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(false);
  });

  it("returns true when order-service reports verified purchase", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(true) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("verified_purchase");
  });

  it("returns false when no rule matches and no verified purchase", async () => {
    const guard = new VerifiedPurchaseGuard({ fetcher: makeFetch(false) as any });
    const result = await guard.canTag({
      userId: "u1",
      productId: "p1",
      canTagUnowned: false,
      ownsVendorOfProduct: false,
      taggingPermissions: [],
      productBrandId: "b1",
      productVendorId: "v1",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_qualifying_rule");
  });
});
