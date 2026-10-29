export type MediaAssetType =
  | "product_image"
  | "product_video"
  | "brand_logo"
  | "banner_image"
  | "vendor_logo"
  | "vendor_banner"
  | "kyc_document"
  | "category_image"
  | "category_icon"
  | "category_banner"
  | "user_avatar"
  | "creator_portfolio_video";

export interface AssetTypeConfig {
  bucketKind: "public" | "private";
  keyPrefix: string; // may contain `{vendorId}` or `{userId}` placeholder
  allowedContentTypes: readonly string[];
  maxBytes: number;
  maxDimension?: number; // for image resizing; undefined for no resize
  process: "multi_variant" | "single_webp" | "none";
  requiresVendorId: boolean;
  requiresUserId: boolean;
}

const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMG_TYPES_WITH_SVG = [...IMG_TYPES, "image/svg+xml"] as const;

export const ASSET_TYPE_CONFIG: Record<MediaAssetType, AssetTypeConfig> = {
  product_image: {
    bucketKind: "public",
    keyPrefix: "products/",
    allowedContentTypes: IMG_TYPES,
    maxBytes: 10 * 1024 * 1024,
    process: "multi_variant",
    requiresVendorId: false,
    requiresUserId: false,
  },
  product_video: {
    bucketKind: "public",
    keyPrefix: "products/videos/",
    allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
    maxBytes: 100 * 1024 * 1024,
    process: "none",
    requiresVendorId: false,
    requiresUserId: false,
  },
  brand_logo: {
    bucketKind: "public",
    keyPrefix: "brands/",
    allowedContentTypes: IMG_TYPES_WITH_SVG,
    maxBytes: 2 * 1024 * 1024,
    maxDimension: 512,
    process: "single_webp",
    requiresVendorId: false,
    requiresUserId: false,
  },
  banner_image: {
    bucketKind: "public",
    keyPrefix: "banners/",
    allowedContentTypes: IMG_TYPES,
    maxBytes: 5 * 1024 * 1024,
    maxDimension: 1920,
    process: "single_webp",
    requiresVendorId: false,
    requiresUserId: false,
  },
  category_image: {
    bucketKind: "public",
    keyPrefix: "categories/images/",
    allowedContentTypes: IMG_TYPES,
    maxBytes: 5 * 1024 * 1024,
    maxDimension: 1280,
    process: "single_webp",
    requiresVendorId: false,
    requiresUserId: false,
  },
  category_icon: {
    bucketKind: "public",
    keyPrefix: "categories/icons/",
    allowedContentTypes: IMG_TYPES_WITH_SVG,
    maxBytes: 1 * 1024 * 1024,
    maxDimension: 256,
    process: "single_webp",
    requiresVendorId: false,
    requiresUserId: false,
  },
  category_banner: {
    bucketKind: "public",
    keyPrefix: "categories/banners/",
    allowedContentTypes: IMG_TYPES,
    maxBytes: 5 * 1024 * 1024,
    maxDimension: 1920,
    process: "single_webp",
    requiresVendorId: false,
    requiresUserId: false,
  },
  vendor_logo: {
    bucketKind: "public",
    keyPrefix: "vendors/{vendorId}/logo/",
    allowedContentTypes: IMG_TYPES_WITH_SVG,
    maxBytes: 2 * 1024 * 1024,
    maxDimension: 512,
    process: "single_webp",
    requiresVendorId: true,
    requiresUserId: false,
  },
  vendor_banner: {
    bucketKind: "public",
    keyPrefix: "vendors/{vendorId}/banner/",
    allowedContentTypes: IMG_TYPES,
    maxBytes: 5 * 1024 * 1024,
    maxDimension: 1920,
    process: "single_webp",
    requiresVendorId: true,
    requiresUserId: false,
  },
  kyc_document: {
    bucketKind: "private",
    keyPrefix: "private/kyc/{vendorId}/",
    allowedContentTypes: ["image/jpeg", "image/png", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
    process: "none",
    requiresVendorId: true,
    requiresUserId: false,
  },
  user_avatar: {
    bucketKind: "public",
    keyPrefix: "users/{userId}/avatar/",
    allowedContentTypes: IMG_TYPES,
    maxBytes: 2 * 1024 * 1024,
    maxDimension: 512,
    process: "single_webp",
    requiresVendorId: false,
    requiresUserId: true,
  },
  creator_portfolio_video: {
    bucketKind: "public",
    keyPrefix: "users/{userId}/portfolio/",
    allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
    maxBytes: 50 * 1024 * 1024,
    process: "none",
    requiresVendorId: false,
    requiresUserId: true,
  },
};

export function isAssetType(value: string): value is MediaAssetType {
  return Object.prototype.hasOwnProperty.call(ASSET_TYPE_CONFIG, value);
}

function sanitiseFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildAssetKey(
  assetType: MediaAssetType,
  filename: string,
  opts: { vendorId?: string; userId?: string } = {},
): string {
  const cfg = ASSET_TYPE_CONFIG[assetType];
  if (cfg.requiresVendorId && !opts.vendorId) {
    throw new Error(`Asset type ${assetType} requires vendorId`);
  }
  if (cfg.requiresUserId && !opts.userId) {
    throw new Error(`Asset type ${assetType} requires userId`);
  }
  const prefix = cfg.keyPrefix
    .replace("{vendorId}", opts.vendorId ?? "")
    .replace("{userId}", opts.userId ?? "");
  return `${prefix}${crypto.randomUUID()}/${sanitiseFilename(filename)}`;
}
