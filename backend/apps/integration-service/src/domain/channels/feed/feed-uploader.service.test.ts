import { describe, expect, it, mock } from "bun:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { FeedUploaderService } from "./feed-uploader.service.ts";

const makeS3 = () => {
  const send = mock((_cmd: any) => Promise.resolve({}));
  return { client: { send } as unknown as S3Client, send };
};

describe("FeedUploaderService", () => {
  it("uploads with the right key, content-type, and cache-control", async () => {
    const { client, send } = makeS3();
    const svc = new FeedUploaderService(
      client,
      "materialhub-channel-feeds-prod",
      "https://feeds.materialhubuae.com",
    );

    const result = await svc.upload({
      channelCode: "google_merchant",
      format: "xml",
      body: "<rss/>",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = (send.mock.calls[0]![0] as { input: Record<string, unknown> }).input;
    expect(cmd.Bucket).toBe("materialhub-channel-feeds-prod");
    expect(cmd.Key).toBe("google_merchant/feed.xml");
    expect(cmd.ContentType).toBe("application/xml");
    expect(cmd.CacheControl).toBe("max-age=300");
    expect(result.url).toBe("https://feeds.materialhubuae.com/google_merchant/feed.xml");
    expect(result.bytes).toBe(6);
  });

  it("trims trailing slash on cloudfront base url", async () => {
    const { client } = makeS3();
    const svc = new FeedUploaderService(client, "b", "https://feeds.materialhubuae.com/");
    const r = await svc.upload({ channelCode: "google_merchant", format: "csv", body: "x" });
    expect(r.url).toBe("https://feeds.materialhubuae.com/google_merchant/feed.csv");
  });
});
