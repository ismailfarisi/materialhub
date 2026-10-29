import { describe, expect, it, mock } from "bun:test";
import { AffiliateResolveService } from "./affiliate-resolve.service.ts";

describe("AffiliateResolveService.resolveAndClick", () => {
  it("returns null for an unknown slug", async () => {
    const linkRepo = { findOne: mock(async () => null), increment: mock(async () => ({})) } as any;
    const affiliateRepo = { findOne: mock(async () => null) } as any;
    const svc = new AffiliateResolveService(linkRepo, affiliateRepo);
    expect(await svc.resolveAndClick("nope")).toBeNull();
    expect(linkRepo.increment).not.toHaveBeenCalled();
  });

  it("returns null when the affiliate is not active", async () => {
    const link = {
      id: "l1",
      slug: "s",
      vendor_affiliate_id: "a1",
      target_type: "store",
      target_id: null,
    };
    const linkRepo = { findOne: mock(async () => link), increment: mock(async () => ({})) } as any;
    const affiliateRepo = {
      findOne: mock(async () => ({
        id: "a1",
        vendor_id: "v1",
        affiliate_code: "AFF-X",
        status: "suspended",
      })),
    } as any;
    const svc = new AffiliateResolveService(linkRepo, affiliateRepo);
    expect(await svc.resolveAndClick("s")).toBeNull();
    expect(linkRepo.increment).not.toHaveBeenCalled();
  });

  it("increments click_count and returns the target for an active affiliate", async () => {
    const link = {
      id: "l1",
      slug: "s",
      vendor_affiliate_id: "a1",
      target_type: "product",
      target_id: "p1",
      target_url: null,
    };
    const linkRepo = { findOne: mock(async () => link), increment: mock(async () => ({})) } as any;
    const affiliateRepo = {
      findOne: mock(async () => ({
        id: "a1",
        vendor_id: "v1",
        affiliate_code: "AFF-X",
        status: "active",
      })),
    } as any;
    const svc = new AffiliateResolveService(linkRepo, affiliateRepo);
    const res = await svc.resolveAndClick("s");
    expect(res).toEqual({
      code: "AFF-X",
      targetType: "product",
      targetId: "p1",
      targetUrl: null,
      vendorId: "v1",
    });
    expect(linkRepo.increment).toHaveBeenCalledWith({ id: "l1" }, "click_count", 1);
  });

  it("resolves brand link with targetId", async () => {
    const link = {
      id: "l2",
      slug: "brand-slug",
      vendor_affiliate_id: "a1",
      target_type: "brand",
      target_id: "brand-123",
      target_url: null,
    };
    const linkRepo = { findOne: mock(async () => link), increment: mock(async () => ({})) } as any;
    const affiliateRepo = {
      findOne: mock(async () => ({
        id: "a1",
        vendor_id: "v1",
        affiliate_code: "AFF-X",
        status: "active",
      })),
    } as any;
    const svc = new AffiliateResolveService(linkRepo, affiliateRepo);
    const res = await svc.resolveAndClick("brand-slug");
    expect(res).toEqual({
      code: "AFF-X",
      targetType: "brand",
      targetId: "brand-123",
      targetUrl: null,
      vendorId: "v1",
    });
  });

  it("resolves custom_url link with targetUrl", async () => {
    const link = {
      id: "l3",
      slug: "custom-slug",
      vendor_affiliate_id: "a1",
      target_type: "custom_url",
      target_id: null,
      target_url: "/en/brand/flormar",
    };
    const linkRepo = { findOne: mock(async () => link), increment: mock(async () => ({})) } as any;
    const affiliateRepo = {
      findOne: mock(async () => ({
        id: "a1",
        vendor_id: "v1",
        affiliate_code: "AFF-X",
        status: "active",
      })),
    } as any;
    const svc = new AffiliateResolveService(linkRepo, affiliateRepo);
    const res = await svc.resolveAndClick("custom-slug");
    expect(res).toEqual({
      code: "AFF-X",
      targetType: "custom_url",
      targetId: null,
      targetUrl: "/en/brand/flormar",
      vendorId: "v1",
    });
  });
});
