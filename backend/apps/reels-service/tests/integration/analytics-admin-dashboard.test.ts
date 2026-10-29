/**
 * End-to-end integration test for the admin analytics dashboard (Task 10).
 *
 * Seeds a small but representative fixture (2 creators, 2 vendors, 3 reels,
 * events across ≥2 bucket_dates, a mix of commission statuses), runs the
 * `RecomputeDailyRollupsJob.runOnce(today)` directly against a live Postgres,
 * then exercises every admin analytics endpoint through `app.handle(...)`
 * in-process (no HTTP server, no BullMQ start).
 *
 * Requires a live stack:
 *   - Postgres reachable (see docker-compose `postgres` service)
 *   - Redis reachable (only used by the rollup job constructor; no connect
 *     happens unless `.start()` is called, which we avoid here)
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/analytics-admin-dashboard
 *
 * Gated by REELS_LIVE_DB=1 so it doesn't fail in environments without a DB.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt as jwtPlugin } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Category,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductStatus,
  Reel,
  ReelCommissionStatus,
  ReelProductTag,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorOrder,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { permissionMatrix, signAccessToken } from "@materialhub/guards";
import type { UserRole as GuardUserRole } from "@materialhub/guards";
import { Elysia } from "elysia";

import { app } from "../../src/app.ts";
import { RecomputeDailyRollupsJob } from "../../src/domain/analytics/jobs/recompute-daily-rollups.job.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

// ─── Token minting ────────────────────────────────────────────────────
// Phase 2 Route Migration: tokens are signed via the shared `signAccessToken`
// helper so the JWT carries the new `tv` (token_version) and `vm`
// (vendor memberships) claims. Admin endpoints don't need `vm`, so we leave
// `memberships: []` for them; the `requireRole("admin")` guard inspects the
// `role` claim only.
type SignArgs = {
  userId: string;
  email: string;
  role: GuardUserRole;
};
type Signer = (args: SignArgs) => Promise<string>;

async function makeSigner(): Promise<Signer> {
  const signerApp = new Elysia().use(
    jwtPlugin({
      name: "accessJwt",
      secret: config.jwt.accessSecret,
      alg: "HS256",
    }),
  );
  // Compile so the decorator is attached; then pull out the sign() fn.
  signerApp.compile();
  const decoratorBag = (signerApp as unknown as { decorator: Record<string, unknown> }).decorator;
  const accessJwt = decoratorBag.accessJwt as {
    sign: (p: Record<string, unknown>) => Promise<string>;
  };
  return async (args) =>
    signAccessToken(accessJwt, {
      id: args.userId,
      email: args.email,
      role: args.role,
      token_version: 1,
      memberships: [],
    });
}

// ─── Date helpers ─────────────────────────────────────────────────────
const todayDate = new Date();
function isoAt(daysAgo: number, hour = 12): Date {
  const d = new Date(todayDate);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

// ─── Seed IDs ─────────────────────────────────────────────────────────
const unique = Date.now();

let buyerAId = "";
let buyerBId = "";
let creatorAId = "";
let creatorBId = "";
let superAdminId = "";
let customerUserId = "";
let vendorUserAId = "";
let vendorUserBId = "";
let vendorAId = "";
let vendorBId = "";
let categoryId = "";
const productIds: string[] = [];
let reel1Id = ""; // creator A, tags vendor A products only
let reel2Id = ""; // creator B, tags vendor B products only
let reel3Id = ""; // creator A, multi-vendor (tags A + B)
const orderIds: string[] = [];
const orderItemIds: string[] = [];
const vendorOrderIds: string[] = [];
const attributionIds: string[] = [];
const commissionIds: string[] = [];

async function seedFixtures(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const reelRepo = AppDataSource.getRepository(Reel);
  const reelTagRepo = AppDataSource.getRepository(ReelProductTag);

  // Users
  const [buyerA, buyerB, creatorA, creatorB, superAdmin, customerUser, vendorUserA, vendorUserB] =
    await Promise.all([
      userRepo.save(
        userRepo.create({
          first_name: "Analytics",
          last_name: "BuyerA",
          email: `adash-buyerA-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Analytics",
          last_name: "BuyerB",
          email: `adash-buyerB-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Ada",
          last_name: "Creator",
          email: `adash-creatorA-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Bob",
          last_name: "Creator",
          email: `adash-creatorB-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Super",
          last_name: "Admin",
          email: `adash-super-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.super_admin,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Plain",
          last_name: "Customer",
          email: `adash-customer-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "UserA",
          email: `adash-vendorA-user-${unique}@test.local`,
          password_hash: "x",
          // Phase 3a: vendor owners are customers with vendor_members owner row
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "UserB",
          email: `adash-vendorB-user-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
    ]);

  buyerAId = buyerA.id;
  buyerBId = buyerB.id;
  creatorAId = creatorA.id;
  creatorBId = creatorB.id;
  superAdminId = superAdmin.id;
  customerUserId = customerUser.id;
  vendorUserAId = vendorUserA.id;
  vendorUserBId = vendorUserB.id;

  // Vendors (both enrolled in reels program, subsidy active)
  const [vendorA, vendorB] = await Promise.all([
    vendorRepo.save(
      vendorRepo.create({
        user_id: vendorUserA.id,
        name: `Analytics Vendor A ${unique}`,
        slug: `adash-vendorA-${unique}`,
        business_name: "Analytics Vendor A",
        business_type: "retail",
        contact_email: `adash-vendorA-${unique}@test.local`,
        contact_phone: "+971500000001",
        status: VendorStatus.approved,
        reels_program_joined_at: new Date(),
        reels_commission_rate: "0.0500",
        reels_subsidy_ends_at: new Date(Date.now() + 60 * 86_400_000),
      }),
    ),
    vendorRepo.save(
      vendorRepo.create({
        user_id: vendorUserB.id,
        name: `Analytics Vendor B ${unique}`,
        slug: `adash-vendorB-${unique}`,
        business_name: "Analytics Vendor B",
        business_type: "retail",
        contact_email: `adash-vendorB-${unique}@test.local`,
        contact_phone: "+971500000002",
        status: VendorStatus.approved,
        reels_program_joined_at: new Date(),
        reels_commission_rate: "0.0500",
        reels_subsidy_ends_at: new Date(Date.now() + 60 * 86_400_000),
      }),
    ),
  ]);
  vendorAId = vendorA.id;
  vendorBId = vendorB.id;

  // Category + 5 products (3 for vendor A, 2 for vendor B).
  const category = await categoryRepo.save(
    categoryRepo.create({
      name: `Analytics Category ${unique}`,
      slug: `adash-cat-${unique}`,
      is_active: true,
    }),
  );
  categoryId = category.id;

  const productSpecs = [
    { vendorId: vendorAId, suffix: "a1", price: 10000 },
    { vendorId: vendorAId, suffix: "a2", price: 15000 },
    { vendorId: vendorAId, suffix: "a3", price: 8000 },
    { vendorId: vendorBId, suffix: "b1", price: 20000 },
    { vendorId: vendorBId, suffix: "b2", price: 12000 },
  ];
  for (const spec of productSpecs) {
    const p = await productRepo.save(
      productRepo.create({
        vendor_id: spec.vendorId,
        category_id: category.id,
        name: `Analytics Product ${spec.suffix}`,
        slug: `adash-p-${spec.suffix}-${unique}`,
        status: ProductStatus.approved,
        price: spec.price,
        currency: "AED",
      }),
    );
    productIds.push(p.id);
  }
  // aliases for readability
  const [pA1, pA2, pA3, pB1, pB2] = productIds;

  // Reels: reel1 = creator A → vendor A only
  //        reel2 = creator B → vendor B only
  //        reel3 = creator A → vendor A + vendor B (multi-vendor)
  const baseReel = {
    video_provider: "cloudflare_stream",
    video_duration_seconds: 30,
    video_width: 1080,
    video_height: 1920,
    language_code: "en",
    status: ReelStatus.approved,
  };
  const r1 = await reelRepo.save(
    reelRepo.create({
      ...baseReel,
      user_id: creatorAId,
      video_asset_id: `adash-r1-${unique}`,
      video_playback_url: "https://cf/r1.m3u8",
      thumbnail_url: "https://cf/r1-thumb.jpg",
      caption: "Creator A reel — vendor A only",
      published_at: isoAt(1, 6),
    }),
  );
  const r2 = await reelRepo.save(
    reelRepo.create({
      ...baseReel,
      user_id: creatorBId,
      video_asset_id: `adash-r2-${unique}`,
      video_playback_url: "https://cf/r2.m3u8",
      thumbnail_url: "https://cf/r2-thumb.jpg",
      caption: "Creator B reel — vendor B only",
      published_at: isoAt(1, 6),
    }),
  );
  const r3 = await reelRepo.save(
    reelRepo.create({
      ...baseReel,
      user_id: creatorAId,
      video_asset_id: `adash-r3-${unique}`,
      video_playback_url: "https://cf/r3.m3u8",
      thumbnail_url: "https://cf/r3-thumb.jpg",
      caption: "Creator A reel — multi-vendor",
      published_at: isoAt(1, 6),
    }),
  );
  reel1Id = r1.id;
  reel2Id = r2.id;
  reel3Id = r3.id;

  // Tags
  await reelTagRepo.save([
    reelTagRepo.create({ reel_id: reel1Id, product_id: pA1, timestamp_seconds: "5.00" }),
    reelTagRepo.create({ reel_id: reel1Id, product_id: pA2, timestamp_seconds: "10.00" }),
    reelTagRepo.create({ reel_id: reel2Id, product_id: pB1, timestamp_seconds: "5.00" }),
    reelTagRepo.create({ reel_id: reel3Id, product_id: pA3, timestamp_seconds: "5.00" }),
    reelTagRepo.create({ reel_id: reel3Id, product_id: pB2, timestamp_seconds: "10.00" }),
  ]);

  // Views across today-1 and today-2 (dates that the rollup job rebuilds).
  // The `viewed_at` column is @CreateDateColumn — TypeORM respects an
  // explicit value if you pass one, but to be safe we use raw INSERTs.
  const viewPairs: Array<[string, string, number]> = [
    // [userId, reelId, daysAgo]
    [buyerAId, reel1Id, 1],
    [buyerBId, reel1Id, 1],
    [buyerAId, reel2Id, 1],
    [buyerBId, reel3Id, 1],
    [buyerAId, reel3Id, 2],
    [buyerBId, reel2Id, 2],
  ];
  for (const [uid, rid, daysAgo] of viewPairs) {
    await AppDataSource.query(
      `INSERT INTO reel_views
        (user_id, reel_id, viewed_at, watch_duration_seconds, completion_percentage, device_type)
       VALUES ($1, $2, $3, 30, 0.9, 'web_desktop')
       ON CONFLICT (user_id, reel_id) DO NOTHING`,
      [uid, rid, isoAt(daysAgo, 14)],
    );
  }

  // Likes + saves (all on today-1).
  await AppDataSource.query(
    `INSERT INTO reel_likes (reel_id, user_id, liked_at) VALUES
      ($1, $2, $5), ($3, $4, $5)
     ON CONFLICT (reel_id, user_id) DO NOTHING`,
    [reel1Id, buyerAId, reel3Id, buyerBId, isoAt(1, 15)],
  );
  await AppDataSource.query(
    `INSERT INTO reel_saves (reel_id, user_id, saved_at) VALUES
      ($1, $2, $3)
     ON CONFLICT (reel_id, user_id) DO NOTHING`,
    [reel1Id, buyerBId, isoAt(1, 16)],
  );

  // Attributions (today-1). Parent table is range-partitioned on tapped_at;
  // fresh (today-1) falls into an open partition by migration convention.
  const attributionSpecs = [
    { reelId: reel1Id, productId: pA1, creatorId: creatorAId, userId: buyerAId, daysAgo: 1 },
    { reelId: reel2Id, productId: pB1, creatorId: creatorBId, userId: buyerAId, daysAgo: 1 },
    { reelId: reel3Id, productId: pA3, creatorId: creatorAId, userId: buyerBId, daysAgo: 1 },
    { reelId: reel3Id, productId: pB2, creatorId: creatorAId, userId: buyerBId, daysAgo: 1 },
    // One extra tap that will back a paid_out commission on today-2
    { reelId: reel1Id, productId: pA2, creatorId: creatorAId, userId: buyerBId, daysAgo: 2 },
  ];
  for (const a of attributionSpecs) {
    const tappedAt = isoAt(a.daysAgo, 12);
    const expiresAt = new Date(tappedAt);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
    const rows: { id: string }[] = await AppDataSource.query(
      `INSERT INTO reel_attributions
        (user_id, reel_id, product_id, creator_id, tapped_at, expires_at, attribution_window_days_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, 30)
       RETURNING id`,
      [a.userId, a.reelId, a.productId, a.creatorId, tappedAt, expiresAt],
    );
    attributionIds.push(rows[0].id);
  }

  // Orders + vendor_orders + order_items. We need a real order per commission
  // row so the FK reel_commissions.order_id resolves. Five orders total.
  const orderSpecs = [
    // [buyerUserId, vendorId, productIdx, price, status]
    { buyerId: buyerAId, vendorId: vendorAId, productIdx: 0, price: 10000 }, // commission pending
    { buyerId: buyerAId, vendorId: vendorBId, productIdx: 3, price: 20000 }, // commission earned
    { buyerId: buyerBId, vendorId: vendorAId, productIdx: 2, price: 8000 }, // commission voided
    { buyerId: buyerBId, vendorId: vendorBId, productIdx: 4, price: 12000 }, // commission earned
    { buyerId: buyerBId, vendorId: vendorAId, productIdx: 1, price: 15000 }, // commission paid_out (today-2)
  ];

  for (let i = 0; i < orderSpecs.length; i++) {
    const spec = orderSpecs[i];
    const orderRepo = AppDataSource.getRepository(Order);
    const vendorOrderRepo = AppDataSource.getRepository(VendorOrder);
    const itemRepo = AppDataSource.getRepository(OrderItem);

    const o = await orderRepo.save(
      orderRepo.create({
        order_number: `ADASH-${unique}-${i}`,
        user_id: spec.buyerId,
        status: OrderStatus.confirmed,
        subtotal: spec.price,
        grand_total: spec.price,
        currency: "AED",
        shipping_address: { line1: "T", city: "Dubai", country: "AE" },
      }),
    );
    orderIds.push(o.id);

    const vo = await vendorOrderRepo.save(
      vendorOrderRepo.create({
        order_id: o.id,
        vendor_id: spec.vendorId,
        vendor_order_number: `ADASHV-${unique}-${i}`,
        status: OrderStatus.confirmed,
        subtotal: spec.price,
        vendor_total: spec.price,
        currency: "AED",
      }),
    );
    vendorOrderIds.push(vo.id);

    const item = await itemRepo.save(
      itemRepo.create({
        order_id: o.id,
        vendor_order_id: vo.id,
        vendor_id: spec.vendorId,
        product_id: productIds[spec.productIdx],
        product_name: `P-${spec.productIdx}`,
        quantity: 1,
        unit_price: spec.price,
        line_total: spec.price,
        status: OrderStatus.confirmed,
      }),
    );
    orderItemIds.push(item.id);
  }

  // Commissions — one per order, covering all four status branches.
  // created_at is explicitly set so the rollup's ::date filter hits the
  // right bucket. We use raw SQL because TypeORM's @CreateDateColumn
  // silently drops explicit values on save() in some versions.
  const commissionSpecs: Array<{
    orderIdx: number;
    reelId: string;
    creatorId: string;
    vendorId: string;
    productIdx: number;
    status: ReelCommissionStatus;
    attributionIdx: number;
    daysAgo: number;
  }> = [
    // pending → counted in attributedGmv but not in earnedCommission
    {
      orderIdx: 0,
      reelId: reel1Id,
      creatorId: creatorAId,
      vendorId: vendorAId,
      productIdx: 0,
      status: ReelCommissionStatus.pending,
      attributionIdx: 0,
      daysAgo: 1,
    },
    // earned → counted in both
    {
      orderIdx: 1,
      reelId: reel2Id,
      creatorId: creatorBId,
      vendorId: vendorBId,
      productIdx: 3,
      status: ReelCommissionStatus.earned,
      attributionIdx: 1,
      daysAgo: 1,
    },
    // voided → excluded from attributed totals entirely
    {
      orderIdx: 2,
      reelId: reel3Id,
      creatorId: creatorAId,
      vendorId: vendorAId,
      productIdx: 2,
      status: ReelCommissionStatus.voided,
      attributionIdx: 2,
      daysAgo: 1,
    },
    // earned on multi-vendor reel
    {
      orderIdx: 3,
      reelId: reel3Id,
      creatorId: creatorAId,
      vendorId: vendorBId,
      productIdx: 4,
      status: ReelCommissionStatus.earned,
      attributionIdx: 3,
      daysAgo: 1,
    },
    // paid_out on today-2
    {
      orderIdx: 4,
      reelId: reel1Id,
      creatorId: creatorAId,
      vendorId: vendorAId,
      productIdx: 1,
      status: ReelCommissionStatus.paid_out,
      attributionIdx: 4,
      daysAgo: 2,
    },
  ];

  for (const c of commissionSpecs) {
    const orderId = orderIds[c.orderIdx];
    const orderItemId = orderItemIds[c.orderIdx];
    const productId = productIds[c.productIdx];
    const price = orderSpecs[c.orderIdx].price;
    const rate = 0.05;
    const gross = Math.round(price * rate);
    const platformShare = Math.round(gross * 0.5);
    const vendorShare = gross - platformShare;
    const createdAt = isoAt(c.daysAgo, 18);
    const earnedAt =
      c.status === ReelCommissionStatus.earned || c.status === ReelCommissionStatus.paid_out
        ? new Date(createdAt.getTime() + 60 * 1000)
        : null;

    const rows: { id: string }[] = await AppDataSource.query(
      `INSERT INTO reel_commissions
        (creator_id, reel_id, attribution_id, order_id, order_item_id, vendor_id, product_id,
         item_price_fils, commission_rate_snapshot, subsidy_share_snapshot,
         gross_commission_fils, vendor_share_fils, platform_subsidy_fils,
         status, eligible_at, earned_at, voided_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        c.creatorId,
        c.reelId,
        attributionIds[c.attributionIdx],
        orderId,
        orderItemId,
        c.vendorId,
        productId,
        price,
        rate.toString(),
        "0.5000",
        gross,
        vendorShare,
        platformShare,
        c.status,
        earnedAt,
        earnedAt,
        c.status === ReelCommissionStatus.voided ? "full_refund" : null,
        createdAt,
      ],
    );
    commissionIds.push(rows[0].id);
  }
}

async function cleanup(): Promise<void> {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch((err) =>
      console.warn("[adash.cleanup] ignored:", (err as Error).message),
    );

  // Order matters: child rows before parents. Rollup tables + attributions +
  // event tables cascade cleanly via bucket filter. Commission → orders →
  // vendors → products → users.
  if (commissionIds.length) {
    await q("DELETE FROM reel_commissions WHERE id = ANY($1::uuid[])", [commissionIds]);
  }
  if (attributionIds.length) {
    await q("DELETE FROM reel_attributions WHERE id = ANY($1::uuid[])", [attributionIds]);
  }
  if (reel1Id || reel2Id || reel3Id) {
    const rids = [reel1Id, reel2Id, reel3Id].filter(Boolean);
    await q("DELETE FROM reel_views  WHERE reel_id = ANY($1::uuid[])", [rids]);
    await q("DELETE FROM reel_likes  WHERE reel_id = ANY($1::uuid[])", [rids]);
    await q("DELETE FROM reel_saves  WHERE reel_id = ANY($1::uuid[])", [rids]);
    await q("DELETE FROM reel_product_tags WHERE reel_id = ANY($1::uuid[])", [rids]);
    await q("DELETE FROM daily_reel_metrics WHERE reel_id = ANY($1::uuid[])", [rids]);
    await q("DELETE FROM reels WHERE id = ANY($1::uuid[])", [rids]);
  }
  if (orderIds.length) {
    await q("DELETE FROM order_items   WHERE order_id = ANY($1::uuid[])", [orderIds]);
    await q("DELETE FROM vendor_orders WHERE order_id = ANY($1::uuid[])", [orderIds]);
    await q("DELETE FROM orders        WHERE id       = ANY($1::uuid[])", [orderIds]);
  }
  if (productIds.length) {
    await q("DELETE FROM products WHERE id = ANY($1::uuid[])", [productIds]);
  }
  if (categoryId) {
    await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  }
  // Creator + vendor rollups keyed on user/vendor ids we created — drop by id.
  const creatorIds = [creatorAId, creatorBId].filter(Boolean);
  if (creatorIds.length) {
    await q("DELETE FROM daily_creator_metrics WHERE creator_id = ANY($1::uuid[])", [creatorIds]);
    await q("UPDATE users SET wallet_balance = 0 WHERE id = ANY($1::uuid[])", [creatorIds]);
    await q("DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])", [creatorIds]);
  }
  const vendorIds = [vendorAId, vendorBId].filter(Boolean);
  if (vendorIds.length) {
    await q("DELETE FROM daily_vendor_reel_metrics WHERE vendor_id = ANY($1::uuid[])", [vendorIds]);
    await q("DELETE FROM vendors WHERE id = ANY($1::uuid[])", [vendorIds]);
  }
  const userIds = [
    buyerAId,
    buyerBId,
    creatorAId,
    creatorBId,
    superAdminId,
    customerUserId,
    vendorUserAId,
    vendorUserBId,
  ].filter(Boolean);
  for (const uid of userIds) {
    await q("DELETE FROM users WHERE id = $1", [uid]);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────
describeLive("admin analytics dashboard integration", () => {
  let adminToken = "";
  let customerToken = "";

  beforeAll(async () => {
    await ensureDatabase();
    await seedFixtures();

    // Phase 2: seed the in-process permission matrix. The admin routes in
    // this suite don't go through `vendorMembership`, but we seed it anyway
    // for parity with the vendor-dashboard suite — harmless no-op for these
    // endpoints, defensive against future tests that touch vendor routes.
    permissionMatrix.__setMapForTests([{ role: "owner", permission: "analytics.read" }]);

    // Run the rollup job against today (14-day window); this populates
    // daily_reel_metrics, daily_creator_metrics, daily_vendor_reel_metrics.
    const job = new RecomputeDailyRollupsJob();
    const res = await job.runOnce(todayDate);
    expect(res.failed).toEqual([]);
    // Close the BullMQ queue connection the constructor opened (lazy, but
    // ioredis keeps the connection pool alive otherwise).
    await job.stop();

    const sign = await makeSigner();
    adminToken = await sign({
      userId: superAdminId,
      email: `adash-super-${unique}@test.local`,
      role: "super_admin",
    });
    customerToken = await sign({
      userId: customerUserId,
      email: `adash-customer-${unique}@test.local`,
      role: "customer",
    });
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  // Loose shape for response envelopes — the routes are typed as `any` on the
  // handler return to avoid Elysia-typebox friction; asserting structurally here.
  type ApiEnvelope = {
    statusCode: number;
    data: {
      kpis?: Record<string, { value: number }>;
      timeseries?: Array<Record<string, number | string>>;
      funnel?: Record<string, number>;
      rows?: Array<Record<string, unknown>>;
      asOf?: string;
    };
  };

  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, init));

  const authed = (path: string, token: string) =>
    call(path, { headers: { Authorization: `Bearer ${token}` } });

  it("GET /admin/reels/analytics/overview?period=7d returns populated KPIs", async () => {
    const res = await authed("/admin/reels/analytics/overview?period=7d", adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiEnvelope;
    expect(body.statusCode).toBe(200);
    const kpis = body.data.kpis!;
    expect(kpis.impressions.value).toBeGreaterThan(0);
    expect(kpis.attributedGmvFils.value).toBeGreaterThan(0);
    expect(kpis.earnedCommissionFils.value).toBeGreaterThan(0);
    expect(Array.isArray(body.data.timeseries)).toBe(true);
    expect(body.data.timeseries!.length).toBeGreaterThanOrEqual(1);
    expect(body.data.funnel).toHaveProperty("impressions");
    expect(body.data.funnel).toHaveProperty("taps");
    expect(body.data.funnel).toHaveProperty("orders");
    expect(body.data.funnel).toHaveProperty("earnedCommissions");
  });

  it("GET /admin/reels/analytics/overview without Authorization → 401", async () => {
    const res = await call("/admin/reels/analytics/overview");
    expect(res.status).toBe(401);
  });

  it("GET /admin/reels/analytics/overview with customer role → 403", async () => {
    const res = await authed("/admin/reels/analytics/overview", customerToken);
    expect(res.status).toBe(403);
  });

  it("each leaderboard type returns rows in correctly sorted order", async () => {
    const types = [
      "creators_commission",
      "creators_gmv",
      "reels_orders",
      "products_gmv",
      "vendors_gmv",
    ];
    for (const type of types) {
      const res = await authed(
        `/admin/reels/analytics/leaderboard?type=${type}&period=30d`,
        adminToken,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as ApiEnvelope;
      const rows = (body.data.rows ?? []) as Array<{ value: number }>;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThanOrEqual(0);
      for (let i = 1; i < rows.length; i++) {
        expect(Number(rows[i - 1].value)).toBeGreaterThanOrEqual(Number(rows[i].value));
      }
    }
  });

  it("GET /admin/reels/analytics/leaderboard.csv returns text/csv with AED-formatted currency", async () => {
    const res = await authed(
      "/admin/reels/analytics/leaderboard.csv?type=creators_commission&period=30d",
      adminToken,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const body = await res.text();
    const lines = body.split("\n");
    expect(lines[0]).toBe("id,label,sub_label,reels,orders,gmv_fils,value");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // The two currency columns (gmv_fils, value) should be rendered as "AED X.XX".
    const dataRows = lines.slice(1).filter((l) => l.length > 0);
    expect(dataRows.length).toBeGreaterThanOrEqual(1);
    const currencyCellRe = /AED \d+\.\d{2}/;
    const allRowsHaveCurrency = dataRows.every((row) => {
      // Extract the two trailing columns using a simple split — our seed data
      // contains no commas in labels, so CSV escaping isn't triggered here.
      const cols = row.split(",");
      return (
        currencyCellRe.test(cols[cols.length - 1]) && currencyCellRe.test(cols[cols.length - 2])
      );
    });
    expect(allRowsHaveCurrency).toBe(true);
  });

  it("vendor_id filter isolates reels_orders to reels tagging that vendor's products", async () => {
    const resAll = await authed(
      "/admin/reels/analytics/leaderboard?type=reels_orders&period=30d",
      adminToken,
    );
    const all = (await resAll.json()) as ApiEnvelope;
    const resFiltered = await authed(
      `/admin/reels/analytics/leaderboard?type=reels_orders&period=30d&vendor_id=${vendorAId}`,
      adminToken,
    );
    const filtered = (await resFiltered.json()) as ApiEnvelope;
    expect(resFiltered.status).toBe(200);

    const filteredIds = ((filtered.data.rows ?? []) as Array<{ id: string }>).map((r) => r.id);
    const allIds = ((all.data.rows ?? []) as Array<{ id: string }>).map((r) => r.id);
    expect(filteredIds.length).toBeLessThanOrEqual(allIds.length);
    // Every row that came back with vendor_id=A must correspond to a reel that
    // tags at least one vendor A product. reel1 (A-only) and reel3 (A+B) both
    // qualify; reel2 (B-only) must not appear.
    expect(filteredIds).not.toContain(reel2Id);
  });

  it("voided commissions are excluded from attributed totals", async () => {
    const res = await authed("/admin/reels/analytics/overview?period=7d", adminToken);
    const body = (await res.json()) as ApiEnvelope;
    const attributedOrders = body.data.kpis!.attributedOrders.value;

    // Ground truth: count distinct non-voided commission orders seeded.
    const rows: Array<{ count: string }> = await AppDataSource.query(
      `SELECT COUNT(DISTINCT order_id)::text AS count
         FROM reel_commissions
        WHERE id = ANY($1::uuid[]) AND status <> 'voided'`,
      [commissionIds],
    );
    const expected = Number(rows[0].count);
    expect(attributedOrders).toBe(expected);
  });
});
