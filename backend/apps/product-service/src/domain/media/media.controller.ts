import { AppDataSource, ProductImage, ProductVideo } from "@materialhub/database";
import type { AuthUser } from "@materialhub/guards";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
} from "@materialhub/plugins";
import { ASSET_TYPE_CONFIG, type MediaService, isAssetType } from "@materialhub/utils";
import type { Queue } from "bullmq";
import type { IProductImageRepository, IProductVideoRepository } from "../types.ts";
import type { AiEnhanceService } from "./ai-enhance.service.ts";
import type { AiSettingsRepository } from "./ai-settings.repository.ts";
import type { VendorAiUsageRepository } from "./vendor-ai-usage.repository.ts";
import type { IVendorLookup } from "./vendor-lookup.service.ts";

function nextMonthStartIso(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return next.toISOString();
}

export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly imageRepo: IProductImageRepository,
    private readonly vendorLookup: IVendorLookup,
    private readonly videoRepo: IProductVideoRepository,
    private readonly videoQueue: Queue,
    private readonly aiEnhance: AiEnhanceService,
    private readonly aiSettings: AiSettingsRepository,
    private readonly aiUsage: VendorAiUsageRepository,
  ) {}

  async getProductImages(productId: string) {
    return { images: await this.imageRepo.findByProductId(productId) };
  }

  async generatePresignedUrl(
    userRole: string,
    body: {
      asset_type: string;
      filename: string;
      content_type: string;
      vendor_id?: string;
    },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions to upload media");
    }

    if (!isAssetType(body.asset_type)) {
      throw new BadRequestError(`Unknown asset type: ${body.asset_type}`);
    }

    const assetType = body.asset_type;
    const cfg = ASSET_TYPE_CONFIG[assetType];
    let vendorId: string | undefined;

    if (cfg.requiresVendorId) {
      if (userRole !== "admin" && userRole !== "super_admin") {
        // Derive the vendor id from the authenticated user — never trust body.vendor_id
        const derived = await this.vendorLookup.findVendorIdByUserId(user.id);
        if (!derived) {
          throw new ForbiddenError("No vendor record for this user");
        }
        // If caller supplied a vendor_id that differs from their own, reject it
        if (body.vendor_id && body.vendor_id !== derived) {
          throw new ForbiddenError("Cannot upload on behalf of another vendor");
        }
        vendorId = derived;
      } else {
        // admin / super_admin must supply vendor_id explicitly
        if (!body.vendor_id) {
          throw new BadRequestError("vendor_id is required for vendor-scoped asset types");
        }
        vendorId = body.vendor_id;
      }
    }

    return this.mediaService.generatePresignedUrlForAsset({
      assetType,
      filename: body.filename,
      contentType: body.content_type,
      vendorId,
    });
  }

  async processImage(
    userRole: string,
    body: {
      key: string;
      product_id: string;
      alt_text?: string;
      is_primary?: boolean;
      variant_id?: string | null;
    },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) {
        throw new ForbiddenError("No vendor record for this user");
      }
      const productOwner = await this.imageRepo.findProductOwner(body.product_id);
      if (!productOwner) {
        throw new NotFoundError("Product not found");
      }
      if (productOwner !== vendorId) {
        throw new ForbiddenError("You do not own this product");
      }
    }

    const processed = await this.mediaService.processImage(body.key);
    const image = await this.imageRepo.save({
      product_id: body.product_id,
      url: processed.large.url,
      thumbnail_url: processed.thumb.url,
      card_url: processed.card.url,
      medium_url: processed.medium.url,
      alt_text: body.alt_text ?? null,
      is_primary: body.is_primary ?? false,
      variant_id: body.variant_id ?? null,
      width: processed.large.width,
      height: processed.large.height,
      mime_type: "image/webp",
      file_size: processed.large.fileSize,
    });

    return { image };
  }

  async processAsset(
    userRole: string,
    body: { asset_type: string; key: string },
  ): Promise<{ url: string }> {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    if (!isAssetType(body.asset_type)) {
      throw new BadRequestError(`Unknown asset_type: ${body.asset_type}`);
    }

    return this.mediaService.processAssetImage({
      assetType: body.asset_type,
      key: body.key,
    });
  }

  async getKycSignedUrl(userRole: string, key: string): Promise<{ url: string; expiresAt: Date }> {
    if (!["admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Only admins can view KYC documents");
    }

    return this.mediaService.getKycSignedUrl(key);
  }

  async deleteImage(id: string) {
    const image = await this.imageRepo.findById(id);
    if (!image) throw new NotFoundError("Image not found");

    // Extract the processed/{uuid}/ prefix from the URL and delete all variants at once
    const largePath = image.url ? this.mediaService.extractKeyFromPublicUrl(image.url) : null;
    if (largePath) {
      const prefixMatch = largePath.match(/^(processed\/[^/]+\/)/);
      if (prefixMatch) {
        try {
          await this.mediaService.deleteMediaByPrefix(prefixMatch[1]!);
        } catch {
          // Log but don't fail — DB cleanup is more important
        }
      }
    }

    await this.imageRepo.softRemove(image);
    return { message: "Image deleted successfully" };
  }

  private async resolveVendorIdForRole(
    userRole: string,
    productId: string,
    user: AuthUser,
  ): Promise<string> {
    if (userRole !== "admin" && userRole !== "super_admin") {
      const v = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!v) throw new ForbiddenError("No vendor record for this user");
      return v;
    }
    // admin/super_admin: resolve the product's owner so Internal's ownership check trivially passes
    const owner = await this.imageRepo.findProductOwner(productId);
    if (!owner) throw new NotFoundError("Product not found");
    return owner;
  }

  async enhanceImage(userRole: string, productId: string, imageId: string, user: AuthUser) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    const vendorId = await this.resolveVendorIdForRole(userRole, productId, user);
    return this.enhanceImageInternal(productId, imageId, vendorId);
  }

  async enhanceImageInternal(productId: string, imageId: string, vendorId: string) {
    const owner = await this.imageRepo.findProductOwner(productId);
    if (!owner) throw new NotFoundError("Product not found");
    if (owner !== vendorId) throw new ForbiddenError("You do not own this product");

    const settings = await this.aiSettings.get();
    if (!settings.enabled) {
      throw new ServiceUnavailableError("AI enhance is disabled");
    }

    const monthlyUsed = await this.aiUsage.getMonthCount(vendorId);
    if (monthlyUsed >= settings.per_vendor_monthly_cap) {
      throw new TooManyRequestsError("Monthly AI enhance limit reached", {
        limit: settings.per_vendor_monthly_cap,
        resets_at: nextMonthStartIso(),
      });
    }

    const source = await this.imageRepo.findById(imageId);
    if (!source || source.product_id !== productId) throw new NotFoundError("Image not found");

    const sourceKey = this.mediaService.extractKeyFromPublicUrl(source.url);
    if (!sourceKey) throw new BadRequestError("Cannot derive source key");

    const candidateUuid = crypto.randomUUID();
    const result = await this.aiEnhance.enhance({
      sourceKey,
      prompt: settings.prompt,
      model: settings.model,
      candidateUuid,
      apiKey: settings.api_key,
    });

    if (result.noChangeDetected) {
      await this.mediaService.deleteMediaByPrefix(`processed/${candidateUuid}/`).catch(() => {});
      await this.mediaService.deleteMediaByPrefix(`pending/${candidateUuid}/`).catch(() => {});
      return { no_change_detected: true };
    }

    const candidate = await this.imageRepo.save({
      product_id: productId,
      url: result.processed.large.url,
      thumbnail_url: result.processed.thumb.url,
      card_url: result.processed.card.url,
      medium_url: result.processed.medium.url,
      width: result.processed.large.width,
      height: result.processed.large.height,
      file_size: result.processed.large.fileSize,
      mime_type: "image/webp",
      sort_order: source.sort_order,
      is_primary: source.is_primary,
      alt_text: source.alt_text,
      variant_id: source.variant_id,
      ai_source_image_id: source.id,
    });
    // Single-statement soft-delete — atomic at the DB level.
    // @DeleteDateColumn may strip deleted_at on insert, so we use a raw UPDATE
    // to avoid the two-async-call window where the candidate is visible as live.
    await AppDataSource.query("UPDATE product_images SET deleted_at = now() WHERE id = $1", [
      candidate.id,
    ]);

    await this.aiUsage.increment(vendorId);

    return {
      candidate_id: candidate.id,
      preview_url: candidate.medium_url,
      original_id: source.id,
    };
  }

  async acceptAiEnhance(
    userRole: string,
    productId: string,
    imageId: string,
    body: { candidate_id: string },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.acceptAiEnhanceInternal(productId, imageId, body, vendorId);
    }
    return this.acceptAiEnhanceInternal(productId, imageId, body, null);
  }

  async acceptAiEnhanceInternal(
    productId: string,
    imageId: string,
    body: { candidate_id: string },
    vendorId: string | null,
  ) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const candidate = await this.imageRepo.findByIdIncludingDeleted(body.candidate_id);
    if (!candidate || candidate.ai_source_image_id !== imageId) {
      throw new NotFoundError("Candidate not found");
    }

    await AppDataSource.transaction(async (manager) => {
      await manager.update(ProductImage, { id: candidate.id }, { deleted_at: null });
      await manager.update(ProductImage, { id: imageId }, { deleted_at: new Date() });
    });

    return { image: await this.imageRepo.findById(candidate.id) };
  }

  async rejectAiEnhance(
    userRole: string,
    productId: string,
    imageId: string,
    body: { candidate_id: string },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    const vendorId = await this.resolveVendorIdForRole(userRole, productId, user);
    return this.rejectAiEnhanceInternal(productId, imageId, body, vendorId);
  }

  async rejectAiEnhanceInternal(
    productId: string,
    imageId: string,
    body: { candidate_id: string },
    vendorId: string,
  ) {
    const owner = await this.imageRepo.findProductOwner(productId);
    if (!owner) throw new NotFoundError("Product not found");
    if (owner !== vendorId) throw new ForbiddenError("You do not own this product");

    const candidate = await this.imageRepo.findByIdIncludingDeleted(body.candidate_id);
    if (!candidate || candidate.ai_source_image_id !== imageId) {
      throw new NotFoundError("Candidate not found");
    }

    const key = this.mediaService.extractKeyFromPublicUrl(candidate.url);
    if (key) {
      const m = key.match(/^(processed\/[^/]+\/)/);
      if (m) await this.mediaService.deleteMediaByPrefix(m[1]!).catch(() => {});
    }
    // Decrement first: if hardDelete later throws, the counter is slightly low
    // (vendor gains a free credit) — far better than losing a credit on hardDelete success.
    await this.aiUsage.decrement(vendorId);
    await this.imageRepo.hardDelete(candidate.id);
    return { ok: true };
  }

  async revertAiEnhance(userRole: string, productId: string, imageId: string, user: AuthUser) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.revertAiEnhanceInternal(productId, imageId, vendorId);
    }
    return this.revertAiEnhanceInternal(productId, imageId, null);
  }

  async revertAiEnhanceInternal(productId: string, imageId: string, vendorId: string | null) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const enhanced = await this.imageRepo.findById(imageId);
    if (!enhanced || !enhanced.ai_source_image_id) {
      throw new NotFoundError("Not an AI image");
    }

    const originalId = enhanced.ai_source_image_id;
    await AppDataSource.transaction(async (manager) => {
      await manager.update(ProductImage, { id: originalId }, { deleted_at: null });
      await manager.update(ProductImage, { id: imageId }, { deleted_at: new Date() });
    });

    return { image: await this.imageRepo.findById(originalId) };
  }

  async updateImage(
    userRole: string,
    productId: string,
    imageId: string,
    body: {
      alt_text?: string | null;
      focal_x?: number | null;
      focal_y?: number | null;
      variant_id?: string | null;
    },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.updateImageInternal(productId, imageId, body, vendorId);
    }
    // admin/super_admin: no ownership check required
    return this.updateImageInternal(productId, imageId, body, null);
  }

  async updateImageInternal(
    productId: string,
    imageId: string,
    body: {
      alt_text?: string | null;
      focal_x?: number | null;
      focal_y?: number | null;
      variant_id?: string | null;
    },
    vendorId: string | null,
  ) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const image = await this.imageRepo.findById(imageId);
    if (!image || image.product_id !== productId) throw new NotFoundError("Image not found");

    const fields: Partial<typeof image> = {};
    if (body.alt_text !== undefined) fields.alt_text = body.alt_text;
    // biome-ignore lint/suspicious/noExplicitAny: numeric TypeORM column expects string but body sends number
    if (body.focal_x !== undefined)
      fields.focal_x = body.focal_x === null ? null : (String(body.focal_x) as any);
    // biome-ignore lint/suspicious/noExplicitAny: numeric TypeORM column expects string but body sends number
    if (body.focal_y !== undefined)
      fields.focal_y = body.focal_y === null ? null : (String(body.focal_y) as any);
    if (body.variant_id !== undefined) fields.variant_id = body.variant_id;

    await this.imageRepo.updateFields(imageId, fields);

    return { image: await this.imageRepo.findById(imageId) };
  }

  async replaceImage(
    userRole: string,
    productId: string,
    imageId: string,
    body: { key: string },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.replaceImageInternal(productId, imageId, body, vendorId);
    }
    return this.replaceImageInternal(productId, imageId, body, null);
  }

  async replaceImageInternal(
    productId: string,
    imageId: string,
    body: { key: string },
    vendorId: string | null,
  ) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const image = await this.imageRepo.findById(imageId);
    if (!image || image.product_id !== productId) throw new NotFoundError("Image not found");

    // Process new upload under a fresh uuid (per memory: avoid collisions)
    const processed = await this.mediaService.processImage(body.key, crypto.randomUUID());

    // Best-effort delete old prefix
    const oldLarge = this.mediaService.extractKeyFromPublicUrl(image.url);
    if (oldLarge) {
      const m = oldLarge.match(/^(processed\/[^/]+\/)/);
      if (m) await this.mediaService.deleteMediaByPrefix(m[1]!).catch(() => {});
    }

    await this.imageRepo.updateFields(imageId, {
      url: processed.large.url,
      thumbnail_url: processed.thumb.url,
      card_url: processed.card.url,
      medium_url: processed.medium.url,
      width: processed.large.width,
      height: processed.large.height,
      file_size: processed.large.fileSize,
    });

    return { image: await this.imageRepo.findById(imageId) };
  }

  async cropImage(
    userRole: string,
    productId: string,
    imageId: string,
    body: { crop: { x: number; y: number; w: number; h: number }; rotation_degrees?: number },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.cropImageInternal(productId, imageId, body, vendorId);
    }
    return this.cropImageInternal(productId, imageId, body, null);
  }

  async cropImageInternal(
    productId: string,
    imageId: string,
    body: { crop: { x: number; y: number; w: number; h: number }; rotation_degrees?: number },
    vendorId: string | null,
  ) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const image = await this.imageRepo.findById(imageId);
    if (!image || image.product_id !== productId) throw new NotFoundError("Image not found");

    const largeKey = this.mediaService.extractKeyFromPublicUrl(image.url);
    if (!largeKey) throw new BadRequestError("Cannot derive source key from image URL");

    const taskUuid = crypto.randomUUID();
    const processed = await this.mediaService.processImageWithCrop(
      largeKey,
      body.crop,
      body.rotation_degrees ?? 0,
      taskUuid,
    );

    await this.imageRepo.updateFields(imageId, {
      url: processed.large.url,
      thumbnail_url: processed.thumb.url,
      card_url: processed.card.url,
      medium_url: processed.medium.url,
      width: processed.large.width,
      height: processed.large.height,
      file_size: processed.large.fileSize,
    });

    return { image: await this.imageRepo.findById(imageId) };
  }

  async reorderMedia(
    userRole: string,
    productId: string,
    items: Array<{ id: string; kind: "image" | "video"; sort_order: number }>,
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    let vendorId: string;
    if (userRole !== "admin" && userRole !== "super_admin") {
      const v = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!v) throw new ForbiddenError("No vendor record for this user");
      vendorId = v;
    } else {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      vendorId = owner;
    }
    return this.reorderMediaInternal(productId, vendorId, items);
  }

  async reorderMediaInternal(
    productId: string,
    vendorId: string,
    items: Array<{ id: string; kind: "image" | "video"; sort_order: number }>,
  ) {
    const owner = await this.imageRepo.findProductOwner(productId);
    if (!owner) throw new NotFoundError("Product not found");
    if (owner !== vendorId) throw new ForbiddenError("You do not own this product");

    // Primary is the earliest *image*, which is not necessarily the item at
    // sort_order 0 — a video can hold that slot.
    const primaryImageId = items
      .filter((item) => item.kind === "image")
      .reduce<{ id: string; sort_order: number } | null>(
        (earliest, item) =>
          earliest === null || item.sort_order < earliest.sort_order ? item : earliest,
        null,
      )?.id;

    await AppDataSource.transaction(async (manager) => {
      for (const item of items) {
        if (item.kind === "image") {
          await manager.update(
            ProductImage,
            { id: item.id, product_id: productId },
            { sort_order: item.sort_order, is_primary: item.id === primaryImageId },
          );
        } else {
          await manager.update(
            ProductVideo,
            { id: item.id, product_id: productId },
            { sort_order: item.sort_order },
          );
        }
      }
    });

    return { ok: true };
  }

  async presignVideo(
    userRole: string,
    productId: string,
    body: { filename: string; content_type: string; size_bytes: number },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    let vendorId: string;
    if (userRole !== "admin" && userRole !== "super_admin") {
      const derived = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!derived) throw new ForbiddenError("No vendor record for this user");
      vendorId = derived;
    } else {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      vendorId = owner;
    }
    return this.presignVideoInternal(productId, vendorId, body);
  }

  async presignVideoInternal(
    productId: string,
    vendorId: string,
    body: { filename: string; content_type: string; size_bytes: number },
  ) {
    const owner = await this.imageRepo.findProductOwner(productId);
    if (!owner) throw new NotFoundError("Product not found");
    if (owner !== vendorId) throw new ForbiddenError("You do not own this product");

    if (!["video/mp4", "video/webm"].includes(body.content_type)) {
      throw new BadRequestError("Only MP4 and WebM are allowed");
    }
    if (body.size_bytes > 50 * 1024 * 1024) {
      throw new BadRequestError("Video must be 50MB or smaller");
    }

    return this.mediaService.generateVideoPresignedUrl({
      vendorId,
      productId,
      filename: body.filename,
      contentType: body.content_type,
    });
  }

  async processVideo(userRole: string, productId: string, body: { key: string }, user: AuthUser) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.processVideoInternal(productId, vendorId, body);
    }
    return this.processVideoInternal(productId, null, body);
  }

  async processVideoInternal(productId: string, vendorId: string | null, body: { key: string }) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const next = (await this.videoRepo.maxSortOrder(productId)) + 1;
    const placeholder = await this.videoRepo.create({
      product_id: productId,
      url: "",
      poster_url: "",
      duration_seconds: 1,
      sort_order: next,
      status: "processing",
    });

    await this.videoQueue.add("transcode", {
      product_video_id: placeholder.id,
      raw_key: body.key,
    });

    return { video: placeholder };
  }

  async updateVideo(
    userRole: string,
    productId: string,
    videoId: string,
    body: { variant_id?: string | null },
    user: AuthUser,
  ) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.updateVideoInternal(productId, videoId, body, vendorId);
    }
    return this.updateVideoInternal(productId, videoId, body, null);
  }

  async updateVideoInternal(
    productId: string,
    videoId: string,
    body: { variant_id?: string | null },
    vendorId: string | null,
  ) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const video = await this.videoRepo.findById(videoId);
    if (!video || video.product_id !== productId) throw new NotFoundError("Video not found");
    await this.videoRepo.updateFields(videoId, { variant_id: body.variant_id ?? null });
    return { video: await this.videoRepo.findById(videoId) };
  }

  async deleteVideo(userRole: string, productId: string, videoId: string, user: AuthUser) {
    if (!["vendor", "customer", "admin", "super_admin"].includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole !== "admin" && userRole !== "super_admin") {
      const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
      if (!vendorId) throw new ForbiddenError("No vendor record for this user");
      return this.deleteVideoInternal(productId, videoId, vendorId);
    }
    return this.deleteVideoInternal(productId, videoId, null);
  }

  async deleteVideoInternal(productId: string, videoId: string, vendorId: string | null) {
    if (vendorId !== null) {
      const owner = await this.imageRepo.findProductOwner(productId);
      if (!owner) throw new NotFoundError("Product not found");
      if (owner !== vendorId) throw new ForbiddenError("You do not own this product");
    }

    const video = await this.videoRepo.findById(videoId);
    if (!video || video.product_id !== productId) throw new NotFoundError("Video not found");
    await this.videoRepo.softRemove(videoId);

    // Best-effort prefix delete
    const m = video.url.match(/processed-video\/([^/]+)\//);
    if (m) await this.mediaService.deleteMediaByPrefix(`processed-video/${m[1]!}/`).catch(() => {});

    return { ok: true };
  }

  async getProductMedia(productId: string) {
    const [images, videos] = await Promise.all([
      this.imageRepo.findByProductId(productId),
      this.videoRepo.findByProductId(productId),
    ]);

    type Item =
      | {
          kind: "image";
          id: string;
          sort_order: number;
          url: string;
          thumbnail_url: string | null;
          card_url: string | null;
          medium_url: string | null;
          alt_text: string | null;
          focal_x: number | null;
          focal_y: number | null;
          variant_id: string | null;
          ai_source_image_id: string | null;
          width: number | null;
          height: number | null;
          is_primary: boolean;
        }
      | {
          kind: "video";
          id: string;
          sort_order: number;
          url: string;
          webm_url: string | null;
          poster_url: string;
          duration_seconds: number;
          variant_id: string | null;
          width: number | null;
          height: number | null;
          status: string;
        };

    const items: Item[] = [
      ...images.map(
        (i): Item => ({
          kind: "image",
          id: i.id,
          sort_order: i.sort_order,
          url: i.url,
          thumbnail_url: i.thumbnail_url,
          card_url: i.card_url,
          medium_url: i.medium_url,
          alt_text: i.alt_text,
          focal_x: i.focal_x ? Number(i.focal_x) : null,
          focal_y: i.focal_y ? Number(i.focal_y) : null,
          variant_id: i.variant_id,
          ai_source_image_id: i.ai_source_image_id,
          width: i.width,
          height: i.height,
          is_primary: i.is_primary,
        }),
      ),
      ...videos.map(
        (v): Item => ({
          kind: "video",
          id: v.id,
          sort_order: v.sort_order,
          url: v.url,
          webm_url: v.webm_url,
          poster_url: v.poster_url,
          duration_seconds: v.duration_seconds,
          variant_id: v.variant_id,
          width: v.width,
          height: v.height,
          status: v.status,
        }),
      ),
    ].sort((a, b) => a.sort_order - b.sort_order);

    return { items };
  }
}
