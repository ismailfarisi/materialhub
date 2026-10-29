/**
 * Live integration test for the category reels feed.
 *
 * Seeds a 3-level category tree, products at the leaves, and approved reels
 * tagged to those products, then exercises FeedService.getCategoryFeed from
 * the root, mid-level, and leaf.
 *
 * Gated by REELS_LIVE_DB=1.
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/category-feed
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Category,
  Product,
  ProductStatus,
  Reel,
  ReelProductTag,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { FeedCacheClient, type RedisLike } from "../../src/domain/feed/feed-cache.client.ts";
import { FeedService } from "../../src/domain/feed/feed.service.ts";

const LIVE = process.env.REELS_LIVE_DB === "1";
const unique = Date.now();

let rootCategoryId = "";
let midCategoryId = "";
let leafCategoryId = "";
let creatorId = "";
let vendorId = "";
const productIds: string[] = [];
const reelIds: string[] = [];

const makeCache = (): FeedCacheClient => {
  const pipe = { del: () => pipe, zadd: () => pipe, expire: () => pipe, exec: async () => [] };
  const redis: RedisLike = {
    multi: () => pipe,
    zrevrange: async () => [],
    del: async () => 0,
  };
  return new FeedCacheClient(redis);
};

beforeAll(async () => {
  if (!LIVE) return;
  await ensureDatabase();

  const catRepo = AppDataSource.getRepository(Category);
  const root = await catRepo.save(
    catRepo.create({
      name: `Root ${unique}`,
      slug: `root-${unique}`,
      path: `/root-${unique}`,
      depth: 0,
    }),
  );
  rootCategoryId = root.id;
  const mid = await catRepo.save(
    catRepo.create({
      name: `Mid ${unique}`,
      slug: `mid-${unique}`,
      parent_id: root.id,
      path: `/root-${unique}/mid-${unique}`,
      depth: 1,
    }),
  );
  midCategoryId = mid.id;
  const leaf = await catRepo.save(
    catRepo.create({
      name: `Leaf ${unique}`,
      slug: `leaf-${unique}`,
      parent_id: mid.id,
      path: `/root-${unique}/mid-${unique}/leaf-${unique}`,
      depth: 2,
    }),
  );
  leafCategoryId = leaf.id;

  const userRepo = AppDataSource.getRepository(User);
  const creator = await userRepo.save(
    userRepo.create({
      email: `creator-${unique}@test.local`,
      password_hash: "x",
      full_name: "Creator",
      status: UserStatus.active,
      role: UserRole.customer,
      preferred_language: "en",
    }),
  );
  creatorId = creator.id;

  const vendorUser = await userRepo.save(
    userRepo.create({
      email: `vendor-${unique}@test.local`,
      password_hash: "x",
      full_name: "Vendor",
      status: UserStatus.active,
      // Phase 3a: vendor owners are customers with vendor_members owner row
      role: UserRole.customer,
      preferred_language: "en",
    }),
  );

  const vendorRepo = AppDataSource.getRepository(Vendor);
  const vendor = await vendorRepo.save(
    vendorRepo.create({
      user_id: vendorUser.id,
      business_name: `Vendor ${unique}`,
      slug: `vendor-${unique}`,
      status: VendorStatus.approved,
    } as any),
  );
  vendorId = vendor.id;

  const productRepo = AppDataSource.getRepository(Product);
  const p1 = await productRepo.save(
    productRepo.create({
      vendor_id: vendor.id,
      category_id: leaf.id,
      name: `Leaf Product ${unique}`,
      slug: `leaf-prod-${unique}`,
      sku: `SKU-L-${unique}`,
      status: ProductStatus.active,
      price_fils: 10000,
    } as any),
  );
  productIds.push(p1.id);

  const reelRepo = AppDataSource.getRepository(Reel);
  const tagRepo = AppDataSource.getRepository(ReelProductTag);
  for (let i = 0; i < 3; i++) {
    const reel = await reelRepo.save(
      reelRepo.create({
        user_id: creatorId,
        status: ReelStatus.approved,
        language_code: "en",
        published_at: new Date(Date.now() - i * 1000),
        ranking_score: 100 - i,
        view_count: 0,
      } as any),
    );
    reelIds.push(reel.id);
    await tagRepo.save(tagRepo.create({ reel_id: reel.id, product_id: p1.id } as any));
  }
});

afterAll(async () => {
  if (!LIVE) return;
  const q = (sql: string, params: unknown[] = []) => AppDataSource.query(sql, params);
  if (reelIds.length) await q("DELETE FROM reel_product_tags WHERE reel_id = ANY($1)", [reelIds]);
  if (reelIds.length) await q("DELETE FROM reels WHERE id = ANY($1)", [reelIds]);
  if (productIds.length) await q("DELETE FROM products WHERE id = ANY($1)", [productIds]);
  if (vendorId) await q("DELETE FROM vendors WHERE id = $1", [vendorId]);
  if (creatorId) await q("DELETE FROM users WHERE id = $1", [creatorId]);
  if (leafCategoryId) await q("DELETE FROM categories WHERE id = $1", [leafCategoryId]);
  if (midCategoryId) await q("DELETE FROM categories WHERE id = $1", [midCategoryId]);
  if (rootCategoryId) await q("DELETE FROM categories WHERE id = $1", [rootCategoryId]);
});

describe.if(LIVE)("getCategoryFeed (integration)", () => {
  it("returns leaf-tagged reels when querying the root category", async () => {
    const svc = new FeedService(makeCache());
    const res = await svc.getCategoryFeed(
      { id: rootCategoryId },
      { userId: null, limit: 10, language: "en", country: "AE" },
    );
    expect(res.reels.length).toBe(3);
    expect(res.reels.every((r) => reelIds.includes(r.id))).toBe(true);
  });

  it("returns the same reels when querying by slug", async () => {
    const svc = new FeedService(makeCache());
    const res = await svc.getCategoryFeed(
      { slug: `root-${unique}` },
      { userId: null, limit: 10, language: "en", country: "AE" },
    );
    expect(res.reels.length).toBe(3);
  });

  it("returns leaf-tagged reels when querying the leaf directly", async () => {
    const svc = new FeedService(makeCache());
    const res = await svc.getCategoryFeed(
      { id: leafCategoryId },
      { userId: null, limit: 10, language: "en", country: "AE" },
    );
    expect(res.reels.length).toBe(3);
  });

  it("returns empty for a different language", async () => {
    const svc = new FeedService(makeCache());
    const res = await svc.getCategoryFeed(
      { id: rootCategoryId },
      { userId: null, limit: 10, language: "ar", country: "AE" },
    );
    expect(res.reels.length).toBe(0);
  });

  it("rejects unknown category slug with a throw", async () => {
    const svc = new FeedService(makeCache());
    await expect(
      svc.getCategoryFeed(
        { slug: "definitely-does-not-exist" },
        { userId: null, limit: 10, language: "en", country: "AE" },
      ),
    ).rejects.toThrow("unknown_category");
  });
});
