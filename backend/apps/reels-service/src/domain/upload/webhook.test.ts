import { describe, expect, it, mock } from "bun:test";
import { WebhookHandler } from "./webhook.handler.ts";

function makeFakeReelsService(existing: any = null) {
  return {
    findByAssetId: mock(async () => existing),
    createDraftFromAsset: mock(async () => ({ id: "reel-1", status: "draft" })),
    markAssetRejected: mock(async () => undefined),
  };
}

/**
 * Cloudflare Stream webhooks post the video object at the TOP LEVEL
 * (no {eventType, data} wrapper). Test fixtures match the real shape
 * from https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
function makeReadyPayload(
  overrides: Partial<{
    uid: string;
    readyToStream: boolean;
    status: { state: string };
    meta: Record<string, string>;
    duration: number;
    input: { width: number; height: number };
    thumbnail: string;
    playback: { hls: string };
  }> = {},
) {
  return {
    uid: "asset-123",
    readyToStream: true,
    status: { state: "ready" },
    meta: { userId: "user-1" },
    duration: 30,
    input: { width: 1080, height: 1920 },
    thumbnail: "https://cf/thumb.jpg",
    playback: { hls: "https://cf/hls.m3u8" },
    ...overrides,
  } as any;
}

describe("WebhookHandler.handleNotification", () => {
  it("applies ready metadata to a pre-created draft", async () => {
    const fakeReelsService = makeFakeReelsService({ id: "reel-already-here" });
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification(makeReadyPayload({ uid: "asset-existing" }));
    expect(fakeReelsService.createDraftFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "asset-existing",
        playbackUrl: "https://cf/hls.m3u8",
        thumbnailUrl: "https://cf/thumb.jpg",
      }),
    );
    expect(fakeReelsService.markAssetRejected).not.toHaveBeenCalled();
  });

  it("creates a draft reel for a portrait 9:16 video in state=ready", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification(makeReadyPayload());

    expect(fakeReelsService.createDraftFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        assetId: "asset-123",
        durationSeconds: 30,
        width: 1080,
        height: 1920,
        thumbnailUrl: "https://cf/thumb.jpg",
        playbackUrl: "https://cf/hls.m3u8",
      }),
    );
    expect(fakeReelsService.markAssetRejected).not.toHaveBeenCalled();
  });

  it("rejects landscape video (height < width)", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification(
      makeReadyPayload({
        uid: "asset-456",
        input: { width: 1920, height: 1080 },
      }),
    );
    expect(fakeReelsService.createDraftFromAsset).not.toHaveBeenCalled();
    expect(fakeReelsService.markAssetRejected).toHaveBeenCalledWith(
      "asset-456",
      "aspect_ratio_not_portrait",
    );
  });

  it("rejects video shorter than 3 seconds", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification(makeReadyPayload({ uid: "asset-short", duration: 2 }));
    expect(fakeReelsService.markAssetRejected).toHaveBeenCalledWith(
      "asset-short",
      "duration_too_short",
    );
  });

  it("rejects video longer than 90 seconds", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification(makeReadyPayload({ uid: "asset-long", duration: 120 }));
    expect(fakeReelsService.markAssetRejected).toHaveBeenCalledWith(
      "asset-long",
      "duration_too_long",
    );
  });

  it("rejects missing user metadata", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification(makeReadyPayload({ uid: "asset-nouser", meta: {} }));
    expect(fakeReelsService.markAssetRejected).toHaveBeenCalledWith(
      "asset-nouser",
      "missing_user_id",
    );
  });

  it("marks asset rejected when state=error", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification({
      uid: "asset-err",
      readyToStream: false,
      status: {
        state: "error",
        errReasonCode: "ERR_MALFORMED_VIDEO",
        errReasonText: "corrupt",
      },
    } as any);
    expect(fakeReelsService.markAssetRejected).toHaveBeenCalledWith(
      "asset-err",
      "ERR_MALFORMED_VIDEO",
    );
    expect(fakeReelsService.createDraftFromAsset).not.toHaveBeenCalled();
  });

  it("ignores payloads where state is neither ready nor error", async () => {
    const fakeReelsService = makeFakeReelsService();
    const handler = new WebhookHandler(fakeReelsService as any);
    await handler.handleNotification({
      uid: "asset-pending",
      readyToStream: false,
      status: { state: "inprogress" },
    } as any);
    expect(fakeReelsService.createDraftFromAsset).not.toHaveBeenCalled();
    expect(fakeReelsService.markAssetRejected).not.toHaveBeenCalled();
  });
});
