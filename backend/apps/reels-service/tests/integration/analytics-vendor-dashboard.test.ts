/**
 * End-to-end integration test for the vendor analytics dashboard (Task 11).
 *
 * Verifies vendor isolation — vendor A's numbers never leak into vendor B's
 * responses, and vice versa — plus empty-state for a fresh vendor, auth
 * guards (customer with no membership → 400, no token → 401), and the three
 * leaderboard types.
 *
 * Requires a live stack (same gating as the admin test):
 *   - Postgres reachable
 *   - Redis reachable (lazy; no connect happens unless the job is started)
 *
 * Run:
 *   cd backend/apps/reels-service
 *   REELS_LIVE_DB=1 bun test tests/integration/analytics-vendor-dashboard
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
import { Elysia } from "elysia";

import { app } from "../../src/app.ts";
import { RecomputeDailyRollupsJob } from "../../src/domain/analytics/jobs/recompute-daily-rollups.job.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

// ─── Token minting ────────────────────────────────────────────────────
// Phase 2 Route Migration: tokens are signed via the shared `signAccessToken`
// helper so the JWT carries the new `tv` (token_version) and `vm`
// (vendor memberships) claims that the `vendorMembership` guard reads.
type SignVendorOpts = {
  userId: string;
  email: string;
  vendorId: string;
};
type VendorSigner = (opts: SignVendorOpts) => Promise<string>;
type CustomerSigner = (opts: { userId: string; email: string }) => Promise<string>;

interface Signers {
  signVendor: VendorSigner;
  signCustomer: CustomerSigner;
}

async function makeSigners(): Promise<Signers> {
  const signerApp = new Elysia().use(
    jwtPlugin({
      name: "accessJwt",
      secret: config.jwt.accessSecret,
      alg: "HS256",
    }),
  );
  signerApp.compile();
  const decoratorBag = (signerApp as unknown as { decorator: Record<string, unknown> }).decorator;
  const accessJwt = decoratorBag.accessJwt as {
    sign: (p: Record<string, unknown>) => Promise<string>;
  };

  const signVendor: VendorSigner = (opts) =>
    signAccessToken(accessJwt, {
      id: opts.userId,
      email: opts.email,
      role: "customer",
      token_version: 1,
      memberships: [{ vid: opts.vendorId, r: "owner" }],
    });

  const signCustomer: CustomerSigner = (opts) =>
    signAccessToken(accessJwt, {
      id: opts.userId,
      email: opts.email,
      role: "customer",
      token_version: 1,
      memberships: [],
    });

  return { signVendor, signCustomer };
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
let customerUserId = "";
let vendorUserAId = "";
let vendorUserBId = "";
let vendorUserCId = "";
let vendorAId = "";
let vendorBId = "";
let vendorCId = "";
let categoryId = "";
const productIds: string[] = []; // [pA1, pA2, pA3, pB1, pB2, pC1]
let reel1Id = ""; // creator A → vendor A only
let reel2Id = ""; // creator B → vendor B only
let reel3Id = ""; // creator A → vendor A + vendor B (multi-vendor)
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

  // Users: 2 buyers, 2 creators, 1 plain customer, 3 vendor-owners (A, B, C).
  const [buyerA, buyerB, creatorA, creatorB, customerUser, vendorUserA, vendorUserB, vendorUserC] =
    await Promise.all([
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "BuyerA",
          email: `vdash-buyerA-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "BuyerB",
          email: `vdash-buyerB-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Ada",
          last_name: "Creator",
          email: `vdash-creatorA-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Bob",
          last_name: "Creator",
          email: `vdash-creatorB-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Plain",
          last_name: "Customer",
          email: `vdash-customer-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "OwnerA",
          email: `vdash-vendorA-user-${unique}@test.local`,
          password_hash: "x",
          // Phase 3a: vendor owners are customers with vendor_members owner row
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "OwnerB",
          email: `vdash-vendorB-user-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      ),
      userRepo.save(
        userRepo.create({
          first_name: "Vendor",
          last_name: "OwnerC",
          email: `vdash-vendorC-user-${unique}@test.local`,
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
  customerUserId = customerUser.id;
  vendorUserAId = vendorUserA.id;
  vendorUserBId = vendorUserB.id;
  vendorUserCId = vendorUserC.id;

  // Vendors — all enrolled in the reels program. C has NO reels activity.
  const [vendorA, vendorB, vendorC] = await Promise.all([
    vendorRepo.save(
      vendorRepo.create({
        user_id: vendorUserA.id,
        name: `Vendor Dash A ${unique}`,
        slug: `vdash-vendorA-${unique}`,
        business_name: "Vendor Dash A",
        business_type: "retail",
        contact_email: `vdash-vendorA-${unique}@test.local`,
        contact_phone: "+971500000011",
        status: VendorStatus.approved,
        reels_program_joined_at: new Date(),
        reels_commission_rate: "0.0500",
        reels_subsidy_ends_at: new Date(Date.now() + 60 * 86_400_000),
      }),
    ),
    vendorRepo.save(
      vendorRepo.create({
        user_id: vendorUserB.id,
        name: `Vendor Dash B ${unique}`,
        slug: `vdash-vendorB-${unique}`,
        business_name: "Vendor Dash B",
        business_type: "retail",
        contact_email: `vdash-vendorB-${unique}@test.local`,
        contact_phone: "+971500000012",
        status: VendorStatus.approved,
        reels_program_joined_at: new Date(),
        reels_commission_rate: "0.0500",
        reels_subsidy_ends_at: new Date(Date.now() + 60 * 86_400_000),
      }),
    ),
    vendorRepo.save(
      vendorRepo.create({
        user_id: vendorUserC.id,
        name: `Vendor Dash C ${unique}`,
        slug: `vdash-vendorC-${unique}`,
        business_name: "Vendor Dash C",
        business_type: "retail",
        contact_email: `vdash-vendorC-${unique}@test.local`,
        contact_phone: "+971500000013",
        status: VendorStatus.approved,
        reels_program_joined_at: new Date(),
        reels_commission_rate: "0.0500",
        reels_subsidy_ends_at: new Date(Date.now() + 60 * 86_400_000),
      }),
    ),
  ]);
  vendorAId = vendorA.id;
  vendorBId = vendorB.id;
  vendorCId = vendorC.id;

  // Category + products: 3 for vendor A, 2 for vendor B, 1 for vendor C (unused).
  const category = await categoryRepo.save(
    categoryRepo.create({
      name: `Vendor Dash Category ${unique}`,
      slug: `vdash-cat-${unique}`,
      is_active: true,
    }),
  );
  categoryId = category.id;

  const productSpecs = [
    { vendorId: vendorAId, suffix: "a1", price: 10000 }, // 0
    { vendorId: vendorAId, suffix: "a2", price: 15000 }, // 1
    { vendorId: vendorAId, suffix: "a3", price: 8000 }, // 2
    { vendorId: vendorBId, suffix: "b1", price: 20000 }, // 3
    { vendorId: vendorBId, suffix: "b2", price: 12000 }, // 4
    { vendorId: vendorCId, suffix: "c1", price: 9000 }, // 5 — no activity
  ];
  for (const spec of productSpecs) {
    const p = await productRepo.save(
      productRepo.create({
        vendor_id: spec.vendorId,
        category_id: category.id,
        name: `Vendor Dash Product ${spec.suffix}`,
        slug: `vdash-p-${spec.suffix}-${unique}`,
        status: ProductStatus.approved,
        price: spec.price,
        currency: "AED",
      }),
    );
    productIds.push(p.id);
  }
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
      video_asset_id: `vdash-r1-${unique}`,
      video_playback_url: "https://cf/vr1.m3u8",
      thumbnail_url: "https://cf/vr1-thumb.jpg",
      caption: "Creator A reel — vendor A only",
      published_at: isoAt(1, 6),
    }),
  );
  const r2 = await reelRepo.save(
    reelRepo.create({
      ...baseReel,
      user_id: creatorBId,
      video_asset_id: `vdash-r2-${unique}`,
      video_playback_url: "https://cf/vr2.m3u8",
      thumbnail_url: "https://cf/vr2-thumb.jpg",
      caption: "Creator B reel — vendor B only",
      published_at: isoAt(1, 6),
    }),
  );
  const r3 = await reelRepo.save(
    reelRepo.create({
      ...baseReel,
      user_id: creatorAId,
      video_asset_id: `vdash-r3-${unique}`,
      video_playback_url: "https://cf/vr3.m3u8",
      thumbnail_url: "https://cf/vr3-thumb.jpg",
      caption: "Creator A reel — multi-vendor A+B",
      published_at: isoAt(1, 6),
    }),
  );
  reel1Id = r1.id;
  reel2Id = r2.id;
  reel3Id = r3.id;

  // Tags: reel1→{pA1,pA2}, reel2→{pB1}, reel3→{pA3,pB2}.
  await reelTagRepo.save([
    reelTagRepo.create({ reel_id: reel1Id, product_id: pA1, timestamp_seconds: "5.00" }),
    reelTagRepo.create({ reel_id: reel1Id, product_id: pA2, timestamp_seconds: "10.00" }),
    reelTagRepo.create({ reel_id: reel2Id, product_id: pB1, timestamp_seconds: "5.00" }),
    reelTagRepo.create({ reel_id: reel3Id, product_id: pA3, timestamp_seconds: "5.00" }),
    reelTagRepo.create({ reel_id: reel3Id, product_id: pB2, timestamp_seconds: "10.00" }),
  ]);

  // Views — designed so vendor A and vendor B impression totals differ.
  // vendor A impressions come from reels tagging a vendor-A product (reels 1 & 3).
  // vendor B impressions come from reels 2 & 3.
  const viewPairs: Array<[string, string, number]> = [
    // [userId, reelId, daysAgo]
    [buyerAId, reel1Id, 1], // vendor A
    [buyerBId, reel1Id, 1], // vendor A
    [buyerAId, reel1Id, 2], // vendor A — extra impression so A > B
    [buyerAId, reel2Id, 1], // vendor B
    [buyerBId, reel3Id, 1], // vendor A + vendor B (multi-tag reel)
    [buyerAId, reel3Id, 2], // vendor A + vendor B
    [buyerBId, reel2Id, 2], // vendor B
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

  // Attributions (today-1 and today-2).
  const attributionSpecs = [
    // vendor A attributions
    { reelId: reel1Id, productId: pA1, creatorId: creatorAId, userId: buyerAId, daysAgo: 1 }, // 0
    { reelId: reel1Id, productId: pA2, creatorId: creatorAId, userId: buyerBId, daysAgo: 2 }, // 1
    { reelId: reel3Id, productId: pA3, creatorId: creatorAId, userId: buyerBId, daysAgo: 1 }, // 2
    // vendor B attributions
    { reelId: reel2Id, productId: pB1, creatorId: creatorBId, userId: buyerAId, daysAgo: 1 }, // 3
    { reelId: reel3Id, productId: pB2, creatorId: creatorAId, userId: buyerBId, daysAgo: 1 }, // 4
    // vendor A — voided attribution (exercises status <> 'voided' filter branch)
    { reelId: reel1Id, productId: pA1, creatorId: creatorAId, userId: buyerAId, daysAgo: 1 }, // 5
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

  // Orders + vendor_orders + order_items — one per commission to satisfy FKs.
  // Six commissions below.
  const orderSpecs = [
    // [buyerId, vendorId, productIdx, price]
    { buyerId: buyerAId, vendorId: vendorAId, productIdx: 0, price: 10000 }, // A — pending
    { buyerId: buyerBId, vendorId: vendorAId, productIdx: 1, price: 15000 }, // A — paid_out (today-2)
    { buyerId: buyerBId, vendorId: vendorAId, productIdx: 2, price: 8000 }, // A — earned (multi-vendor reel)
    { buyerId: buyerAId, vendorId: vendorBId, productIdx: 3, price: 20000 }, // B — earned
    { buyerId: buyerBId, vendorId: vendorBId, productIdx: 4, price: 12000 }, // B — earned (multi-vendor reel)
    { buyerId: buyerAId, vendorId: vendorAId, productIdx: 0, price: 10000 }, // A — voided
  ];

  for (let i = 0; i < orderSpecs.length; i++) {
    const spec = orderSpecs[i];
    const orderRepo = AppDataSource.getRepository(Order);
    const vendorOrderRepo = AppDataSource.getRepository(VendorOrder);
    const itemRepo = AppDataSource.getRepository(OrderItem);

    const o = await orderRepo.save(
      orderRepo.create({
        order_number: `VDASH-${unique}-${i}`,
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
        vendor_order_number: `VDASHV-${unique}-${i}`,
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

  // Commissions. Vendor A totals (attributedGmv across 3 non-voided rows):
  //   pA1(10000) + pA2(15000) + pA3(8000) = 33000 fils.
  // Vendor B totals (2 non-voided rows): pB1(20000) + pB2(12000) = 32000 fils.
  // Totals DIFFER → isolation assertions fire cleanly.
  const commissionSpecs: Array<{
    orderIdx: number;
    reelId: string;
    creatorId: string;
    vendorId: string;
    productIdx: number;
    status: ReelCommissionStatus;
    attributionIdx: number;
    daysAgo: number;
    voidedReason?: string | null;
  }> = [
    // Vendor A — pending
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
    // Vendor A — paid_out (today-2)
    {
      orderIdx: 1,
      reelId: reel1Id,
      creatorId: creatorAId,
      vendorId: vendorAId,
      productIdx: 1,
      status: ReelCommissionStatus.paid_out,
      attributionIdx: 1,
      daysAgo: 2,
    },
    // Vendor A — earned (multi-vendor reel; creator A drove it → appears in A's creators_promoting_me)
    {
      orderIdx: 2,
      reelId: reel3Id,
      creatorId: creatorAId,
      vendorId: vendorAId,
      productIdx: 2,
      status: ReelCommissionStatus.earned,
      attributionIdx: 2,
      daysAgo: 1,
    },
    // Vendor B — earned (driven by creator B)
    {
      orderIdx: 3,
      reelId: reel2Id,
      creatorId: creatorBId,
      vendorId: vendorBId,
      productIdx: 3,
      status: ReelCommissionStatus.earned,
      attributionIdx: 3,
      daysAgo: 1,
    },
    // Vendor B — earned (multi-vendor reel; driven by creator A)
    {
      orderIdx: 4,
      reelId: reel3Id,
      creatorId: creatorAId,
      vendorId: vendorBId,
      productIdx: 4,
      status: ReelCommissionStatus.earned,
      attributionIdx: 4,
      daysAgo: 1,
    },
    // Vendor A — voided (must be excluded from attributed_* metrics).
    {
      orderIdx: 5,
      reelId: reel1Id,
      creatorId: creatorAId,
      vendorId: vendorAId,
      productIdx: 0,
      status: ReelCommissionStatus.voided,
      attributionIdx: 5,
      daysAgo: 1,
      voidedReason: "customer_return",
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
        c.voidedReason ?? null,
        createdAt,
      ],
    );
    commissionIds.push(rows[0].id);
  }
}

async function cleanup(): Promise<void> {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch((err) =>
      console.warn("[vdash.cleanup] ignored:", (err as Error).message),
    );

  // Child → parent order.
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
  const creatorIds = [creatorAId, creatorBId].filter(Boolean);
  if (creatorIds.length) {
    await q("DELETE FROM daily_creator_metrics WHERE creator_id = ANY($1::uuid[])", [creatorIds]);
    await q("UPDATE users SET wallet_balance = 0 WHERE id = ANY($1::uuid[])", [creatorIds]);
    await q("DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])", [creatorIds]);
  }
  const vIds = [vendorAId, vendorBId, vendorCId].filter(Boolean);
  if (vIds.length) {
    await q("DELETE FROM daily_vendor_reel_metrics WHERE vendor_id = ANY($1::uuid[])", [vIds]);
    await q("DELETE FROM vendors WHERE id = ANY($1::uuid[])", [vIds]);
  }
  const userIds = [
    buyerAId,
    buyerBId,
    creatorAId,
    creatorBId,
    customerUserId,
    vendorUserAId,
    vendorUserBId,
    vendorUserCId,
  ].filter(Boolean);
  for (const uid of userIds) {
    await q("DELETE FROM users WHERE id = $1", [uid]);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────
describeLive("vendor analytics dashboard integration", () => {
  let vendorAToken = "";
  let vendorBToken = "";
  let vendorCToken = "";
  let customerToken = "";

  beforeAll(async () => {
    await ensureDatabase();
    await seedFixtures();

    // Phase 2: seed the in-process permission matrix so `owner` can read
    // analytics. The route guard checks the matrix per-request; without this
    // every authed call returns 403 INSUFFICIENT_VENDOR_PERMISSION.
    permissionMatrix.__setMapForTests([{ role: "owner", permission: "analytics.read" }]);

    const job = new RecomputeDailyRollupsJob();
    const res = await job.runOnce(todayDate);
    expect(res.failed).toEqual([]);
    await job.stop();

    const { signVendor, signCustomer } = await makeSigners();
    vendorAToken = await signVendor({
      userId: vendorUserAId,
      email: `vdash-vendorA-user-${unique}@test.local`,
      vendorId: vendorAId,
    });
    vendorBToken = await signVendor({
      userId: vendorUserBId,
      email: `vdash-vendorB-user-${unique}@test.local`,
      vendorId: vendorBId,
    });
    vendorCToken = await signVendor({
      userId: vendorUserCId,
      email: `vdash-vendorC-user-${unique}@test.local`,
      vendorId: vendorCId,
    });
    customerToken = await signCustomer({
      userId: customerUserId,
      email: `vdash-customer-${unique}@test.local`,
    });
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  type ApiEnvelope = {
    statusCode: number;
    data: {
      kpis?: Record<string, { value: number; deltaPct: number | null }>;
      timeseries?: Array<Record<string, number | string>>;
      rows?: Array<Record<string, unknown>>;
      asOf?: string;
    };
  };

  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, init));

  const authed = (path: string, token: string) =>
    call(path, { headers: { Authorization: `Bearer ${token}` } });

  const hit = async (path: string, token: string): Promise<ApiEnvelope> => {
    const res = await authed(path, token);
    expect(res.status).toBe(200);
    return (await res.json()) as ApiEnvelope;
  };

  it("vendor A overview returns non-zero KPIs scoped to vendor A", async () => {
    const body = await hit("/vendor/reels/analytics/overview?period=30d", vendorAToken);
    const kpis = body.data.kpis!;
    expect(kpis.impressions.value).toBeGreaterThan(0);
    expect(kpis.productTaps.value).toBeGreaterThan(0);
    expect(kpis.attributedOrders.value).toBeGreaterThan(0);
    expect(kpis.attributedGmvFils.value).toBeGreaterThan(0);
    expect(Array.isArray(body.data.timeseries)).toBe(true);
    expect(body.data.timeseries!.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.data.asOf).toBe("string");
  });

  it("vendor A overview excludes voided commissions from attributedGmvFils", async () => {
    // Ground truth: sum item_price_fils from reel_commissions directly, filtering
    // out voided rows — this is the same predicate the rollup job uses
    // (status <> 'voided'). If the dashboard's attributedGmvFils diverges from
    // this, the rollup/service is either including voided rows or double-
    // counting, and the test MUST flag it.
    const rows: Array<{ gmv: string | null }> = await AppDataSource.query(
      `SELECT COALESCE(SUM(item_price_fils), 0)::text AS gmv
         FROM reel_commissions
        WHERE vendor_id = $1
          AND status <> 'voided'`,
      [vendorAId],
    );
    const nonVoidedGmv = Number(rows[0]?.gmv ?? 0);
    // Sanity: ensure the seed actually inserted at least one voided row for
    // vendor A (otherwise this assertion is vacuous).
    const voidedRows: Array<{ n: string }> = await AppDataSource.query(
      "SELECT COUNT(*)::text AS n FROM reel_commissions WHERE vendor_id = $1 AND status = 'voided'",
      [vendorAId],
    );
    expect(Number(voidedRows[0]?.n ?? 0)).toBeGreaterThan(0);

    const body = await hit("/vendor/reels/analytics/overview?period=30d", vendorAToken);
    expect(body.data.kpis!.attributedGmvFils.value).toBe(nonVoidedGmv);
  });

  it("vendor A does NOT see vendor B's data (isolation)", async () => {
    const vA = await hit("/vendor/reels/analytics/overview?period=30d", vendorAToken);
    const vB = await hit("/vendor/reels/analytics/overview?period=30d", vendorBToken);

    // GMV totals must differ — seed values are 33000 fils (A) vs 32000 fils (B).
    expect(vA.data.kpis!.attributedGmvFils.value).not.toBe(vB.data.kpis!.attributedGmvFils.value);

    // Timeseries arrays must differ too (either by length or by value).
    const aTs = vA.data.timeseries ?? [];
    const bTs = vB.data.timeseries ?? [];
    expect(JSON.stringify(aTs)).not.toBe(JSON.stringify(bTs));

    // Cross-check via SQL: the per-vendor rollup rows are truly distinct.
    const aGmv = vA.data.kpis!.attributedGmvFils.value;
    const bGmv = vB.data.kpis!.attributedGmvFils.value;
    const groundTruth: Array<{ vendor_id: string; gmv: string }> = await AppDataSource.query(
      `SELECT vendor_id, SUM(attributed_gmv_fils)::text AS gmv
         FROM daily_vendor_reel_metrics
        WHERE vendor_id = ANY($1::uuid[])
        GROUP BY vendor_id`,
      [[vendorAId, vendorBId]],
    );
    const aTrue = Number(groundTruth.find((r) => r.vendor_id === vendorAId)?.gmv ?? 0);
    const bTrue = Number(groundTruth.find((r) => r.vendor_id === vendorBId)?.gmv ?? 0);
    expect(aGmv).toBe(aTrue);
    expect(bGmv).toBe(bTrue);
  });

  it("empty-state: fresh vendor C returns 200 with zeroed KPIs, empty timeseries, valid asOf", async () => {
    const res = await authed("/vendor/reels/analytics/overview?period=30d", vendorCToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiEnvelope;
    expect(body.statusCode).toBe(200);
    const kpis = body.data.kpis!;
    expect(kpis.impressions.value).toBe(0);
    expect(kpis.productTaps.value).toBe(0);
    expect(kpis.attributedOrders.value).toBe(0);
    expect(kpis.attributedGmvFils.value).toBe(0);
    expect(body.data.timeseries).toEqual([]);
    expect(typeof body.data.asOf).toBe("string");
    // asOf should be parseable as an ISO date.
    expect(Number.isNaN(Date.parse(body.data.asOf as string))).toBe(false);
  });

  it("customer JWT (no vendor memberships) → 400 MISSING_ACTIVE_VENDOR", async () => {
    // Phase 2: a customer-role token with empty `vm[]` is rejected by the
    // membership guard with 400 MISSING_ACTIVE_VENDOR (no active vendor).
    // The previous shape returned 403 from `vendorOwnership` because the
    // user had no `vendors` row; the new guard distinguishes the cases.
    const res = await authed("/vendor/reels/analytics/overview", customerToken);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("MISSING_ACTIVE_VENDOR");
  });

  it("no JWT → 401 on /vendor/reels/analytics/overview", async () => {
    // Phase 2: with `vendorMembership` replacing `vendorOwnership`, the
    // jwtAuth-set 401 is no longer overwritten downstream — a missing
    // token now consistently surfaces as 401 UNAUTHORIZED.
    const res = await call("/vendor/reels/analytics/overview");
    expect(res.status).toBe(401);
  });

  it("leaderboard type=my_products → vendor A's products only", async () => {
    const body = await hit(
      "/vendor/reels/analytics/leaderboard?type=my_products&period=30d",
      vendorAToken,
    );
    const rows = (body.data.rows ?? []) as Array<{ id: string }>;
    expect(rows.length).toBeGreaterThan(0);

    // Ground truth: every returned product.id must belong to vendor A.
    const ids = rows.map((r) => r.id);
    const ownershipRows: Array<{ id: string; vendor_id: string }> = await AppDataSource.query(
      "SELECT id, vendor_id FROM products WHERE id = ANY($1::uuid[])",
      [ids],
    );
    for (const r of ownershipRows) {
      expect(r.vendor_id).toBe(vendorAId);
    }
    expect(ownershipRows.length).toBe(ids.length);
  });

  it("leaderboard type=reels_tagging_me → includes reel1+reel3 for vendor A, excludes reel2", async () => {
    const body = await hit(
      "/vendor/reels/analytics/leaderboard?type=reels_tagging_me&period=30d",
      vendorAToken,
    );
    const rows = (body.data.rows ?? []) as Array<{ id: string }>;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(reel1Id);
    expect(ids).toContain(reel3Id);
    expect(ids).not.toContain(reel2Id); // vendor-B-only reel
  });

  it("leaderboard type=creators_promoting_me → non-empty for vendor A", async () => {
    const body = await hit(
      "/vendor/reels/analytics/leaderboard?type=creators_promoting_me&period=30d",
      vendorAToken,
    );
    const rows = (body.data.rows ?? []) as Array<{ id: string; value: number }>;
    expect(rows.length).toBeGreaterThan(0);
    // Creator A drove commissions for vendor A — must be in the list.
    const creatorIds = rows.map((r) => r.id);
    expect(creatorIds).toContain(creatorAId);
  });

  it("CSV download for vendor A — my_products → AED-formatted currency column", async () => {
    const res = await authed(
      "/vendor/reels/analytics/leaderboard.csv?type=my_products&period=30d",
      vendorAToken,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain('filename="my-reel-analytics-');

    const body = await res.text();
    const lines = body.split("\n");
    expect(lines[0]).toBe("id,label,reels,orders,value");
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const dataRows = lines.slice(1).filter((l) => l.length > 0);
    expect(dataRows.length).toBeGreaterThanOrEqual(1);
    const currencyCellRe = /AED \d+\.\d{2}/;
    // Last column ("value") is a currency column → must format as AED X.XX.
    const allHaveCurrency = dataRows.every((row) => {
      const cols = row.split(",");
      return currencyCellRe.test(cols[cols.length - 1]);
    });
    expect(allHaveCurrency).toBe(true);
  });
});
