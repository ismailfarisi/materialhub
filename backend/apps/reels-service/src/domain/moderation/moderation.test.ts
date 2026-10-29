import { describe, expect, it, mock } from "bun:test";
import { ReelModerationAction, ReelStatus } from "@materialhub/database";
import { ModerationService } from "./moderation.service.ts";

function makeFakes(reel: any) {
  const reelRepo = {
    findOne: async () => reel,
    save: mock(async (x: any) => x),
  };
  const logRepo = {
    save: mock(async (x: any) => x),
    create: (x: any) => x,
  };
  return { reelRepo, logRepo };
}

describe("ModerationService", () => {
  it("approve sets status=approved + published_at + writes log", async () => {
    const reel: any = { id: "r1", status: ReelStatus.pending_review };
    const { reelRepo, logRepo } = makeFakes(reel);
    const service = new ModerationService();
    (service as any).reelRepo = reelRepo;
    (service as any).logRepo = logRepo;

    const result = await service.approve("r1", "mod-1", "looks good");

    expect(result.status).toBe(ReelStatus.approved);
    expect(result.published_at).toBeInstanceOf(Date);
    expect(result.moderator_id).toBe("mod-1");
    expect(result.moderated_at).toBeInstanceOf(Date);
    expect(logRepo.save).toHaveBeenCalled();
  });

  it("approve is idempotent on already-approved reel", async () => {
    const reel: any = {
      id: "r1",
      status: ReelStatus.approved,
      published_at: new Date("2026-01-01"),
    };
    const { reelRepo, logRepo } = makeFakes(reel);
    const service = new ModerationService();
    (service as any).reelRepo = reelRepo;
    (service as any).logRepo = logRepo;

    const result = await service.approve("r1", "mod-1");
    expect(result.status).toBe(ReelStatus.approved);
    expect(result.published_at).toEqual(new Date("2026-01-01"));
    // Log still written for audit
    expect(logRepo.save).toHaveBeenCalled();
  });

  it("reject sets status=rejected with reason", async () => {
    const reel: any = { id: "r1", status: ReelStatus.pending_review };
    const { reelRepo, logRepo } = makeFakes(reel);
    const service = new ModerationService();
    (service as any).reelRepo = reelRepo;
    (service as any).logRepo = logRepo;

    const result = await service.reject("r1", "mod-1", "off_topic", "not beauty");

    expect(result.status).toBe(ReelStatus.rejected);
    expect(result.rejection_reason).toBe("off_topic");
    expect(result.moderator_id).toBe("mod-1");
    expect(logRepo.save).toHaveBeenCalled();
  });

  it("flag does not change status, only writes log", async () => {
    const reel: any = { id: "r1", status: ReelStatus.pending_review };
    const { reelRepo, logRepo } = makeFakes(reel);
    const service = new ModerationService();
    (service as any).reelRepo = reelRepo;
    (service as any).logRepo = logRepo;

    await service.flag("r1", "mod-1", "needs senior review");

    expect(reel.status).toBe(ReelStatus.pending_review);
    const logArg = (logRepo.save as any).mock.calls[0][0];
    expect(logArg.action).toBe(ReelModerationAction.flagged);
  });

  it("throws reel_not_found for missing reel", async () => {
    const reelRepo = { findOne: async () => null, save: mock(async (x: any) => x) };
    const logRepo = { save: mock(async (x: any) => x), create: (x: any) => x };
    const service = new ModerationService();
    (service as any).reelRepo = reelRepo;
    (service as any).logRepo = logRepo;

    await expect(service.approve("missing", "mod-1")).rejects.toThrow(/reel_not_found/);
    await expect(service.reject("missing", "mod-1", "x")).rejects.toThrow(/reel_not_found/);
    await expect(service.flag("missing", "mod-1")).rejects.toThrow(/reel_not_found/);
  });
});
