import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export interface UploadResult {
  /** Public URL via CloudFront. */
  url: string;
  /** S3 object key. */
  key: string;
  /** Bytes uploaded. */
  bytes: number;
}

export class FeedUploaderService {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly cloudFrontBaseUrl: string,
  ) {}

  /**
   * Upload feed XML/CSV to S3 at `{channelCode}/feed.xml` (or `.csv`).
   * The key is stable so the public URL never changes — platforms register it
   * once. Each upload overwrites the previous object (versioning at the bucket
   * level retains old versions for rollback).
   */
  async upload(args: {
    channelCode: string;
    format: "xml" | "csv";
    body: string;
  }): Promise<UploadResult> {
    const key = `${args.channelCode}/feed.${args.format}`;
    const contentType = args.format === "xml" ? "application/xml" : "text/csv";
    const body = args.body;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Platforms will re-fetch on their own cadence; keep CloudFront cache short
        // so dashboards reflect the latest run within minutes.
        CacheControl: "max-age=300",
      }),
    );
    return {
      url: `${this.cloudFrontBaseUrl.replace(/\/$/, "")}/${key}`,
      key,
      bytes: Buffer.byteLength(body, "utf8"),
    };
  }
}
