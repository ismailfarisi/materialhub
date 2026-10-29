/**
 * Integration test: analytics today-live SQL counts anonymous events.
 *
 * Verifies that buildTodayReelSql() picks up reel_views and reel_attributions
 * rows that have only session_id (no user_id) — i.e. anonymous taps and views
 * are counted in impressions, unique_viewers (via COALESCE on session_id), and
 * product_taps.
 *
 * Gated by REELS_LIVE_DB=1.
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/analytics-anonymous-counts
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Category,
  Product,
  ProductStatus,
  Reel,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";

import { buildTodayReelSql } from "../../src/domain/analytics/rollup.service.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

async function makeUser(emailSuffix: string, first = "F", last = "L") {
  const repo = AppDataSource.getRepository(User);
  return repo.save(
    repo.create({
      first_name: first,
      last_name: last,
      email: `analytics-anon-${emailSuffix}-${unique}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password_hash: "x",
      role: UserRole.customer,
      status: UserStatus.active,
    }),
  );
}

async function makeCategory(suffix: string): Promise<string> {
  const repo = AppDataSource.getRepository(Category);
  const cat = await repo.save(
    repo.create({
      name: `Analytics Anon Cat ${suffix}-${unique}`,
      slug: `analytics-anon-cat-${suffix}-${unique}-${Math.random().toString(36).slice(2, 8)}`,
      is_active: true,
    }),
  );
  return cat.id;
}

async function makeVendor(userId: string, suffix: string): Promise<string> {
  const repo = AppDataSource.getRepository(Vendor);
  const v = await repo.save(
    repo.create({
      user_id: userId,
      name: `Analytics Anon Vendor ${suffix}-${unique}`,
      slug: `analytics-anon-vendor-${suffix}-${unique}-${Math.random().toString(36).slice(2, 8)}`,
      business_name: "Analytics Anon Vendor",
      business_type: "retail",
      contact_email: `analytics-anon-vendor-${suffix}-${unique}@test.local`,
      contact_phone: "+971500000000",
      status: VendorStatus.approved,
    }),
  );
  return v.id;
}

async function makeProduct(vendorId: string, categoryId: string, suffix: string): Promise<string> {
  const repo = AppDataSource.getRepository(Product);
  const p = await repo.save(
    repo.create({
      vendor_id: vendorId,
      category_id: categoryId,
      name: `Analytics Anon Product ${suffix}`,
      slug: `analytics-anon-p-${suffix}-${unique}-${Math.random().toString(36).slice(2, 8)}`,
      price: 1000,
      currency: "AED",
      status: ProductStatus.approved,
    }),
  );
  return p.id;
}

async function makeReel(creatorId: string, suffix: string): Promise<string> {
  const repo = AppDataSource.getRepository(Reel);
  const r = await repo.save(
    repo.create({
      user_id: creatorId,
      video_provider: "cloudflare_stream",
      video_asset_id: `analytics-anon-${suffix}-${unique}`,
      video_playback_url: "https://test.local/r.m3u8",
      video_duration_seconds: 30,
      video_width: 1080,
      video_height: 1920,
      thumbnail_url: "https://test.local/r-thumb.jpg",
      language_code: "en",
      caption: `analytics anon reel ${suffix}`,
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

describeLive("integration: analytics picks up anonymous events", () => {
  beforeAll(async () => {
    await ensureDatabase();
  });
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it("today-live SQL counts anonymous taps and anon unique_viewers", async () => {
    const today = new Date().toISOString().slice(0, 10);

    const sessionA = await makeGuestSession("anon-analytics-A");
    const sessionB = await makeGuestSession("anon-analytics-B");
    const creator = await makeUser("creator", "C", "C");
    const vendorUser = await makeUser("vu", "V", "V");
    const vendorId = await makeVendor(vendorUser.id, "v");
    const categoryId = await makeCategory("c");
    const reelId = await makeReel(creator.id, "r");
    const productId = await makeProduct(vendorId, categoryId, "p");

    await AppDataSource.query(
      `INSERT INTO reel_views
         (user_id, session_id, reel_id, watch_duration_seconds, completion_percentage)
         VALUES (NULL, $1, $2, 3, 0.6)`,
      [sessionA, reelId],
    );
    await AppDataSource.query(
      `INSERT INTO reel_views
         (user_id, session_id, reel_id, watch_duration_seconds, completion_percentage)
         VALUES (NULL, $1, $2, 4, 0.7)`,
      [sessionB, reelId],
    );
    await AppDataSource.query(
      `INSERT INTO reel_attributions
         (user_id, session_id, reel_id, product_id, creator_id,
          tapped_at, expires_at, attribution_window_days_snapshot)
         VALUES (NULL, $1, $2, $3, $4, now(), now() + interval '7 days', 7)`,
      [sessionA, reelId, productId, creator.id],
    );

    const rows = await AppDataSource.query(buildTodayReelSql(), [today]);
    const mine = rows.find((r: { reel_id: string }) => r.reel_id === reelId);

    expect(mine).toBeDefined();
    expect(Number(mine.impressions)).toBe(2);
    expect(Number(mine.unique_viewers)).toBe(2);
    expect(Number(mine.product_taps)).toBe(1);

    await AppDataSource.query("DELETE FROM reel_attributions WHERE reel_id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM reel_views WHERE reel_id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM reels WHERE id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM products WHERE id = $1", [productId]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM categories WHERE id = $1", [categoryId]);
    await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2)", [
      creator.id,
      vendorUser.id,
    ]);
    await AppDataSource.query("DELETE FROM guest_sessions WHERE id IN ($1, $2)", [
      sessionA,
      sessionB,
    ]);
  });
});
