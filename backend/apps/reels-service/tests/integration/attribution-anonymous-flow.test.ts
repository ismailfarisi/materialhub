/**
 * Integration test: anonymous attribution → login merge → commission match.
 *
 * Verifies that AttributionMergeService correctly backfills `user_id` on
 * `reel_attributions` rows that were created during a guest session, so that
 * the commission matcher (which queries by user_id + product_id) finds the
 * row after the guest authenticates.
 *
 * Gated by REELS_LIVE_DB=1 (consistent with sibling integration tests).
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/attribution-anonymous-flow
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
      email: `anon-flow-${emailSuffix}-${unique}-${Math.random().toString(36).slice(2, 8)}@test.local`,
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
      name: `Anon Flow Cat ${suffix}-${unique}`,
      slug: `anon-flow-cat-${suffix}-${unique}-${Math.random().toString(36).slice(2, 8)}`,
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
      name: `Anon Flow Vendor ${suffix}-${unique}`,
      slug: `anon-flow-vendor-${suffix}-${unique}-${Math.random().toString(36).slice(2, 8)}`,
      business_name: "Anon Flow Vendor",
      business_type: "retail",
      contact_email: `anon-flow-vendor-${suffix}-${unique}@test.local`,
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
      name: `Anon Flow Product ${suffix}`,
      slug: `anon-flow-p-${suffix}-${unique}-${Math.random().toString(36).slice(2, 8)}`,
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
      video_asset_id: `anon-flow-${suffix}-${unique}`,
      video_playback_url: "https://test.local/r.m3u8",
      video_duration_seconds: 30,
      video_width: 1080,
      video_height: 1920,
      thumbnail_url: "https://test.local/r-thumb.jpg",
      language_code: "en",
      caption: `anon flow reel ${suffix}`,
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

describeLive("integration: anonymous attribution → login merge → commission match", () => {
  beforeAll(async () => {
    await ensureDatabase();
  });
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it("backfills user_id on anon attribution, commission matcher finds row", async () => {
    const sessionId = await makeGuestSession("test-token-hash-1");
    const creator = await makeUser("creator", "C", "C");
    const buyer = await makeUser("buyer", "B", "B");
    const vendorUser = await makeUser("vu", "V", "V");
    const vendorId = await makeVendor(vendorUser.id, "v1");
    const categoryId = await makeCategory("c1");
    const reelId = await makeReel(creator.id, "r1");
    const productId = await makeProduct(vendorId, categoryId, "p1");

    // Insert an anonymous reel_attributions row (session_id only).
    const tappedAt = new Date();
    const expiresAt = new Date(tappedAt.getTime() + 7 * 86_400_000);
    await AppDataSource.query(
      `INSERT INTO reel_attributions
         (user_id, session_id, reel_id, product_id, creator_id,
          tapped_at, expires_at, attribution_window_days_snapshot)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, 7)`,
      [sessionId, reelId, productId, creator.id, tappedAt, expiresAt],
    );

    // Pre-merge: commission matcher (user_id + product_id) should find nothing.
    const preMatch = await AppDataSource.query(
      `SELECT COUNT(*)::int AS n FROM reel_attributions
         WHERE user_id = $1 AND product_id = $2`,
      [buyer.id, productId],
    );
    expect(preMatch[0].n).toBe(0);

    // Merge: run the service.
    const svc = new AttributionMergeService(AppDataSource);
    await svc.mergeGuestToUser(sessionId, buyer.id);

    // Post-merge: the same row is now matchable by user_id; session_id retained.
    const postMatch = await AppDataSource.query(
      `SELECT id, user_id, session_id FROM reel_attributions
         WHERE user_id = $1 AND product_id = $2`,
      [buyer.id, productId],
    );
    expect(postMatch).toHaveLength(1);
    expect(postMatch[0].user_id).toBe(buyer.id);
    expect(postMatch[0].session_id).toBe(sessionId);

    // Cleanup.
    await AppDataSource.query("DELETE FROM reel_attributions WHERE reel_id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM reels WHERE id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM products WHERE id = $1", [productId]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM categories WHERE id = $1", [categoryId]);
    await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      creator.id,
      buyer.id,
      vendorUser.id,
    ]);
    await AppDataSource.query("DELETE FROM guest_sessions WHERE id = $1", [sessionId]);
  });

  it("is idempotent — second merge call changes nothing", async () => {
    const sessionId = await makeGuestSession("test-token-hash-idem");
    const creator = await makeUser("idem-creator", "C", "C");
    const buyer = await makeUser("idem-buyer", "B", "B");
    const vendorUser = await makeUser("idem-vu", "V", "V");
    const vendorId = await makeVendor(vendorUser.id, "v-idem");
    const categoryId = await makeCategory("c-idem");
    const reelId = await makeReel(creator.id, "r-idem");
    const productId = await makeProduct(vendorId, categoryId, "p-idem");

    const tappedAt = new Date();
    const expiresAt = new Date(tappedAt.getTime() + 7 * 86_400_000);
    await AppDataSource.query(
      `INSERT INTO reel_attributions
         (user_id, session_id, reel_id, product_id, creator_id,
          tapped_at, expires_at, attribution_window_days_snapshot)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, 7)`,
      [sessionId, reelId, productId, creator.id, tappedAt, expiresAt],
    );

    const svc = new AttributionMergeService(AppDataSource);
    await svc.mergeGuestToUser(sessionId, buyer.id);
    await svc.mergeGuestToUser(sessionId, buyer.id);

    const rows = await AppDataSource.query(
      "SELECT COUNT(*)::int AS n FROM reel_attributions WHERE reel_id = $1",
      [reelId],
    );
    expect(rows[0].n).toBe(1);

    await AppDataSource.query("DELETE FROM reel_attributions WHERE reel_id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM reels WHERE id = $1", [reelId]);
    await AppDataSource.query("DELETE FROM products WHERE id = $1", [productId]);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [vendorId]);
    await AppDataSource.query("DELETE FROM categories WHERE id = $1", [categoryId]);
    await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      creator.id,
      buyer.id,
      vendorUser.id,
    ]);
    await AppDataSource.query("DELETE FROM guest_sessions WHERE id = $1", [sessionId]);
  });
});
