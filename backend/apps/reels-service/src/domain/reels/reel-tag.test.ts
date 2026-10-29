import { describe, expect, it, mock } from "bun:test";
import { ReelStatus } from "@materialhub/database";
import { ReelTagService } from "./reel-tag.service.ts";

function makeRepos(overrides: any = {}) {
  const defaultRepos = {
    reelRepo: {
      findOne: async () => ({
        id: "reel-1",
        user_id: "user-1",
        status: ReelStatus.draft,
      }),
    },
    productRepo: {
      findOne: async () => ({ id: "p1", brand_id: "b1", vendor_id: "v1" }),
    },
    permRepo: { find: async () => [] },
    userRepo: {
      findOne: async () => ({ id: "user-1", can_tag_unowned: false }),
    },
    tagRepo: {
      create: (data: any) => data,
      save: mock(async (data: any) => ({ ...data, id: "tag-1" })),
      delete: mock(async () => undefined),
    },
  };
  return { ...defaultRepos, ...overrides };
}

describe("ReelTagService.addTag", () => {
  it("creates a tag when guard allows", async () => {
    const fakeGuard = {
      canTag: mock(async () => ({
        allowed: true,
        reason: "verified_purchase",
      })),
    };
    const service = new ReelTagService(fakeGuard as any);
    service.setRepos(makeRepos() as any);

    const result = await service.addTag({
      reelId: "reel-1",
      userId: "user-1",
      productId: "p1",
      timestampSeconds: 5.5,
    });

    expect(result.id).toBe("tag-1");
    expect(fakeGuard.canTag).toHaveBeenCalled();
  });

  it("throws forbidden when guard denies", async () => {
    const fakeGuard = {
      canTag: mock(async () => ({
        allowed: false,
        reason: "no_qualifying_rule",
      })),
    };
    const service = new ReelTagService(fakeGuard as any);
    const repos = makeRepos();
    service.setRepos(repos as any);

    await expect(
      service.addTag({
        reelId: "reel-1",
        userId: "user-1",
        productId: "p1",
        timestampSeconds: 1,
      }),
    ).rejects.toThrow(/forbidden/i);
    expect(repos.tagRepo.save).not.toHaveBeenCalled();
  });

  it("throws when reel does not belong to user", async () => {
    const fakeGuard = {
      canTag: mock(async () => ({ allowed: true, reason: "x" })),
    };
    const service = new ReelTagService(fakeGuard as any);
    service.setRepos(
      makeRepos({
        reelRepo: {
          findOne: async () => ({
            id: "r1",
            user_id: "OTHER",
            status: ReelStatus.draft,
          }),
        },
      }) as any,
    );
    await expect(
      service.addTag({
        reelId: "r1",
        userId: "user-1",
        productId: "p1",
        timestampSeconds: 1,
      }),
    ).rejects.toThrow(/not.the.owner|not_the_owner/i);
  });

  it("throws when reel is not in draft state", async () => {
    const fakeGuard = {
      canTag: mock(async () => ({ allowed: true, reason: "x" })),
    };
    const service = new ReelTagService(fakeGuard as any);
    service.setRepos(
      makeRepos({
        reelRepo: {
          findOne: async () => ({
            id: "r1",
            user_id: "user-1",
            status: ReelStatus.approved,
          }),
        },
      }) as any,
    );
    await expect(
      service.addTag({
        reelId: "r1",
        userId: "user-1",
        productId: "p1",
        timestampSeconds: 1,
      }),
    ).rejects.toThrow(/draft/i);
  });

  it("detects vendor-owns-product relationship", async () => {
    const fakeGuard = {
      canTag: mock(async (input: any) => {
        expect(input.ownsVendorOfProduct).toBe(true);
        return { allowed: true, reason: "vendor_owns_product" };
      }),
    };
    const service = new ReelTagService(fakeGuard as any);
    service.setRepos(makeRepos() as any);
    const result = await service.addTag({
      reelId: "reel-1",
      userId: "user-1",
      activeVendorId: "v1",
      productId: "p1",
      timestampSeconds: 1,
    });
    expect(result).toBeTruthy();
  });
});

describe("ReelTagService.removeTag", () => {
  it("deletes the tag when reel belongs to user and is draft", async () => {
    const service = new ReelTagService({} as any);
    const repos = makeRepos();
    service.setRepos(repos as any);
    await service.removeTag("reel-1", "tag-1", "user-1");
    expect(repos.tagRepo.delete).toHaveBeenCalledWith({
      id: "tag-1",
      reel_id: "reel-1",
    });
  });

  it("throws when reel does not belong to user", async () => {
    const service = new ReelTagService({} as any);
    service.setRepos(
      makeRepos({
        reelRepo: {
          findOne: async () => ({
            id: "r1",
            user_id: "OTHER",
            status: ReelStatus.draft,
          }),
        },
      }) as any,
    );
    await expect(service.removeTag("r1", "tag-1", "user-1")).rejects.toThrow(
      /not.the.owner|not_the_owner/i,
    );
  });
});
