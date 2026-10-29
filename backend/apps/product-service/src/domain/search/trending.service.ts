// Minimal structural interface — works with ioredis (used at runtime via
// BullMQ's transitive dep) and the fake in tests.
interface RedisLike {
  multi(): {
    zincrby(key: string, by: number, member: string): any;
    expire(key: string, seconds: number): any;
    exec(): Promise<any>;
  };
  zunionstore(dest: string, numkeys: number, ...keys: string[]): Promise<any>;
  expire(key: string, seconds: number): Promise<any>;
  zrevrange(key: string, start: number, stop: number, withScores: "WITHSCORES"): Promise<string[]>;
}

function isoWeekKey(now = new Date()): string {
  // ISO 8601 year-week — cheap inline implementation to avoid pulling
  // a date lib into this layer.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `trending:${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export class TrendingSearchService {
  constructor(private readonly redis: RedisLike) {}

  async record(query: string): Promise<void> {
    const term = query.trim().toLowerCase();
    if (!term) return;
    const key = isoWeekKey();
    await this.redis
      .multi()
      .zincrby(key, 1, term)
      .expire(key, 14 * 86_400)
      .exec();
  }

  async list(limit = 10): Promise<Array<{ query: string; count: number }>> {
    const cur = isoWeekKey();
    const prev = isoWeekKey(new Date(Date.now() - 7 * 86_400_000));
    const dest = `${cur}:rolling`;
    await this.redis.zunionstore(dest, 2, cur, prev);
    await this.redis.expire(dest, 3600);
    const raw = await this.redis.zrevrange(dest, 0, limit - 1, "WITHSCORES");
    const out: Array<{ query: string; count: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      const query = raw[i];
      const score = raw[i + 1];
      if (query !== undefined && score !== undefined) {
        out.push({ query, count: Number(score) });
      }
    }
    return out;
  }
}
