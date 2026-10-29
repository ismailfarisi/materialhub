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
  ReelLicenseEscrowHold,
  ReelLicenseFundingSource,
  ReelLicenseGrant,
  ReelLicenseHoldStatus,
  ReelLicenseOffer,
  ReelLicenseOfferStatus,
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
import { LicensingService } from "../../src/domain/licensing/licensing.service.ts";
import { PayoutBalanceRail } from "../../src/domain/licensing/payout-balance-rail.ts";
import {
  FakeChargeGateway,
  StripeChargeRail,
} from "../../src/domain/licensing/stripe-charge-rail.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;
const unique = Date.now();

let vendorUserId = "";
let vendorId = "";
let creatorId = "";
let otherUserId = "";
let reelId = "";
let orderId = "";
let vendorOrderId = "";
let orderItemId = "";
let commissionId = "";
let categoryId = "";
let productId = "";
const createdOfferIds: string[] = [];

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
  return { vendorSigner, creatorSigner };
}

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
        email: `lic-${fn}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
  const [vUser, creator, other] = await Promise.all([
    mkUser("vowner"),
    mkUser("creator"),
    mkUser("other"),
  ]);
  vendorUserId = vUser.id;
  creatorId = creator.id;
  otherUserId = other.id;

  const vendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Lic Vendor ${unique}`,
      slug: `lic-vendor-${unique}`,
      business_name: "Lic Vendor",
      business_type: "retail",
      contact_email: `lic-vendor-${unique}@test.local`,
      contact_phone: "+971500000099",
      status: VendorStatus.approved,
    }),
  );
  vendorId = vendor.id;

  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: vendorId,
      user_id: vendorUserId,
      email: `lic-vowner-${unique}@test.local`,
      role: VendorMemberRole.owner,
      status: VendorMemberStatus.active,
      accepted_at: new Date(),
    }),
  );

  const reel = await reelRepo.save(
    reelRepo.create({
      user_id: creatorId,
      video_provider: "cloudflare_stream",
      video_duration_seconds: 30,
      video_width: 1080,
      video_height: 1920,
      language_code: "en",
      status: ReelStatus.approved,
      view_count: 5,
      like_count: 2,
      published_at: new Date(),
      video_asset_id: `lic-r1-${unique}`,
      video_playback_url: "https://cf/lic-r1.m3u8",
      thumbnail_url: "https://cf/lic-r1.jpg",
      caption: "license me",
    }),
  );
  reelId = reel.id;

  const cat = await categoryRepo.save(
    categoryRepo.create({ name: `Lic Cat ${unique}`, slug: `lic-cat-${unique}`, is_active: true }),
  );
  categoryId = cat.id;
  const product = await productRepo.save(
    productRepo.create({
      vendor_id: vendorId,
      category_id: cat.id,
      name: `Lic Product ${unique}`,
      slug: `lic-p-${unique}`,
      status: ProductStatus.approved,
      price: 100000,
      currency: "AED",
    }),
  );
  productId = product.id;

  // FK chain for the commissions row that grants vendor payout balance.
  const o = await AppDataSource.query(
    `INSERT INTO orders (order_number, user_id, status, subtotal, grand_total, currency, shipping_address, surcharge_total)
     VALUES ($1,$2,'confirmed',100000,100000,'AED','{"line1":"T","city":"Dubai","country":"AE"}', 0) RETURNING id`,
    [`LIC-${unique}-1`, creatorId],
  );
  orderId = o[0].id;
  const vo = await AppDataSource.query(
    `INSERT INTO vendor_orders (order_id, vendor_id, vendor_order_number, status, subtotal, vendor_total, currency)
     VALUES ($1,$2,$3,'confirmed',100000,100000,'AED') RETURNING id`,
    [orderId, vendorId, `LICV-${unique}-1`],
  );
  vendorOrderId = vo[0].id;
  const it = await AppDataSource.query(
    `INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, product_name, quantity, unit_price, line_total, status)
     VALUES ($1,$2,$3,$4,'P',1,100000,100000,'confirmed') RETURNING id`,
    [orderId, vendorOrderId, vendorId, productId],
  );
  orderItemId = it[0].id;

  // Vendor payout balance = SUM(vendor_earning WHERE status='pending') = 100000.
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
      vendor_earning: 100000,
      status: CommissionStatus.pending,
    }),
  );
  commissionId = commission.id;
}

async function cleanup() {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch(() => {});
  await q("DELETE FROM reel_license_grants WHERE offer_id = ANY($1::uuid[])", [createdOfferIds]);
  await q("DELETE FROM reel_license_escrow_holds WHERE offer_id = ANY($1::uuid[])", [
    createdOfferIds,
  ]);
  await q("DELETE FROM reel_license_offers WHERE id = ANY($1::uuid[])", [createdOfferIds]);
  await q("DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])", [
    [creatorId, otherUserId, vendorUserId],
  ]);
  await q("DELETE FROM commissions WHERE id = $1", [commissionId]);
  await q("DELETE FROM reels WHERE id = $1", [reelId]);
  await q("DELETE FROM order_items WHERE id = $1", [orderItemId]);
  await q("DELETE FROM vendor_orders WHERE id = $1", [vendorOrderId]);
  await q("DELETE FROM orders WHERE id = $1", [orderId]);
  await q("DELETE FROM products WHERE id = $1", [productId]);
  await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  await q("DELETE FROM vendor_members WHERE vendor_id = $1", [vendorId]);
  await q("DELETE FROM vendors WHERE id = $1", [vendorId]);
  await q("DELETE FROM users WHERE id = ANY($1::uuid[])", [[vendorUserId, creatorId, otherUserId]]);
}

describeLive("licensing escrow", () => {
  let vendorToken = "";
  let creatorToken = "";
  const fake = new FakeChargeGateway();
  let svc: LicensingService;

  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, init));
  const authed = (path: string, token: string, init: RequestInit = {}) =>
    call(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });

  const getBalance = async (userId: string): Promise<number> => {
    const u = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
    return u?.wallet_balance ?? 0;
  };

  beforeAll(async () => {
    await ensureDatabase();
    await seed();
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "analytics.read" },
      { role: "owner", permission: "payouts.read" },
      { role: "owner", permission: "bank.read" },
    ]);
    const { vendorSigner, creatorSigner } = makeSigners();
    vendorToken = await vendorSigner(vendorUserId, `lic-vowner-${unique}@test.local`, vendorId);
    creatorToken = await creatorSigner(creatorId, `lic-creator-${unique}@test.local`);

    const wallet = new CreatorWalletService();
    svc = new LicensingService(
      {
        [ReelLicenseFundingSource.payout_balance]: new PayoutBalanceRail(),
        [ReelLicenseFundingSource.stripe]: new StripeChargeRail(fake),
      },
      wallet,
    );
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  it("Case 1: stripe rail happy path — hold authorized, accept captures + grants + credits", async () => {
    const authBefore = fake.authorizations.length;
    const capBefore = fake.captures.length;

    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    expect(fake.authorizations.length).toBe(authBefore + 1);

    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);
    let hold = await holdRepo.findOne({ where: { offer_id: offer.id } });
    expect(hold).not.toBeNull();
    expect(hold?.status).toBe(ReelLicenseHoldStatus.held);
    expect(hold?.stripe_payment_intent_id?.startsWith("pi_fake_")).toBe(true);

    const balBefore = await getBalance(creatorId);

    const grant = await svc.acceptOffer(creatorId, offer.id);
    expect(fake.captures.length).toBe(capBefore + 1);

    hold = await holdRepo.findOne({ where: { offer_id: offer.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.captured);

    const grantRow = await AppDataSource.getRepository(ReelLicenseGrant).findOne({
      where: { offer_id: offer.id },
    });
    expect(grantRow).not.toBeNull();
    expect(grantRow?.gross_fils).toBe("50000");
    expect(grantRow?.platform_fee_fils).toBe("10000"); // round(50000 * 0.2)
    expect(grantRow?.creator_net_fils).toBe("40000");

    const txns = await AppDataSource.getRepository(WalletTransaction).find({
      where: { reference_type: "reels_license_grant", reference_id: grant.id },
    });
    expect(txns.length).toBe(1);
    expect(txns[0].amount).toBe(40000);

    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 40000);

    const offerRow = await AppDataSource.getRepository(ReelLicenseOffer).findOne({
      where: { id: offer.id },
    });
    expect(offerRow?.status).toBe(ReelLicenseOfferStatus.completed);
  });

  it("Case 4: below minimum -> HTTP 400 offer_below_minimum", async () => {
    const res = await authed("/vendor/reels/licensing/offers", vendorToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reel_id: reelId,
        amount_fils: 100,
        funding_source: "payout_balance",
        rights_scope: "in_platform",
      }),
    });
    expect(res.status).toBe(400);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("offer_below_minimum");
  });

  it("Case 3: insufficient payout balance -> HTTP 400 insufficient_payout_balance", async () => {
    // available = 100000 (seeded) - 0 captured so far; 200000 > 100000 -> reject.
    const res = await authed("/vendor/reels/licensing/offers", vendorToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reel_id: reelId,
        amount_fils: 200000,
        funding_source: "payout_balance",
        rights_scope: "in_platform",
      }),
    });
    expect(res.status).toBe(400);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("insufficient_payout_balance");
  });

  it("Case 2: payout-balance rail via HTTP — offer + accept credits exactly 24000", async () => {
    const createRes = await authed("/vendor/reels/licensing/offers", vendorToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reel_id: reelId,
        amount_fils: 30000,
        funding_source: "payout_balance",
        rights_scope: "in_platform",
      }),
    });
    expect(createRes.status).toBe(200);
    const createBody = (await createRes.json()) as any;
    expect(createBody.statusCode).toBe(201);
    const offerId2 = createBody.data.id as string;
    createdOfferIds.push(offerId2);

    const balBefore = await getBalance(creatorId);

    const acceptRes = await authed(
      `/me/creator/licensing/offers/${offerId2}/accept`,
      creatorToken,
      { method: "POST" },
    );
    expect(acceptRes.status).toBe(200);
    const acceptBody = (await acceptRes.json()) as any;
    const grant = acceptBody.data;
    expect(grant.creator_net_fils).toBe("24000"); // 30000 - 20%
    expect(grant.gross_fils).toBe("30000");
    expect(grant.platform_fee_fils).toBe("6000");

    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 24000);

    const hold = await AppDataSource.getRepository(ReelLicenseEscrowHold).findOne({
      where: { offer_id: offerId2 },
    });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.captured);
  });

  it("Case 8: available-balance netting reflects the captured payout-balance hold", async () => {
    const available = await new PayoutBalanceRail().availableFils(vendorId);
    expect(available).toBe(70000); // 100000 seeded - 30000 captured (case 2)
  });

  it("Case 5: stripe decline releases the hold, no grant, balance unchanged", async () => {
    const cancelsBefore = fake.cancels.length;
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    const balBefore = await getBalance(creatorId);
    await svc.declineOffer(creatorId, offer.id);
    expect(fake.cancels.length).toBe(cancelsBefore + 1);

    const hold = await AppDataSource.getRepository(ReelLicenseEscrowHold).findOne({
      where: { offer_id: offer.id },
    });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.released);

    const grant = await AppDataSource.getRepository(ReelLicenseGrant).findOne({
      where: { offer_id: offer.id },
    });
    expect(grant).toBeNull();

    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore);
  });

  it("Case 6: expiry sweep releases the hold and marks the offer expired", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    await AppDataSource.query(
      `UPDATE reel_license_offers SET expires_at = now() - interval '1 hour' WHERE id = $1`,
      [offer.id],
    );

    const n = await svc.expireDueOffers();
    expect(n).toBeGreaterThanOrEqual(1);

    const offerRow = await AppDataSource.getRepository(ReelLicenseOffer).findOne({
      where: { id: offer.id },
    });
    expect(offerRow?.status).toBe(ReelLicenseOfferStatus.expired);

    const hold = await AppDataSource.getRepository(ReelLicenseEscrowHold).findOne({
      where: { offer_id: offer.id },
    });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.released);
  });

  it("Case 7a: a non-owner accepting an offer is Forbidden", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    let threw = false;
    try {
      await svc.acceptOffer(otherUserId, offer.id);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // Clean up so the dangling pending offer doesn't leak into other counters.
    await svc.declineOffer(creatorId, offer.id);
  });

  it("Case 7b: double-accept does not credit twice and keeps a single wallet row", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    const grant = await svc.acceptOffer(creatorId, offer.id);
    const balAfterFirst = await getBalance(creatorId);

    let threw = false;
    try {
      await svc.acceptOffer(creatorId, offer.id);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const balAfterSecond = await getBalance(creatorId);
    expect(balAfterSecond).toBe(balAfterFirst);

    const txns = await AppDataSource.getRepository(WalletTransaction).find({
      where: { reference_type: "reels_license_grant", reference_id: grant.id },
    });
    expect(txns.length).toBe(1);
  });
});
