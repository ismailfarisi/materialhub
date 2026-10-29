import { describe, expect, it, mock } from "bun:test";
import { AttributionService } from "./attribution.service.ts";

describe("AttributionService.recordTap", () => {
  it("inserts attribution row with snapshot of window from settings", async () => {
    let saved: any = null;
    const repo = {
      create: (x: any) => x,
      save: mock(async (x: any) => {
        saved = x;
        return x;
      }),
    };
    const reelRepo = {
      findOne: async () => ({ id: "reel-1", user_id: "creator-1" }),
    };
    const tagRepo = { increment: mock(async () => undefined) };
    const settings = { get: async () => "10" }; // 10-day window

    const service = new AttributionService();
    (service as any).repo = repo;
    (service as any).reelRepo = reelRepo;
    (service as any).tagRepo = tagRepo;
    (service as any).settings = settings;

    const before = new Date();
    await service.recordTap({
      reelId: "reel-1",
      productId: "p-1",
      tagId: "tag-1",
      buyerUserId: "buyer-1",
      sessionId: null,
    });

    expect(saved.user_id).toBe("buyer-1");
    expect(saved.creator_id).toBe("creator-1");
    expect(saved.reel_id).toBe("reel-1");
    expect(saved.product_id).toBe("p-1");
    expect(saved.attribution_window_days_snapshot).toBe(10);
    const expectedExpiry = new Date(before.getTime() + 10 * 24 * 3600 * 1000);
    expect(Math.abs(saved.expires_at.getTime() - expectedExpiry.getTime())).toBeLessThan(2000);
    expect(tagRepo.increment).toHaveBeenCalledWith({ id: "tag-1" }, "tap_count", 1);
  });

  it("throws when reel not found", async () => {
    const service = new AttributionService();
    (service as any).reelRepo = { findOne: async () => null };
    (service as any).repo = { create: () => ({}), save: async () => ({}) };
    (service as any).tagRepo = { increment: async () => undefined };
    (service as any).settings = { get: async () => "7" };

    await expect(
      service.recordTap({
        reelId: "missing",
        productId: "p",
        tagId: "t",
        buyerUserId: "b",
        sessionId: null,
      }),
    ).rejects.toThrow("reel_not_found");
  });

  it("defaults to 7 day window when setting is missing or non-numeric", async () => {
    let saved: any = null;
    const service = new AttributionService();
    (service as any).reelRepo = {
      findOne: async () => ({ id: "r", user_id: "c" }),
    };
    (service as any).repo = {
      create: (x: any) => x,
      save: mock(async (x: any) => {
        saved = x;
        return x;
      }),
    };
    (service as any).tagRepo = { increment: mock(async () => undefined) };
    (service as any).settings = { get: async () => "" }; // missing

    await service.recordTap({
      reelId: "r",
      productId: "p",
      tagId: "t",
      buyerUserId: "b",
      sessionId: null,
    });
    expect(saved.attribution_window_days_snapshot).toBe(7);
  });
});

describe("AttributionService.recordTap (anonymous)", () => {
  it("writes row with session_id when buyerUserId is null", async () => {
    const saved: any[] = [];
    const repo = {
      create: (row: any) => row,
      save: (row: any) => {
        saved.push(row);
        return Promise.resolve({ ...row, id: "a1" });
      },
    };
    const reelRepo = {
      findOne: () => Promise.resolve({ id: "r1", user_id: "creator1" }),
    };
    const tagRepo = { increment: () => Promise.resolve() };
    const service = new AttributionService();
    (service as any).repo = repo;
    (service as any).reelRepo = reelRepo;
    (service as any).tagRepo = tagRepo;
    (service as any).settings = { get: () => Promise.resolve("7") };

    await service.recordTap({
      reelId: "r1",
      productId: "p1",
      tagId: "t1",
      buyerUserId: null,
      sessionId: "s1",
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].user_id).toBeNull();
    expect(saved[0].session_id).toBe("s1");
    expect(saved[0].reel_id).toBe("r1");
  });

  it("returns silently when both buyerUserId and sessionId are null", async () => {
    const saveCalls: any[] = [];
    const repo = {
      create: (row: any) => row,
      save: (row: any) => {
        saveCalls.push(row);
        return Promise.resolve(row);
      },
    };
    const service = new AttributionService();
    (service as any).repo = repo;
    (service as any).reelRepo = { findOne: () => Promise.resolve({}) };

    await service.recordTap({
      reelId: "r1",
      productId: "p1",
      tagId: "t1",
      buyerUserId: null,
      sessionId: null,
    });

    expect(saveCalls).toHaveLength(0);
  });

  it("writes row with user_id when buyerUserId is set (existing behavior)", async () => {
    const saved: any[] = [];
    const repo = {
      create: (row: any) => row,
      save: (row: any) => {
        saved.push(row);
        return Promise.resolve({ ...row, id: "a1" });
      },
    };
    const reelRepo = {
      findOne: () => Promise.resolve({ id: "r1", user_id: "creator1" }),
    };
    const tagRepo = { increment: () => Promise.resolve() };
    const service = new AttributionService();
    (service as any).repo = repo;
    (service as any).reelRepo = reelRepo;
    (service as any).tagRepo = tagRepo;
    (service as any).settings = { get: () => Promise.resolve("7") };

    await service.recordTap({
      reelId: "r1",
      productId: "p1",
      tagId: "t1",
      buyerUserId: "u1",
      sessionId: null,
    });

    expect(saved[0].user_id).toBe("u1");
    expect(saved[0].session_id).toBeNull();
  });
});
