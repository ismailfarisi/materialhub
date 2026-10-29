/**
 * Minimal ioredis-style client surface used by FeedCacheClient.
 *
 * We avoid a hard dependency on `ioredis` (not in this workspace) by declaring
 * the exact subset of methods we call. This keeps the test fake trivial and
 * lets the concrete client be wired up to any ioredis-compatible instance at
 * composition time.
 */
export interface RedisLike {
  multi(): RedisPipelineLike;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  del(key: string): Promise<number | unknown>;
}

export interface RedisPipelineLike {
  del(key: string): RedisPipelineLike;
  zadd(key: string, ...args: (string | number)[]): RedisPipelineLike;
  expire(key: string, seconds: number): RedisPipelineLike;
  exec(): Promise<unknown>;
}

export interface CohortEntry {
  reelId: string;
  score: number;
}

export class FeedCacheClient {
  constructor(private readonly redis: RedisLike) {}

  private key(cohortKey: string): string {
    return `reels:cohort:${cohortKey}`;
  }

  async setCohort(cohortKey: string, entries: CohortEntry[]): Promise<void> {
    const k = this.key(cohortKey);
    const pipeline = this.redis.multi();
    pipeline.del(k);
    if (entries.length > 0) {
      const args: (string | number)[] = [];
      for (const e of entries) {
        args.push(e.score, e.reelId);
      }
      pipeline.zadd(k, ...args);
      pipeline.expire(k, 15 * 60); // 15 min TTL
    }
    await pipeline.exec();
  }

  async getCohort(cohortKey: string, offset: number, limit: number): Promise<string[]> {
    return this.redis.zrevrange(this.key(cohortKey), offset, offset + limit - 1);
  }

  async invalidate(cohortKey: string): Promise<void> {
    await this.redis.del(this.key(cohortKey));
  }

  async invalidateMany(cohortKeys: string[]): Promise<void> {
    if (cohortKeys.length === 0) return;
    const pipeline = this.redis.multi();
    for (const k of cohortKeys) pipeline.del(this.key(k));
    await pipeline.exec();
  }
}
