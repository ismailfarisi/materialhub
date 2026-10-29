import { describe, expect, it, mock } from "bun:test";
import { FollowService } from "./follow.service.ts";

describe("FollowService.toggle", () => {
  it("inserts follow when not present", async () => {
    const repo = {
      findOne: async () => null,
      create: (data: any) => data,
      save: mock(async (data: any) => data),
      delete: mock(async () => undefined),
    };
    const service = new FollowService();
    (service as any).repo = repo;
    const result = await service.toggle("follower-1", "followee-1");
    expect(result.action).toBe("followed");
    expect(repo.save).toHaveBeenCalled();
  });

  it("removes follow when already present", async () => {
    const repo = {
      findOne: async () => ({
        follower_id: "follower-1",
        followee_id: "followee-1",
      }),
      create: (data: any) => data,
      save: mock(async () => ({})),
      delete: mock(async () => undefined),
    };
    const service = new FollowService();
    (service as any).repo = repo;
    const result = await service.toggle("follower-1", "followee-1");
    expect(result.action).toBe("unfollowed");
    expect(repo.delete).toHaveBeenCalled();
  });

  it("rejects self-follow", async () => {
    const service = new FollowService();
    (service as any).repo = { findOne: async () => null };
    await expect(service.toggle("user-1", "user-1")).rejects.toThrow("cannot_follow_self");
  });
});
