import type { RecentSearch } from "@materialhub/database";
import type { Repository } from "typeorm";

const MAX_PER_USER = 10;

export class RecentSearchService {
  constructor(private readonly repo: Repository<RecentSearch>) {}

  async record(userId: string, query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;
    await this.repo.upsert(
      { user_id: userId, query: trimmed, last_used_at: new Date() },
      { conflictPaths: ["user_id", "query"], skipUpdateIfNoValuesChanged: false },
    );
    await this.capEntries(userId, MAX_PER_USER);
  }

  async list(userId: string, limit = MAX_PER_USER): Promise<RecentSearch[]> {
    return this.repo.find({
      where: { user_id: userId },
      order: { last_used_at: "DESC" },
      take: limit,
    });
  }

  async clear(userId: string, query?: string): Promise<void> {
    await this.repo.delete(query ? { user_id: userId, query } : { user_id: userId });
  }

  private async capEntries(userId: string, max: number): Promise<void> {
    const count = await this.repo.count({ where: { user_id: userId } });
    if (count <= max) return;
    const oldest = await this.repo.find({
      where: { user_id: userId },
      order: { last_used_at: "ASC" },
      take: count - max,
    });
    if (oldest.length) await this.repo.remove(oldest);
  }
}
