/**
 * Integration test: view-merge collision handling.
 *
 * Verifies AttributionMergeService.mergeGuestToUser() correctly resolves the
 * partial-unique conflict on `reel_views (user_id, reel_id) WHERE user_id IS
 * NOT NULL`:
 *   - When the user already has a logged-in view for the same reel, the anon
 *     row is deleted (logged-in row wins, no UPDATE conflict).
 *   - When no collision exists, the anon row is promoted: user_id backfilled,
 *     session_id nulled.
 *
 * Gated by REELS_LIVE_DB=1.
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/attribution-merge-view-conflict
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Reel,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  ensureDatabase,
} from "@materialhub/database";

import { AttributionMergeService } from "../../src/domain/commerce/attribution-merge.service.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

async function makeUser(emailSuffix: string, first = "F", last = "L") {
  const repo = AppDataSource.getRepository(User);
  return repo.save(
    repo.create({
      first_name: first,
      last_name: last,
      email: `view-conflict-${emailSuffix}-${unique}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: "x",
      role: UserRole.customer,
      status: UserStatus.active,
    }),
  );
}

async function makeReel(creatorId: string, suffix: string): Promise<string> {
  const repo = AppDataSource.getRepository(Reel);
  const r = await repo.save(
    repo.create({
      user_id: creatorId,
      video_provider: "cloudflare_stream",
      video_asset_id: `view-conflict-${suffix}-${unique}`,
      video_playback_url: "https://test.local/r.m3u8",
      video_duration_seconds: 30,
      video_width: 1080,
      video_height: 1920,
      thumbnail_url: "https://test.local/r-thumb.jpg",
      language_code: "en",
      caption: `view conflict reel ${suffix}`,
      status: ReelStatus.approved,
      published_at: new Date(),
    }),
  );
  return r.id;
}

async function makeGuestSession(token: string): Promise<string> {
  const expires = new Date(Date.now() + 30 * 86_400_000);
  const rows = await AppDataSource.query(
    "INSERT INTO guest_sessions (session_token, expires_at) VALUES ($1, $2) RETURNING id",
    [`${token}-${unique}-${Math.random().toString(36).slice(2, 8)}`, expires],
  );
  return rows[0].id;
}

describeLive("integration: view merge collision — delete anon row, keep logged-in row", () => {
  beforeAll(async () => {
    await ensureDatabase();
  });
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it("deletes the anon view when a logged-in view exists for the same reel", async () => {
    const sessionId = await makeGuestSession("view-conflict-token");
    const user = await makeUser("u-collide", "V", "V");
    const creator = await makeUser("creator-collide", "C", "C");
    const reelId = await makeReel(creator.id, "collide");

    await AppDataSource.query(
      `INSERT INTO reel_views
         (user_id, session_id, reel_id, watch_duration_seconds, completion_percentage)
         VALUES (NULL, $1, $2, 3, 0.6)`,
      [sessionId, reelId],
    );
    await AppDataSource.query(
      `INSERT INTO reel_views
         (user_id, session_id, reel_id, watch_duration_seconds, completion_percentage)
         VALUES ($1, NULL, $2, 5, 0.9)`,
      [user.id, reelId],
    );

    const svc = new AttributionMergeService(AppDataSource);
    await svc.mergeGuestToUser(sessionId, user.id);

    const rows = await AppDataSource.query(
      "SELECT user_id, watch_duration_seconds FROM reel_views WHERE reel_id = $1",
      [reelId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(user.id);
    expect(Number(rows[0].watch_duration_seconds)).toBe(5);

    await AppDataSource.query("DELETE FROM reel_views WHERE reel_id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM reels WHERE id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2)", [user.id, creator.id]);
    await AppDataSource.query("DELETE FROM guest_sessions WHERE id = $1", [sessionId]);
  });

  it("promotes the anon view when no logged-in collision exists", async () => {
    const sessionId = await makeGuestSession("view-promote-token");
    const user = await makeUser("u-promote", "V", "V");
    const creator = await makeUser("creator-promote", "C", "C");
    const reelId = await makeReel(creator.id, "promote");

    await AppDataSource.query(
      `INSERT INTO reel_views
         (user_id, session_id, reel_id, watch_duration_seconds, completion_percentage)
         VALUES (NULL, $1, $2, 4, 0.7)`,
      [sessionId, reelId],
    );

    const svc = new AttributionMergeService(AppDataSource);
    await svc.mergeGuestToUser(sessionId, user.id);

    const rows = await AppDataSource.query(
      "SELECT user_id, session_id, watch_duration_seconds FROM reel_views WHERE reel_id = $1",
      [reelId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(user.id);
    expect(rows[0].session_id).toBeNull();
    expect(Number(rows[0].watch_duration_seconds)).toBe(4);

    await AppDataSource.query("DELETE FROM reel_views WHERE reel_id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM reels WHERE id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2)", [user.id, creator.id]);
    await AppDataSource.query("DELETE FROM guest_sessions WHERE id = $1", [sessionId]);
  });
});
