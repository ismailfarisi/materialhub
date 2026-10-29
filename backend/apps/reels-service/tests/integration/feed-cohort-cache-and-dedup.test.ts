import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { AppDataSource, Reel, ReelStatus, ReelView, User } from "@materialhub/database";
import { FeedCacheClient } from "../../src/domain/feed/feed-cache.client.ts";
import { FeedService } from "../../src/domain/feed/feed.service.ts";

/**
 * Feed cohort + dedup integration test.
 *
 * Requires a live stack:
 *   - Postgres reachable (database migrated to M2)
 *   - Redis reachable (via config.bullmq.redisUrl; also used as ioredis for cache)
 *
 * Run locally with:
 *   REELS_INTEGRATION_STACK_UP=1 bun test integration/feed-cohort-cache-and-dedup
 *
 * When the env var is unset, the whole suite is skipped.
 */

const STACK_UP = process.env.REELS_INTEGRATION_STACK_UP === "1";

describe.skipIf(!STACK_UP)("Feed cohort + dedup integration", () => {
  // ioredis is pulled transitively via bullmq in this workspace; import lazily
  // so unit tests don't need to resolve it.
  let redis: any;
  let cache: FeedCacheClient;
  let userId: string;
  const reelIds: string[] = [];

  beforeAll(async () => {
    const { default: Redis } = await import("ioredis");
    const { config } = await import("@materialhub/config");
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    redis = new Redis(config.bullmq.redisUrl);
    cache = new FeedCacheClient(redis);

    const user = await AppDataSource.getRepository(User).save({
      email: `feed-test-${Date.now()}@example.com`,
      role: "customer",
    } as any);
    userId = user.id;

    for (let i = 0; i < 3; i++) {
      const r = await AppDataSource.getRepository(Reel).save({
        user_id: userId,
        video_provider: "cloudflare_stream",
        video_asset_id: `a${i}`,
        video_playback_url: `u${i}`,
        video_duration_seconds: 30,
        video_width: 1080,
        video_height: 1920,
        thumbnail_url: `t${i}`,
        language_code: "en",
        status: ReelStatus.approved,
        published_at: new Date(),
        ranking_score: String(100 - i),
      } as any);
      reelIds.push(r.id);
    }
    await cache.setCohort(
      "home:for_you:en:AE",
      reelIds.map((id, i) => ({ reelId: id, score: 100 - i })),
    );
  });

  afterAll(async () => {
    if (!STACK_UP) return;
    await AppDataSource.getRepository(ReelView).delete({ user_id: userId });
    if (reelIds.length > 0) await AppDataSource.getRepository(Reel).delete(reelIds);
    await AppDataSource.getRepository(User).delete({ id: userId });
    await redis?.quit?.();
  });

  it("returns full cohort for fresh user", async () => {
    const service = new FeedService(
      cache,
      AppDataSource.getRepository(ReelView),
      AppDataSource.getRepository(Reel),
    );
    const r = await service.getHomeFeed({
      tab: "for_you",
      language: "en",
      country: "AE",
      userId,
      limit: 20,
    });
    expect(r.reels.map((x) => x.id)).toEqual(reelIds);
  });

  it("excludes seen reel after view", async () => {
    await AppDataSource.getRepository(ReelView).save({
      user_id: userId,
      reel_id: reelIds[1],
      watch_duration_seconds: "30",
      completion_percentage: "0.9",
      device_type: "web_desktop",
    } as any);
    const service = new FeedService(
      cache,
      AppDataSource.getRepository(ReelView),
      AppDataSource.getRepository(Reel),
    );
    const r = await service.getHomeFeed({
      tab: "for_you",
      language: "en",
      country: "AE",
      userId,
      limit: 20,
    });
    expect(r.reels.map((x) => x.id)).not.toContain(reelIds[1]);
  });
});
