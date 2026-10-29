import { describe, expect, it } from "bun:test";
import { ASSET_TYPE_CONFIG, buildAssetKey, isAssetType } from "./asset-type-config.ts";

describe("asset-type-config — product_video", () => {
  it("declares product_video as a recognised asset type", () => {
    expect(isAssetType("product_video")).toBe(true);
  });

  it("accepts mp4, quicktime, and webm content types", () => {
    const cfg = ASSET_TYPE_CONFIG.product_video;
    expect(cfg.allowedContentTypes).toContain("video/mp4");
    expect(cfg.allowedContentTypes).toContain("video/quicktime");
    expect(cfg.allowedContentTypes).toContain("video/webm");
  });

  it("uses products/videos/ key prefix and no processing", () => {
    const cfg = ASSET_TYPE_CONFIG.product_video;
    expect(cfg.keyPrefix).toBe("products/videos/");
    expect(cfg.process).toBe("none");
    expect(cfg.requiresVendorId).toBe(false);
  });

  it("caps file size at 100 MB", () => {
    expect(ASSET_TYPE_CONFIG.product_video.maxBytes).toBe(100 * 1024 * 1024);
  });

  it("builds a video key under products/videos/", () => {
    const key = buildAssetKey("product_video", "clip.mp4");
    expect(key.startsWith("products/videos/")).toBe(true);
    expect(key.endsWith("/clip.mp4")).toBe(true);
  });
});

describe("category asset types", () => {
  it("category_image is a public single_webp image type, no vendor", () => {
    expect(isAssetType("category_image")).toBe(true);
    const cfg = ASSET_TYPE_CONFIG.category_image;
    expect(cfg.bucketKind).toBe("public");
    expect(cfg.process).toBe("single_webp");
    expect(cfg.requiresVendorId).toBe(false);
    expect(cfg.maxBytes).toBe(5 * 1024 * 1024);
  });

  it("category_icon allows svg and is small", () => {
    const cfg = ASSET_TYPE_CONFIG.category_icon;
    expect(cfg.allowedContentTypes).toContain("image/svg+xml");
    expect(cfg.maxBytes).toBe(1 * 1024 * 1024);
    expect(cfg.requiresVendorId).toBe(false);
  });

  it("category_banner exists and is public", () => {
    expect(isAssetType("category_banner")).toBe(true);
    expect(ASSET_TYPE_CONFIG.category_banner.bucketKind).toBe("public");
    expect(ASSET_TYPE_CONFIG.category_banner.process).toBe("single_webp");
    expect(ASSET_TYPE_CONFIG.category_banner.maxBytes).toBe(5 * 1024 * 1024);
    expect(ASSET_TYPE_CONFIG.category_banner.allowedContentTypes).not.toContain("image/svg+xml");
  });
});

describe("user_avatar asset type", () => {
  it("is a recognised asset type requiring a userId", () => {
    expect(isAssetType("user_avatar")).toBe(true);
    const cfg = ASSET_TYPE_CONFIG.user_avatar;
    expect(cfg.requiresUserId).toBe(true);
    expect(cfg.requiresVendorId).toBe(false);
    expect(cfg.process).toBe("single_webp");
    expect(cfg.maxBytes).toBe(2 * 1024 * 1024);
    expect(cfg.maxDimension).toBe(512);
    expect(cfg.allowedContentTypes).not.toContain("image/svg+xml");
  });

  it("builds a key under users/{userId}/avatar/", () => {
    const key = buildAssetKey("user_avatar", "me.jpg", { userId: "u-123" });
    expect(key.startsWith("users/u-123/avatar/")).toBe(true);
    expect(key.endsWith("/me.jpg")).toBe(true);
  });

  it("throws when userId is missing", () => {
    expect(() => buildAssetKey("user_avatar", "me.jpg")).toThrow(/requires userId/);
  });
});

describe("creator_portfolio_video asset type", () => {
  it("is a recognised asset type requiring a userId, video content only", () => {
    expect(isAssetType("creator_portfolio_video")).toBe(true);
    const cfg = ASSET_TYPE_CONFIG.creator_portfolio_video;
    expect(cfg.requiresUserId).toBe(true);
    expect(cfg.requiresVendorId).toBe(false);
    expect(cfg.process).toBe("none");
    expect(cfg.maxBytes).toBe(50 * 1024 * 1024);
    expect(cfg.allowedContentTypes).toEqual(["video/mp4", "video/quicktime", "video/webm"]);
  });

  it("builds a key under users/{userId}/portfolio/", () => {
    const key = buildAssetKey("creator_portfolio_video", "clip.mp4", { userId: "u-123" });
    expect(key.startsWith("users/u-123/portfolio/")).toBe(true);
    expect(key.endsWith("/clip.mp4")).toBe(true);
  });

  it("throws when userId is missing", () => {
    expect(() => buildAssetKey("creator_portfolio_video", "clip.mp4")).toThrow(/requires userId/);
  });
});
