import {
  AppDataSource,
  Reel,
  ReelAttribution,
  ReelProductTag,
  SiteSetting,
} from "@materialhub/database";
import type { Repository } from "typeorm";

export interface RecordTapInput {
  reelId: string;
  productId: string;
  tagId: string;
  buyerUserId: string | null;
  sessionId: string | null;
}

const DEFAULT_WINDOW_DAYS = 7;
const WINDOW_SETTING_KEY = "reels_attribution_window_days";

export class AttributionService {
  private repo!: Repository<ReelAttribution>;
  private reelRepo!: Repository<Reel>;
  private tagRepo!: Repository<ReelProductTag>;
  private settings: { get(key: string): Promise<string> } = {
    async get(key: string) {
      const row = await AppDataSource.getRepository(SiteSetting).findOne({
        where: { key },
      });
      return row?.value ?? "";
    },
  };

  private getRepos() {
    if (!this.repo) this.repo = AppDataSource.getRepository(ReelAttribution);
    if (!this.reelRepo) this.reelRepo = AppDataSource.getRepository(Reel);
    if (!this.tagRepo) this.tagRepo = AppDataSource.getRepository(ReelProductTag);
    return { repo: this.repo, reelRepo: this.reelRepo, tagRepo: this.tagRepo };
  }

  async recordTap(input: RecordTapInput): Promise<ReelAttribution | null> {
    const { repo, reelRepo, tagRepo } = this.getRepos();

    // Caller must pass at least one identity. Defence-in-depth — route layer
    // also checks this, but keeping here so the service has a clear contract.
    if (!input.buyerUserId && !input.sessionId) return null;

    const reel = await reelRepo.findOne({ where: { id: input.reelId } });
    if (!reel) throw new Error("reel_not_found");

    const raw = await this.settings.get(WINDOW_SETTING_KEY);
    const parsed = Number.parseInt(raw, 10);
    const windowDays = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS;

    const tappedAt = new Date();
    const expiresAt = new Date(tappedAt.getTime() + windowDays * 86_400_000);

    const attribution = repo.create({
      user_id: input.buyerUserId,
      session_id: input.sessionId,
      reel_id: input.reelId,
      product_id: input.productId,
      creator_id: reel.user_id,
      tapped_at: tappedAt,
      expires_at: expiresAt,
      attribution_window_days_snapshot: windowDays,
    });
    const saved = await repo.save(attribution);

    await tagRepo.increment({ id: input.tagId }, "tap_count", 1);

    return saved;
  }
}
