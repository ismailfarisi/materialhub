// manual-booking.routes.integration.test.ts
//
// Live Postgres + Redis (BOOKING_LIVE_DB=1) — boots the real booking-service
// `app` and drives POST /manage/bookings end-to-end with real signed vendor
// JWTs, so jwtAuth + vendorMembership + assertLocationManager +
// ManualBookingController/ManualBookingService/EngagementService are all
// exercised for real, not mocked. Mirrors booking.routes.integration.test.ts's
// shape (imports `app` directly, ensureDatabase() in beforeAll, jsonwebtoken
// to sign tokens, cleanup in afterAll) and
// analytics-vendor-dashboard.test.ts's `permissionMatrix.__setMapForTests`
// seeding (the real `role_permissions` matrix is DB-seeded by
// 1746500000000-VendorMembershipFoundation, but tests seed the in-process
// singleton directly rather than depending on `permissionMatrix.load()`,
// which only runs from index.ts's real server boot).
//
// Covers the Task 1 brief's three live-DB assertions:
//   1. manager creates a walk-in -> engagement confirmed, blocks availability
//      (a second overlapping reserve on the same slot 409s).
//   2. overlapping second walk-in -> 409 (same point, folded into the first
//      as an explicit second call rather than a separate slot-probe).
//   3. non-manager of that location -> 403.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  Booking,
  BookingStatusHistory,
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
  // Deliberately omit `tv` (token_version) — jwtAuth only calls
  // getCurrentTokenVersion when `typeof payload.tv === "number"`, so omitting
  // it skips the DB/Redis revocation check entirely, matching
  // booking.routes.integration.test.ts's own signCustomer helper.
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

const BASE_DAY = new Date(Date.now() + 8 * 24 * 3_600_000); // 8 days out
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

describeLive("POST /manage/bookings (live DB) — manual walk-in/phone booking", () => {
  let vendorId = "";
  let otherVendorId = "";
  let locationId = "";
  let staffId = "";
  let managerToken = "";
  let staffRoleToken = "";
  let otherVendorOwnerToken = "";

  const createdUserIds: string[] = [];
  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabase();

    // Real `role_permissions` matrix is DB-seeded (1746500000000), but that's
    // only loaded into the in-process singleton by index.ts's real server
    // boot — tests seed it directly (mirrors
    // analytics-vendor-dashboard.test.ts). owner/manager get products.write;
    // staff deliberately does NOT, matching the real seeded matrix — the
    // vendorMembership guard itself 403s a staff-role actor before this
    // route's own assertLocationManager check ever runs.
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
          first_name: "Manual",
          last_name: label,
          email: `manual-booking-${label}-${unique}@test.local`,
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
        name: `Manual Booking Test Vendor ${unique}`,
        slug: `manual-booking-test-vendor-${unique}`,
        business_name: "Test Salon",
        business_type: "salon",
        contact_email: `manual-booking-vendor-${unique}@test.local`,
        contact_phone: "+971500000003",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const otherVendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Manual Booking Other Vendor ${unique}`,
        slug: `manual-booking-other-vendor-${unique}`,
        business_name: "Other Salon",
        business_type: "salon",
        contact_email: `manual-booking-other-vendor-${unique}@test.local`,
        contact_phone: "+971500000004",
        status: VendorStatus.approved,
      }),
    );
    otherVendorId = otherVendor.id;

    const location = await locationRepo.save(
      locationRepo.create({ vendor_id: vendorId, name: "Marina Branch", is_active: true }),
    );
    locationId = location.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Manual Booking Stylist ${unique}` }),
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

    // Non-manager of the location: a vendor_member with role "staff" — the
    // real seeded role_permissions matrix does NOT grant staff
    // `products.write`, so this actor 403s at the vendorMembership guard
    // itself, before assertLocationManager ever runs (see the brief's third
    // assertion: "non-manager of that location -> 403").
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

    // A DIFFERENT vendor's owner — passes vendorMembership("products.write")
    // (owner has it), but assertLocationManager's
    // `location.vendor_id !== actor.vendorId` branch must 403 them for THIS
    // vendor's location.
    const otherOwnerUser = await makeUser("otherowner");
    await vendorMemberRepo.save(
      vendorMemberRepo.create({
        vendor_id: otherVendorId,
        user_id: otherOwnerUser.id,
        email: otherOwnerUser.email,
        role: VendorMemberRole.owner,
        status: VendorMemberStatus.active,
      }),
    );
    otherVendorOwnerToken = signVendorUser(otherOwnerUser.id, otherOwnerUser.email, [
      { vid: otherVendorId, r: "owner" },
    ]);
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[manual-booking.routes.integration.test] cleanup "${label}" failed`, err);
      }
    }

    if (createdBookingIds.length) {
      await step("delete booking_status_history", () =>
        AppDataSource.getRepository(BookingStatusHistory)
          .createQueryBuilder()
          .delete()
          .where("booking_id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
      await step("delete bookings", () =>
        AppDataSource.getRepository(Booking)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
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
        .where("vendor_id IN (:...ids)", { ids: [vendorId, otherVendorId] })
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
    for (const id of [vendorId, otherVendorId]) {
      await step(`delete vendor ${id}`, () =>
        AppDataSource.getRepository(Vendor)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id })
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

  it("manager creates a walk-in: 201, engagement confirmed, booking row confirmed with no MaterialHub customer", async () => {
    const slot = nextSlot();
    const res = await req("POST", "/manage/bookings", managerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "walk_in",
      customer_name: "Walk-in Customer",
      customer_phone: "+971509999999",
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.data.engagement.status).toBe("confirmed");
    expect(json.data.booking.status).toBe("confirmed");
    expect(json.data.booking.customer_user_id).toBeNull();
    expect(json.data.booking.customer_name).toBe("Walk-in Customer");
    expect(json.data.booking.source).toBe("walk_in");
    expect(json.data.booking.payment_mode).toBe("pay_at_venue");
    createdBookingIds.push(json.data.booking.id);
    createdEngagementIds.push(json.data.engagement.id);

    // Blocks availability: the DB row is genuinely `confirmed`, in the EXCLUDE
    // predicate (held, confirmed) — verified directly rather than re-deriving
    // the availability engine here.
    const dbEngagement = await AppDataSource.getRepository(StaffEngagement).findOne({
      where: { id: json.data.engagement.id },
    });
    expect(dbEngagement?.status).toBe(EngagementStatus.confirmed);
  });

  it("overlapping second walk-in for the SAME staff/slot: 409", async () => {
    const slot = nextSlot();
    const first = await req("POST", "/manage/bookings", managerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "phone",
      customer_phone: "+971508888888",
    });
    expect(first.status).toBe(201);
    const firstJson = (await first.json()) as any;
    createdBookingIds.push(firstJson.data.booking.id);
    createdEngagementIds.push(firstJson.data.engagement.id);

    // Same exact slot, same staff member — the GiST EXCLUDE constraint must
    // reject the second reserve.
    const second = await req("POST", "/manage/bookings", managerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "walk_in",
      customer_name: "Overlap Customer",
    });
    expect(second.status).toBe(409);
  });

  it("non-manager of that location (vendor_member role=staff, lacks products.write): 403", async () => {
    const slot = nextSlot();
    const res = await req("POST", "/manage/bookings", staffRoleToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "walk_in",
      customer_name: "Should Not Be Created",
    });
    expect(res.status).toBe(403);
  });

  it("owner of a DIFFERENT vendor targeting this vendor's location: 403 (assertLocationManager)", async () => {
    const slot = nextSlot();
    const res = await req("POST", "/manage/bookings", otherVendorOwnerToken, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "walk_in",
      customer_name: "Should Not Be Created",
    });
    expect(res.status).toBe(403);
  });

  it("rejects a request with no bearer token", async () => {
    const slot = nextSlot();
    const res = await req("POST", "/manage/bookings", undefined, {
      staff_member_id: staffId,
      vendor_location_id: locationId,
      starts_at: slot.start.toISOString(),
      ends_at: slot.end.toISOString(),
      kind: "walk_in",
    });
    expect(res.status).toBe(401);
  });
});
