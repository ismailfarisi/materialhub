import { describe, expect, it, mock } from "bun:test";
import { SaveService } from "./save.service.ts";

describe("SaveService.toggle", () => {
  it("inserts save when not present", async () => {
    const repo = {
      findOne: async () => null,
      create: (data: any) => data,
      save: mock(async (data: any) => data),
      delete: mock(async () => undefined),
    };
    const service = new SaveService();
    (service as any).repo = repo;
    const result = await service.toggle("reel-1", "user-1");
    expect(result.action).toBe("saved");
    expect(repo.save).toHaveBeenCalled();
  });

  it("removes save when already present", async () => {
    const repo = {
      findOne: async () => ({ reel_id: "reel-1", user_id: "user-1" }),
      create: (data: any) => data,
      save: mock(async () => ({})),
      delete: mock(async () => undefined),
    };
    const service = new SaveService();
    (service as any).repo = repo;
    const result = await service.toggle("reel-1", "user-1");
    expect(result.action).toBe("unsaved");
    expect(repo.delete).toHaveBeenCalled();
  });
});
