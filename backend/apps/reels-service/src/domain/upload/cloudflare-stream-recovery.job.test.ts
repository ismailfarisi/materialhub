import { describe, expect, it, mock } from "bun:test";
import { CloudflareStreamRecoveryJob } from "./cloudflare-stream-recovery.job.ts";

function makeJob(
  overrides: {
    video?: {
      assetId?: string;
      status: "uploading" | "ready" | "error";
      meta?: Record<string, string>;
      errorReason?: string;
    };
  } = {},
) {
  const cloudflare = {
    getVideo: mock(async () => ({
      assetId: "asset-1",
      duration: 30,
      width: 1080,
      height: 1920,
      thumbnailUrl: "https://cf/thumb.jpg",
      playbackUrl: "https://cf/hls.m3u8",
      meta: {},
      ...overrides.video,
    })),
  };
  const webhookHandler = {
    handleNotification: mock(async () => undefined),
  };
  const job = new CloudflareStreamRecoveryJob(
    "redis://localhost:6379",
    cloudflare as any,
    webhookHandler as any,
  );
  return { job, cloudflare, webhookHandler };
}

describe("CloudflareStreamRecoveryJob.handle", () => {
  it("throws while Cloudflare is still processing so BullMQ retries", async () => {
    const { job } = makeJob({ video: { status: "uploading" } });

    await expect(job.handle({ assetId: "asset-1", userId: "user-1" })).rejects.toThrow(
      "cloudflare_stream_still_processing",
    );
    await job.stop();
  });

  it("replays ready metadata through the webhook handler", async () => {
    const { job, webhookHandler } = makeJob({
      video: { status: "ready", meta: { userId: "cf-user" } },
    });

    await job.handle({ assetId: "asset-1", userId: "fallback-user" });

    expect(webhookHandler.handleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "asset-1",
        readyToStream: true,
        meta: { userId: "cf-user" },
        status: expect.objectContaining({ state: "ready" }),
      }),
    );
    await job.stop();
  });

  it("replays error metadata through the webhook handler", async () => {
    const { job, webhookHandler } = makeJob({
      video: { status: "error", errorReason: "ERR_MALFORMED_VIDEO" },
    });

    await job.handle({ assetId: "asset-1", userId: "user-1" });

    expect(webhookHandler.handleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "asset-1",
        readyToStream: false,
        status: expect.objectContaining({
          state: "error",
          errReasonCode: "ERR_MALFORMED_VIDEO",
        }),
      }),
    );
    await job.stop();
  });
});
