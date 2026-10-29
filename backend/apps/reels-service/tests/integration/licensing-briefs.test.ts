import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt as jwtPlugin } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Category,
  Commission,
  CommissionStatus,
  CommissionType,
  Product,
  ProductStatus,
  Reel,
  ReelBrief,
  ReelBriefBid,
  ReelBriefBidStatus,
  ReelBriefEvent,
  ReelBriefEventType,
  ReelBriefStatus,
  ReelFeaturePlacement,
  ReelLicenseEscrowHold,
  ReelLicenseFundingSource,
  ReelLicenseHoldStatus,
  ReelLicenseRightsScope,
  ReelStatus,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorMember,
  VendorMemberRole,
  VendorMemberStatus,
  VendorStatus,
  WalletTransaction,
  ensureDatabase,
} from "@materialhub/database";
import { permissionMatrix, signAccessToken } from "@materialhub/guards";
import { Elysia } from "elysia";
import { app } from "../../src/app.ts";
import { CreatorWalletService } from "../../src/domain/commerce/creator-wallet.service.ts";
import { BriefService } from "../../src/domain/licensing/brief.service.ts";
import { FakeDownloadProvider } from "../../src/domain/licensing/download-provider.ts";
import { EscrowEngine } from "../../src/domain/licensing/escrow-engine.ts";
import { PayoutBalanceRail } from "../../src/domain/licensing/payout-balance-rail.ts";
import { RightsService } from "../../src/domain/licensing/rights.service.ts";
import {
  FakeChargeGateway,
  StripeChargeRail,
} from "../../src/domain/licensing/stripe-charge-rail.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;
// Unique suffix per run so reruns don't collide with leftover rows.
const unique = Date.now();

// Shared IDs populated in seed()
let vendorUserId = "";
let vendorId = "";
let creatorId = "";
let creator2Id = "";
let otherUserId = "";
let otherVendorUserId = "";
let otherVendorId = "";
let reelId = "";
let reel2Id = "";
let orderId = "";
let vendorOrderId = "";
let orderItemId = "";
let commissionId = "";
let categoryId = "";
let productId = "";

// Accumulated brief IDs for FK-safe teardown.
const createdBriefIds: string[] = [];

// ---------------------------------------------------------------------------
// Token helpers — identical to the 2a/2b/2c harnesses
// ---------------------------------------------------------------------------
function makeSigners() {
  const signerApp = new Elysia().use(
    jwtPlugin({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }),
  );
  signerApp.compile();
  const bag = (signerApp as unknown as { decorator: Record<string, unknown> }).decorator;
  const accessJwt = bag.accessJwt as { sign: (p: Record<string, unknown>) => Promise<string> };
  const vendorSigner = (userId: string, email: string, vid: string) =>
    signAccessToken(accessJwt, {
      id: userId,
      email,
      role: "customer",
      token_version: 1,
      memberships: [{ vid, r: "owner" }],
    });
  const creatorSigner = (userId: string, email: string) =>
    signAccessToken(accessJwt, {
      id: userId,
      email,
      role: "customer",
      token_version: 1,
      memberships: [],
    });
  // A viewer-role membership — holds payouts.read but NOT bank.read, so it may
  // read the licensing surface but must be rejected from fund-committing routes.
  const viewerSigner = (userId: string, email: string, vid: string) =>
    signAccessToken(accessJwt, {
      id: userId,
      email,
      role: "customer",
      token_version: 1,
      memberships: [{ vid, r: "viewer" }],
    });
  return { vendorSigner, creatorSigner, viewerSigner };
}

// ---------------------------------------------------------------------------
// Seed — users (two creators, two vendor owners, one "other" user), two
// vendors + memberships, two reels (one per creator), a category + product,
// and a commissions row that grants the vendor payout balance.
// ---------------------------------------------------------------------------
async function seed() {
  const userRepo = AppDataSource.getRepository(User);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const vendorMemberRepo = AppDataSource.getRepository(VendorMember);
  const reelRepo = AppDataSource.getRepository(Reel);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const commissionRepo = AppDataSource.getRepository(Commission);

  const mkUser = (fn: string) =>
    userRepo.save(
      userRepo.create({
        first_name: fn,
        last_name: "u",
        email: `brf-${fn}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
  const [vUser, creator, creator2, other, otherVUser] = await Promise.all([
    mkUser("vowner"),
    mkUser("creator"),
    mkUser("creator2"),
    mkUser("other"),
    mkUser("othervowner"),
  ]);
  vendorUserId = vUser.id;
  creatorId = creator.id;
  creator2Id = creator2.id;
  otherUserId = other.id;
  otherVendorUserId = otherVUser.id;

  const vendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Brf Vendor ${unique}`,
      slug: `brf-vendor-${unique}`,
      business_name: "Brf Vendor",
      business_type: "retail",
      contact_email: `brf-vendor-${unique}@test.local`,
      contact_phone: "+971500000066",
      status: VendorStatus.approved,
    }),
  );
  vendorId = vendor.id;

  const otherVendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Brf Other Vendor ${unique}`,
      slug: `brf-other-vendor-${unique}`,
      business_name: "Brf Other Vendor",
      business_type: "retail",
      contact_email: `brf-other-vendor-${unique}@test.local`,
      contact_phone: "+971500000065",
      status: VendorStatus.approved,
    }),
  );
  otherVendorId = otherVendor.id;

  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: vendorId,
      user_id: vendorUserId,
      email: `brf-vowner-${unique}@test.local`,
      role: VendorMemberRole.owner,
      status: VendorMemberStatus.active,
      accepted_at: new Date(),
    }),
  );
  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: otherVendorId,
      user_id: otherVendorUserId,
      email: `brf-othervowner-${unique}@test.local`,
      role: VendorMemberRole.owner,
      status: VendorMemberStatus.active,
      accepted_at: new Date(),
    }),
  );

  const mkReel = (creatorUserId: string, tag: string) =>
    reelRepo.save(
      reelRepo.create({
        user_id: creatorUserId,
        video_provider: "cloudflare_stream",
        video_duration_seconds: 30,
        video_width: 1080,
        video_height: 1920,
        language_code: "en",
        status: ReelStatus.approved,
        view_count: 5,
        like_count: 2,
        published_at: new Date(),
        video_asset_id: `brf-${tag}-${unique}`,
        video_playback_url: `https://cf/brf-${tag}.m3u8`,
        thumbnail_url: `https://cf/brf-${tag}.jpg`,
        caption: "deliver me",
      }),
    );
  const reel = await mkReel(creatorId, "r1");
  reelId = reel.id;
  const reel2 = await mkReel(creator2Id, "r2");
  reel2Id = reel2.id;

  const cat = await categoryRepo.save(
    categoryRepo.create({ name: `Brf Cat ${unique}`, slug: `brf-cat-${unique}`, is_active: true }),
  );
  categoryId = cat.id;
  const product = await productRepo.save(
    productRepo.create({
      vendor_id: vendorId,
      category_id: cat.id,
      name: `Brf Product ${unique}`,
      slug: `brf-p-${unique}`,
      status: ProductStatus.approved,
      price: 100000,
      currency: "AED",
    }),
  );
  productId = product.id;

  // FK chain for the commissions row that grants the vendor payout balance.
  const o = await AppDataSource.query(
    `INSERT INTO orders (order_number, user_id, status, subtotal, grand_total, currency, shipping_address, surcharge_total)
     VALUES ($1,$2,'confirmed',100000,100000,'AED','{"line1":"T","city":"Dubai","country":"AE"}', 0) RETURNING id`,
    [`BRF-${unique}-1`, creatorId],
  );
  orderId = o[0].id;
  const vo = await AppDataSource.query(
    `INSERT INTO vendor_orders (order_id, vendor_id, vendor_order_number, status, subtotal, vendor_total, currency)
     VALUES ($1,$2,$3,'confirmed',100000,100000,'AED') RETURNING id`,
    [orderId, vendorId, `BRFV-${unique}-1`],
  );
  vendorOrderId = vo[0].id;
  const it = await AppDataSource.query(
    `INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, product_name, quantity, unit_price, line_total, status)
     VALUES ($1,$2,$3,$4,'P',1,100000,100000,'confirmed') RETURNING id`,
    [orderId, vendorOrderId, vendorId, productId],
  );
  orderItemId = it[0].id;

  // Vendor payout balance = SUM(vendor_earning WHERE status='pending') = 1000000 (generous,
  // covers every payout-balance hold this suite places).
  const commission = await commissionRepo.save(
    commissionRepo.create({
      vendor_id: vendorId,
      order_id: orderId,
      vendor_order_id: vendorOrderId,
      order_item_id: orderItemId,
      commission_type: CommissionType.percentage,
      commission_rate: 20,
      item_total: 100000,
      commission_amount: 20000,
      vendor_earning: 1000000,
      status: CommissionStatus.pending,
    }),
  );
  commissionId = commission.id;
}

// ---------------------------------------------------------------------------
// Cleanup — FK-safe: grants → holds → events → bids → briefs → features/
// downloads → commissions → wallet txns → reels → vendor_members → vendors →
// users. Scope by the created brief IDs / specific seeded IDs.
// ---------------------------------------------------------------------------
async function cleanup() {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch(() => {});
  await q(
    "DELETE FROM reel_license_grants WHERE bid_id IN (SELECT id FROM reel_brief_bids WHERE brief_id = ANY($1::uuid[]))",
    [createdBriefIds],
  );
  await q(
    "DELETE FROM reel_license_escrow_holds WHERE bid_id IN (SELECT id FROM reel_brief_bids WHERE brief_id = ANY($1::uuid[]))",
    [createdBriefIds],
  );
  await q("DELETE FROM reel_brief_events WHERE brief_id = ANY($1::uuid[])", [createdBriefIds]);
  await q("DELETE FROM reel_brief_bids WHERE brief_id = ANY($1::uuid[])", [createdBriefIds]);
  await q("DELETE FROM reel_briefs WHERE id = ANY($1::uuid[])", [createdBriefIds]);
  await q("DELETE FROM reel_license_features WHERE reel_id = ANY($1::uuid[])", [[reelId, reel2Id]]);
  await q("DELETE FROM reel_license_downloads WHERE requested_by = ANY($1::uuid[])", [
    [vendorId, otherVendorId],
  ]);
  await q("DELETE FROM commissions WHERE id = $1", [commissionId]);
  await q("DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])", [
    [creatorId, creator2Id, otherUserId, vendorUserId, otherVendorUserId],
  ]);
  await q("DELETE FROM order_items WHERE id = $1", [orderItemId]);
  await q("DELETE FROM vendor_orders WHERE id = $1", [vendorOrderId]);
  await q("DELETE FROM orders WHERE id = $1", [orderId]);
  await q("DELETE FROM products WHERE id = $1", [productId]);
  await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  await q("DELETE FROM reels WHERE id = ANY($1::uuid[])", [[reelId, reel2Id]]);
  await q("DELETE FROM vendor_members WHERE vendor_id = ANY($1::uuid[])", [
    [vendorId, otherVendorId],
  ]);
  await q("DELETE FROM vendors WHERE id = ANY($1::uuid[])", [[vendorId, otherVendorId]]);
  await q("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    [vendorUserId, creatorId, creator2Id, otherUserId, otherVendorUserId],
  ]);
}

describeLive("licensing briefs (brief/bid)", () => {
  let vendorToken = "";
  let creatorToken = "";
  let viewerToken = "";
  const fake = new FakeChargeGateway();
  let service: BriefService;

  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, init));
  const authed = (path: string, token: string, init: RequestInit = {}) =>
    call(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });

  const getBalance = async (userId: string): Promise<number> => {
    const u = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
    return u?.wallet_balance ?? 0;
  };

  const openBrief = async (): Promise<string> => {
    const brief = await service.createBrief({
      vendorId,
      title: `Brief ${createdBriefIds.length}`,
      brief: "Make a great reel",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(brief.id);
    return brief.id;
  };

  beforeAll(async () => {
    await ensureDatabase();
    await seed();
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "analytics.read" },
      { role: "owner", permission: "payouts.read" },
      { role: "owner", permission: "bank.read" },
      // viewer mirrors the seeded matrix: payouts.read (read licensing) but NOT bank.read.
      { role: "viewer", permission: "payouts.read" },
    ]);
    const { vendorSigner, creatorSigner, viewerSigner } = makeSigners();
    vendorToken = await vendorSigner(vendorUserId, `brf-vowner-${unique}@test.local`, vendorId);
    creatorToken = await creatorSigner(creatorId, `brf-creator-${unique}@test.local`);
    viewerToken = await viewerSigner(otherUserId, `brf-viewer-${unique}@test.local`, vendorId);

    // Construct BriefService directly, mirroring the container wiring. The Stripe rail uses a
    // FakeChargeGateway so capture succeeds without hitting Stripe.
    const wallet = new CreatorWalletService();
    const rails = {
      [ReelLicenseFundingSource.payout_balance]: new PayoutBalanceRail(),
      [ReelLicenseFundingSource.stripe]: new StripeChargeRail(fake),
    };
    const escrow = new EscrowEngine(rails, wallet);
    service = new BriefService(escrow);
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Case 1: happy path on the payout-balance rail — full money path.
  // -------------------------------------------------------------------------
  it("Case 1: payout-balance happy path — accept holds 40000, approve grants net 32000 + credits creator", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "I'll shoot it");
    expect(bid.status).toBe(ReelBriefBidStatus.pending);

    const balBefore = await getBalance(creatorId);

    const accepted = await service.acceptBid(
      vendorId,
      briefId,
      bid.id,
      ReelLicenseFundingSource.payout_balance,
    );
    expect(accepted.status).toBe(ReelBriefBidStatus.accepted);
    expect(accepted.delivery_deadline_at).not.toBeNull();

    // A `held` hold for the bid exists with the bid amount.
    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);
    let hold = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(hold).not.toBeNull();
    expect(hold?.status).toBe(ReelLicenseHoldStatus.held);
    expect(hold?.amount_fils).toBe("40000");
    expect(hold?.funding_source).toBe(ReelLicenseFundingSource.payout_balance);

    // Brief is awarded, bid accepted.
    const briefAwarded = await AppDataSource.getRepository(ReelBrief).findOne({
      where: { id: briefId },
    });
    expect(briefAwarded?.status).toBe(ReelBriefStatus.awarded);
    expect(briefAwarded?.awarded_bid_id).toBe(bid.id);

    // Deliver.
    const delivered = await service.submitDelivery(creatorId, briefId, bid.id, reelId);
    expect(delivered.status).toBe(ReelBriefBidStatus.delivered);

    // Approve → grant with net 32000 (40000 − 20%).
    const grant = await service.approveDelivery(vendorId, briefId, bid.id);
    expect(grant.gross_fils).toBe("40000");
    expect(grant.platform_fee_fils).toBe("8000");
    expect(grant.creator_net_fils).toBe("32000");
    expect(grant.bid_id).toBe(bid.id);

    // Brief fulfilled, bid completed with grant_id set.
    const briefRow = await AppDataSource.getRepository(ReelBrief).findOne({
      where: { id: briefId },
    });
    expect(briefRow?.status).toBe(ReelBriefStatus.fulfilled);
    const bidRow = await AppDataSource.getRepository(ReelBriefBid).findOne({
      where: { id: bid.id },
    });
    expect(bidRow?.status).toBe(ReelBriefBidStatus.completed);
    expect(bidRow?.grant_id).toBe(grant.id);

    // Hold captured.
    hold = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.captured);

    // Creator wallet credited +32000 with exactly one txn for this grant.
    const txns = await AppDataSource.getRepository(WalletTransaction).find({
      where: { reference_type: "reels_license_grant", reference_id: grant.id },
    });
    expect(txns.length).toBe(1);
    expect(txns[0].amount).toBe(32000);
    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 32000);
  });

  // -------------------------------------------------------------------------
  // Case 2: the brief-sourced grant is a first-class reel_license_grant —
  // 2c rights delivery works on it.
  // -------------------------------------------------------------------------
  it("Case 2: 2c RightsService.pinFeature + listFeaturedReels work on a brief grant", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "again");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    await service.submitDelivery(creatorId, briefId, bid.id, reelId);
    const grant = await service.approveDelivery(vendorId, briefId, bid.id);

    const rights = new RightsService(new FakeDownloadProvider());
    const feature = await rights.pinFeature(vendorId, grant.id, {
      placement: ReelFeaturePlacement.storefront,
    });
    expect(feature.id).toBeDefined();

    const featured = await rights.listFeaturedReels({ vendorId });
    expect(featured.some((f) => f.feature_id === feature.id)).toBe(true);
    expect(featured.some((f) => f.video_playback_url === "https://cf/brf-r1.m3u8")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 3: auction multi-bid — accepting A leaves B pending; approving A
  // declines B.
  // -------------------------------------------------------------------------
  it("Case 3: two bids — accept A (B stays pending); approve A declines B", async () => {
    const briefId = await openBrief();
    const bidA = await service.placeBid(creatorId, briefId, 40000, "creator A");
    const bidB = await service.placeBid(creator2Id, briefId, 35000, "creator B");

    await service.acceptBid(vendorId, briefId, bidA.id, ReelLicenseFundingSource.payout_balance);

    const bidARow1 = await AppDataSource.getRepository(ReelBriefBid).findOne({
      where: { id: bidA.id },
    });
    const bidBRow1 = await AppDataSource.getRepository(ReelBriefBid).findOne({
      where: { id: bidB.id },
    });
    expect(bidARow1?.status).toBe(ReelBriefBidStatus.accepted);
    expect(bidBRow1?.status).toBe(ReelBriefBidStatus.pending);

    // Deliver A (creator A owns reelId) then approve — the auction is over.
    await service.submitDelivery(creatorId, briefId, bidA.id, reelId);
    await service.approveDelivery(vendorId, briefId, bidA.id);

    const bidBRow2 = await AppDataSource.getRepository(ReelBriefBid).findOne({
      where: { id: bidB.id },
    });
    expect(bidBRow2?.status).toBe(ReelBriefBidStatus.declined);
  });

  // -------------------------------------------------------------------------
  // Case 4: Stripe funding rail — accept authorizes, approve captures, net
  // credited.
  // -------------------------------------------------------------------------
  it("Case 4: stripe rail — accept holds via Stripe, approve captures, creator credited net", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 50000, "stripe rail");

    const authBefore = fake.authorizations.length;
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.stripe, "pm_test");
    expect(fake.authorizations.length).toBe(authBefore + 1);

    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);
    let hold = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.held);
    expect(hold?.funding_source).toBe(ReelLicenseFundingSource.stripe);
    expect(hold?.stripe_payment_intent_id?.startsWith("pi_fake_")).toBe(true);

    await service.submitDelivery(creatorId, briefId, bid.id, reelId);

    const capBefore = fake.captures.length;
    const balBefore = await getBalance(creatorId);
    const grant = await service.approveDelivery(vendorId, briefId, bid.id);
    expect(fake.captures.length).toBe(capBefore + 1);

    expect(grant.gross_fils).toBe("50000");
    expect(grant.creator_net_fils).toBe("40000"); // 50000 − 20%
    expect(grant.platform_fee_fils).toBe("10000");

    hold = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.captured);

    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 40000);
  });

  // -------------------------------------------------------------------------
  // Case 5: state guards.
  // -------------------------------------------------------------------------
  it("Case 5a: placeBid below the minimum throws amount_below_min", async () => {
    const briefId = await openBrief();
    let threw = false;
    try {
      await service.placeBid(creatorId, briefId, 100, "too low");
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("amount_below_min");
    }
    expect(threw).toBe(true);
  });

  it("Case 5a2: placeBid after bids_close_at throws bids_closed", async () => {
    const brief = await service.createBrief({
      vendorId,
      title: `Closed brief ${createdBriefIds.length}`,
      brief: "Auction already closed",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() - 1000),
    });
    createdBriefIds.push(brief.id);
    let threw = false;
    try {
      await service.placeBid(creatorId, brief.id, 40000, "too late");
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("bids_closed");
    }
    expect(threw).toBe(true);
  });

  it("Case 5b: placeBid on a non-open brief throws brief_not_open", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "first");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    // Brief is now awarded — a second bid must be rejected.
    let threw = false;
    try {
      await service.placeBid(creator2Id, briefId, 40000, "late");
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("brief_not_open");
    }
    expect(threw).toBe(true);
  });

  it("Case 5c: acceptBid on a non-pending bid throws bid_not_pending", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "accept me");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    // Brief is awarded; re-accepting the same bid fails (brief_not_open guards first).
    let threw = false;
    try {
      await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("brief_not_open");
    }
    expect(threw).toBe(true);
  });

  it("Case 5d: a second acceptBid on the same brief throws (brief_not_open)", async () => {
    const briefId = await openBrief();
    const bidA = await service.placeBid(creatorId, briefId, 40000, "A");
    const bidB = await service.placeBid(creator2Id, briefId, 35000, "B");
    await service.acceptBid(vendorId, briefId, bidA.id, ReelLicenseFundingSource.payout_balance);
    let threw = false;
    try {
      await service.acceptBid(vendorId, briefId, bidB.id, ReelLicenseFundingSource.payout_balance);
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/brief_not_open|23505/);
    }
    expect(threw).toBe(true);
  });

  it("Case 5e: submitDelivery before accept throws bid_not_accepted", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "pending bid");
    let threw = false;
    try {
      await service.submitDelivery(creatorId, briefId, bid.id, reelId);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("bid_not_accepted");
    }
    expect(threw).toBe(true);
  });

  it("Case 5f: submitDelivery with a reel not owned by the bidder throws reel_not_owned_by_creator", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "owns r1");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    // reel2Id is owned by creator2, not creatorId.
    let threw = false;
    try {
      await service.submitDelivery(creatorId, briefId, bid.id, reel2Id);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("reel_not_owned_by_creator");
    }
    expect(threw).toBe(true);
  });

  it("Case 5g: approveDelivery before delivery throws bid_not_delivered", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "accepted not delivered");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    let threw = false;
    try {
      await service.approveDelivery(vendorId, briefId, bid.id);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("bid_not_delivered");
    }
    expect(threw).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 6: 403s — wrong vendor / wrong creator.
  // -------------------------------------------------------------------------
  it("Case 6a: a different vendor accepting/approving gets not_your_brief", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "mine");

    let threwAccept = false;
    try {
      await service.acceptBid(
        otherVendorId,
        briefId,
        bid.id,
        ReelLicenseFundingSource.payout_balance,
      );
    } catch (e) {
      threwAccept = true;
      expect(String(e)).toContain("not_your_brief");
    }
    expect(threwAccept).toBe(true);

    // Take it to delivered with the rightful vendor so approve can be tested by the wrong one.
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    await service.submitDelivery(creatorId, briefId, bid.id, reelId);
    let threwApprove = false;
    try {
      await service.approveDelivery(otherVendorId, briefId, bid.id);
    } catch (e) {
      threwApprove = true;
      expect(String(e)).toContain("not_your_brief");
    }
    expect(threwApprove).toBe(true);
  });

  it("Case 6b: a different creator withdrawing/delivering gets not_your_bid", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "creator1 bid");

    let threwWithdraw = false;
    try {
      await service.withdrawBid(creator2Id, briefId, bid.id);
    } catch (e) {
      threwWithdraw = true;
      expect(String(e)).toContain("not_your_bid");
    }
    expect(threwWithdraw).toBe(true);

    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    let threwDeliver = false;
    try {
      await service.submitDelivery(creator2Id, briefId, bid.id, reel2Id);
    } catch (e) {
      threwDeliver = true;
      expect(String(e)).toContain("not_your_bid");
    }
    expect(threwDeliver).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 7: HTTP round-trip — vendor creates a brief, creator bids, vendor
  // reads the brief with the bid listed.
  // -------------------------------------------------------------------------
  it("Case 7: HTTP — POST brief (201), POST bid (201), GET brief lists the bid", async () => {
    const createRes = await authed("/vendor/reels/licensing/briefs", vendorToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "HTTP brief",
        brief: "Produce a reel via HTTP",
        rights_scope: "both",
        bids_close_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      }),
    });
    expect(createRes.status).toBe(200);
    const createBody = (await createRes.json()) as any;
    expect(createBody.statusCode).toBe(201);
    const briefId = createBody.data.id as string;
    createdBriefIds.push(briefId);

    const bidRes = await authed(`/me/creator/licensing/briefs/${briefId}/bids`, creatorToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount_fils: 40000, pitch: "http pitch" }),
    });
    expect(bidRes.status).toBe(200);
    const bidBody = (await bidRes.json()) as any;
    expect(bidBody.statusCode).toBe(201);
    const bidId = bidBody.data.id as string;

    const getRes = await authed(`/vendor/reels/licensing/briefs/${briefId}`, vendorToken);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.statusCode).toBe(200);
    expect(getBody.data.brief.id).toBe(briefId);
    expect(getBody.data.bids.some((b: { id: string }) => b.id === bidId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3b Case 1: revision loop keeps escrow held and still completes + pays.
  // -------------------------------------------------------------------------
  it("3b-1: reviseDelivery preserves the held escrow, loop completes, net 32000 credited", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "round 0");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);

    const balBefore = await getBalance(creatorId);
    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);
    const bidRepo = AppDataSource.getRepository(ReelBriefBid);

    await service.submitDelivery(creatorId, briefId, bid.id, reelId);

    // Vendor requests a revision.
    const revised = await service.reviseDelivery(vendorId, briefId, bid.id);
    expect(revised.status).toBe(ReelBriefBidStatus.revision_requested);
    expect(revised.delivery_round).toBe(1);

    const revisedRow = await bidRepo.findOne({ where: { id: bid.id } });
    expect(revisedRow?.status).toBe(ReelBriefBidStatus.revision_requested);
    expect(revisedRow?.delivery_round).toBe(1);
    expect(revisedRow?.delivery_deadline_at).not.toBeNull();
    expect((revisedRow?.delivery_deadline_at as Date).getTime()).toBeGreaterThan(Date.now());

    // The escrow hold is STILL held — revision did not release funds.
    const heldDuringRevision = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(heldDuringRevision?.status).toBe(ReelLicenseHoldStatus.held);

    // Creator re-delivers; bid goes back to delivered.
    const redelivered = await service.submitDelivery(creatorId, briefId, bid.id, reelId);
    expect(redelivered.status).toBe(ReelBriefBidStatus.delivered);

    // Approve completes the loop and pays out net.
    const grant = await service.approveDelivery(vendorId, briefId, bid.id);
    expect(grant.creator_net_fils).toBe("32000");

    const capturedHold = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(capturedHold?.status).toBe(ReelLicenseHoldStatus.captured);

    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 32000);
  });

  // -------------------------------------------------------------------------
  // 3b Case 2: rejectDelivery releases the hold, reopens the brief, and a
  // sibling bid is re-acceptable. Creator A is never credited.
  // -------------------------------------------------------------------------
  it("3b-2: rejectDelivery releases hold + reopens brief; sibling bid re-acceptable", async () => {
    const briefId = await openBrief();
    const bidA = await service.placeBid(creatorId, briefId, 40000, "creator A");
    const bidB = await service.placeBid(creator2Id, briefId, 50000, "creator B");

    const balABefore = await getBalance(creatorId);
    await service.acceptBid(vendorId, briefId, bidA.id, ReelLicenseFundingSource.payout_balance);
    await service.submitDelivery(creatorId, briefId, bidA.id, reelId);

    await service.rejectDelivery(vendorId, briefId, bidA.id, "not what we wanted");

    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);
    const bidRepo = AppDataSource.getRepository(ReelBriefBid);
    const briefRepo = AppDataSource.getRepository(ReelBrief);

    const bidARow = await bidRepo.findOne({ where: { id: bidA.id } });
    expect(bidARow?.status).toBe(ReelBriefBidStatus.rejected);

    const holdA = await holdRepo.findOne({ where: { bid_id: bidA.id } });
    expect(holdA?.status).toBe(ReelLicenseHoldStatus.released);

    const briefRow = await briefRepo.findOne({ where: { id: briefId } });
    expect(briefRow?.status).toBe(ReelBriefStatus.open);
    expect(briefRow?.awarded_bid_id).toBeNull();

    const bidBRow = await bidRepo.findOne({ where: { id: bidB.id } });
    expect(bidBRow?.status).toBe(ReelBriefBidStatus.pending);

    // Creator A's wallet was never credited — reserved funds returned to the vendor.
    expect(await getBalance(creatorId)).toBe(balABefore);

    // The brief reopened, so the sibling bid B is acceptable.
    await service.acceptBid(vendorId, briefId, bidB.id, ReelLicenseFundingSource.payout_balance);
    const holdB = await holdRepo.findOne({
      where: { bid_id: bidB.id, status: ReelLicenseHoldStatus.held },
    });
    expect(holdB).not.toBeNull();
    expect(holdB?.status).toBe(ReelLicenseHoldStatus.held);
  });

  // -------------------------------------------------------------------------
  // 3b Case 3: brief-window expiry sweep — a past, never-awarded brief expires;
  // a future open brief is untouched.
  // -------------------------------------------------------------------------
  it("3b-3: expireDueBriefs expires a past unawarded brief; leaves a future one open", async () => {
    const pastBrief = await service.createBrief({
      vendorId,
      title: `Past brief ${createdBriefIds.length}`,
      brief: "Window already lapsed",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() - 1000),
    });
    createdBriefIds.push(pastBrief.id);

    const futureBrief = await service.createBrief({
      vendorId,
      title: `Future brief ${createdBriefIds.length}`,
      brief: "Window still open",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(futureBrief.id);

    const result = await service.expireDueBriefs(new Date());
    expect(result.briefsExpired).toBeGreaterThanOrEqual(1);

    const briefRepo = AppDataSource.getRepository(ReelBrief);
    const pastRow = await briefRepo.findOne({ where: { id: pastBrief.id } });
    expect(pastRow?.status).toBe(ReelBriefStatus.expired);

    const futureRow = await briefRepo.findOne({ where: { id: futureBrief.id } });
    expect(futureRow?.status).toBe(ReelBriefStatus.open);

    const events = await AppDataSource.getRepository(ReelBriefEvent).find({
      where: { brief_id: pastBrief.id, event_type: ReelBriefEventType.brief_expired },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 3b Case 4: delivery-deadline expiry sweep — an accepted-but-undelivered bid
  // past its deadline is rejected, hold released, brief expired, creator not paid.
  // -------------------------------------------------------------------------
  it("3b-4: expireDueBriefs expires a lapsed delivery deadline; releases hold, no credit", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "will lapse");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);

    const balBefore = await getBalance(creatorId);
    const bidRepo = AppDataSource.getRepository(ReelBriefBid);
    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);

    // Force the delivery deadline into the past without submitting anything.
    await bidRepo.update({ id: bid.id }, { delivery_deadline_at: new Date(Date.now() - 1000) });

    const result = await service.expireDueBriefs(new Date());
    expect(result.deliveriesExpired).toBeGreaterThanOrEqual(1);

    const bidRow = await bidRepo.findOne({ where: { id: bid.id } });
    expect(bidRow?.status).toBe(ReelBriefBidStatus.rejected);

    const hold = await holdRepo.findOne({ where: { bid_id: bid.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.released);

    const briefRow = await AppDataSource.getRepository(ReelBrief).findOne({
      where: { id: briefId },
    });
    expect(briefRow?.status).toBe(ReelBriefStatus.expired);

    // Creator never credited — reserved funds released back to the vendor.
    expect(await getBalance(creatorId)).toBe(balBefore);

    const events = await AppDataSource.getRepository(ReelBriefEvent).find({
      where: { brief_id: briefId, event_type: ReelBriefEventType.delivery_expired },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 3b Case 5: revise/reject guards.
  // -------------------------------------------------------------------------
  it("3b-5a: revise/rejectDelivery on a still-accepted (undelivered) bid throws bid_not_delivered", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "accepted only");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);

    let threwRevise = false;
    try {
      await service.reviseDelivery(vendorId, briefId, bid.id);
    } catch (e) {
      threwRevise = true;
      expect(String(e)).toContain("bid_not_delivered");
    }
    expect(threwRevise).toBe(true);

    let threwReject = false;
    try {
      await service.rejectDelivery(vendorId, briefId, bid.id);
    } catch (e) {
      threwReject = true;
      expect(String(e)).toContain("bid_not_delivered");
    }
    expect(threwReject).toBe(true);
  });

  it("3b-5b: a different vendor revising/rejecting someone else's brief throws not_your_brief", async () => {
    const briefId = await openBrief();
    const bid = await service.placeBid(creatorId, briefId, 40000, "mine to deliver");
    await service.acceptBid(vendorId, briefId, bid.id, ReelLicenseFundingSource.payout_balance);
    await service.submitDelivery(creatorId, briefId, bid.id, reelId);

    let threwRevise = false;
    try {
      await service.reviseDelivery(otherVendorId, briefId, bid.id);
    } catch (e) {
      threwRevise = true;
      expect(String(e)).toContain("not_your_brief");
    }
    expect(threwRevise).toBe(true);

    let threwReject = false;
    try {
      await service.rejectDelivery(otherVendorId, briefId, bid.id);
    } catch (e) {
      threwReject = true;
      expect(String(e)).toContain("not_your_brief");
    }
    expect(threwReject).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3b Case 6: public board (HTTP, no auth) exposes safe fields and leaks no
  // bid/creator/vendor-id data.
  // -------------------------------------------------------------------------
  it("3b-6: GET /reels/briefs/open (no auth) returns sanitized board, leaks no bid/creator/vendor data", async () => {
    const board = await service.createBrief({
      vendorId,
      title: `Public board brief ${createdBriefIds.length}`,
      brief: "Hidden brief body that must not leak",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(board.id);

    // Place a bid so there IS bid data in the DB that could leak.
    const SECRET_AMOUNT = 73219;
    const SECRET_PITCH = "do-not-leak-this-pitch";
    await service.placeBid(creatorId, board.id, SECRET_AMOUNT, SECRET_PITCH);

    const res = await call("/reels/briefs/open");
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as any;
    expect(body.statusCode).toBe(200);

    const item = body.data.find((b: { id: string }) => b.id === board.id);
    expect(item).toBeDefined();
    expect(item.title).toBe(board.title);
    expect(item.rights_scope).toBe(ReelLicenseRightsScope.both);
    expect(item.bids_close_at).toBeDefined();
    expect(item.vendor_name).toBe(`Brf Vendor ${unique}`);
    expect(item.vendor_slug).toBe(`brf-vendor-${unique}`);

    // No sensitive bid / creator / vendor-internal data leaks.
    expect(text).not.toContain(String(SECRET_AMOUNT));
    expect(text).not.toContain(SECRET_PITCH);
    expect(text).not.toContain("creator_id");
    expect(text).not.toContain("amount_fils");
    expect(text).not.toContain("pitch");
    expect(text).not.toContain("vendor_id");
    expect(text).not.toContain("awarded_bid_id");
  });

  // -------------------------------------------------------------------------
  // 3c-2: listBidsForCreator returns only the creator's own bids, with titles.
  // -------------------------------------------------------------------------
  it("3c2: listBidsForCreator returns only the creator's own bids, with brief titles", async () => {
    const titleA = `Brief A 3c2 ${unique}`;
    const titleB = `Brief B 3c2 ${unique}`;
    const briefA = await service.createBrief({
      vendorId,
      title: titleA,
      brief: "Make a great reel A",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(briefA.id);
    const briefB = await service.createBrief({
      vendorId,
      title: titleB,
      brief: "Make a great reel B",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(briefB.id);

    await service.placeBid(creatorId, briefA.id, 40000, "A on A");
    await service.placeBid(creatorId, briefB.id, 45000, "A on B");
    await service.placeBid(creator2Id, briefA.id, 50000, "B on A");

    const mine = await service.listBidsForCreator(creatorId);
    const mineForThese = mine.filter((b) => b.brief_id === briefA.id || b.brief_id === briefB.id);
    expect(mineForThese.length).toBe(2);
    const titles = mineForThese.map((b) => b.brief_title).sort();
    expect(titles).toEqual([titleA, titleB].sort());
    const amountsOk = mineForThese.every(
      (b) => b.amount_fils === "40000" || b.amount_fils === "45000",
    );
    expect(amountsOk).toBe(true);
    const shapesOk = mineForThese.every(
      (b) => typeof b.bid_id === "string" && typeof b.status === "string",
    );
    expect(shapesOk).toBe(true);

    const other = await service.listBidsForCreator(creator2Id);
    const otherForThese = other.filter((b) => b.brief_id === briefA.id || b.brief_id === briefB.id);
    expect(otherForThese.length).toBe(1);
    expect(otherForThese[0].amount_fils).toBe("50000");
  });

  // -------------------------------------------------------------------------
  // 3c-2 HTTP: GET /me/creator/licensing/bids — 401 unauthenticated; authed as
  // a creator returns the envelope with ONLY that creator's bids (isolation
  // proven through the route, not just the service).
  // -------------------------------------------------------------------------
  it("3c2-http: GET /me/creator/licensing/bids — 401 unauth; authed creator sees only own bids", async () => {
    const titleA = `Brief A 3c2-http ${unique}`;
    const titleB = `Brief B 3c2-http ${unique}`;
    const briefA = await service.createBrief({
      vendorId,
      title: titleA,
      brief: "HTTP creator A reel A",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(briefA.id);
    const briefB = await service.createBrief({
      vendorId,
      title: titleB,
      brief: "HTTP creator A reel B",
      rightsScope: ReelLicenseRightsScope.both,
      bidsCloseAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    });
    createdBriefIds.push(briefB.id);

    // creator (creatorToken) bids on both; creator2 bids on briefA only.
    await service.placeBid(creatorId, briefA.id, 41000, "A on A http");
    await service.placeBid(creatorId, briefB.id, 46000, "A on B http");
    const otherBid = await service.placeBid(creator2Id, briefA.id, 50000, "B on A http");

    // (a) Unauthenticated request is rejected with 401.
    const unauthRes = await call("/me/creator/licensing/bids");
    expect(unauthRes.status).toBe(401);

    // (b) Authenticated as the creator — 200 envelope, only this creator's bids.
    const res = await authed("/me/creator/licensing/bids", creatorToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      statusCode: number;
      data: Array<{ bid_id: string; brief_id: string; brief_title: string; amount_fils: string }>;
    };
    expect(body.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);

    const mineForThese = body.data.filter(
      (b) => b.brief_id === briefA.id || b.brief_id === briefB.id,
    );
    expect(mineForThese.length).toBe(2);
    const titles = mineForThese.map((b) => b.brief_title).sort();
    expect(titles).toEqual([titleA, titleB].sort());

    // creator2's bid on briefA must NOT appear in creator's response (isolation).
    expect(body.data.some((b) => b.bid_id === otherBid.id)).toBe(false);
    expect(body.data.some((b) => b.brief_id === briefA.id && b.amount_fils === "50000")).toBe(
      false,
    );
  });

  it("hardening: a viewer (payouts.read, no bank.read) can read but is rejected from mutating routes", async () => {
    // (a) Read route is gated by payouts.read — a viewer holds it → 200.
    const readRes = await authed("/vendor/reels/licensing/briefs", viewerToken);
    expect(readRes.status).toBe(200);

    // (b) A fund-/deal-mutating route is gated by bank.read — a viewer lacks it → 403.
    const createRes = await authed("/vendor/reels/licensing/briefs", viewerToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Viewer should not create ${unique}`,
        brief: "blocked",
        rights_scope: ReelLicenseRightsScope.both,
        bids_close_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      }),
    });
    expect(createRes.status).toBe(403);
    const createBody = (await createRes.json()) as { error?: string };
    expect(createBody.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");

    // (c) Accepting a bid (captures vendor funds) is likewise blocked for the viewer.
    const acceptRes = await authed(
      `/vendor/reels/licensing/briefs/${createdBriefIds[0] ?? "00000000-0000-0000-0000-000000000000"}/bids/00000000-0000-0000-0000-000000000000/accept`,
      viewerToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funding_source: ReelLicenseFundingSource.payout_balance }),
      },
    );
    expect(acceptRes.status).toBe(403);
    const acceptBody = (await acceptRes.json()) as { error?: string };
    expect(acceptBody.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
  });
});
