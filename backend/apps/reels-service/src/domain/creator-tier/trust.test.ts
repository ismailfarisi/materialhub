import { describe, expect, it } from "bun:test";
import { CreatorTier } from "@materialhub/database";
import { TrustService } from "./trust.service.ts";

describe("TrustService.isTrusted", () => {
  it("returns true for creator tier", async () => {
    const repo = {
      findOne: async () => ({
        creator_tier: CreatorTier.creator,
        can_tag_unowned: false,
      }),
    };
    const svc = new TrustService();
    (svc as any).repo = repo;
    expect(await svc.isTrusted("u1")).toBe(true);
  });

  it("returns true for influencer tier", async () => {
    const repo = {
      findOne: async () => ({
        creator_tier: CreatorTier.influencer,
        can_tag_unowned: false,
      }),
    };
    const svc = new TrustService();
    (svc as any).repo = repo;
    expect(await svc.isTrusted("u1")).toBe(true);
  });

  it("returns true for can_tag_unowned bypass regardless of tier", async () => {
    const repo = {
      findOne: async () => ({
        creator_tier: CreatorTier.regular,
        can_tag_unowned: true,
      }),
    };
    const svc = new TrustService();
    (svc as any).repo = repo;
    expect(await svc.isTrusted("u1")).toBe(true);
  });

  it("returns false for plain regular user", async () => {
    const repo = {
      findOne: async () => ({
        creator_tier: CreatorTier.regular,
        can_tag_unowned: false,
      }),
    };
    const svc = new TrustService();
    (svc as any).repo = repo;
    expect(await svc.isTrusted("u1")).toBe(false);
  });

  it("returns false when user does not exist", async () => {
    const repo = { findOne: async () => null };
    const svc = new TrustService();
    (svc as any).repo = repo;
    expect(await svc.isTrusted("missing")).toBe(false);
  });
});
