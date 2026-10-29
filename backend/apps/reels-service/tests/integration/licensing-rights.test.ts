import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt as jwtPlugin } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Category,
  Product,
  ProductStatus,
  Reel,
  ReelFeaturePlacement,
  ReelLicenseDownload,
  ReelLicenseFeature,
  ReelLicenseGrant,
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
import { IsNull } from "typeorm";
import { app } from "../../src/app.ts";
import { FakeDownloadProvider } from "../../src/domain/licensing/download-provider.ts";
import { RightsService } from "../../src/domain/licensing/rights.service.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;
// Fixed unique suffix per run so reruns don't collide with leftover rows.
const unique = Date.now();

// Shared IDs populated in seed()
let vendorUserId = "";
let vendorId = "";
let creatorId = "";
let otherVendorUserId = "";
let otherVendorId = "";
let reelId = "";
let categoryId = "";
let productId = "";

// Accumulated grant IDs for FK-safe teardown.
const createdGrantIds: string[] = [];

// ---------------------------------------------------------------------------
// Token helpers — identical to the 2a/2b harnesses
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
  return { vendorSigner };
}

// ---------------------------------------------------------------------------
// Grant seeding — direct insert so we control scope/expires_at/revoked_at.
// ---------------------------------------------------------------------------
async function insertGrant(opts: {
  scope: ReelLicenseRightsScope;
  vendor?: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}): Promise<string> {
  const repo = AppDataSource.getRepository(ReelLicenseGrant);
  // offer_id is NOT NULL with a FK to reel_license_offers; insert a throwaway
  // offer row so the grant can point at it.
  const off = await AppDataSource.query(
    `INSERT INTO reel_license_offers
       (vendor_id, reel_id, creator_id, amount_fils, rights_scope, funding_source, status, expires_at)
     VALUES ($1,$2,$3,50000,$4,'payout_balance','completed', now() + interval '7 days') RETURNING id`,
    [opts.vendor ?? vendorId, reelId, creatorId, opts.scope],
  );
  const offerId = off[0].id as string;
  const grant = await repo.save(
    repo.create({
      offer_id: offerId,
      reel_id: reelId,
      vendor_id: opts.vendor ?? vendorId,
      creator_id: creatorId,
      scope: opts.scope,
      gross_fils: "50000",
      platform_fee_fils: "10000",
      creator_net_fils: "40000",
      fee_rate_snapshot: "0.2000",
      wallet_transaction_id: null,
      terms_snapshot: {},
      expires_at: opts.expiresAt ?? null,
      revoked_at: opts.revokedAt ?? null,
    }),
  );
  createdGrantIds.push(grant.id);
  return grant.id;
}

// ---------------------------------------------------------------------------
// Seed — users (creator + two vendor owners), two vendors + memberships,
// a reel owned by the creator, a category + product for product placement.
// ---------------------------------------------------------------------------
async function seed() {
  const userRepo = AppDataSource.getRepository(User);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const vendorMemberRepo = AppDataSource.getRepository(VendorMember);
  const reelRepo = AppDataSource.getRepository(Reel);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);

  const mkUser = (fn: string) =>
    userRepo.save(
      userRepo.create({
        first_name: fn,
        last_name: "u",
        email: `rts-${fn}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
  const [vUser, creator, otherVUser] = await Promise.all([
    mkUser("vowner"),
    mkUser("creator"),
    mkUser("othervowner"),
  ]);
  vendorUserId = vUser.id;
  creatorId = creator.id;
  otherVendorUserId = otherVUser.id;

  const vendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Rts Vendor ${unique}`,
      slug: `rts-vendor-${unique}`,
      business_name: "Rts Vendor",
      business_type: "retail",
      contact_email: `rts-vendor-${unique}@test.local`,
      contact_phone: "+971500000077",
      status: VendorStatus.approved,
    }),
  );
  vendorId = vendor.id;

  const otherVendor = await vendorRepo.save(
    vendorRepo.create({
      name: `Rts Other Vendor ${unique}`,
      slug: `rts-other-vendor-${unique}`,
      business_name: "Rts Other Vendor",
      business_type: "retail",
      contact_email: `rts-other-vendor-${unique}@test.local`,
      contact_phone: "+971500000076",
      status: VendorStatus.approved,
    }),
  );
  otherVendorId = otherVendor.id;

  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: vendorId,
      user_id: vendorUserId,
      email: `rts-vowner-${unique}@test.local`,
      role: VendorMemberRole.owner,
      status: VendorMemberStatus.active,
      accepted_at: new Date(),
    }),
  );
  await vendorMemberRepo.save(
    vendorMemberRepo.create({
      vendor_id: otherVendorId,
      user_id: otherVendorUserId,
      email: `rts-othervowner-${unique}@test.local`,
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
      video_asset_id: `rts-r1-${unique}`,
      video_playback_url: "https://cf/rts-r1.m3u8",
      thumbnail_url: "https://cf/rts-r1.jpg",
      caption: "feature me",
    }),
  );
  reelId = reel.id;

  const cat = await categoryRepo.save(
    categoryRepo.create({ name: `Rts Cat ${unique}`, slug: `rts-cat-${unique}`, is_active: true }),
  );
  categoryId = cat.id;
  const product = await productRepo.save(
    productRepo.create({
      vendor_id: vendorId,
      category_id: cat.id,
      name: `Rts Product ${unique}`,
      slug: `rts-p-${unique}`,
      status: ProductStatus.approved,
      price: 100000,
      currency: "AED",
    }),
  );
  productId = product.id;
}

// ---------------------------------------------------------------------------
// Cleanup — FK-safe: downloads → features → grants → offers → reel →
// product → category → vendor_members → vendors → users
// ---------------------------------------------------------------------------
async function cleanup() {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch(() => {});
  await q("DELETE FROM reel_license_downloads WHERE grant_id = ANY($1::uuid[])", [createdGrantIds]);
  await q("DELETE FROM reel_license_features WHERE grant_id = ANY($1::uuid[])", [createdGrantIds]);
  await q("DELETE FROM reel_license_grants WHERE id = ANY($1::uuid[])", [createdGrantIds]);
  await q("DELETE FROM reel_license_offers WHERE reel_id = $1", [reelId]);
  await q("DELETE FROM reels WHERE id = $1", [reelId]);
  await q("DELETE FROM products WHERE id = $1", [productId]);
  await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  await q("DELETE FROM vendor_members WHERE vendor_id = ANY($1::uuid[])", [
    [vendorId, otherVendorId],
  ]);
  await q("DELETE FROM vendors WHERE id = ANY($1::uuid[])", [[vendorId, otherVendorId]]);
  await q("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    [vendorUserId, creatorId, otherVendorUserId],
  ]);
}

describeLive("licensing rights delivery", () => {
  let vendorToken = "";
  const fake = new FakeDownloadProvider();
  let svc: RightsService;

  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, init));
  const authed = (path: string, token: string, init: RequestInit = {}) =>
    call(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    await ensureDatabase();
    await seed();
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "analytics.read" },
      { role: "owner", permission: "payouts.read" },
      { role: "owner", permission: "bank.read" },
    ]);
    const { vendorSigner } = makeSigners();
    vendorToken = await vendorSigner(vendorUserId, `rts-vowner-${unique}@test.local`, vendorId);

    // Service-level cases use a FakeDownloadProvider we hold a reference to.
    svc = new RightsService(fake);
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  // -------------------------------------------------------------------------
  // Case 1: pin to product + public read
  // -------------------------------------------------------------------------
  it("Case 1: pinFeature(product) creates a live feature; listFeaturedReels({productId}) returns it", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    const feature = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.product,
      productId,
    });

    const row = await AppDataSource.getRepository(ReelLicenseFeature).findOne({
      where: { id: feature.id, deleted_at: IsNull() },
    });
    expect(row).not.toBeNull();
    expect(row?.placement).toBe(ReelFeaturePlacement.product);
    expect(row?.product_id).toBe(productId);

    const featured = await svc.listFeaturedReels({ productId });
    const mine = featured.find((f) => f.feature_id === feature.id);
    expect(mine).toBeDefined();
    expect(mine?.featured).toBe(true);
    expect(mine?.video_playback_url).toBe("https://cf/rts-r1.m3u8");
  });

  // -------------------------------------------------------------------------
  // Case 2: pin to storefront
  // -------------------------------------------------------------------------
  it("Case 2: pinFeature(storefront) surfaces under {vendorId}, not under {productId}", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    const feature = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.storefront,
    });

    const byVendor = await svc.listFeaturedReels({ vendorId });
    expect(byVendor.some((f) => f.feature_id === feature.id)).toBe(true);

    const byProduct = await svc.listFeaturedReels({ productId });
    expect(byProduct.some((f) => f.feature_id === feature.id)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Case 3: scope gating
  // -------------------------------------------------------------------------
  it("Case 3: in_platform grant denies download; off_platform grant denies pin", async () => {
    const inPlatform = await insertGrant({ scope: ReelLicenseRightsScope.in_platform });
    let threwDownload = false;
    try {
      await svc.requestDownload(vendorId, inPlatform);
    } catch (e) {
      threwDownload = true;
      expect(String(e)).toContain("scope_denies_download");
    }
    expect(threwDownload).toBe(true);

    const offPlatform = await insertGrant({ scope: ReelLicenseRightsScope.off_platform });
    let threwPin = false;
    try {
      await svc.pinFeature(vendorId, offPlatform, {
        placement: ReelFeaturePlacement.storefront,
      });
    } catch (e) {
      threwPin = true;
      expect(String(e)).toContain("scope_denies_pin");
    }
    expect(threwPin).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 4: download mints + audits
  // -------------------------------------------------------------------------
  it("Case 4: requestDownload mints a future-dated URL and writes exactly one audit row", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    const callsBefore = fake.calls;

    const minted = await svc.requestDownload(vendorId, grantId);
    expect(typeof minted.url).toBe("string");
    expect(minted.url.length).toBeGreaterThan(0);
    expect(minted.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(fake.calls).toBe(callsBefore + 1);

    const rows = await AppDataSource.getRepository(ReelLicenseDownload).find({
      where: { grant_id: grantId },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].requested_by).toBe(vendorId);
    expect(rows[0].url_expires_at.getTime()).toBe(minted.expiresAt.getTime());
  });

  // -------------------------------------------------------------------------
  // Case 5: revoked grant
  // -------------------------------------------------------------------------
  it("Case 5: revoking a pinned grant drops it from featured; pin + download throw grant_not_active", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    const feature = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.product,
      productId,
    });

    // Confirm it is featured before revoke.
    const before = await svc.listFeaturedReels({ productId });
    expect(before.some((f) => f.feature_id === feature.id)).toBe(true);

    await AppDataSource.query("UPDATE reel_license_grants SET revoked_at = now() WHERE id = $1", [
      grantId,
    ]);

    const after = await svc.listFeaturedReels({ productId });
    expect(after.some((f) => f.feature_id === feature.id)).toBe(false);

    let threwPin = false;
    try {
      await svc.pinFeature(vendorId, grantId, {
        placement: ReelFeaturePlacement.storefront,
      });
    } catch (e) {
      threwPin = true;
      expect(String(e)).toContain("grant_not_active");
    }
    expect(threwPin).toBe(true);

    let threwDownload = false;
    try {
      await svc.requestDownload(vendorId, grantId);
    } catch (e) {
      threwDownload = true;
      expect(String(e)).toContain("grant_not_active");
    }
    expect(threwDownload).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 6: expired grant
  // -------------------------------------------------------------------------
  it("Case 6: an expired grant drops from featured; pin + download throw grant_not_active", async () => {
    const past = new Date(Date.now() - 3600_000);
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    // Pin while still active (insert with future expiry then expire it), so we
    // can prove the feature drops once the grant expires.
    const feature = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.product,
      productId,
    });
    await AppDataSource.query("UPDATE reel_license_grants SET expires_at = $2 WHERE id = $1", [
      grantId,
      past,
    ]);

    const after = await svc.listFeaturedReels({ productId });
    expect(after.some((f) => f.feature_id === feature.id)).toBe(false);

    let threwPin = false;
    try {
      await svc.pinFeature(vendorId, grantId, {
        placement: ReelFeaturePlacement.storefront,
      });
    } catch (e) {
      threwPin = true;
      expect(String(e)).toContain("grant_not_active");
    }
    expect(threwPin).toBe(true);

    let threwDownload = false;
    try {
      await svc.requestDownload(vendorId, grantId);
    } catch (e) {
      threwDownload = true;
      expect(String(e)).toContain("grant_not_active");
    }
    expect(threwDownload).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 7: 403s — wrong vendor on pin / download / unpin
  // -------------------------------------------------------------------------
  it("Case 7: a different vendor gets not_your_grant on pin/download and not_your_feature on unpin", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    // The owning vendor pins it so there's a feature for the unpin check.
    const feature = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.product,
      productId,
    });

    let threwPin = false;
    try {
      await svc.pinFeature(otherVendorId, grantId, {
        placement: ReelFeaturePlacement.storefront,
      });
    } catch (e) {
      threwPin = true;
      expect(String(e)).toContain("not_your_grant");
    }
    expect(threwPin).toBe(true);

    let threwDownload = false;
    try {
      await svc.requestDownload(otherVendorId, grantId);
    } catch (e) {
      threwDownload = true;
      expect(String(e)).toContain("not_your_grant");
    }
    expect(threwDownload).toBe(true);

    let threwUnpin = false;
    try {
      await svc.unpinFeature(otherVendorId, feature.id);
    } catch (e) {
      threwUnpin = true;
      expect(String(e)).toContain("not_your_feature");
    }
    expect(threwUnpin).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 8: unpin + idempotent re-pin
  // -------------------------------------------------------------------------
  it("Case 8: unpin removes from featured; re-pin succeeds and only ONE live row exists", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    const first = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.product,
      productId,
    });

    await svc.unpinFeature(vendorId, first.id);
    const afterUnpin = await svc.listFeaturedReels({ productId });
    expect(afterUnpin.some((f) => f.feature_id === first.id)).toBe(false);

    // Re-pin the same surface — must not 500 on a unique-index collision.
    const second = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.product,
      productId,
    });
    const afterRepin = await svc.listFeaturedReels({ productId });
    expect(afterRepin.some((f) => f.feature_id === second.id)).toBe(true);

    // Exactly one LIVE feature row for this grant+surface.
    const live = await AppDataSource.getRepository(ReelLicenseFeature).find({
      where: {
        grant_id: grantId,
        placement: ReelFeaturePlacement.product,
        product_id: productId,
        deleted_at: IsNull(),
      },
    });
    expect(live.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Case 9: product placement requires product_id
  // -------------------------------------------------------------------------
  it("Case 9: pinFeature(product) without productId throws product_required_for_product_placement", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    let threw = false;
    try {
      await svc.pinFeature(vendorId, grantId, { placement: ReelFeaturePlacement.product });
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("product_required_for_product_placement");
    }
    expect(threw).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 10: featured query validation
  // -------------------------------------------------------------------------
  it("Case 10: listFeaturedReels with neither/both ids throws product_id_or_vendor_id_required", async () => {
    let threwNeither = false;
    try {
      await svc.listFeaturedReels({});
    } catch (e) {
      threwNeither = true;
      expect(String(e)).toContain("product_id_or_vendor_id_required");
    }
    expect(threwNeither).toBe(true);

    let threwBoth = false;
    try {
      await svc.listFeaturedReels({ productId, vendorId });
    } catch (e) {
      threwBoth = true;
      expect(String(e)).toContain("product_id_or_vendor_id_required");
    }
    expect(threwBoth).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 11: HTTP round-trip — authed pin then public featured read
  // -------------------------------------------------------------------------
  it("Case 11: POST grants/:id/feature (201) then public GET /reels/featured (200) includes the reel", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });

    const pinRes = await authed(`/vendor/reels/licensing/grants/${grantId}/feature`, vendorToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ placement: "product", product_id: productId }),
    });
    expect(pinRes.status).toBe(200);
    const pinBody = (await pinRes.json()) as any;
    expect(pinBody.statusCode).toBe(201);
    const featureId = pinBody.data.id as string;

    // Public read — no auth header.
    const getRes = await call(`/reels/featured?product_id=${productId}`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.statusCode).toBe(200);
    expect(getBody.data.some((f: { feature_id: string }) => f.feature_id === featureId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 12: storefront single-live-pin is backstopped at the DB level
  // -------------------------------------------------------------------------
  it("Case 12: a second live storefront row for the same grant is rejected by uq_rlf_storefront", async () => {
    const grantId = await insertGrant({ scope: ReelLicenseRightsScope.both });
    const pinned = await svc.pinFeature(vendorId, grantId, {
      placement: ReelFeaturePlacement.storefront,
    });
    // Bypass the in-service guard and force a raw duplicate live storefront insert — the partial
    // unique index uq_rlf_storefront (product_id IS NULL AND deleted_at IS NULL) must reject it.
    let threw = false;
    try {
      await AppDataSource.query(
        `INSERT INTO reel_license_features (grant_id, reel_id, vendor_id, placement, product_id, position)
         VALUES ($1,$2,$3,'storefront',NULL,0)`,
        [grantId, reelId, vendorId],
      );
    } catch (e) {
      threw = true;
      expect(String((e as { code?: string }).code)).toBe("23505");
    }
    expect(threw).toBe(true);
    // Still exactly one live storefront row (the one pinFeature created).
    const live = await AppDataSource.getRepository(ReelLicenseFeature).find({
      where: {
        grant_id: grantId,
        placement: ReelFeaturePlacement.storefront,
        deleted_at: IsNull(),
      },
    });
    expect(live.length).toBe(1);
    expect(live[0].id).toBe(pinned.id);
  });
});
