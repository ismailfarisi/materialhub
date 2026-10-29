import type { AuthUser } from "@materialhub/guards";
import { BadRequestError, ForbiddenError, NotFoundError } from "@materialhub/plugins";
import type { MediaService } from "@materialhub/utils";
import type { IProductVideoRepository } from "../types.ts";
import {
  LAYOUT_VIDEO_CONTENT_TYPES,
  LAYOUT_VIDEO_MAX_BYTES,
  LAYOUT_VIDEO_MAX_DURATION_SECONDS,
  LAYOUT_VIDEO_VENDOR_QUOTA,
} from "./layout-video.constants.ts";
import type { IVendorLookup } from "./vendor-lookup.service.ts";

const ALLOWED_ROLES = ["admin", "super_admin", "vendor"];
const LAYOUT_KEY_PREFIX = "raw-video/layout/";

interface VideoQueue {
  add(name: string, data: unknown): Promise<unknown>;
}

export class LayoutVideoController {
  constructor(
    private readonly videoRepo: IProductVideoRepository,
    private readonly vendorLookup: IVendorLookup,
    private readonly mediaService: MediaService,
    private readonly videoQueue: VideoQueue,
  ) {}

  /** Admins act on platform layouts (vendor_id null); vendors are pinned to their own vendor. */
  private async resolveScope(userRole: string, user: AuthUser): Promise<string | null> {
    if (!ALLOWED_ROLES.includes(userRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    if (userRole === "admin" || userRole === "super_admin") return null;
    const vendorId = await this.vendorLookup.findVendorIdByUserId(user.id);
    if (!vendorId) throw new ForbiddenError("No vendor record for this user");
    return vendorId;
  }

  /**
   * Enforced on BOTH presign and process. Presign alone is not a gate: a client
   * can presign once and replay the same key at `process` N times, which would
   * mint N rows and N ffmpeg jobs on a queue whose concurrency is 2.
   */
  private async assertQuota(vendorId: string): Promise<void> {
    const used = await this.videoRepo.countLayoutVideosByVendor(vendorId);
    if (used >= LAYOUT_VIDEO_VENDOR_QUOTA) {
      throw new BadRequestError(
        `You have reached the limit of ${LAYOUT_VIDEO_VENDOR_QUOTA} layout videos. Remove one to upload another.`,
      );
    }
  }

  async presign(
    userRole: string,
    body: { filename: string; content_type: string; size_bytes: number },
    user: AuthUser,
  ) {
    const vendorId = await this.resolveScope(userRole, user);

    if (!LAYOUT_VIDEO_CONTENT_TYPES.includes(body.content_type as never)) {
      throw new BadRequestError("Only MP4 and WebM are allowed");
    }
    if (body.size_bytes > LAYOUT_VIDEO_MAX_BYTES) {
      throw new BadRequestError("Video must be 25MB or smaller");
    }
    if (vendorId) await this.assertQuota(vendorId);

    return this.mediaService.generateLayoutVideoPresignedUrl({
      vendorId,
      contentType: body.content_type,
      sizeBytes: body.size_bytes,
    });
  }

  async process(userRole: string, body: { key: string }, user: AuthUser) {
    const vendorId = await this.resolveScope(userRole, user);

    // The client echoes back the key we issued; refuse anything outside the
    // layout prefix so this route can't be used to transcode arbitrary objects.
    if (!body.key.startsWith(LAYOUT_KEY_PREFIX)) {
      throw new BadRequestError("Invalid key for a layout video");
    }
    const scope = vendorId ?? "platform";
    if (!body.key.startsWith(`${LAYOUT_KEY_PREFIX}${scope}/`)) {
      throw new ForbiddenError("You do not own this upload");
    }

    // Re-checked here, not just at presign — this is the call that actually
    // consumes a slot and enqueues CPU work.
    if (vendorId) await this.assertQuota(vendorId);

    const placeholder = await this.videoRepo.create({
      product_id: null,
      asset_type: "layout_background",
      vendor_id: vendorId,
      url: "",
      poster_url: "",
      duration_seconds: 1,
      sort_order: 0,
      status: "processing",
    });

    await this.videoQueue.add("transcode", {
      product_video_id: placeholder.id,
      raw_key: body.key,
      strip_audio: true,
      max_duration_seconds: LAYOUT_VIDEO_MAX_DURATION_SECONDS,
    });

    return { video: { id: placeholder.id, status: placeholder.status } };
  }

  private async findOwned(userRole: string, id: string, user: AuthUser) {
    const vendorId = await this.resolveScope(userRole, user);
    const row = await this.videoRepo.findLayoutVideoById(id);
    if (!row) throw new NotFoundError("Video not found");
    if (vendorId !== null && row.vendor_id !== vendorId) {
      throw new ForbiddenError("You do not own this video");
    }
    return row;
  }

  async get(userRole: string, id: string, user: AuthUser) {
    const row = await this.findOwned(userRole, id, user);
    return {
      id: row.id,
      status: row.status,
      url: row.url,
      poster_url: row.poster_url,
      duration_seconds: row.duration_seconds,
    };
  }

  async remove(userRole: string, id: string, user: AuthUser): Promise<{ ok: true }> {
    const row = await this.findOwned(userRole, id, user);
    await this.videoRepo.softRemove(row.id);
    return { ok: true };
  }
}
