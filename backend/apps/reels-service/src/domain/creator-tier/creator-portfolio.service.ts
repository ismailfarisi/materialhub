import { AppDataSource, CreatorPortfolioVideo } from "@materialhub/database";
import { MediaService } from "@materialhub/utils";
import type { Repository } from "typeorm";

const SAMPLE_LIMIT = 6;

export class CreatorPortfolioService {
  private videoRepo!: Repository<CreatorPortfolioVideo>;
  private mediaService: MediaService;

  constructor(
    videoRepo?: Repository<CreatorPortfolioVideo>,
    mediaService: MediaService = new MediaService(),
  ) {
    if (videoRepo) this.videoRepo = videoRepo;
    this.mediaService = mediaService;
  }

  private videos(): Repository<CreatorPortfolioVideo> {
    if (!this.videoRepo) this.videoRepo = AppDataSource.getRepository(CreatorPortfolioVideo);
    return this.videoRepo;
  }

  /** Presigns a direct-to-S3 upload for the caller's own portfolio video. */
  async presignVideo(
    userId: string,
    filename: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    const { uploadUrl, key } = await this.mediaService.generatePresignedUrlForAsset({
      assetType: "creator_portfolio_video",
      filename,
      contentType,
      userId,
    });
    return { uploadUrl, key };
  }

  /**
   * Finalizes an uploaded video. `intro` replaces any existing intro video
   * (old S3 object deleted, old row soft-removed); `sample` is capped at 6
   * live rows per user.
   */
  async finalizeVideo(
    userId: string,
    key: string,
    kind: "sample" | "intro",
    caption?: string | null,
  ): Promise<CreatorPortfolioVideo> {
    if (!key.startsWith(`users/${userId}/portfolio/`)) {
      throw new Error("invalid_portfolio_key");
    }

    if (kind === "intro") {
      const existing = await this.videos().findOne({ where: { user_id: userId, kind: "intro" } });
      if (existing) {
        const oldKey = this.mediaService.extractKeyFromPublicUrl(existing.video_url);
        if (oldKey) await this.mediaService.deleteMedia([oldKey]);
        await this.videos().softRemove(existing);
      }
    } else {
      const count = (await this.videos().find({ where: { user_id: userId, kind: "sample" } }))
        .length;
      if (count >= SAMPLE_LIMIT) throw new Error("portfolio_sample_limit_reached");
    }

    const { url } = await this.mediaService.processAssetImage({
      assetType: "creator_portfolio_video",
      key,
    });

    const row = this.videos().create({
      user_id: userId,
      kind,
      video_url: url,
      content_type: this.contentTypeFromKey(key),
      caption: kind === "sample" ? (caption ?? null) : null,
    });
    return this.videos().save(row);
  }

  /** The caller's own showcase: at most one intro, samples in upload order. */
  async listVideos(
    userId: string,
  ): Promise<{ intro: CreatorPortfolioVideo | null; samples: CreatorPortfolioVideo[] }> {
    const [intro, samples] = await Promise.all([
      this.videos().findOne({ where: { user_id: userId, kind: "intro" } }),
      this.videos().find({
        where: { user_id: userId, kind: "sample" },
        order: { created_at: "ASC" },
      }),
    ]);
    return { intro, samples };
  }

  async deleteVideo(userId: string, videoId: string): Promise<void> {
    const row = await this.videos().findOne({ where: { id: videoId } });
    if (!row) throw new Error("video_not_found");
    if (row.user_id !== userId) throw new Error("not_your_video");
    const key = this.mediaService.extractKeyFromPublicUrl(row.video_url);
    if (key) await this.mediaService.deleteMedia([key]);
    await this.videos().softRemove(row);
  }

  // Content-type isn't returned by processAssetImage (process: "none" just
  // resolves the public URL), so it's derived from the presigned key's
  // extension rather than threaded through an extra parameter.
  private contentTypeFromKey(key: string): string {
    const ext = key.split(".").pop()?.toLowerCase();
    const byExt: Record<string, string> = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
    };
    return (ext ? byExt[ext] : undefined) ?? "video/mp4";
  }
}
