import { CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "@materialhub/config";
import sharp from "sharp";
import { ASSET_TYPE_CONFIG, type MediaAssetType, buildAssetKey } from "./asset-type-config.ts";
import { getCloudFrontClient, getS3Client } from "./s3-client.ts";

interface ImageVariant {
  key: string;
  url: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface ProcessedImages {
  large: ImageVariant;
  medium: ImageVariant;
  card: ImageVariant;
  thumb: ImageVariant;
}

/**
 * Whitelist that turns a validated content type into the object-key extension.
 * Deliberately not derived from the client's filename — that string reaches the
 * key verbatim and can contain path separators.
 */
const LAYOUT_VIDEO_EXTENSION_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

// Magic bytes for supported image formats
const _IMAGE_SIGNATURES = {
  jpeg: [0xff, 0xd8],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP" at offset 8
} as const;

export {
  ASSET_TYPE_CONFIG,
  buildAssetKey,
  isAssetType,
  type AssetTypeConfig,
  type MediaAssetType,
} from "./asset-type-config.ts";

function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG: starts with FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;

  // PNG: starts with 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return true;

  // WebP: "WEBP" at bytes 8-11
  if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50)
    return true;

  return false;
}

export class MediaService {
  private bucket = config.media.s3Bucket;

  getPublicUrlPrefix(): string {
    if (config.media.cloudfrontDomain) {
      return `https://${config.media.cloudfrontDomain}`;
    }
    if (config.aws.s3Endpoint) {
      return `${config.aws.s3Endpoint.replace(/\/$/, "")}/${this.bucket}`;
    }
    return `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com`;
  }

  getPublicUrl(key: string): string {
    return `${this.getPublicUrlPrefix()}/${key}`;
  }

  extractKeyFromPublicUrl(url: string): string | null {
    const prefix = `${this.getPublicUrlPrefix()}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }

  async generatePresignedUrl(
    filename: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; key: string; expiresAt: Date }> {
    if (!config.media.allowedMimeTypes.includes(contentType)) {
      throw new Error(
        `Invalid content type: ${contentType}. Allowed: ${config.media.allowedMimeTypes.join(", ")}`,
      );
    }

    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `uploads/${crypto.randomUUID()}/${sanitized}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type"]),
    });

    const expiresAt = new Date(Date.now() + 300 * 1000);

    return { uploadUrl, key, expiresAt };
  }

  async generatePresignedUrlForAsset(input: {
    assetType: MediaAssetType;
    filename: string;
    contentType: string;
    vendorId?: string;
    userId?: string;
  }): Promise<{ uploadUrl: string; key: string; expiresAt: Date }> {
    const { assetType, filename, contentType, vendorId, userId } = input;
    const cfg = ASSET_TYPE_CONFIG[assetType];

    if (!(cfg.allowedContentTypes as readonly string[]).includes(contentType)) {
      throw new Error(
        `Invalid content type: ${contentType}. Allowed content types for ${assetType}: ${cfg.allowedContentTypes.join(", ")}`,
      );
    }

    if (cfg.requiresVendorId && !vendorId) {
      throw new Error(`Asset type ${assetType} requires vendorId`);
    }
    if (cfg.requiresUserId && !userId) {
      throw new Error(`Asset type ${assetType} requires userId`);
    }

    const key = buildAssetKey(assetType, filename, { vendorId, userId });

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type"]),
    });

    const expiresAt = new Date(Date.now() + 300 * 1000);

    return { uploadUrl, key, expiresAt };
  }

  async uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  /**
   * Process an uploaded image into thumb/card/medium/large WebP variants.
   *
   * The `variantUuid` argument is REQUIRED for any caller where multiple
   * uploads can share the same s3Key prefix segment — pass a per-upload
   * unique id (e.g. the bulk-import task id). If omitted, falls back to
   * `s3Key.split("/")[1]`, which is correct only for the presigned-upload
   * pattern `uploads/{uuid}/{filename}`. Picking the wrong segment causes
   * concurrent images for the same parent to collide on a single
   * `processed/{uuid}/{size}.webp` key and overwrite each other in S3 —
   * the symptom is "all product images point to the last-uploaded file".
   */
  async processImage(s3Key: string, variantUuid?: string): Promise<ProcessedImages> {
    const s3 = getS3Client();

    const getCmd = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    const response = await s3.send(getCmd);

    if (!response.Body) {
      throw new Error(`Failed to download object: ${s3Key}`);
    }

    // Enforce file size limit server-side
    if (response.ContentLength && response.ContentLength > config.media.maxFileSize) {
      throw new Error(`File exceeds maximum allowed size of ${config.media.maxFileSize} bytes`);
    }

    const bodyBytes = await response.Body.transformToByteArray();
    const buffer = Buffer.from(bodyBytes);

    // Validate magic bytes to prevent MIME spoofing
    if (!validateImageMagicBytes(buffer)) {
      throw new Error(
        "Invalid image format: file content does not match a supported image type (JPEG, PNG, WebP)",
      );
    }

    // TODO: Integrate malware scanning before processing
    // In production, this should call ClamAV (via ECS sidecar) or AWS GuardDuty Malware Protection.
    // Files should remain in the uploads/ (quarantine) prefix until scan passes.
    // For now, sharp() will reject truly malformed files but a dedicated scanner is required.

    const uuid = variantUuid ?? s3Key.split("/")[1] ?? crypto.randomUUID();
    const sizes = config.media.sizes;

    const results: Record<string, ImageVariant> = {};

    for (const [name, maxWidth] of Object.entries(sizes) as Array<[keyof typeof sizes, number]>) {
      const processed = await sharp(buffer)
        .resize(maxWidth, undefined, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });

      const variantKey = `processed/${uuid}/${name}.webp`;

      await s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: variantKey,
          Body: processed.data,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      results[name] = {
        key: variantKey,
        url: this.getPublicUrl(variantKey),
        width: processed.info.width,
        height: processed.info.height,
        fileSize: processed.info.size,
      };
    }

    return results as unknown as ProcessedImages;
  }

  async processImageWithCrop(
    s3Key: string,
    crop: { x: number; y: number; w: number; h: number },
    rotationDegrees = 0,
    variantUuid?: string,
  ): Promise<ProcessedImages> {
    const s3 = getS3Client();
    const getCmd = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    const response = await s3.send(getCmd);
    if (!response.Body) throw new Error(`Failed to download object: ${s3Key}`);

    const bodyBytes = await response.Body.transformToByteArray();
    const buffer = Buffer.from(bodyBytes);

    if (!validateImageMagicBytes(buffer)) {
      throw new Error("Invalid image format");
    }

    // crop coords are normalized 0–1; convert to pixels
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");
    const px = {
      left: Math.round(crop.x * meta.width),
      top: Math.round(crop.y * meta.height),
      width: Math.max(1, Math.round(crop.w * meta.width)),
      height: Math.max(1, Math.round(crop.h * meta.height)),
    };

    // Per-task uuid so concurrent jobs don't write to the same processed/ prefix
    const uuid = variantUuid ?? crypto.randomUUID();
    const sizes = config.media.sizes;
    const results: Record<string, ImageVariant> = {};

    for (const [name, maxWidth] of Object.entries(sizes) as Array<[keyof typeof sizes, number]>) {
      let pipeline = sharp(buffer).extract(px);
      if (rotationDegrees) pipeline = pipeline.rotate(rotationDegrees);
      const processed = await pipeline
        .resize(maxWidth, undefined, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });

      const variantKey = `processed/${uuid}/${name}.webp`;
      await s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: variantKey,
          Body: processed.data,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      results[name] = {
        key: variantKey,
        url: this.getPublicUrl(variantKey),
        width: processed.info.width,
        height: processed.info.height,
        fileSize: processed.info.size,
      };
    }

    return results as unknown as ProcessedImages;
  }

  async processAssetImage(input: {
    assetType: MediaAssetType;
    key: string;
  }): Promise<{ url: string }> {
    const { assetType, key } = input;
    const cfg = ASSET_TYPE_CONFIG[assetType];

    if (cfg.process === "multi_variant") {
      // Editorial / inline JSONB use: run a single resize at 1920px and return a URL.
      // (The multi-variant pipeline is reserved for ProductImage row creation.)
      const s3 = getS3Client();
      const obj = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!obj.Body) throw new Error(`Failed to download object: ${key}`);
      if (obj.ContentLength && obj.ContentLength > cfg.maxBytes) {
        throw new Error(`File exceeds maximum size of ${cfg.maxBytes} bytes for ${assetType}`);
      }
      const bytes = await obj.Body.transformToByteArray();
      const buf = Buffer.from(bytes);
      if (!validateImageMagicBytes(buf)) throw new Error("Invalid image format");
      const processed = await sharp(buf)
        .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      const segs = key.split("/");
      const filename = segs[segs.length - 1] ?? "";
      const baseName = filename.replace(/\.[^.]+$/, "");
      const dir = segs.slice(0, -1).join("/");
      const newKey = `${dir}/${baseName}.editorial.webp`;
      await s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: newKey,
          Body: processed,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      return { url: this.getPublicUrl(newKey) };
    }

    if (cfg.process === "none") {
      // No server-side processing needed (e.g. videos). Just expose the public URL.
      return { url: this.getPublicUrl(key) };
    }

    // single_webp path
    const s3 = getS3Client();
    const obj = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));

    if (!obj.Body) {
      throw new Error(`Failed to download object: ${key}`);
    }

    if (obj.ContentLength && obj.ContentLength > cfg.maxBytes) {
      throw new Error(`File exceeds maximum size of ${cfg.maxBytes} bytes for ${assetType}`);
    }

    // SVG passthrough — no raster processing needed
    if (obj.ContentType === "image/svg+xml") {
      return { url: this.getPublicUrl(key) };
    }

    const bodyBytes = await obj.Body.transformToByteArray();
    const buffer = Buffer.from(bodyBytes);

    if (!validateImageMagicBytes(buffer)) {
      throw new Error("Invalid image format");
    }

    const maxDimension = cfg.maxDimension ?? 1920;
    const processed = await sharp(buffer)
      .resize(maxDimension, maxDimension, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();

    // Compute new key: swap extension to .webp
    const segments = key.split("/");
    const filename = segments[segments.length - 1] ?? "";
    const baseName = filename.replace(/\.[^.]+$/, "");
    const dir = segments.slice(0, -1).join("/");
    const newKey = `${dir}/${baseName}.webp`;

    await s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: newKey,
        Body: processed,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    // Best-effort delete original if key changed
    if (newKey !== key) {
      try {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: [{ Key: key }],
              Quiet: true,
            },
          }),
        );
      } catch {
        // swallow — cleanup failure should not fail the upload
      }
    }

    return { url: this.getPublicUrl(newKey) };
  }

  /**
   * Re-encodes an existing processed S3 object at a new max width and uploads
   * it to targetKey. Used by one-off variant backfill scripts (e.g. populating
   * the 320px card variant for rows that predate it). Returns the public URL
   * of the newly written object.
   */
  async resizeFromExisting(
    sourceKey: string,
    targetKey: string,
    maxWidth: number,
  ): Promise<{ url: string }> {
    const s3 = getS3Client();
    const obj = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: sourceKey }));
    if (!obj.Body) throw new Error(`Failed to download object: ${sourceKey}`);
    const bytes = await obj.Body.transformToByteArray();
    const buffer = Buffer.from(bytes);

    const processed = await sharp(buffer)
      .resize(maxWidth, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: targetKey,
        Body: processed,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { url: this.getPublicUrl(targetKey) };
  }

  async generateVideoPresignedUrl(input: {
    vendorId: string;
    productId: string;
    filename: string;
    contentType: string;
  }): Promise<{ url: string; key: string; expiresIn: number }> {
    const ext = input.filename.split(".").pop() ?? "mp4";
    const key = `raw-video/${input.vendorId}/${input.productId}/${crypto.randomUUID()}.${ext}`;
    const s3 = getS3Client();
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.contentType,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 900 });
    return { url, key, expiresIn: 900 };
  }

  async generateLayoutVideoPresignedUrl(input: {
    vendorId: string | null;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ url: string; key: string; expiresIn: number }> {
    // The extension is derived from the already-validated content type rather
    // than from the client's filename: a filename can contain "/" and would
    // otherwise let a caller invent sub-paths under the vendor prefix.
    const ext = LAYOUT_VIDEO_EXTENSION_BY_TYPE[input.contentType];
    if (!ext) {
      throw new Error(`Unsupported layout video content type: ${input.contentType}`);
    }
    const scope = input.vendorId ?? "platform";
    const key = `raw-video/layout/${scope}/${crypto.randomUUID()}.${ext}`;
    const s3 = getS3Client();
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.contentType,
      // Signed, so the declared size is what S3 will accept. Without it the
      // 25MB cap is advisory and a client could declare 1MB and PUT 2GB, which
      // downloadBuffer would then pull whole into memory.
      ContentLength: input.sizeBytes,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 900 });
    return { url, key, expiresIn: 900 };
  }

  async downloadBuffer(s3Key: string): Promise<Buffer> {
    const s3 = getS3Client();
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    const response = await s3.send(cmd);
    if (!response.Body) throw new Error(`Failed to download object: ${s3Key}`);
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getKycSignedUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    if (!key.startsWith("private/kyc/")) {
      throw new Error("Key is not under private/kyc/ prefix");
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });
    return { url, expiresAt: new Date(Date.now() + 300 * 1000) };
  }

  /** Short-lived download URL for an eco declaration certificate. */
  async getEcoCertificateSignedUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    if (!key.startsWith("private/eco-certificates/")) {
      throw new Error("Key is not under private/eco-certificates/ prefix");
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });
    return { url, expiresAt: new Date(Date.now() + 300 * 1000) };
  }

  async getReceiptSignedUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    if (!key.startsWith("private/receipts/")) {
      throw new Error("Key is not under private/receipts/ prefix");
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });
    return { url, expiresAt: new Date(Date.now() + 300 * 1000) };
  }

  async deleteMediaByPrefix(prefix: string): Promise<void> {
    const s3 = getS3Client();

    // List all objects under the prefix to avoid fragile string manipulation
    const listResult = await s3.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );

    const keys = (listResult.Contents ?? []).map((obj) => obj.Key).filter((k): k is string => !!k);

    if (keys.length === 0) return;

    await this.deleteMedia(keys);
  }

  async deleteMedia(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const s3 = getS3Client();

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );

    if (config.media.cloudfrontDistributionId) {
      const cf = getCloudFrontClient();
      await cf.send(
        new CreateInvalidationCommand({
          DistributionId: config.media.cloudfrontDistributionId,
          InvalidationBatch: {
            CallerReference: `del-${Date.now()}`,
            Paths: {
              Quantity: keys.length,
              Items: keys.map((k) => `/${k}`),
            },
          },
        }),
      );
    }
  }
}
