import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt as jwtPlugin } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
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
  VendorMember,
  VendorMemberRole,
  VendorMemberStatus,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { permissionMatrix, signAccessToken } from "@materialhub/guards";
import { Elysia } from "elysia";
import { app } from "../../src/app.ts";

const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;
const unique = Date.now();

let vendorUserAId = "";
let vendorUserBId = "";
let vendorAId = "";
let vendorBId = "";
let creatorAId = "";
let creatorBId = "";
let pA1 = "";
let pB1 = "";
let reel1Id = "";
let reel2Id = "";
let reel3Id = "";
const createdReelIds: string[] = [];
const createdProductIds: string[] = [];
let categoryId = "";

async function makeVendorSigner() {
  const signerApp = new Elysia().use(
    jwtPlugin({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }),
  );
  signerApp.compile();
  const bag = (signerApp as unknown as { decorator: Record<string, unknown> }).decorator;
  const accessJwt = bag.accessJwt as { sign: (p: Record<string, unknown>) => Promise<string> };
  return (userId: string, email: string, vendorId: string) =>
    signAccessToken(accessJwt, {
      id: userId,
      email,
      role: "customer",
      token_version: 1,
      memberships: [{ vid: vendorId, r: "owner" }],
    });
}

async function seed() {
  const userRepo = AppDataSource.getRepository(User);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const vendorMemberRepo = AppDataSource.getRepository(VendorMember);
  const categoryRepo = AppDataSource.getRepository(Category);
  const productRepo = AppDataSource.getRepository(Product);
  const reelRepo = AppDataSource.getRepository(Reel);
  const tagRepo = AppDataSource.getRepository(ReelProductTag);

  const mkUser = (fn: string, ln: string) =>
    userRepo.save(
      userRepo.create({
        first_name: fn,
        last_name: ln,
        email: `ugc-${fn}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
  const [vUserA, vUserB, creatorA, creatorB] = await Promise.all([
    mkUser("vownerA", "u"),
    mkUser("vownerB", "u"),
    mkUser("creatorA", "u"),
    mkUser("creatorB", "u"),
  ]);
  vendorUserAId = vUserA.id;
  vendorUserBId = vUserB.id;
  creatorAId = creatorA.id;
  creatorBId = creatorB.id;

  // Phase 3b: vendors.user_id was dropped; ownership tracked via vendor_members
  const mkVendor = (tag: string) =>
    vendorRepo.save(
      vendorRepo.create({
        name: `UGC Vendor ${tag} ${unique}`,
        slug: `ugc-${tag}-${unique}`,
        business_name: `UGC Vendor ${tag}`,
        business_type: "retail",
        contact_email: `ugc-${tag}-${unique}@test.local`,
        contact_phone: "+971500000099",
        status: VendorStatus.approved,
      }),
    );
  const [vA, vB] = await Promise.all([mkVendor("A"), mkVendor("B")]);
  vendorAId = vA.id;
  vendorBId = vB.id;

  // Seed vendor_members rows so the JWT vendor membership guard resolves
  await Promise.all([
    vendorMemberRepo.save(
      vendorMemberRepo.create({
        vendor_id: vendorAId,
        user_id: vendorUserAId,
        email: `ugc-vownerA-u-${unique}@test.local`,
        role: VendorMemberRole.owner,
        status: VendorMemberStatus.active,
        accepted_at: new Date(),
      }),
    ),
    vendorMemberRepo.save(
      vendorMemberRepo.create({
        vendor_id: vendorBId,
        user_id: vendorUserBId,
        email: `ugc-vownerB-u-${unique}@test.local`,
        role: VendorMemberRole.owner,
        status: VendorMemberStatus.active,
        accepted_at: new Date(),
      }),
    ),
  ]);

  const cat = await categoryRepo.save(
    categoryRepo.create({ name: `UGC Cat ${unique}`, slug: `ugc-cat-${unique}`, is_active: true }),
  );
  categoryId = cat.id;

  const mkProduct = (vid: string, sfx: string) =>
    productRepo.save(
      productRepo.create({
        vendor_id: vid,
        category_id: cat.id,
        name: `UGC Product ${sfx}`,
        slug: `ugc-p-${sfx}-${unique}`,
        status: ProductStatus.approved,
        price: 10000,
        currency: "AED",
      }),
    );
  const prodA1 = await mkProduct(vendorAId, "a1");
  const prodB1 = await mkProduct(vendorBId, "b1");
  const prodA2 = await mkProduct(vendorAId, "a2");
  const prodB2 = await mkProduct(vendorBId, "b2");
  pA1 = prodA1.id;
  pB1 = prodB1.id;
  createdProductIds.push(prodA1.id, prodB1.id, prodA2.id, prodB2.id);

  const base = {
    video_provider: "cloudflare_stream",
    video_duration_seconds: 30,
    video_width: 1080,
    video_height: 1920,
    language_code: "en",
    status: ReelStatus.approved,
    view_count: 5,
    like_count: 2,
    published_at: new Date(),
  };
  const r1 = await reelRepo.save(
    reelRepo.create({
      ...base,
      user_id: creatorAId,
      video_asset_id: `ugc-r1-${unique}`,
      video_playback_url: "https://cf/r1.m3u8",
      thumbnail_url: "https://cf/r1.jpg",
      caption: "vendorA only",
    }),
  );
  const r2 = await reelRepo.save(
    reelRepo.create({
      ...base,
      user_id: creatorBId,
      video_asset_id: `ugc-r2-${unique}`,
      video_playback_url: "https://cf/r2.m3u8",
      thumbnail_url: "https://cf/r2.jpg",
      caption: "vendorB only",
    }),
  );
  const r3 = await reelRepo.save(
    reelRepo.create({
      ...base,
      user_id: creatorAId,
      video_asset_id: `ugc-r3-${unique}`,
      video_playback_url: "https://cf/r3.m3u8",
      thumbnail_url: "https://cf/r3.jpg",
      caption: "multi A+B",
    }),
  );
  reel1Id = r1.id;
  reel2Id = r2.id;
  reel3Id = r3.id;
  createdReelIds.push(r1.id, r2.id, r3.id);

  await tagRepo.save([
    tagRepo.create({
      reel_id: reel1Id,
      product_id: prodA1.id,
      timestamp_seconds: "5.00",
      tap_count: 7,
    }),
    tagRepo.create({
      reel_id: reel2Id,
      product_id: prodB1.id,
      timestamp_seconds: "5.00",
      tap_count: 3,
    }),
    tagRepo.create({
      reel_id: reel3Id,
      product_id: prodA2.id,
      timestamp_seconds: "5.00",
      tap_count: 4,
    }),
    tagRepo.create({
      reel_id: reel3Id,
      product_id: prodB2.id,
      timestamp_seconds: "8.00",
      tap_count: 9,
    }),
  ]);

  const o1 = await AppDataSource.query(
    `INSERT INTO orders (order_number, user_id, status, subtotal, grand_total, currency, shipping_address, surcharge_total)
     VALUES ($1,$2,'confirmed',10000,10000,'AED','{"line1":"T","city":"Dubai","country":"AE"}', 0) RETURNING id`,
    [`UGC-${unique}-1`, creatorAId],
  );
  const vo1 = await AppDataSource.query(
    `INSERT INTO vendor_orders (order_id, vendor_id, vendor_order_number, status, subtotal, vendor_total, currency)
     VALUES ($1,$2,$3,'confirmed',10000,10000,'AED') RETURNING id`,
    [o1[0].id, vendorAId, `UGCV-${unique}-1`],
  );
  const it1 = await AppDataSource.query(
    `INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, product_name, quantity, unit_price, line_total, status)
     VALUES ($1,$2,$3,$4,'P',1,10000,10000,'confirmed') RETURNING id`,
    [o1[0].id, vo1[0].id, vendorAId, pA1],
  );
  const att1 = await AppDataSource.query(
    `INSERT INTO reel_attributions (user_id, reel_id, product_id, creator_id, tapped_at, expires_at, attribution_window_days_snapshot)
     VALUES ($1,$2,$3,$4, now(), now() + interval '30 days', 30) RETURNING id`,
    [creatorAId, reel1Id, pA1, creatorAId],
  );
  await AppDataSource.query(
    `INSERT INTO reel_commissions
       (creator_id, reel_id, attribution_id, order_id, order_item_id, vendor_id, product_id,
        item_price_fils, commission_rate_snapshot, subsidy_share_snapshot,
        gross_commission_fils, vendor_share_fils, platform_subsidy_fils, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,10000,'0.0500','0.5000',500,250,250,'earned', now())`,
    [creatorAId, reel1Id, att1[0].id, o1[0].id, it1[0].id, vendorAId, pA1],
  );
}

async function cleanup() {
  const q = (sql: string, params: unknown[] = []) =>
    AppDataSource.query(sql, params).catch(() => {});
  await q("DELETE FROM reel_vendor_shortlists WHERE reel_id = ANY($1::uuid[])", [createdReelIds]);
  await q("DELETE FROM reel_commissions WHERE reel_id = ANY($1::uuid[])", [createdReelIds]);
  await q("DELETE FROM reel_attributions WHERE reel_id = ANY($1::uuid[])", [createdReelIds]);
  await q("DELETE FROM order_items WHERE product_id = ANY($1::uuid[])", [createdProductIds]);
  await q("DELETE FROM vendor_orders WHERE vendor_id = ANY($1::uuid[])", [[vendorAId, vendorBId]]);
  await q("DELETE FROM orders WHERE order_number LIKE $1", [`UGC-${unique}-%`]);
  await q("DELETE FROM reel_product_tags WHERE reel_id = ANY($1::uuid[])", [createdReelIds]);
  await q("DELETE FROM reels WHERE id = ANY($1::uuid[])", [createdReelIds]);
  await q("DELETE FROM products WHERE id = ANY($1::uuid[])", [createdProductIds]);
  await q("DELETE FROM categories WHERE id = $1", [categoryId]);
  await q("DELETE FROM vendor_members WHERE vendor_id = ANY($1::uuid[])", [[vendorAId, vendorBId]]);
  await q("DELETE FROM vendors WHERE id = ANY($1::uuid[])", [[vendorAId, vendorBId]]);
  await q("DELETE FROM users WHERE id = ANY($1::uuid[])", [
    [vendorUserAId, vendorUserBId, creatorAId, creatorBId],
  ]);
}

describeLive("ugc discovery", () => {
  let tokenA = "";
  let tokenB = "";
  const call = (path: string, init: RequestInit = {}) =>
    app.handle(new Request(`http://localhost${path}`, init));
  const authed = (path: string, token: string, init: RequestInit = {}) =>
    call(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    await ensureDatabase();
    await seed();
    permissionMatrix.__setMapForTests([{ role: "owner", permission: "analytics.read" }]);
    const sign = await makeVendorSigner();
    tokenA = await sign(vendorUserAId, `ugc-vownerA-u-${unique}@test.local`, vendorAId);
    tokenB = await sign(vendorUserBId, `ugc-vownerB-u-${unique}@test.local`, vendorBId);
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  it("My UGC: vendor A sees reel1 + reel3, not reel2; only A's tagged products; attributed present", async () => {
    const res = await authed("/vendor/reels/discovery/mine", tokenA);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const ids = body.data.items.map((c: any) => c.id);
    expect(ids).toContain(reel1Id);
    expect(ids).toContain(reel3Id);
    expect(ids).not.toContain(reel2Id);
    const reel3 = body.data.items.find((c: any) => c.id === reel3Id);
    const prodNames = reel3.tagged_products.map((p: any) => p.name);
    expect(prodNames.some((n: string) => n.includes("a2"))).toBe(true);
    expect(prodNames.some((n: string) => n.includes("b2"))).toBe(false);
    const reel1 = body.data.items.find((c: any) => c.id === reel1Id);
    expect(reel1.attributed.gmv_fils).toBe(10000);
    expect(reel1.attributed.product_taps).toBe(7);
  });

  it("Browse: returns approved reels and NEVER leaks attributed sales", async () => {
    const res = await authed("/vendor/reels/discovery/browse", tokenA);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const ids = body.data.items.map((c: any) => c.id);
    expect(ids).toContain(reel2Id);
    for (const card of body.data.items) {
      expect(card.attributed).toBeUndefined();
    }
  });

  it("Shortlist: save is idempotent, surfaces in list, and un-save/re-save works", async () => {
    const saveOnce = await authed("/vendor/reels/shortlist", tokenA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reel_id: reel1Id, note: "great clip" }),
    });
    expect(saveOnce.status).toBe(200);
    const saveTwice = await authed("/vendor/reels/shortlist", tokenA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reel_id: reel1Id, note: "updated note" }),
    });
    expect(saveTwice.status).toBe(200);

    const list1 = (await (await authed("/vendor/reels/shortlist", tokenA)).json()) as any;
    expect(list1.data.items.map((c: any) => c.id)).toContain(reel1Id);
    expect(list1.data.items.length).toBe(1);

    await authed(`/vendor/reels/shortlist/${reel1Id}`, tokenA, { method: "DELETE" });
    const list2 = (await (await authed("/vendor/reels/shortlist", tokenA)).json()) as any;
    expect(list2.data.items.map((c: any) => c.id)).not.toContain(reel1Id);

    const reSave = await authed("/vendor/reels/shortlist", tokenA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reel_id: reel1Id }),
    });
    expect(reSave.status).toBe(200);
  });

  it("Shortlist: saving a non-existent reel -> 404", async () => {
    const res = await authed("/vendor/reels/shortlist", tokenA, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reel_id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("auth: no token -> 401 on My UGC", async () => {
    const res = await call("/vendor/reels/discovery/mine");
    expect(res.status).toBe(401);
  });
});
