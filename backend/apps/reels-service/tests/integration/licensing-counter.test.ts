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
// Use a unique suffix so reruns don't collide with leftover rows.
const unique = Date.now();

// Shared IDs populated in seed()
let vendorUserId = "";
let vendorId = "";
let creatorId = "";
let otherUserId = "";
let otherVendorUserId = "";
let otherVendorId = "";
let reelId = "";
let orderId = "";
let vendorOrderId = "";
let orderItemId = "";
let commissionId = "";
let categoryId = "";
let productId = "";
// Accumulated offer IDs for FK-safe teardown
const createdOfferIds: string[] = [];

// ---------------------------------------------------------------------------
// Token helpers — identical to 2a harness
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
  return { vendorSigner, creatorSigner };
}

// ---------------------------------------------------------------------------
// Seed — mirrors 2a, extended with an extra "other" vendor for 403 checks
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
        email: `cnt-${fn}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
  const [vUser, creator, other, otherVUser] = await Promise.all([
    mkUser("vowner"),
    mkUser("creator"),
    mkUser("other"),
    mkUser("othervowner"),
  ]);
  vendorUserId = vUser.id;
  creatorId = creator.id;
  otherUserId = other.id;
  otherVendorUserId = otherVUser.id;

  const vendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Cnt Vendor ${unique}`,
      slug: `cnt-vendor-${unique}`,
      business_name: "Cnt Vendor",
      business_type: "retail",
      contact_email: `cnt-vendor-${unique}@test.local`,
      contact_phone: "+971500000088",
      status: VendorStatus.approved,
    }),
  );
  vendorId = vendor.id;

  const otherVendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Cnt Other Vendor ${unique}`,
      slug: `cnt-other-vendor-${unique}`,
      business_name: "Cnt Other Vendor",
      business_type: "retail",
      contact_email: `cnt-other-vendor-${unique}@test.local`,
      contact_phone: "+971500000087",
      status: VendorStatus.approved,
    }),
  );
  otherVendorId = otherVendor.id;

  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: vendorId,
      user_id: vendorUserId,
      email: `cnt-vowner-${unique}@test.local`,
      role: VendorMemberRole.owner,
      status: VendorMemberStatus.active,
      accepted_at: new Date(),
    }),
  );
  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: otherVendorId,
      user_id: otherVendorUserId,
      email: `cnt-othervowner-${unique}@test.local`,
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
      video_asset_id: `cnt-r1-${unique}`,
      video_playback_url: "https://cf/cnt-r1.m3u8",
      thumbnail_url: "https://cf/cnt-r1.jpg",
      caption: "counter-offer me",
    }),
  );
  reelId = reel.id;

  const cat = await categoryRepo.save(
    categoryRepo.create({ name: `Cnt Cat ${unique}`, slug: `cnt-cat-${unique}`, is_active: true }),
  );
  categoryId = cat.id;
  const product = await productRepo.save(
    productRepo.create({
      vendor_id: vendorId,
      category_id: cat.id,
      name: `Cnt Product ${unique}`,
      slug: `cnt-p-${unique}`,
      status: ProductStatus.approved,
      price: 100000,
      currency: "AED",
    }),
  );
  productId = product.id;

  // FK chain for the commissions row: vendor payout balance = 100000.
  const o = await AppDataSource.query(
    `INSERT INTO orders (order_number, user_id, status, subtotal, grand_total, currency, shipping_address, surcharge_total)
     VALUES ($1,$2,'confirmed',100000,100000,'AED','{"line1":"T","city":"Dubai","country":"AE"}', 0) RETURNING id`,
    [`CNT-${unique}-1`, creatorId],
  );
  orderId = o[0].id;
  const vo = await AppDataSource.query(
    `INSERT INTO vendor_orders (order_id, vendor_id, vendor_order_number, status, subtotal, vendor_total, currency)
     VALUES ($1,$2,$3,'confirmed',100000,100000,'AED') RETURNING id`,
    [orderId, vendorId, `CNTV-${unique}-1`],
  );
  vendorOrderId = vo[0].id;
  const it = await AppDataSource.query(
    `INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, product_name, quantity, unit_price, line_total, status)
     VALUES ($1,$2,$3,$4,'P',1,100000,100000,'confirmed') RETURNING id`,
    [orderId, vendorOrderId, vendorId, productId],
  );
  orderItemId = it[0].id;

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

// ---------------------------------------------------------------------------
// Cleanup — FK-safe; mirrors 2a order, extended with events table
// ---------------------------------------------------------------------------
async function cleanup() {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch(() => {});
  await q("DELETE FROM reel_license_offer_events WHERE offer_id = ANY($1::uuid[])", [
    createdOfferIds,
  ]);
  await q("DELETE FROM reel_license_grants WHERE offer_id = ANY($1::uuid[])", [createdOfferIds]);
  await q("DELETE FROM reel_license_escrow_holds WHERE offer_id = ANY($1::uuid[])", [
    createdOfferIds,
  ]);
  await q("DELETE FROM reel_license_offers WHERE id = ANY($1::uuid[])", [createdOfferIds]);
  await q("DELETE FROM wallet_transactions WHERE user_id = ANY($1::uuid[])", [
    [creatorId, otherUserId, vendorUserId, otherVendorUserId],
  ]);
  await q("DELETE FROM commissions WHERE id = $1", [commissionId]);
  await q("DELETE FROM reels WHERE id = $1", [reelId]);
  await q("DELETE FROM order_items WHERE id = $1", [orderItemId]);
  await q("DELETE FROM vendor_orders WHERE id = $1", [vendorOrderId]);
  await q("DELETE FROM orders WHERE id = $1", [orderId]);
  await q("DELETE FROM products WHERE id = $1", [productId]);
  await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  await q("DELETE FROM vendor_members WHERE vendor_id = ANY($1::uuid[])", [
    [vendorId, otherVendorId],
  ]);
  await q("DELETE FROM vendors WHERE id = ANY($1::uuid[])", [[vendorId, otherVendorId]]);
  await q("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    [vendorUserId, creatorId, otherUserId, otherVendorUserId],
  ]);
}

describeLive("licensing counter-offer negotiation", () => {
  let vendorToken = "";
  let creatorToken = "";
  let otherVendorToken = "";
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
    vendorToken = await vendorSigner(vendorUserId, `cnt-vowner-${unique}@test.local`, vendorId);
    creatorToken = await creatorSigner(creatorId, `cnt-creator-${unique}@test.local`);
    otherVendorToken = await vendorSigner(
      otherVendorUserId,
      `cnt-othervowner-${unique}@test.local`,
      otherVendorId,
    );

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

  // -------------------------------------------------------------------------
  // Case 1: counter releases the hold (stripe, service-level)
  // -------------------------------------------------------------------------
  it("Case 1: counterOffer releases Stripe hold; offer status=countered with new amount", async () => {
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

    // Hold should exist in `held` state
    const holdRepo = AppDataSource.getRepository(ReelLicenseEscrowHold);
    let hold = await holdRepo.findOne({ where: { offer_id: offer.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.held);

    // Counter from creator side
    const countered = await svc.counterOffer(creatorId, offer.id, 40000);

    // Stripe cancel should have been called
    expect(fake.cancels.length).toBe(cancelsBefore + 1);

    // Hold must now be released
    hold = await holdRepo.findOne({ where: { offer_id: offer.id } });
    expect(hold?.status).toBe(ReelLicenseHoldStatus.released);

    // Offer state
    expect(countered.status).toBe(ReelLicenseOfferStatus.countered);
    expect(countered.amount_fils).toBe("40000");
    expect(countered.last_actor).toBe("creator");

    // Events: expect both a `released` and a `countered` event
    const events = await svc.listEvents(offer.id);
    const eventTypes = events.map((e) => e.event_type);
    expect(eventTypes).toContain("released");
    expect(eventTypes).toContain("countered");
  });

  // -------------------------------------------------------------------------
  // Case 2: accept-counter completes at countered price (payout-balance via HTTP)
  // -------------------------------------------------------------------------
  it("Case 2: accept-counter via HTTP — payout-balance, credits 40000 (50000 − 20%)", async () => {
    // Create offer via HTTP (vendor side)
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
    const offerId = createBody.data.id as string;
    createdOfferIds.push(offerId);

    // Creator counters via HTTP at 50000
    const counterRes = await authed(
      `/me/creator/licensing/offers/${offerId}/counter`,
      creatorToken,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount_fils: 50000 }),
      },
    );
    expect(counterRes.status).toBe(200);
    const counterBody = (await counterRes.json()) as any;
    expect(counterBody.data.status).toBe("countered");

    // Vendor accepts the counter via HTTP (payout-balance: no payment_method_id needed)
    const balBefore = await getBalance(creatorId);

    const acceptRes = await authed(
      `/vendor/reels/licensing/offers/${offerId}/accept-counter`,
      vendorToken,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(acceptRes.status).toBe(200);
    const acceptBody = (await acceptRes.json()) as any;
    const grant = acceptBody.data;

    // creator_net = 50000 − 20% = 40000 EXACTLY
    expect(grant.creator_net_fils).toBe("40000");
    expect(grant.gross_fils).toBe("50000");
    expect(grant.platform_fee_fils).toBe("10000");

    // Wallet balance must be exactly +40000
    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 40000);

    // A captured hold must exist (acceptCounter places a fresh hold then immediately captures it)
    const holds = await AppDataSource.getRepository(ReelLicenseEscrowHold).find({
      where: { offer_id: offerId },
    });
    const capturedHold = holds.find((h) => h.status === ReelLicenseHoldStatus.captured);
    expect(capturedHold).not.toBeNull();

    // Offer completed
    const offerRow = await AppDataSource.getRepository(ReelLicenseOffer).findOne({
      where: { id: offerId },
    });
    expect(offerRow?.status).toBe(ReelLicenseOfferStatus.completed);

    // Payout balance: 100000 (seeded) − 50000 (captured) = 50000
    const available = await new PayoutBalanceRail().availableFils(vendorId);
    expect(available).toBe(50000);
  });

  // -------------------------------------------------------------------------
  // Case 3: re-offer returns to pending_creator with new hold (stripe, service-level)
  // -------------------------------------------------------------------------
  it("Case 3: reOffer places new Stripe hold; then acceptOffer credits 36000 (45000 − 20%)", async () => {
    const authBefore = fake.authorizations.length;

    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);
    // createOffer adds 1 auth
    expect(fake.authorizations.length).toBe(authBefore + 1);

    // Creator counters
    await svc.counterOffer(creatorId, offer.id, 40000);

    // Vendor re-offers at 45000 — must place a fresh hold
    const authBeforeReoffer = fake.authorizations.length;
    const reoffered = await svc.reOffer(vendorId, offer.id, 45000, "pm_test");

    expect(fake.authorizations.length).toBe(authBeforeReoffer + 1);
    expect(reoffered.status).toBe(ReelLicenseOfferStatus.pending_creator);
    expect(reoffered.amount_fils).toBe("45000");
    expect(reoffered.last_actor).toBe("vendor");

    // New hold exists in `held` state for the new amount
    const holds = await AppDataSource.getRepository(ReelLicenseEscrowHold).find({
      where: { offer_id: offer.id },
    });
    const activeHold = holds.find((h) => h.status === ReelLicenseHoldStatus.held);
    expect(activeHold).not.toBeNull();
    expect(Number(activeHold?.amount_fils)).toBe(45000);

    // `re_offered` event present
    const events = await svc.listEvents(offer.id);
    expect(events.some((e) => e.event_type === "re_offered")).toBe(true);

    // Creator accepts the re-offer — credits exactly 36000 = 45000 − 20%
    const balBefore = await getBalance(creatorId);
    const grant = await svc.acceptOffer(creatorId, offer.id);

    expect(grant.creator_net_fils).toBe("36000");
    expect(grant.gross_fils).toBe("45000");
    expect(grant.platform_fee_fils).toBe("9000");

    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore + 36000);

    const offerRow = await AppDataSource.getRepository(ReelLicenseOffer).findOne({
      where: { id: offer.id },
    });
    expect(offerRow?.status).toBe(ReelLicenseOfferStatus.completed);
  });

  // -------------------------------------------------------------------------
  // Case 4: counter below minimum
  // -------------------------------------------------------------------------
  it("Case 4: counterOffer below minimum throws offer_below_minimum", async () => {
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
      await svc.counterOffer(creatorId, offer.id, 100);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("offer_below_minimum");
    }
    expect(threw).toBe(true);

    // Cleanup: decline the offer so it doesn't leak a live hold
    await svc.declineOffer(creatorId, offer.id);
  });

  // -------------------------------------------------------------------------
  // Case 5: creator cannot counter a countered offer
  // -------------------------------------------------------------------------
  it("Case 5: counterOffer on an already-countered offer throws cannot_counter_in_status:countered", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    // First counter succeeds
    await svc.counterOffer(creatorId, offer.id, 40000);

    // Second counter attempt should fail
    let threw = false;
    try {
      await svc.counterOffer(creatorId, offer.id, 35000);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("cannot_counter_in_status:countered");
    }
    expect(threw).toBe(true);

    // Cleanup: cancel from vendor side
    await svc.cancelOffer(vendorId, offer.id);
  });

  // -------------------------------------------------------------------------
  // Case 6: vendor cancel from countered state
  // -------------------------------------------------------------------------
  it("Case 6: cancelOffer from countered state — offer cancelled, no active hold, event present", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    // Creator counters (releases the hold)
    await svc.counterOffer(creatorId, offer.id, 40000);

    const balBefore = await getBalance(creatorId);

    // Vendor cancels the offer
    await svc.cancelOffer(vendorId, offer.id);

    const offerRow = await AppDataSource.getRepository(ReelLicenseOffer).findOne({
      where: { id: offer.id },
    });
    expect(offerRow?.status).toBe(ReelLicenseOfferStatus.cancelled);

    // No active (held) hold should exist
    const activeHold = await AppDataSource.getRepository(ReelLicenseEscrowHold).findOne({
      where: { offer_id: offer.id, status: ReelLicenseHoldStatus.held },
    });
    expect(activeHold).toBeNull();

    // A `cancelled` event should be present
    const events = await svc.listEvents(offer.id);
    expect(events.some((e) => e.event_type === "cancelled")).toBe(true);

    // Creator balance unchanged
    const balAfter = await getBalance(creatorId);
    expect(balAfter).toBe(balBefore);
  });

  // -------------------------------------------------------------------------
  // Case 7: expiry sweeps a countered offer
  // -------------------------------------------------------------------------
  it("Case 7: expireDueOffers marks a countered offer as expired with an expired event", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    // Creator counters (hold released, offer is now countered)
    await svc.counterOffer(creatorId, offer.id, 40000);

    // Force the offer into the past
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

    // `expired` event must be present
    const events = await svc.listEvents(offer.id);
    expect(events.some((e) => e.event_type === "expired")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 8: 403s — wrong actor on counter / acceptCounter / reOffer
  // -------------------------------------------------------------------------
  it("Case 8a: different creator calling counterOffer gets not_your_offer", async () => {
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
      await svc.counterOffer(otherUserId, offer.id, 40000);
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("not_your_offer");
    }
    expect(threw).toBe(true);

    // Cleanup
    await svc.declineOffer(creatorId, offer.id);
  });

  it("Case 8b: different vendor calling acceptCounter gets not_your_offer", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    // Creator counters
    await svc.counterOffer(creatorId, offer.id, 40000);

    let threw = false;
    try {
      await svc.acceptCounter(otherVendorId, offer.id, "pm_test");
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("not_your_offer");
    }
    expect(threw).toBe(true);

    // Cleanup
    await svc.cancelOffer(vendorId, offer.id);
  });

  it("Case 8c: different vendor calling reOffer gets not_your_offer", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 50000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    // Creator counters
    await svc.counterOffer(creatorId, offer.id, 40000);

    let threw = false;
    try {
      await svc.reOffer(otherVendorId, offer.id, 45000, "pm_test");
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("not_your_offer");
    }
    expect(threw).toBe(true);

    // Cleanup
    await svc.cancelOffer(vendorId, offer.id);
  });

  // -------------------------------------------------------------------------
  // Case 9: event trail order — full negotiation loop
  // -------------------------------------------------------------------------
  it("Case 9: full loop offer→counter→re_offer→accept produces events in chronological order", async () => {
    const offer = await svc.createOffer({
      vendorId,
      reelId,
      amountFils: 60000,
      rightsScope: ReelLicenseRightsScope.in_platform,
      fundingSource: ReelLicenseFundingSource.stripe,
      paymentMethodId: "pm_test",
    });
    createdOfferIds.push(offer.id);

    // Creator counters at 50000
    await svc.counterOffer(creatorId, offer.id, 50000);

    // Vendor re-offers at 55000
    await svc.reOffer(vendorId, offer.id, 55000, "pm_test");

    // Creator accepts
    await svc.acceptOffer(creatorId, offer.id);

    const events = await svc.listEvents(offer.id);
    const eventTypes = events.map((e) => e.event_type);

    // Events must be in chronological order: no event's created_at may precede a prior row's
    for (let i = 1; i < events.length; i++) {
      expect(events[i].created_at.getTime()).toBeGreaterThanOrEqual(
        events[i - 1].created_at.getTime(),
      );
    }

    // Expected sequence (service records captured + accepted at the end of captureAndComplete)
    // offered → released (counter releases hold) → countered → re_offered → captured → accepted
    expect(eventTypes[0]).toBe("offered");
    expect(eventTypes).toContain("released");
    expect(eventTypes).toContain("countered");
    expect(eventTypes).toContain("re_offered");
    expect(eventTypes).toContain("captured");
    expect(eventTypes).toContain("accepted");

    // Amount snapshot checks
    const offeredEvt = events.find((e) => e.event_type === "offered");
    expect(offeredEvt?.amount_fils_snapshot).toBe("60000");

    const counteredEvt = events.find((e) => e.event_type === "countered");
    expect(counteredEvt?.amount_fils_snapshot).toBe("50000");

    const reOfferedEvt = events.find((e) => e.event_type === "re_offered");
    expect(reOfferedEvt?.amount_fils_snapshot).toBe("55000");

    const capturedEvt = events.find((e) => e.event_type === "captured");
    expect(capturedEvt?.amount_fils_snapshot).toBe("55000");

    const acceptedEvt = events.find((e) => e.event_type === "accepted");
    expect(acceptedEvt?.amount_fils_snapshot).toBe("55000");
  });
});
