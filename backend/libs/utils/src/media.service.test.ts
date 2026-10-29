import { describe, expect, test } from "bun:test";
import {
  ASSET_TYPE_CONFIG,
  type MediaAssetType,
  buildAssetKey,
  isAssetType,
} from "./asset-type-config.ts";
import { MediaService } from "./media.service.ts";

describe("MediaService asset config", () => {
  test("exposes a config entry for every MediaAssetType", () => {
    const expected = [
      "product_image",
      "brand_logo",
      "banner_image",
      "vendor_logo",
      "vendor_banner",
      "kyc_document",
    ];
    for (const type of expected) {
      expect(ASSET_TYPE_CONFIG[type as keyof typeof ASSET_TYPE_CONFIG]).toBeDefined();
      expect(isAssetType(type)).toBe(true);
    }
  });

  test("rejects unknown asset types", () => {
    expect(isAssetType("not_a_real_type")).toBe(false);
  });

  test("uses a public prefix for brand_logo and a private prefix for kyc_document", () => {
    expect(ASSET_TYPE_CONFIG.brand_logo.bucketKind).toBe("public");
    expect(ASSET_TYPE_CONFIG.brand_logo.keyPrefix).toBe("brands/");
    expect(ASSET_TYPE_CONFIG.kyc_document.bucketKind).toBe("private");
    expect(ASSET_TYPE_CONFIG.kyc_document.keyPrefix.startsWith("private/kyc/")).toBe(true);
  });

  test("places kyc keys under per-vendor folders", () => {
    const key = buildAssetKey("kyc_document", "trade-licence.pdf", {
      vendorId: "v-123",
    });
    expect(key.startsWith("private/kyc/v-123/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  test("places vendor_logo keys under per-vendor folders", () => {
    const key = buildAssetKey("vendor_logo", "logo.png", { vendorId: "v-123" });
    expect(key.startsWith("vendors/v-123/logo/")).toBe(true);
  });

  test("places user_avatar keys under per-user folders", () => {
    const key = buildAssetKey("user_avatar", "me.jpg", { userId: "u-123" });
    expect(key.startsWith("users/u-123/avatar/")).toBe(true);
  });

  test("places brand_logo keys under brands/", () => {
    const key = buildAssetKey("brand_logo", "logo.svg");
    expect(key.startsWith("brands/")).toBe(true);
  });

  test("sanitises the filename in the generated key", () => {
    const key = buildAssetKey("brand_logo", "weird name (1)!.png");
    expect(key.endsWith("/weird_name__1__.png")).toBe(true);
  });
});

describe("MediaService.generatePresignedUrlForAsset", () => {
  const svc = new MediaService();

  test("rejects content types not allowed for the asset", async () => {
    await expect(
      svc.generatePresignedUrlForAsset({
        assetType: "brand_logo",
        filename: "logo.gif",
        contentType: "image/gif",
      }),
    ).rejects.toThrow(/content type/i);
  });

  test("rejects when vendorId is missing for an asset that requires it", async () => {
    await expect(
      svc.generatePresignedUrlForAsset({
        assetType: "vendor_logo",
        filename: "logo.png",
        contentType: "image/png",
      }),
    ).rejects.toThrow(/vendorId/i);
  });

  test("rejects when userId is missing for an asset that requires it", async () => {
    await expect(
      svc.generatePresignedUrlForAsset({
        assetType: "user_avatar",
        filename: "me.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(/userId/i);
  });
});

describe("MediaService.generateLayoutVideoPresignedUrl", () => {
  const svc = new MediaService();

  test("rejects a content type outside the mp4/webm whitelist", async () => {
    await expect(
      svc.generateLayoutVideoPresignedUrl({
        vendorId: "v-123",
        contentType: "video/quicktime",
        sizeBytes: 1000,
      }),
    ).rejects.toThrow(/content type/i);
  });

  test("derives the key extension from the content type, never from a filename", async () => {
    // Credentials only need to exist for the signer; nothing is sent to AWS.
    process.env.AWS_ACCESS_KEY_ID ||= "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY ||= "test-secret-key";
    process.env.AWS_REGION ||= "me-central-1";

    const mp4 = await svc.generateLayoutVideoPresignedUrl({
      vendorId: "v-123",
      contentType: "video/mp4",
      sizeBytes: 1000,
    });
    expect(mp4.key.startsWith("raw-video/layout/v-123/")).toBe(true);
    expect(mp4.key.endsWith(".mp4")).toBe(true);
    // Exactly one path segment below the vendor prefix — a client string could
    // otherwise inject "/" and invent sub-paths.
    expect(mp4.key.split("/")).toHaveLength(4);

    const webm = await svc.generateLayoutVideoPresignedUrl({
      vendorId: null,
      contentType: "video/webm",
      sizeBytes: 1000,
    });
    expect(webm.key.startsWith("raw-video/layout/platform/")).toBe(true);
    expect(webm.key.endsWith(".webm")).toBe(true);
  });

  test("signs content-length so the 25MB cap is enforced by S3, not just advised", async () => {
    process.env.AWS_ACCESS_KEY_ID ||= "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY ||= "test-secret-key";
    process.env.AWS_REGION ||= "me-central-1";

    const { url } = await svc.generateLayoutVideoPresignedUrl({
      vendorId: "v-123",
      contentType: "video/mp4",
      sizeBytes: 1234,
    });
    const signedHeaders = new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "";
    expect(signedHeaders.split(";")).toContain("content-length");
  });
});

describe("MediaService.processAssetImage", () => {
  // product_image (multi_variant) now takes the editorial URL path — no longer throws.
  // Integration coverage for the multi_variant path is in the Task 15 E2E suite.

  describe("process: none types", () => {
    test("returns the public URL for product_video without S3 reads", async () => {
      const svc = new MediaService();
      const key = "products/videos/abc-123/clip.mp4";
      const result = await svc.processAssetImage({ assetType: "product_video", key });
      expect(result.url).toBe(svc.getPublicUrl(key));
    });

    test("returns the public URL for kyc_document without S3 reads", async () => {
      const svc = new MediaService();
      const key = "private/kyc/v-123/document.pdf";
      const result = await svc.processAssetImage({ assetType: "kyc_document", key });
      expect(result.url).toBe(svc.getPublicUrl(key));
    });
  });
});

describe("MediaService.getKycSignedUrl", () => {
  test("rejects keys outside the private/kyc/ prefix", async () => {
    const svc = new MediaService();
    await expect(svc.getKycSignedUrl("products/abc/foo.pdf")).rejects.toThrow(/private\/kyc/);
  });
});

describe("MediaService.getReceiptSignedUrl", () => {
  test("rejects keys outside private/receipts/", async () => {
    const svc = new MediaService();
    await expect(svc.getReceiptSignedUrl("public/x.pdf")).rejects.toThrow("private/receipts/");
  });
});
