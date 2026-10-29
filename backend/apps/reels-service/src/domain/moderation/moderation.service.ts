import {
  AppDataSource,
  Reel,
  ReelModerationAction,
  ReelModerationLog,
  ReelStatus,
} from "@materialhub/database";
import type { Repository } from "typeorm";
import type { CategoryCohortInvalidator } from "../feed/category-cohort-invalidator.ts";

export async function collectCategorySeedIdsForReel(
  reelId: string,
  runner: { query<T>(sql: string, params: unknown[]): Promise<T> },
): Promise<string[]> {
  const rows = await runner.query<{ category_id: string }[]>(
    `SELECT DISTINCT p.category_id
     FROM reel_product_tags t
     JOIN products p ON p.id = t.product_id
     WHERE t.reel_id = $1`,
    [reelId],
  );
  return Array.from(new Set(rows.map((r) => r.category_id))).filter(Boolean);
}

export class ModerationService {
  private reelRepo!: Repository<Reel>;
  private logRepo!: Repository<ReelModerationLog>;

  constructor(private readonly invalidator?: CategoryCohortInvalidator) {}

  private getRepos() {
    if (!this.reelRepo) this.reelRepo = AppDataSource.getRepository(Reel);
    if (!this.logRepo) this.logRepo = AppDataSource.getRepository(ReelModerationLog);
    return { reelRepo: this.reelRepo, logRepo: this.logRepo };
  }

  async listQueue(opts: { language?: string; cursor?: string; limit?: number }) {
    const { reelRepo } = this.getRepos();
    const limit = opts.limit ?? 20;
    const qb = reelRepo
      .createQueryBuilder("r")
      .where("r.status = :status", { status: ReelStatus.pending_review })
      .andWhere("r.deleted_at IS NULL")
      .orderBy("r.created_at", "ASC")
      .limit(limit + 1);
    if (opts.language) qb.andWhere("r.language_code = :lang", { lang: opts.language });
    if (opts.cursor) qb.andWhere("r.created_at > :cursor", { cursor: new Date(opts.cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? items[items.length - 1]!.created_at.toISOString() : null;
    return { items, nextCursor };
  }

  async approve(reelId: string, moderatorId: string, notes?: string): Promise<Reel> {
    const { reelRepo, logRepo } = this.getRepos();
    const reel = await reelRepo.findOne({ where: { id: reelId } });
    if (!reel) throw new Error("reel_not_found");

    // Idempotent: if already approved, just log the re-attempt.
    if (reel.status === ReelStatus.approved) {
      await logRepo.save(
        logRepo.create({
          reel_id: reelId,
          moderator_id: moderatorId,
          action: ReelModerationAction.approved,
          notes: notes ?? null,
        } as any),
      );
      return reel;
    }

    reel.status = ReelStatus.approved;
    reel.published_at = new Date();
    reel.moderator_id = moderatorId;
    reel.moderated_at = new Date();
    const saved = await reelRepo.save(reel);
    await logRepo.save(
      logRepo.create({
        reel_id: reelId,
        moderator_id: moderatorId,
        action: ReelModerationAction.approved,
        notes: notes ?? null,
      } as any),
    );
    if (this.invalidator) {
      const seeds = await collectCategorySeedIdsForReel(reelId, AppDataSource);
      void this.invalidator.enqueue({ seedCategoryIds: seeds });
    }
    return saved;
  }

  async reject(reelId: string, moderatorId: string, reason: string, notes?: string): Promise<Reel> {
    const { reelRepo, logRepo } = this.getRepos();
    const reel = await reelRepo.findOne({ where: { id: reelId } });
    if (!reel) throw new Error("reel_not_found");

    reel.status = ReelStatus.rejected;
    reel.rejection_reason = reason;
    reel.moderator_id = moderatorId;
    reel.moderated_at = new Date();
    const saved = await reelRepo.save(reel);
    await logRepo.save(
      logRepo.create({
        reel_id: reelId,
        moderator_id: moderatorId,
        action: ReelModerationAction.rejected,
        reason,
        notes: notes ?? null,
      } as any),
    );
    if (this.invalidator) {
      const seeds = await collectCategorySeedIdsForReel(reelId, AppDataSource);
      void this.invalidator.enqueue({ seedCategoryIds: seeds });
    }
    return saved;
  }

  async flag(reelId: string, moderatorId: string, notes?: string): Promise<void> {
    const { reelRepo, logRepo } = this.getRepos();
    const reel = await reelRepo.findOne({ where: { id: reelId } });
    if (!reel) throw new Error("reel_not_found");
    await logRepo.save(
      logRepo.create({
        reel_id: reelId,
        moderator_id: moderatorId,
        action: ReelModerationAction.flagged,
        notes: notes ?? null,
      } as any),
    );
  }
}
