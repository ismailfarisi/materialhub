import { describe, expect, it, mock } from "bun:test";
import { LikeService } from "./like.service.ts";

describe("LikeService.toggle", () => {
  it("inserts like when not present", async () => {
    const stored: any[] = [];
    const repo = {
      findOne: async () => null,
      create: (data: any) => data,
      save: mock(async (data: any) => {
        stored.push(data);
        return data;
      }),
      delete: mock(async () => undefined),
    };
    const service = new LikeService();
    (service as any).repo = repo;
    const result = await service.toggle("reel-1", "user-1");
    expect(result.action).toBe("liked");
    expect(repo.save).toHaveBeenCalled();
  });

  it("removes like when already present", async () => {
    const repo = {
      findOne: async () => ({ reel_id: "reel-1", user_id: "user-1" }),
      create: (data: any) => data,
      save: mock(async () => ({})),
      delete: mock(async () => undefined),
    };
    const service = new LikeService();
    (service as any).repo = repo;
    const result = await service.toggle("reel-1", "user-1");
    expect(result.action).toBe("unliked");
    expect(repo.delete).toHaveBeenCalled();
  });
});
