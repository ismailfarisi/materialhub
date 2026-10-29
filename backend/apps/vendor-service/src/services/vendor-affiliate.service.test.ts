import { describe, expect, it, mock } from "bun:test";
import { AffiliateCommissionType, VendorAffiliateStatus } from "@materialhub/database";
import { VendorAffiliateService } from "./vendor-affiliate.service.ts";

function makeSvc(
  opts: {
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub shape
    memberForUser?: any;
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub shape
    existingAffiliate?: any;
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub shape
    userByEmail?: any;
  } = {},
) {
  const affiliateRepo = {
    findOne: mock(async () => opts.existingAffiliate ?? null),
    find: mock(async () => []),
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub signature
    create: mock((x: any) => x),
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub signature
    save: mock(async (x: any) => ({ id: "aff-1", ...x })),
  };
  const memberRepo = { findOne: mock(async () => opts.memberForUser ?? null) };
  const userRepo = { findOne: mock(async () => opts.userByEmail ?? null) };
  const linkRepo = {
    findOne: mock(async () => null),
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub signature
    create: mock((x: any) => x),
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub signature
    save: mock(async (x: any) => ({ id: "link-1", ...x })),
    find: mock(async () => []),
  };
  const svc = new VendorAffiliateService(
    affiliateRepo as any,
    linkRepo as any,
    memberRepo as any,
    userRepo as any,
  );
  return { svc, affiliateRepo, memberRepo, userRepo, linkRepo };
}

describe("VendorAffiliateService.invite", () => {
  it("rejects inviting the vendor's own staff member (self-dealing)", async () => {
    const { svc } = makeSvc({
      userByEmail: { id: "u1" },
      memberForUser: { id: "m1", vendor_id: "v1" },
    });
    await expect(
      svc.invite(
        "v1",
        { email: "staff@shop.com", commissionType: "percentage", commissionValue: 1000 },
        "owner",
      ),
    ).rejects.toThrow(/self.?dealing|own staff|SELF_DEALING/i);
  });

  it("rejects a duplicate active invite for the same user+vendor", async () => {
    const { svc } = makeSvc({
      userByEmail: { id: "u1" },
      existingAffiliate: { id: "aff-existing", vendor_id: "v1", user_id: "u1" },
    });
    await expect(
      svc.invite(
        "v1",
        { userId: "u1", commissionType: "percentage", commissionValue: 1000 },
        "owner",
      ),
    ).rejects.toThrow(/duplicate|already|DUPLICATE/i);
  });

  it("creates an invited affiliate with a generated AFF- code", async () => {
    const { svc, affiliateRepo } = makeSvc({ userByEmail: { id: "u1" } });
    const aff = await svc.invite(
      "v1",
      { userId: "u1", commissionType: "percentage", commissionValue: 1500 },
      "owner",
    );
    const saved = affiliateRepo.create.mock.calls[0]![0];
    expect(saved.vendor_id).toBe("v1");
    expect(saved.status).toBe("invited");
    expect(saved.commission_value).toBe(1500);
    expect(saved.affiliate_code).toMatch(/^AFF-[A-Z0-9]{8}$/);
    expect(aff.id).toBe("aff-1");
  });
});

describe("VendorAffiliateService.accept", () => {
  it("flips invited -> active and stamps joined_at", async () => {
    const { svc, affiliateRepo } = makeSvc({
      existingAffiliate: { id: "aff-1", vendor_id: "v1", user_id: "u1", status: "invited" },
    });
    await svc.accept("u1", "aff-1");
    const patch = affiliateRepo.save.mock.calls[0]![0];
    expect(patch.status).toBe("active");
    expect(patch.joined_at).toBeInstanceOf(Date);
  });

  it("rejects accepting another user's invite", async () => {
    const { svc } = makeSvc({
      existingAffiliate: { id: "aff-1", vendor_id: "v1", user_id: "u1", status: "invited" },
    });
    await expect(svc.accept("u2", "aff-1")).rejects.toThrow(/another user|WRONG_USER/i);
  });
});

describe("VendorAffiliateService.createLink", () => {
  it("generates a unique slug and stores the product target", async () => {
    const { svc, linkRepo } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    const link = await svc.createLink("v1", "aff-1", { targetType: "product", targetId: "p1" });
    const saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_type).toBe("product");
    expect(saved.target_id).toBe("p1");
    expect(saved.target_url).toBeNull();
    expect(saved.slug).toMatch(/^[A-Za-z0-9]{8,}$/);
    expect(link.id).toBe("link-1");
  });

  it("creates a brand link with targetId", async () => {
    const { svc, linkRepo } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    const link = await svc.createLink("v1", "aff-1", {
      targetType: "brand",
      targetId: "brand-123",
    });
    const saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_type).toBe("brand");
    expect(saved.target_id).toBe("brand-123");
    expect(saved.target_url).toBeNull();
    expect(link.id).toBe("link-1");
  });

  it("creates a custom_url link and normalizes full URL", async () => {
    const { svc, linkRepo } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    const link = await svc.createLink("v1", "aff-1", {
      targetType: "custom_url",
      targetUrl: "https://www.materialhubuae.com/en/brand/flormar?sort=top#reviews",
    });
    const saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_type).toBe("custom_url");
    expect(saved.target_id).toBeNull();
    expect(saved.target_url).toBe("/en/brand/flormar?sort=top#reviews");
    expect(link.id).toBe("link-1");
  });

  it("creates a custom_url link and normalizes relative path without leading slash", async () => {
    const { svc, linkRepo } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    await svc.createLink("v1", "aff-1", {
      targetType: "custom_url",
      targetUrl: "brand/flormar",
    });
    const saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_url).toBe("/brand/flormar");
  });

  it("creates a store link with null targetId and targetUrl", async () => {
    const { svc, linkRepo } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    await svc.createLink("v1", "aff-1", { targetType: "store" });
    const saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_type).toBe("store");
    expect(saved.target_id).toBeNull();
    expect(saved.target_url).toBeNull();
  });

  it("throws error when targetId is missing for product or brand link", async () => {
    const { svc } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    await expect(svc.createLink("v1", "aff-1", { targetType: "product" })).rejects.toThrow(
      /targetId is required/i,
    );
    await expect(svc.createLink("v1", "aff-1", { targetType: "brand" })).rejects.toThrow(
      /targetId is required/i,
    );
  });

  it("throws error when targetUrl is missing or empty for custom_url link", async () => {
    const { svc } = makeSvc({ existingAffiliate: { id: "aff-1", vendor_id: "v1" } });
    await expect(svc.createLink("v1", "aff-1", { targetType: "custom_url" })).rejects.toThrow(
      /targetUrl is required/i,
    );
    await expect(
      svc.createLink("v1", "aff-1", { targetType: "custom_url", targetUrl: "   " }),
    ).rejects.toThrow(/targetUrl is required/i);
  });
});

describe("VendorAffiliateService admin methods", () => {
  it("getById returns affiliate with relations", async () => {
    const mockAff = { id: "aff-1", vendor_id: "v1", affiliate_code: "AFF-TEST1" };
    const { svc, affiliateRepo } = makeSvc({ existingAffiliate: mockAff });
    const result = await svc.getById("aff-1");
    // biome-ignore lint/suspicious/noExplicitAny: test-only cast
    expect(result).toEqual(mockAff as any);
    expect(affiliateRepo.findOne).toHaveBeenCalledWith({
      where: { id: "aff-1", deleted_at: expect.anything() },
      relations: ["vendor", "user"],
    });
  });

  it("setRateByAdmin updates commission type and value", async () => {
    const mockAff = {
      id: "aff-1",
      vendor_id: "v1",
      commission_type: "percentage",
      commission_value: 1000,
    };
    const { svc } = makeSvc({ existingAffiliate: mockAff });
    const updated = await svc.setRateByAdmin("aff-1", {
      commissionType: "fixed",
      commissionValue: 5000,
    });
    expect(updated.commission_type).toBe(AffiliateCommissionType.fixed);
    expect(updated.commission_value).toBe(5000);
  });

  it("setStatusByAdmin updates affiliate status", async () => {
    const mockAff = {
      id: "aff-1",
      vendor_id: "v1",
      status: "active",
    };
    const { svc } = makeSvc({ existingAffiliate: mockAff });
    const updated = await svc.setStatusByAdmin("aff-1", "suspended");
    expect(updated.status).toBe(VendorAffiliateStatus.suspended);
  });

  it("createLinkByAdmin generates slug and creates product link", async () => {
    const mockAff = {
      id: "aff-1",
      vendor_id: "v1",
    };
    const { svc, linkRepo } = makeSvc({ existingAffiliate: mockAff });
    const link = await svc.createLinkByAdmin("aff-1", {
      targetType: "product",
      targetId: "prod-123",
    });
    const saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_type).toBe("product");
    expect(saved.target_id).toBe("prod-123");
    expect(saved.target_url).toBeNull();
    expect(saved.slug).toMatch(/^[A-Za-z0-9]{8,}$/);
    expect(link.id).toBe("link-1");
  });

  it("createLinkByAdmin creates brand and custom_url links", async () => {
    const mockAff = { id: "aff-1", vendor_id: "v1" };
    const { svc, linkRepo } = makeSvc({ existingAffiliate: mockAff });
    await svc.createLinkByAdmin("aff-1", {
      targetType: "brand",
      targetId: "brand-456",
    });
    let saved = linkRepo.create.mock.calls[0]![0];
    expect(saved.target_type).toBe("brand");
    expect(saved.target_id).toBe("brand-456");
    expect(saved.target_url).toBeNull();

    await svc.createLinkByAdmin("aff-1", {
      targetType: "custom_url",
      targetUrl: "https://www.materialhubuae.com/en/categories/perfumes",
    });
    saved = linkRepo.create.mock.calls[1]![0];
    expect(saved.target_type).toBe("custom_url");
    expect(saved.target_id).toBeNull();
    expect(saved.target_url).toBe("/en/categories/perfumes");
  });

  it("createLinkByAdmin enforces validation requirements", async () => {
    const mockAff = { id: "aff-1", vendor_id: "v1" };
    const { svc } = makeSvc({ existingAffiliate: mockAff });
    await expect(svc.createLinkByAdmin("aff-1", { targetType: "brand" })).rejects.toThrow(
      /targetId is required/i,
    );
    await expect(svc.createLinkByAdmin("aff-1", { targetType: "custom_url" })).rejects.toThrow(
      /targetUrl is required/i,
    );
  });
});
