import type { ReelsService } from "../reels/reels.service.ts";

/**
 * Cloudflare Stream webhook payload shape. Per
 * https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 *
 * The body is the video object at the TOP LEVEL (same shape as the GET
 * /stream/:id API response). There is NO `{eventType, data}` wrapper.
 * One webhook fires per video once processing is complete, routed by
 * `status.state`: "ready" for success, "error" for failure.
 */
export interface CloudflareStreamWebhookPayload {
  uid: string;
  readyToStream?: boolean;
  status?: {
    state: "ready" | "error" | string;
    pctComplete?: string;
    errReasonCode?: string;
    errReasonText?: string;
  };
  meta?: Record<string, string>;
  duration?: number;
  input?: { width: number; height: number };
  thumbnail?: string;
  playback?: { hls?: string; dash?: string };
}

export class WebhookHandler {
  constructor(private readonly reelsService: ReelsService) {}

  /**
   * Single entry point for Cloudflare Stream webhook notifications.
   * Routes to success or error handling based on `status.state`.
   */
  async handleNotification(event: CloudflareStreamWebhookPayload): Promise<void> {
    const state = event.status?.state;

    if (state === "error") {
      const reason = event.status?.errReasonCode || "transcode_failed";
      await this.reelsService.markAssetRejected(event.uid, reason);
      return;
    }

    if (state !== "ready" || event.readyToStream !== true) {
      // Intermediate state — shouldn't happen per docs ("only sent after
      // processing is complete") but be defensive.
      return;
    }

    // Success path: validate metadata and create draft.
    const userId = event.meta?.userId;
    if (!userId) {
      await this.reelsService.markAssetRejected(event.uid, "missing_user_id");
      return;
    }
    if (!event.duration || event.duration < 3) {
      await this.reelsService.markAssetRejected(event.uid, "duration_too_short");
      return;
    }
    if (event.duration > 90) {
      await this.reelsService.markAssetRejected(event.uid, "duration_too_long");
      return;
    }
    if (!event.input || event.input.height < event.input.width) {
      await this.reelsService.markAssetRejected(event.uid, "aspect_ratio_not_portrait");
      return;
    }
    await this.reelsService.createDraftFromAsset({
      userId,
      assetId: event.uid,
      durationSeconds: Math.round(event.duration),
      width: event.input.width,
      height: event.input.height,
      thumbnailUrl: event.thumbnail ?? "",
      playbackUrl: event.playback?.hls ?? "",
    });
  }

  /** @deprecated kept for test compatibility — delegates to handleNotification */
  async handleVideoReady(event: CloudflareStreamWebhookPayload): Promise<void> {
    return this.handleNotification(event);
  }

  /** @deprecated kept for test compatibility — delegates to handleNotification */
  async handleVideoError(event: CloudflareStreamWebhookPayload): Promise<void> {
    return this.handleNotification(event);
  }
}
