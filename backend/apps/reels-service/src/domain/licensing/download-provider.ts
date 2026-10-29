import { config } from "@materialhub/config";
import { ServiceUnavailableError } from "@materialhub/plugins";

export interface DownloadProvider {
  /** Mint a signed, expiring download URL for the given Cloudflare Stream asset. */
  mintDownloadUrl(assetId: string, ttlSeconds: number): Promise<{ url: string; expiresAt: Date }>;
}

/** Test double: deterministic URL, no external calls. Exposes a call counter for assertions. */
export class FakeDownloadProvider implements DownloadProvider {
  public calls = 0;
  async mintDownloadUrl(
    assetId: string,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    this.calls++;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return { url: `https://fake-download.local/${assetId}?exp=${expiresAt.getTime()}`, expiresAt };
  }
}

/**
 * Real Cloudflare Stream downloads adapter. Enables the MP4 download for the asset and returns the
 * link with a locally-computed expiry. CF MP4 generation is async; if the file is not yet ready we
 * surface ServiceUnavailableError so the caller can retry. Live verification is a follow-up (see spec).
 */
export class CloudflareStreamDownloadProvider implements DownloadProvider {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async mintDownloadUrl(
    assetId: string,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    if (!this.accountId || !this.apiToken)
      throw new ServiceUnavailableError("download_provider_unconfigured");
    const url = `${config.cloudflareStream.apiBaseUrl}/accounts/${this.accountId}/stream/${assetId}/downloads`;
    let res: Response;
    try {
      res = await this.fetcher(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json" },
      });
    } catch {
      throw new ServiceUnavailableError("download_provider_unreachable");
    }
    if (!res.ok) throw new ServiceUnavailableError("download_provider_error");
    const body = (await res.json()) as {
      result?: { default?: { status?: string; url?: string } };
    };
    const dl = body.result?.default;
    if (!dl?.url || (dl.status && dl.status !== "ready")) {
      throw new ServiceUnavailableError("download_not_ready");
    }
    return { url: dl.url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }
}
