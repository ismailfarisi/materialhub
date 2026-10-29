/**
 * Live integration test for the M1 reels flow.
 *
 * Exercises ReelsService / ReelTagService / ModerationService directly against
 * a running Postgres instance — no HTTP server, no mocks beyond the
 * VerifiedPurchaseGuard (which would otherwise require order-service to be up)
 * and the CloudflareStreamClient (which would otherwise hit the real API on
 * rejection cleanup).
 *
 * Gated by REELS_LIVE_DB=1 so it doesn't fail in environments without a DB.
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/upload-to-publish
 *
 * Requires:
 *   - Postgres reachable on localhost:5432 (credentials from @materialhub/config
 *     defaults: materialhub / materialhub / materialhub)
 *   - All M1 migrations applied (including the enforce_reel_tag_limit trigger)
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Category,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductStatus,
  ReelModerationLog,
  ReelProductTag,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorOrder,
  VendorStatus,
} from "@materialhub/database";

import { TrustService } from "../../src/domain/creator-tier/trust.service.ts";
import { ModerationService } from "../../src/domain/moderation/moderation.service.ts";
import { ReelTagService } from "../../src/domain/reels/reel-tag.service.ts";
import { ReelsService } from "../../src/domain/reels/reels.service.ts";
import { CloudflareStreamClient } from "../../src/domain/upload/cloudflare-stream.client.ts";

const LIVE = process.env.REELS_LIVE_DB === "1";

// no-op fetcher for CloudflareStreamClient.deleteVideo best-effort cleanup.
const noopFetcher = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

const unique = Date.now();

let creatorId = "";
let vendorUserId = "";
let vendorId = "";
let categoryId = "";
const productIds: string[] = [];
let orderId = "";
let _vendorOrderId = "";
let createdReelId: string | null = null;

async function seed() {
  const userRepo = AppDataSource.getRepository(User);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const productRepo = AppDataSource.getRepository(Product);
  const categoryRepo = AppDataSource.getRepository(Category);
  const orderRepo = AppDataSource.getRepository(Order);
  const vendorOrderRepo = AppDataSource.getRepository(VendorOrder);
  const orderItemRepo = AppDataSource.getRepository(OrderItem);

  // Creator == buyer (verified purchase on all products).
  const creator = await userRepo.save(
    userRepo.create({
      first_name: "M1",
      last_name: "Creator",
      email: `m1-creator-${unique}@test.local`,
      password_hash: "x",
      role: UserRole.customer,
      status: UserStatus.active,
      can_tag_unowned: false,
    }),
  );
  creatorId = creator.id;

  // Vendor user + vendor row.
  const vendorUser = await userRepo.save(
    userRepo.create({
      first_name: "M1",
      last_name: "Vendor",
      email: `m1-vendor-${unique}@test.local`,
      password_hash: "x",
      // Phase 3a: vendor owners are customers with vendor_members owner row
      role: UserRole.customer,
      status: UserStatus.active,
    }),
  );
  vendorUserId = vendorUser.id;

  const vendor = await vendorRepo.save(
    vendorRepo.create({
      user_id: vendorUser.id,
      name: `M1 Test Vendor ${unique}`,
      slug: `m1-test-vendor-${unique}`,
      business_name: "M1 Test Vendor",
      business_type: "retail",
      contact_email: `m1-vendor-${unique}@test.local`,
      contact_phone: "+971500000000",
      status: VendorStatus.approved,
    }),
  );
  vendorId = vendor.id;

  // Category for products (products.category_id is NOT NULL).
  const category = await categoryRepo.save(
    categoryRepo.create({
      name: `M1 Test Category ${unique}`,
      slug: `m1-test-category-${unique}`,
      is_active: true,
    }),
  );
  categoryId = category.id;

  // 6 products: 5 to tag, 1 to trip the DB trigger.
  for (let i = 0; i < 6; i++) {
    const p = await productRepo.save(
      productRepo.create({
        vendor_id: vendor.id,
        category_id: category.id,
        name: `M1 Test Product ${i}`,
        slug: `m1-test-product-${unique}-${i}`,
        status: ProductStatus.approved,
        price: 10000,
        currency: "AED",
      }),
    );
    productIds.push(p.id);
  }

  // Delivered order + vendor_order + items → verified purchase for all products.
  const order = await orderRepo.save(
    orderRepo.create({
      order_number: `M1-${unique}`,
      user_id: creator.id,
      status: OrderStatus.delivered,
      subtotal: 60000,
      grand_total: 60000,
      currency: "AED",
      shipping_address: {
        line1: "Test",
        city: "Dubai",
        country: "AE",
      },
    }),
  );
  orderId = order.id;

  const vendorOrder = await vendorOrderRepo.save(
    vendorOrderRepo.create({
      order_id: order.id,
      vendor_id: vendor.id,
      vendor_order_number: `M1V-${unique}`,
      status: OrderStatus.delivered,
      subtotal: 60000,
      vendor_total: 60000,
      currency: "AED",
    }),
  );
  _vendorOrderId = vendorOrder.id;

  for (const pid of productIds) {
    await orderItemRepo.save(
      orderItemRepo.create({
        order_id: order.id,
        vendor_order_id: vendorOrder.id,
        vendor_id: vendor.id,
        product_id: pid,
        product_name: "M1 Test Product",
        quantity: 1,
        unit_price: 10000,
        line_total: 10000,
        status: OrderStatus.delivered,
      }),
    );
  }
}

async function cleanup() {
  // Hard delete in dependency order. Wrapped in try/catch per statement so
  // that partial failures still free as much as possible for re-runs.
  const q = (sql: string, params: unknown[]) =>
    AppDataSource.query(sql, params).catch((err) =>
      console.warn("[cleanup] ignored:", (err as Error).message),
    );

  if (createdReelId) {
    await q("DELETE FROM reel_moderation_log WHERE reel_id = $1", [createdReelId]);
    await q("DELETE FROM reel_product_tags WHERE reel_id = $1", [createdReelId]);
    await q("DELETE FROM reels WHERE id = $1", [createdReelId]);
  }
  if (orderId) {
    await q("DELETE FROM order_items WHERE order_id = $1", [orderId]);
    await q("DELETE FROM vendor_orders WHERE order_id = $1", [orderId]);
    await q("DELETE FROM orders WHERE id = $1", [orderId]);
  }
  if (productIds.length) {
    await q("DELETE FROM products WHERE id = ANY($1::uuid[])", [productIds]);
  }
  if (categoryId) {
    await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  }
  if (vendorId) {
    await q("DELETE FROM vendors WHERE id = $1", [vendorId]);
  }
  if (vendorUserId) {
    await q("DELETE FROM users WHERE id = $1", [vendorUserId]);
  }
  if (creatorId) {
    await q("DELETE FROM users WHERE id = $1", [creatorId]);
  }
}

if (!LIVE) {
  describe.skip("Reels M1 live integration (skipped: set REELS_LIVE_DB=1)", () => {
    it("placeholder", () => {});
  });
} else {
  describe("Reels M1 live integration", () => {
    let reelsService: ReelsService;
    let reelTagService: ReelTagService;
    let moderationService: ModerationService;

    beforeAll(async () => {
      if (!AppDataSource.isInitialized) await AppDataSource.initialize();
      await seed();

      const cloudflare = new CloudflareStreamClient({
        accountId: "test",
        apiToken: "test",
        fetcher: noopFetcher,
      });
      // Fake guard that always allows — the real guard would need to reach
      // order-service over HTTP for verified-purchase. Injecting here lets us
      // exercise the actual DB paths without the network dependency.
      const fakeGuard = {
        canTag: async () => ({ allowed: true, reason: "verified_purchase" }),
      };
      reelTagService = new ReelTagService(fakeGuard as any);
      // Real TrustService: the live DB test exercises publish() which routes
      // through isTrustedUser -> TrustService.isTrusted. The seeded creator
      // has creator_tier=regular + can_tag_unowned=false, so this correctly
      // returns false and the reel lands in pending_review.
      reelsService = new ReelsService(cloudflare, reelTagService, new TrustService());
      moderationService = new ModerationService();
    });

    afterAll(async () => {
      try {
        await cleanup();
      } finally {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
      }
    });

    it("step 1: createDraftFromAsset inserts a draft reel", async () => {
      const reel = await reelsService.createDraftFromAsset({
        userId: creatorId,
        assetId: `m1-asset-${unique}`,
        durationSeconds: 30,
        width: 1080,
        height: 1920,
        thumbnailUrl: "https://cf/test-thumb.jpg",
        playbackUrl: "https://cf/test.m3u8",
      });
      createdReelId = reel.id;
      expect(reel.status).toBe(ReelStatus.draft);
      expect(reel.user_id).toBe(creatorId);
    });

    it("step 2: addTag inserts 5 tags successfully", async () => {
      for (let i = 0; i < 5; i++) {
        await reelTagService.addTag({
          reelId: createdReelId!,
          userId: creatorId,
          productId: productIds[i]!,
          timestampSeconds: i * 5 + 1,
        });
      }
      const count = await AppDataSource.getRepository(ReelProductTag).count({
        where: { reel_id: createdReelId! },
      });
      expect(count).toBe(5);
    });

    it("step 3: addTag on 6th product is rejected by the DB trigger", async () => {
      await expect(
        reelTagService.addTag({
          reelId: createdReelId!,
          userId: creatorId,
          productId: productIds[5]!,
          timestampSeconds: 29,
        }),
      ).rejects.toThrow(/reel_tag_limit_exceeded/);
    });

    it("step 4: publish transitions untrusted user to pending_review", async () => {
      const reel = await reelsService.publish({
        reelId: createdReelId!,
        userId: creatorId,
      });
      expect(reel.status).toBe(ReelStatus.pending_review);
    });

    it("step 5: moderator approve transitions to approved + writes log", async () => {
      // Any real user id satisfies the moderator_id FK; M1 doesn't enforce a
      // role check at the service layer.
      const reel = await moderationService.approve(createdReelId!, creatorId, "test approval");
      expect(reel.status).toBe(ReelStatus.approved);
      expect(reel.published_at).toBeInstanceOf(Date);

      const log = await AppDataSource.getRepository(ReelModerationLog).find({
        where: { reel_id: createdReelId! },
      });
      expect(log.length).toBeGreaterThanOrEqual(1);
      expect(log[0]!.action).toBe("approved");
    });

    it("step 6: getById(null) returns approved reel to an anonymous viewer", async () => {
      const reel = await reelsService.getById(createdReelId!, null);
      expect(reel).not.toBeNull();
      expect(reel!.status).toBe(ReelStatus.approved);
    });

    it("step 7: softDelete hides the reel from getById", async () => {
      await reelsService.softDelete(createdReelId!, creatorId);
      const reel = await reelsService.getById(createdReelId!, null);
      expect(reel).toBeNull();
    });
  });
}
