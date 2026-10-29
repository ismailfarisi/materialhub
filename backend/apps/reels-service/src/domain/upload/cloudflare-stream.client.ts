import { config } from "@materialhub/config";

export interface DirectUploadUrlOptions {
  maxDurationSeconds: number;
  expirySeconds?: number;
  /**
   * Cloudflare preserves these fields on the created video and includes them
   * in the `video.ready` webhook payload under `data.meta`. The reels
   * webhook handler relies on `meta.userId` to know which user owns the
   * asset — omitting it causes the webhook to reject the video as
   * `missing_user_id`. Always pass `{ userId }` at minimum.
   */
  meta?: Record<string, string>;
}

export interface DirectUploadUrlResult {
  uploadUrl: string;
  assetId: string;
}

export interface VideoMetadata {
  assetId: string;
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string;
  playbackUrl: string;
  status: "uploading" | "ready" | "error";
  meta: Record<string, string>;
  errorReason?: string;
}

interface CloudflareStreamClientConfig {
  accountId?: string;
  apiToken?: string;
  fetcher?: typeof fetch;
}

export class CloudflareStreamClient {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: CloudflareStreamClientConfig = {}) {
    const configured = config.cloudflareStream ?? {};
    this.accountId =
      opts.accountId ?? configured.accountId ?? process.env.CLOUDFLARE_STREAM_ACCOUNT_ID ?? "";
    this.apiToken =
      opts.apiToken ?? configured.apiToken ?? process.env.CLOUDFLARE_STREAM_API_TOKEN ?? "";
    this.fetcher = opts.fetcher ?? fetch;
  }

  private get baseUrl() {
    return `${config.cloudflareStream.apiBaseUrl}/accounts/${this.accountId}/stream`;
  }

  async requestDirectUploadUrl(opts: DirectUploadUrlOptions): Promise<DirectUploadUrlResult> {
    const body: Record<string, unknown> = {
      maxDurationSeconds: opts.maxDurationSeconds,
      expiry: new Date(Date.now() + (opts.expirySeconds ?? 3600) * 1000).toISOString(),
    };
    if (opts.meta && Object.keys(opts.meta).length > 0) {
      body.meta = opts.meta;
    }
    const res = await this.fetcher(`${this.baseUrl}/direct_upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      success: boolean;
      result?: { uid: string; uploadURL: string };
      errors?: Array<{ message: string }>;
    };
    if (!res.ok || !json.success || !json.result) {
      const message = json.errors?.[0]?.message ?? `cloudflare_stream_error_${res.status}`;
      throw new Error(message);
    }
    return { assetId: json.result.uid, uploadUrl: json.result.uploadURL };
  }

  async getVideo(assetId: string): Promise<VideoMetadata> {
    const res = await this.fetcher(`${this.baseUrl}/${assetId}`, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    const json = (await res.json()) as {
      success: boolean;
      result?: any;
      errors?: Array<{ message: string }>;
    };
    if (!res.ok || !json.success || !json.result) {
      throw new Error(json.errors?.[0]?.message ?? `cloudflare_stream_get_${res.status}`);
    }
    const r = json.result;
    return {
      assetId,
      duration: Math.round(r.duration ?? 0),
      width: r.input?.width ?? 0,
      height: r.input?.height ?? 0,
      thumbnailUrl: r.thumbnail ?? "",
      playbackUrl: r.playback?.hls ?? "",
      status:
        r.status?.state === "ready" ? "ready" : r.status?.state === "error" ? "error" : "uploading",
      meta: r.meta ?? {},
      errorReason: r.status?.errReasonCode ?? r.status?.errReasonText,
    };
  }

  async deleteVideo(assetId: string): Promise<void> {
    try {
      const res = await this.fetcher(`${this.baseUrl}/${assetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      if (!res.ok) {
        console.warn(
          `[CloudflareStreamClient] deleteVideo failed for asset ${assetId}: status ${res.status}`,
        );
      }
    } catch (error) {
      console.warn(
        `[CloudflareStreamClient] deleteVideo threw for asset ${assetId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
