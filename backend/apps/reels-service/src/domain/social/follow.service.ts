import { AppDataSource, UserFollow } from "@materialhub/database";
import type { Repository } from "typeorm";

export class FollowService {
  private repo!: Repository<UserFollow>;

  private getRepo(): Repository<UserFollow> {
    if (!this.repo) this.repo = AppDataSource.getRepository(UserFollow);
    return this.repo;
  }

  async toggle(
    followerId: string,
    followeeId: string,
  ): Promise<{ action: "followed" | "unfollowed" }> {
    if (followerId === followeeId) throw new Error("cannot_follow_self");
    const repo = this.getRepo();
    const existing = await repo.findOne({
      where: { follower_id: followerId, followee_id: followeeId },
    });
    if (existing) {
      await repo.delete({ follower_id: followerId, followee_id: followeeId });
      return { action: "unfollowed" };
    }
    await repo.save(repo.create({ follower_id: followerId, followee_id: followeeId }));
    return { action: "followed" };
  }

  async listFollowers(userId: string, cursor?: string, limit = 20) {
    const qb = this.getRepo()
      .createQueryBuilder("f")
      .innerJoinAndSelect("f.follower", "u")
      .where("f.followee_id = :uid", { uid: userId })
      .orderBy("f.followed_at", "DESC")
      .limit(limit + 1);
    if (cursor) qb.andWhere("f.followed_at < :c", { c: new Date(cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? items[items.length - 1]!.followed_at.toISOString() : null;
    return { items, nextCursor };
  }

  async listFollowing(userId: string, cursor?: string, limit = 20) {
    const qb = this.getRepo()
      .createQueryBuilder("f")
      .innerJoinAndSelect("f.followee", "u")
      .where("f.follower_id = :uid", { uid: userId })
      .orderBy("f.followed_at", "DESC")
      .limit(limit + 1);
    if (cursor) qb.andWhere("f.followed_at < :c", { c: new Date(cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? items[items.length - 1]!.followed_at.toISOString() : null;
    return { items, nextCursor };
  }
}
