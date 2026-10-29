/**
 * Live integration test for the M3 watch-to-commission loop.
 *
 * Exercises AttributionService / CommissionService / CreatorWalletService
 * directly against a running Postgres instance — no HTTP server, no mocks.
 *
 * Flow proven:
 *   recordTap → createFromOrder (pending commission)
 *     → setEligibility → transitionEligibleToEarned (wallet credit)
 *   and separately: voidPendingForOrder on refund
 *
 * Gated by REELS_LIVE_DB=1 so it doesn't fail in environments without a DB.
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/watch-to-commission
 *
 * Requires:
 *   - Postgres reachable on localhost:5432 (credentials from @materialhub/config
 *     defaults: materialhub / materialhub / materialhub)
 *   - All M1 + M3 migrations applied (reel_attributions partitioned table,
 *     reel_commissions, vendor reels_* columns)
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
  Reel,
  ReelCommission,
  ReelCommissionStatus,
  ReelProductTag,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorOrder,
  VendorStatus,
} from "@materialhub/database";

import { AttributionService } from "../../src/domain/commerce/attribution.service.ts";
import { CommissionService } from "../../src/domain/commerce/commission.service.ts";
import { CreatorWalletService } from "../../src/domain/commerce/creator-wallet.service.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

// --- shared seed IDs (first test flow) ---
let buyerUserId = "";
let creatorUserId = "";
let vendorUserId = "";
let vendorId = "";
let categoryId = "";
let productId = "";
let reelId = "";
let tagId = "";
let orderId = "";
let _vendorOrderId = "";
let orderItemId = "";

// --- second flow (void-on-refund) IDs ---
let order2Id = "";
let _vendorOrder2Id = "";
let orderItem2Id = "";
let product2Id = "";
let reel2Id = "";
let tag2Id = "";

async function seedBase() {
  const userRepo = AppDataSource.getRepository(User);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const productRepo = AppDataSource.getRepository(Product);
  const categoryRepo = AppDataSource.getRepository(Category);
  const reelRepo = AppDataSource.getRepository(Reel);
  const reelTagRepo = AppDataSource.getRepository(ReelProductTag);
  const orderRepo = AppDataSource.getRepository(Order);
  const vendorOrderRepo = AppDataSource.getRepository(VendorOrder);
  const orderItemRepo = AppDataSource.getRepository(OrderItem);

  // Buyer — customer who taps + checks out
  const buyer = await userRepo.save(
    userRepo.create({
      first_name: "M3",
      last_name: "Buyer",
      email: `m3-buyer-${unique}@test.local`,
      password_hash: "x",
      role: UserRole.customer,
      status: UserStatus.active,
    }),
  );
  buyerUserId = buyer.id;

  // Creator — customer with published reels
  const creator = await userRepo.save(
    userRepo.create({
      first_name: "M3",
      last_name: "Creator",
      email: `m3-creator-${unique}@test.local`,
      password_hash: "x",
      role: UserRole.customer,
      status: UserStatus.active,
    }),
  );
  creatorUserId = creator.id;

  // Vendor user + Vendor row (enrolled in reels program, subsidy active)
  const vendorUser = await userRepo.save(
    userRepo.create({
      first_name: "M3",
      last_name: "Vendor",
      email: `m3-vendor-${unique}@test.local`,
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
      name: `M3 Test Vendor ${unique}`,
      slug: `m3-test-vendor-${unique}`,
      business_name: "M3 Test Vendor",
      business_type: "retail",
      contact_email: `m3-vendor-${unique}@test.local`,
      contact_phone: "+971500000000",
      status: VendorStatus.approved,
      reels_program_joined_at: new Date(),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: new Date(Date.now() + 60 * 86_400_000), // 60 days
    }),
  );
  vendorId = vendor.id;

  const category = await categoryRepo.save(
    categoryRepo.create({
      name: `M3 Test Category ${unique}`,
      slug: `m3-test-category-${unique}`,
      is_active: true,
    }),
  );
  categoryId = category.id;

  // --- first flow: product, reel, tag, order, vendor_order, order_item ---
  const product = await productRepo.save(
    productRepo.create({
      vendor_id: vendor.id,
      category_id: category.id,
      name: `M3 Test Product ${unique}`,
      slug: `m3-test-product-${unique}`,
      status: ProductStatus.approved,
      price: 10000,
      currency: "AED",
    }),
  );
  productId = product.id;

  const reel = await reelRepo.save(
    reelRepo.create({
      user_id: creator.id,
      video_provider: "cloudflare_stream",
      video_asset_id: `m3-asset-${unique}`,
      video_playback_url: "https://cf/test.m3u8",
      video_duration_seconds: 30,
      video_width: 1080,
      video_height: 1920,
      thumbnail_url: "https://cf/test-thumb.jpg",
      language_code: "en",
      status: ReelStatus.approved,
      published_at: new Date(),
    }),
  );
  reelId = reel.id;

  const tag = await reelTagRepo.save(
    reelTagRepo.create({
      reel_id: reel.id,
      product_id: product.id,
      timestamp_seconds: "5.00",
    }),
  );
  tagId = tag.id;

  const order = await orderRepo.save(
    orderRepo.create({
      order_number: `M3-${unique}`,
      user_id: buyer.id,
      status: OrderStatus.confirmed,
      subtotal: 10000,
      grand_total: 10000,
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
      vendor_order_number: `M3V-${unique}`,
      status: OrderStatus.confirmed,
      subtotal: 10000,
      vendor_total: 10000,
      currency: "AED",
    }),
  );
  _vendorOrderId = vendorOrder.id;

  const item = await orderItemRepo.save(
    orderItemRepo.create({
      order_id: order.id,
      vendor_order_id: vendorOrder.id,
      vendor_id: vendor.id,
      product_id: product.id,
      product_name: "M3 Test Product",
      quantity: 1,
      unit_price: 10000,
      line_total: 10000,
      status: OrderStatus.confirmed,
    }),
  );
  orderItemId = item.id;
}

async function seedSecondFlow() {
  const productRepo = AppDataSource.getRepository(Product);
  const reelRepo = AppDataSource.getRepository(Reel);
  const reelTagRepo = AppDataSource.getRepository(ReelProductTag);
  const orderRepo = AppDataSource.getRepository(Order);
  const vendorOrderRepo = AppDataSource.getRepository(VendorOrder);
  const orderItemRepo = AppDataSource.getRepository(OrderItem);

  const product2 = await productRepo.save(
    productRepo.create({
      vendor_id: vendorId,
      category_id: categoryId,
      name: `M3 Test Product 2 ${unique}`,
      slug: `m3-test-product-2-${unique}`,
      status: ProductStatus.approved,
      price: 10000,
      currency: "AED",
    }),
  );
  product2Id = product2.id;

  const reel2 = await reelRepo.save(
    reelRepo.create({
      user_id: creatorUserId,
      video_provider: "cloudflare_stream",
      video_asset_id: `m3-asset-2-${unique}`,
      video_playback_url: "https://cf/test2.m3u8",
      video_duration_seconds: 30,
      video_width: 1080,
      video_height: 1920,
      thumbnail_url: "https://cf/test2-thumb.jpg",
      language_code: "en",
      status: ReelStatus.approved,
      published_at: new Date(),
    }),
  );
  reel2Id = reel2.id;

  const tag2 = await reelTagRepo.save(
    reelTagRepo.create({
      reel_id: reel2.id,
      product_id: product2.id,
      timestamp_seconds: "5.00",
    }),
  );
  tag2Id = tag2.id;

  const order2 = await orderRepo.save(
    orderRepo.create({
      order_number: `M3-2-${unique}`,
      user_id: buyerUserId,
      status: OrderStatus.confirmed,
      subtotal: 10000,
      grand_total: 10000,
      currency: "AED",
      shipping_address: {
        line1: "Test",
        city: "Dubai",
        country: "AE",
      },
    }),
  );
  order2Id = order2.id;

  const vendorOrder2 = await vendorOrderRepo.save(
    vendorOrderRepo.create({
      order_id: order2.id,
      vendor_id: vendorId,
      vendor_order_number: `M3V-2-${unique}`,
      status: OrderStatus.confirmed,
      subtotal: 10000,
      vendor_total: 10000,
      currency: "AED",
    }),
  );
  _vendorOrder2Id = vendorOrder2.id;

  const item2 = await orderItemRepo.save(
    orderItemRepo.create({
      order_id: order2.id,
      vendor_order_id: vendorOrder2.id,
      vendor_id: vendorId,
      product_id: product2.id,
      product_name: "M3 Test Product 2",
      quantity: 1,
      unit_price: 10000,
      line_total: 10000,
      status: OrderStatus.confirmed,
    }),
  );
  orderItem2Id = item2.id;
}

async function cleanup() {
  // Hard delete in reverse FK dependency order. Each DELETE in its own try/catch
  // so partial failures still free as many rows as possible for re-runs.
  const q = (sql: string, params: unknown[]) =>
    AppDataSource.query(sql, params).catch((err) =>
      console.warn("[cleanup] ignored:", (err as Error).message),
    );

  const orderIds = [orderId, order2Id].filter(Boolean);

  // 1. reel_commissions (FK to order, order_item, wallet_transaction)
  if (orderIds.length) {
    await q("DELETE FROM reel_commissions WHERE order_id = ANY($1::uuid[])", [orderIds]);
  }
  // 2. reel_attributions — partitioned, raw SQL by creator_id
  if (creatorUserId) {
    await q("DELETE FROM reel_attributions WHERE creator_id = $1", [creatorUserId]);
  }
  // 3. Reset creator's wallet_balance to 0 (in case FK constraints care), then
  //    delete wallet_transactions scoped to this creator only.
  if (creatorUserId) {
    await q("UPDATE users SET wallet_balance = 0 WHERE id = $1", [creatorUserId]);
    await q("DELETE FROM wallet_transactions WHERE user_id = $1", [creatorUserId]);
  }
  // 4. order_items, vendor_orders, orders
  if (orderIds.length) {
    await q("DELETE FROM order_items WHERE order_id = ANY($1::uuid[])", [orderIds]);
    await q("DELETE FROM vendor_orders WHERE order_id = ANY($1::uuid[])", [orderIds]);
    await q("DELETE FROM orders WHERE id = ANY($1::uuid[])", [orderIds]);
  }
  // 5. reel_product_tags, reels
  const reelIds = [reelId, reel2Id].filter(Boolean);
  if (reelIds.length) {
    await q("DELETE FROM reel_product_tags WHERE reel_id = ANY($1::uuid[])", [reelIds]);
    await q("DELETE FROM reels WHERE id = ANY($1::uuid[])", [reelIds]);
  }
  // 6. products, category
  const productIds = [productId, product2Id].filter(Boolean);
  if (productIds.length) {
    await q("DELETE FROM products WHERE id = ANY($1::uuid[])", [productIds]);
  }
  if (categoryId) {
    await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  }
  // 7. vendor
  if (vendorId) {
    await q("DELETE FROM vendors WHERE id = $1", [vendorId]);
  }
  // 8. users (buyer, creator, vendor user)
  for (const uid of [buyerUserId, creatorUserId, vendorUserId].filter(Boolean)) {
    await q("DELETE FROM users WHERE id = $1", [uid]);
  }
}

describeLive("watch-to-commission integration", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
    await seedBase();
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  it("records tap, creates pending commission on paid order, transitions to earned on eligibility", async () => {
    const attribution = new AttributionService();
    const wallet = new CreatorWalletService();
    const commission = new CommissionService(wallet);

    // 1. Record tap
    await attribution.recordTap({
      reelId,
      productId,
      tagId,
      buyerUserId,
      sessionId: null,
    });

    // 2. Load order with items (needed by createFromOrder)
    const order = await AppDataSource.getRepository(Order).findOneOrFail({
      where: { id: orderId },
      relations: ["items"],
    });

    // 3. Create commission from the order
    await commission.createFromOrder(order);

    // 4. Assert pending commission row exists with expected amount
    const pending = await AppDataSource.getRepository(ReelCommission).findOne({
      where: { order_item_id: orderItemId },
    });
    expect(pending).toBeTruthy();
    expect(pending!.status).toBe(ReelCommissionStatus.pending);
    // gross = round(10000 * 0.05) = 500
    expect(Number(pending!.gross_commission_fils)).toBe(500);
    // subsidy active → 50/50 split → 250 each
    expect(Number(pending!.platform_subsidy_fils)).toBe(250);
    expect(Number(pending!.vendor_share_fils)).toBe(250);

    // 5. Set eligibility — delivered now, 0-day return window
    await commission.setEligibility(orderId, new Date(), 0);

    // 6. Transition with `now` slightly in the future so eligible_at <= now
    const processed = await commission.transitionEligibleToEarned(new Date(Date.now() + 1000));
    expect(processed).toBeGreaterThanOrEqual(1);

    // 7. Assert commission is now earned and has a wallet_transaction_id
    const earned = await AppDataSource.getRepository(ReelCommission).findOneOrFail({
      where: { id: pending!.id },
    });
    expect(earned.status).toBe(ReelCommissionStatus.earned);
    expect(earned.earned_at).toBeTruthy();
    expect(earned.wallet_transaction_id).toBeTruthy();

    // 8. Assert the creator's user.wallet_balance reflects the credit
    const creator = await AppDataSource.getRepository(User).findOneOrFail({
      where: { id: creatorUserId },
    });
    expect(creator.wallet_balance).toBeGreaterThanOrEqual(500);
  });

  it("voids pending commissions when order refunded", async () => {
    // Seed a second product/reel/tag/order so we have a fresh pending commission.
    await seedSecondFlow();

    const attribution = new AttributionService();
    const wallet = new CreatorWalletService();
    const commission = new CommissionService(wallet);

    // Tap on the second reel/product.
    await attribution.recordTap({
      reelId: reel2Id,
      productId: product2Id,
      tagId: tag2Id,
      buyerUserId,
      sessionId: null,
    });

    const order2 = await AppDataSource.getRepository(Order).findOneOrFail({
      where: { id: order2Id },
      relations: ["items"],
    });

    await commission.createFromOrder(order2);

    // Confirm it's pending
    const pending2 = await AppDataSource.getRepository(ReelCommission).findOneOrFail({
      where: { order_item_id: orderItem2Id },
    });
    expect(pending2.status).toBe(ReelCommissionStatus.pending);

    // Void it (refund path)
    await commission.voidPendingForOrder(order2Id, "full_refund");

    const voided = await AppDataSource.getRepository(ReelCommission).findOneOrFail({
      where: { id: pending2.id },
    });
    expect(voided.status).toBe(ReelCommissionStatus.voided);
    expect(voided.voided_reason).toBe("full_refund");

    // Sanity: the earlier earned commission from test 1 should still be earned
    // (void only touches rows where status=pending AND order_id=the refunded order).
    const firstEarned = await AppDataSource.getRepository(ReelCommission).findOneOrFail({
      where: { order_item_id: orderItemId },
    });
    expect(firstEarned.status).toBe(ReelCommissionStatus.earned);
  });
});
