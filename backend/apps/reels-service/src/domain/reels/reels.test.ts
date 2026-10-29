import { describe, expect, it, mock, spyOn } from "bun:test";
import { ReelAuthorKind } from "@materialhub/database";
import { ReelsService } from "./reels.service.ts";

describe("ReelsService.requestUpload", () => {
  it("returns uploadUrl and assetId from CloudflareStreamClient with 90-second max duration", async () => {
    const fakeClient = {
      requestDirectUploadUrl: mock(async () => ({
        uploadUrl: "https://upload.cf/123",
        assetId: "asset-123",
      })),
    };
    const service = new ReelsService(fakeClient as any, {} as any, {} as any);
    const save = mock(async (reel: any) => ({ ...reel, id: "reel-1" }));
    (service as any).reelRepo = {
      findOne: mock(async () => null),
      create: (data: any) => data,
      save,
    };
    (service as any).hasActiveVendorMembership = mock(async () => false);
    const recoveryScheduler = { enqueue: mock(async () => undefined) };
    service.setUploadRecoveryScheduler(recoveryScheduler);

    const result = await service.requestUpload({ userId: "user-1" });

    expect(result).toEqual({
      uploadUrl: "https://upload.cf/123",
      assetId: "asset-123",
      reelId: "reel-1",
    });
    expect(fakeClient.requestDirectUploadUrl).toHaveBeenCalledTimes(1);
    expect(fakeClient.requestDirectUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ maxDurationSeconds: 90 }),
    );
    expect(recoveryScheduler.enqueue).toHaveBeenCalledWith({
      assetId: "asset-123",
      userId: "user-1",
    });
  });

  it("does not fail upload creation when recovery enqueue fails", async () => {
    const fakeClient = {
      requestDirectUploadUrl: mock(async () => ({
        uploadUrl: "https://upload.cf/123",
        assetId: "asset-123",
      })),
    };
    const service = new ReelsService(fakeClient as any, {} as any, {} as any);
    const save = mock(async (reel: any) => ({ ...reel, id: "reel-1" }));
    (service as any).reelRepo = {
      findOne: mock(async () => null),
      create: (data: any) => data,
      save,
    };
    (service as any).hasActiveVendorMembership = mock(async () => false);
    service.setUploadRecoveryScheduler({
      enqueue: mock(async () => {
        throw new Error("redis_down");
      }),
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    const result = await service.requestUpload({ userId: "user-1" });

    expect(result).toEqual({
      uploadUrl: "https://upload.cf/123",
      assetId: "asset-123",
      reelId: "reel-1",
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("ReelsService.createDraftFromAsset", () => {
  it("marks drafts from active vendor members as house reels", async () => {
    const service = new ReelsService({} as any, {} as any, {} as any);
    const save = mock(async (reel: any) => ({ ...reel, id: "reel-1" }));
    (service as any).reelRepo = {
      findOne: mock(async () => null),
      create: (data: any) => data,
      save,
    };
    (service as any).hasActiveVendorMembership = mock(async () => true);

    const reel = await service.createDraftFromAsset({
      userId: "user-1",
      assetId: "asset-1",
      durationSeconds: 12,
      width: 720,
      height: 1280,
      thumbnailUrl: "https://cdn.example/thumb.jpg",
      playbackUrl: "https://cdn.example/video.m3u8",
    });

    expect(reel.author_kind).toBe(ReelAuthorKind.house);
    expect(save).toHaveBeenCalled();
  });
});
