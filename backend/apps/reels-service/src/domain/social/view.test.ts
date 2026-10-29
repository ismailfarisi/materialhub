import { describe, expect, it, mock } from "bun:test";
import { ViewService } from "./view.service.ts";

describe("ViewService.recordView", () => {
  it("upserts view row and increments reel view count", async () => {
    let saved: any = null;
    const repo = {
      findOne: async () => null,
      save: mock(async (x: any) => {
        saved = x;
        return x;
      }),
      create: (x: any) => x,
    };
    const reelRepo = { increment: mock(async () => undefined) };
    const service = new ViewService();
    (service as any).viewRepo = repo;
    (service as any).reelRepo = reelRepo;
    await service.recordView({
      reelId: "r1",
      userId: "u1",
      sessionId: null,
      watchDurationSeconds: 25,
      completionPercentage: 0.6,
      deviceType: "web_mobile",
    });
    expect(saved).toMatchObject({ reel_id: "r1", user_id: "u1" });
    expect(reelRepo.increment).toHaveBeenCalledWith({ id: "r1" }, "view_count", 1);
  });

  it("updates existing view row instead of inserting new", async () => {
    const existing: any = {
      reel_id: "r1",
      user_id: "u1",
      watch_duration_seconds: "10",
      completion_percentage: "0.3",
    };
    const repo = {
      findOne: async () => existing,
      save: mock(async (x: any) => x),
      create: (x: any) => x,
    };
    const reelRepo = { increment: mock(async () => undefined) };
    const service = new ViewService();
    (service as any).viewRepo = repo;
    (service as any).reelRepo = reelRepo;
    await service.recordView({
      reelId: "r1",
      userId: "u1",
      sessionId: null,
      watchDurationSeconds: 30,
      completionPercentage: 0.8,
      deviceType: "web_desktop",
    });
    expect(repo.save).toHaveBeenCalled();
    expect(reelRepo.increment).not.toHaveBeenCalled(); // already counted
  });
});

describe("ViewService.recordView (anonymous)", () => {
  it("upserts by session_id when userId is null", async () => {
    const saved: any[] = [];
    const repo = {
      findOne: (_opts: any) => Promise.resolve(null),
      save: (row: any) => {
        saved.push(row);
        return Promise.resolve(row);
      },
      create: (row: any) => row,
    };
    const reelRepo = { increment: () => Promise.resolve() };
    const service = new ViewService();
    (service as any).viewRepo = repo;
    (service as any).reelRepo = reelRepo;

    await service.recordView({
      reelId: "r1",
      userId: null,
      sessionId: "s1",
      watchDurationSeconds: 3.5,
      completionPercentage: 0.6,
      deviceType: "web_mobile",
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].user_id).toBeNull();
    expect(saved[0].session_id).toBe("s1");
    expect(saved[0].reel_id).toBe("r1");
  });

  it("returns silently when both userId and sessionId are null", async () => {
    const saved: any[] = [];
    const repo = {
      findOne: () => Promise.resolve(null),
      save: (row: any) => {
        saved.push(row);
        return Promise.resolve(row);
      },
      create: (row: any) => row,
    };
    const service = new ViewService();
    (service as any).viewRepo = repo;

    await service.recordView({
      reelId: "r1",
      userId: null,
      sessionId: null,
      watchDurationSeconds: 0,
      completionPercentage: 0,
    });

    expect(saved).toHaveLength(0);
  });

  it("dedup: uses (session_id, reel_id) lookup for anonymous upsert", async () => {
    let lookedUpWith: any = null;
    const repo = {
      findOne: (opts: any) => {
        lookedUpWith = opts.where;
        return Promise.resolve({
          id: "v1",
          user_id: null,
          session_id: "s1",
          reel_id: "r1",
          watch_duration_seconds: "1",
          completion_percentage: "0.3",
          device_type: null,
        });
      },
      save: (row: any) => Promise.resolve(row),
    };
    const service = new ViewService();
    (service as any).viewRepo = repo;

    await service.recordView({
      reelId: "r1",
      userId: null,
      sessionId: "s1",
      watchDurationSeconds: 4,
      completionPercentage: 0.7,
    });

    expect(lookedUpWith).toEqual({ session_id: "s1", reel_id: "r1" });
  });
});
