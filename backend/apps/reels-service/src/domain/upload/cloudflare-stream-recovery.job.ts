import { type Job, Queue, Worker } from "bullmq";
import type { CloudflareStreamClient } from "./cloudflare-stream.client.ts";
import type { CloudflareStreamWebhookPayload, WebhookHandler } from "./webhook.handler.ts";

export const CLOUDFLARE_STREAM_RECOVERY_QUEUE = "reels-cloudflare-stream-recovery";
export const CLOUDFLARE_STREAM_RECOVERY_JOB = "recoverCloudflareStreamUpload";

const RECOVERY_DELAY_MS = 60 * 1000;
const RECOVERY_ATTEMPTS = 3;

export interface CloudflareStreamRecoveryPayload {
  assetId: string;
  userId: string;
}

export class CloudflareStreamRecoveryJob {
  private worker: Worker | null = null;
  private readonly queue: Queue<CloudflareStreamRecoveryPayload>;

  constructor(
    private readonly redisUrl: string,
    private readonly cloudflare: CloudflareStreamClient,
    private readonly webhookHandler: WebhookHandler,
  ) {
    this.queue = new Queue<CloudflareStreamRecoveryPayload>(CLOUDFLARE_STREAM_RECOVERY_QUEUE, {
      connection: { url: redisUrl },
    });
  }

  async enqueue(payload: CloudflareStreamRecoveryPayload): Promise<void> {
    await this.queue.add(CLOUDFLARE_STREAM_RECOVERY_JOB, payload, {
      jobId: payload.assetId,
      delay: RECOVERY_DELAY_MS,
      attempts: RECOVERY_ATTEMPTS,
      backoff: { type: "fixed", delay: RECOVERY_DELAY_MS },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  start(): void {
    this.worker = new Worker(
      CLOUDFLARE_STREAM_RECOVERY_QUEUE,
      async (job: Job<CloudflareStreamRecoveryPayload>) => {
        await this.handle(job.data);
      },
      {
        connection: { url: this.redisUrl },
        concurrency: 5,
      },
    );
  }

  async handle(payload: CloudflareStreamRecoveryPayload): Promise<void> {
    const video = await this.cloudflare.getVideo(payload.assetId);
    if (video.status === "uploading") {
      throw new Error("cloudflare_stream_still_processing");
    }

    const event: CloudflareStreamWebhookPayload = {
      uid: payload.assetId,
      readyToStream: video.status === "ready",
      status: {
        state: video.status,
        errReasonCode: video.errorReason,
      },
      meta: {
        userId: payload.userId,
        ...video.meta,
      },
      duration: video.duration,
      input: { width: video.width, height: video.height },
      thumbnail: video.thumbnailUrl,
      playback: { hls: video.playbackUrl },
    };

    await this.webhookHandler.handleNotification(event);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }
}
