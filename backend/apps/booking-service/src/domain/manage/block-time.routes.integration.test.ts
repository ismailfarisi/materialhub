// block-time.routes.integration.test.ts
//
// Live Postgres + Redis (BOOKING_LIVE_DB=1) — boots the real booking-service
// `app` and drives POST/GET/DELETE /manage/blocks end-to-end with real
// signed vendor JWTs, so jwtAuth + vendorMembership + assertLocationManager +
// BlockTimeController/BlockTimeService/EngagementService are all exercised
// for real, not mocked. Mirrors manual-booking.routes.integration.test.ts's
// shape (imports `app` directly, ensureDatabase() in beforeAll, jsonwebtoken
// to sign tokens, permissionMatrix.__setMapForTests seeding, cleanup in
// afterAll).
//
// Covers the Task 2 brief's four live-DB assertions:
//   1. a block removes the range from availability (an overlapping reserve
//      on the same staff/slot 409s).
//   2. deleting the block restores it (the same overlapping reserve now
//      succeeds).
//   3. a non-vendor/non-manager actor -> 403.
//   4. deleting a marketplace-kind engagement via this route -> 404 (never
//      leaked, never released).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  EngagementKind,
  EngagementStatus,
  StaffEngagement,
  StaffLocation,
  StaffMember,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorLocation,
  VendorMember,
  VendorMemberRole,
  VendorMemberStatus,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import jwt from "jsonwebtoken";
import { app } from "../../app.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

function signVendorUser(id: string, email: string, vm: Array<{ vid: string; r: string }>): string {
  // Deliberately omit `tv` (token_version) — see
  // manual-booking.routes.integration.test.ts's identical helper.
  return jwt.sign({ sub: id, email, role: "customer", vm }, config.jwt.accessSecret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

async function req(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

const BASE_DAY = new Date(Date.now() + 9 * 24 * 3_600_000); // 9 days out (distinct from Task 1's 8-day-out fixture window)
let slotCursor = 0;
function nextSlot(): { start: Date; end: Date } {
  slotCursor += 45;
  const start = new Date(
    Date.UTC(
      BASE_DAY.getUTCFullYear(),
      BASE_DAY.getUTCMonth(),
      BASE_DAY.getUTCDate(),
      9,
      slotCursor,
      0,
    ),
  );
  return { start, end: new Date(start.getTime() + 30 * 60_000) };
}

describeLive("POST/GET/DELETE /manage/blocks (live DB) — block time / break", () => {
  let vendorId = "";
  let locationId = "";
  let staffId = "";
  let managerToken = "";
  let staffRoleToken = "";

  const createdUserIds: string[] = [];
  const createdEngagementIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabase();

    // Same real-matrix seeding as manual-booking's integration test: only
    // owner/manager get products.write.
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "products.write" },
      { role: "manager", permission: "products.write" },
    ]);

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const locationRepo = AppDataSource.getRepository(VendorLocation);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const staffLocationRepo = AppDataSource.getRepository(StaffLocation);
    const vendorMemberRepo = AppDataSource.getRepository(VendorMember);

    async function makeUser(label: string) {
      const u = await userRepo.save(
        userRepo.create({
          first_name: "Block",
          last_name: label,
          email: `block-time-${label}-${unique}@test.local`,
          password_hash: "x",
          role: UserRole.customer,
          status: UserStatus.active,
        }),
      );
      createdUserIds.push(u.id);
      return u;
    }

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Block Time Test Vendor ${unique}`,
        slug: `block-time-test-vendor-${unique}`,
        business_name: "Test Spa",
        business_type: "salon",
        contact_email: `block-time-vendor-${unique}@test.local`,
        contact_phone: "+971500000005",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const location = await locationRepo.save(
      locationRepo.create({ vendor_id: vendorId, name: "Downtown Branch", is_active: true }),
    );
    locationId = location.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Block Time Stylist ${unique}` }),
    );
    staffId = staff.id;
    await staffLocationRepo.save(
      staffLocationRepo.create({ staff_member_id: staffId, vendor_location_id: locationId }),
    );

    const managerUser = await makeUser("manager");
    await vendorMemberRepo.save(
      vendorMemberRepo.create({
        vendor_id: vendorId,
        user_id: managerUser.id,
        email: managerUser.email,
        role: VendorMemberRole.manager,
        status: VendorMemberStatus.active,
      }),
    );
    managerToken = signVendorUser(managerUser.id, managerUser.email, [
      { vid: vendorId, r: "manager" },
    ]);

    // vendor_member role=staff never gets products.write in the real seeded
    // matrix, so this actor 403s at the vendorMembership guard itself.
    const staffRoleUser = await makeUser("staffrole");
    await vendorMemberRepo.save(
      vendorMemberRepo.create({
        vendor_id: vendorId,
        user_id: staffRoleUser.id,
        email: staffRoleUser.email,
        role: VendorMemberRole.staff,
        status: VendorMemberStatus.active,
      }),
    );
    staffRoleToken = signVendorUser(staffRoleUser.id, staffRoleUser.email, [
      { vid: vendorId, r: "staff" },
    ]);
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[block-time.routes.integration.test] cleanup "${label}" failed`, err);
      }
    }

    if (createdEngagementIds.length) {
      await step("delete engagements", () =>
        AppDataSource.getRepository(StaffEngagement)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdEngagementIds })
          .execute(),
      );
    }
    await step("delete vendor_members", () =>
      AppDataSource.getRepository(VendorMember)
        .createQueryBuilder()
        .delete()
        .where("vendor_id = :id", { id: vendorId })
        .execute(),
    );
    if (staffId) {
      await step("delete staff_locations", () =>
        AppDataSource.getRepository(StaffLocation)
          .createQueryBuilder()
          .delete()
          .where("staff_member_id = :id", { id: staffId })
          .execute(),
      );
      await step("delete staff", () =>
        AppDataSource.getRepository(StaffMember)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: staffId })
          .execute(),
      );
    }
    if (locationId) {
      await step("delete location", () =>
        AppDataSource.getRepository(VendorLocation)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: locationId })
          .execute(),
      );
    }
    if (vendorId) {
      await step("delete vendor", () =>
        AppDataSource.getRepository(Vendor)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: vendorId })
          .execute(),
      );
    }
    if (createdUserIds.length) {
      await step("delete users", () =>
        AppDataSource.getRepository(User)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdUserIds })
          .execute(),
      );
    }
  }, 30_000);

  it("manager creates a manual_block, it blocks availability, deleting it restores availability", async () => {
    const slot = nextSlot();

    // 1. Create the block.
    const createRes = await req("POST", "/manage/blocks", managerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "manual_block",
      reason: "Deep clean",
    });
    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as any;
    expect(createJson.data.status).toBe("confirmed");
    expect(createJson.data.kind).toBe("manual_block");
    const blockId = createJson.data.id as string;
    createdEngagementIds.push(blockId);

    // Confirms in the DB — genuinely `confirmed`, inside the EXCLUDE
    // predicate (held, confirmed).
    const dbEngagement = await AppDataSource.getRepository(StaffEngagement).findOne({
      where: { id: blockId },
    });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);

    // GET /manage/blocks lists it back for this staff member/day.
    const dayStart = new Date(
      Date.UTC(BASE_DAY.getUTCFullYear(), BASE_DAY.getUTCMonth(), BASE_DAY.getUTCDate(), 0, 0, 0),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
    const listRes = await req(
      "GET",
      `/manage/blocks?staff_member_id=${staffId}&from=${dayStart.toISOString()}&to=${dayEnd.toISOString()}`,
      managerToken,
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as any;
    expect(listJson.data.some((b: any) => b.id === blockId)).toBe(true);

    // 2. It removes the range from availability: an overlapping second
    // block on the SAME staff/slot 409s (the GiST EXCLUDE constraint
    // rejects it, same mechanism the availability engine reads from).
    const overlapRes = await req("POST", "/manage/blocks", managerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "break",
    });
    expect(overlapRes.status).toBe(409);

    // 3. Delete the block -> restores the slot.
    const deleteRes = await req("DELETE", `/manage/blocks/${blockId}`, managerToken);
    expect(deleteRes.status).toBe(200);

    const dbAfterDelete = await AppDataSource.getRepository(StaffEngagement).findOne({
      where: { id: blockId },
    });
    expect(dbAfterDelete?.status).toBe(EngagementStatus.released);

    // 4. The same overlapping reserve now succeeds — the slot is free again.
    const afterDeleteRes = await req("POST", "/manage/blocks", managerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "break",
    });
    expect(afterDeleteRes.status).toBe(201);
    const afterDeleteJson = (await afterDeleteRes.json()) as any;
    createdEngagementIds.push(afterDeleteJson.data.id);
  });

  it("non-manager of the vendor (vendor_member role=staff, lacks products.write): 403", async () => {
    const slot = nextSlot();
    const res = await req("POST", "/manage/blocks", staffRoleToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "manual_block",
    });
    expect(res.status).toBe(403);
  });

  it("rejects a request with no bearer token", async () => {
    const slot = nextSlot();
    const res = await req("POST", "/manage/blocks", undefined, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "manual_block",
    });
    expect(res.status).toBe(401);
  });

  it("deleting a marketplace-kind engagement via this route: 404, never released", async () => {
    const slot = nextSlot();
    // Inserted via the same raw INSERT ... RETURNING * shape
    // EngagementService.reserve uses (bypassing the real booking-creation
    // flow, which is out of scope here) — staff_engagements has no FK back
    // to `bookings`, so a bare marketplace_booking-kind row is a valid,
    // minimal fixture for asserting this route refuses to touch non-block
    // kinds. Raw SQL (not repo.save()) mirrors reserve()'s own tstzrange
    // literal construction rather than relying on TypeORM to serialize the
    // `tstzrange` column type.
    const [marketplaceEngagement] = await AppDataSource.query(
      `INSERT INTO staff_engagements
         (staff_member_id, vendor_id, starts_at, ends_at, status, kind)
       VALUES ($1, $2, $3::timestamptz, $4::timestamptz,
          $5::staff_engagements_status_enum, $6::staff_engagements_kind_enum)
       RETURNING *`,
      [
        staffId,
        vendorId,
        slot.start.toISOString(),
        slot.end.toISOString(),
        EngagementStatus.confirmed,
        EngagementKind.marketplace_booking,
      ],
    );
    createdEngagementIds.push(marketplaceEngagement.id);

    const res = await req("DELETE", `/manage/blocks/${marketplaceEngagement.id}`, managerToken);
    expect(res.status).toBe(404);

    const dbEngagement = await AppDataSource.getRepository(StaffEngagement).findOne({
      where: { id: marketplaceEngagement.id },
    });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);
  });

  it("deleting a nonexistent block id: 404", async () => {
    const res = await req(
      "DELETE",
      "/manage/blocks/00000000-0000-0000-0000-000000000000",
      managerToken,
    );
    expect(res.status).toBe(404);
  });
});
