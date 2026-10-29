import { AppDataSource, Reel, ReelView } from "@materialhub/database";
import type { Repository } from "typeorm";

export interface RecordViewInput {
  reelId: string;
  userId: string | null;
  sessionId: string | null;
  watchDurationSeconds: number;
  completionPercentage: number;
  deviceType?: string;
}

export class ViewService {
  private viewRepo!: Repository<ReelView>;
  private reelRepo!: Repository<Reel>;

  private getRepos() {
    if (!this.viewRepo) this.viewRepo = AppDataSource.getRepository(ReelView);
    if (!this.reelRepo) this.reelRepo = AppDataSource.getRepository(Reel);
    return { viewRepo: this.viewRepo, reelRepo: this.reelRepo };
  }

  async recordView(input: RecordViewInput): Promise<void> {
    const { viewRepo, reelRepo } = this.getRepos();
    if (!input.userId && !input.sessionId) return;

    // Dedup lookup — partial unique indexes enforce one row per
    // (user_id, reel_id) for authenticated and one per (session_id, reel_id)
    // for anonymous, so we probe the one that matches this caller.
    const where = input.userId
      ? { user_id: input.userId, reel_id: input.reelId }
      : { session_id: input.sessionId, reel_id: input.reelId };
    const existing = await viewRepo.findOne({ where: where as any });
    if (existing) {
      existing.watch_duration_seconds = String(input.watchDurationSeconds);
      existing.completion_percentage = String(input.completionPercentage);
      existing.device_type = input.deviceType ?? null;
      await viewRepo.save(existing);
      return;
    }
    await viewRepo.save(
      viewRepo.create({
        reel_id: input.reelId,
        user_id: input.userId,
        session_id: input.sessionId,
        watch_duration_seconds: String(input.watchDurationSeconds),
        completion_percentage: String(input.completionPercentage),
        device_type: input.deviceType ?? null,
      }),
    );
    await reelRepo.increment({ id: input.reelId }, "view_count", 1);
  }

  async listHistory(userId: string, cursor?: string, limit = 20) {
    const { viewRepo } = this.getRepos();
    const qb = viewRepo
      .createQueryBuilder("v")
      .innerJoinAndSelect("v.reel", "r")
      .where("v.user_id = :uid", { uid: userId })
      .orderBy("v.viewed_at", "DESC")
      .limit(limit + 1);
    if (cursor) qb.andWhere("v.viewed_at < :c", { c: new Date(cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? items[items.length - 1]!.viewed_at.toISOString() : null;
    return { items, nextCursor };
  }
}
