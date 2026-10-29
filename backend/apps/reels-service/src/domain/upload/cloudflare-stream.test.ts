import { describe, expect, it, mock, spyOn } from "bun:test";
import { config } from "@materialhub/config";
import { CloudflareStreamClient } from "./cloudflare-stream.client.ts";

describe("CloudflareStreamClient", () => {
  describe("requestDirectUploadUrl", () => {
    it("returns uploadUrl + assetId and calls the correct endpoint", async () => {
      const fakeFetch = mock(async (_url: string, _opts?: RequestInit) => {
        return new Response(
          JSON.stringify({
            result: {
              uid: "asset-abc-123",
              uploadURL: "https://upload.cloudflarestream.com/asset-abc-123",
            },
            success: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      });
      const client = new CloudflareStreamClient({
        accountId: "acct1",
        apiToken: "token1",
        fetcher: fakeFetch as unknown as typeof fetch,
      });

      const result = await client.requestDirectUploadUrl({ maxDurationSeconds: 90 });

      expect(result.assetId).toBe("asset-abc-123");
      expect(result.uploadUrl).toBe("https://upload.cloudflarestream.com/asset-abc-123");
      expect(fakeFetch).toHaveBeenCalledTimes(1);

      const [url, opts] = fakeFetch.mock.calls[0] as [string, RequestInit];
      // apiBaseUrl is https://api.cloudflare.com/client/v4 unless a local
      // backend/.env points it at the local-stream stand-in.
      expect(url).toBe(`${config.cloudflareStream.apiBaseUrl}/accounts/acct1/stream/direct_upload`);
      expect(opts.method).toBe("POST");
      expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer token1");
      expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      const parsedBody = JSON.parse(opts.body as string);
      expect(parsedBody.maxDurationSeconds).toBe(90);
      expect(parsedBody.expiry).toBeTruthy();
    });

    it("throws on non-success response", async () => {
      const fakeFetch = mock(
        async () =>
          new Response(JSON.stringify({ success: false, errors: [{ message: "no" }] }), {
            status: 400,
          }),
      );
      const client = new CloudflareStreamClient({
        accountId: "acct1",
        apiToken: "token1",
        fetcher: fakeFetch as unknown as typeof fetch,
      });
      await expect(client.requestDirectUploadUrl({ maxDurationSeconds: 90 })).rejects.toThrow();
    });
  });

  describe("getVideo", () => {
    const makeFetch = (resultBody: any, status = 200) =>
      mock(
        async () =>
          new Response(JSON.stringify({ success: true, result: resultBody }), {
            status,
            headers: { "content-type": "application/json" },
          }),
      );

    it("returns normalized metadata when ready", async () => {
      const client = new CloudflareStreamClient({
        accountId: "acct1",
        apiToken: "token1",
        fetcher: makeFetch({
          duration: 30.7,
          input: { width: 1080, height: 1920 },
          thumbnail: "https://cf/t.jpg",
          playback: { hls: "https://cf/h.m3u8" },
          status: { state: "ready" },
          meta: { userId: "user-1" },
        }) as unknown as typeof fetch,
      });
      const meta = await client.getVideo("asset-xyz");
      expect(meta.assetId).toBe("asset-xyz");
      expect(meta.duration).toBe(31); // rounded
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
      expect(meta.thumbnailUrl).toBe("https://cf/t.jpg");
      expect(meta.playbackUrl).toBe("https://cf/h.m3u8");
      expect(meta.status).toBe("ready");
      expect(meta.meta.userId).toBe("user-1");
    });

    it("maps unknown state to uploading", async () => {
      const client = new CloudflareStreamClient({
        accountId: "acct1",
        apiToken: "token1",
        fetcher: makeFetch({
          duration: 10,
          input: { width: 1080, height: 1920 },
          thumbnail: "x",
          playback: { hls: "x" },
          status: { state: "inprogress" },
        }) as unknown as typeof fetch,
      });
      const meta = await client.getVideo("asset-xyz");
      expect(meta.status).toBe("uploading");
    });

    it("maps error state", async () => {
      const client = new CloudflareStreamClient({
        accountId: "acct1",
        apiToken: "token1",
        fetcher: makeFetch({
          duration: 10,
          input: { width: 1080, height: 1920 },
          thumbnail: "x",
          playback: { hls: "x" },
          status: { state: "error", errReasonCode: "ERR_MALFORMED_VIDEO" },
        }) as unknown as typeof fetch,
      });
      const meta = await client.getVideo("asset-xyz");
      expect(meta.status).toBe("error");
      expect(meta.errorReason).toBe("ERR_MALFORMED_VIDEO");
    });
  });

  describe("deleteVideo", () => {
    it("swallows network errors and warns", async () => {
      const throwingFetch = mock(async () => {
        throw new Error("network down");
      });
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      const client = new CloudflareStreamClient({
        accountId: "acct1",
        apiToken: "token1",
        fetcher: throwingFetch as unknown as typeof fetch,
      });

      await client.deleteVideo("asset-xyz"); // should not throw

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
