// calendar-feed-url.routes.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1) — boots the real booking-service `app`
// and drives POST /manage/staff/:id/calendar-feed-url end-to-end with real
// signed vendor JWTs, so jwtAuth + vendorMembership +
// CalendarFeedUrlController/CalendarFeedUrlService (staff -> linked-locations
// authorization) are all exercised for real, not mocked. Mirrors
// block-time.routes.integration.test.ts's shape (imports `app` directly,
// ensureDatabase() in beforeAll, jsonwebtoken to sign tokens,
// permissionMatrix.__setMapForTests seeding, cleanup in afterAll).
//
// Covers the Task 5 brief's live-DB assertion:
//   "issue-URL endpoint returns a URL whose token verifies against the same
//   staff id and 401s for a different staff id" — plus an end-to-end check
//   that the issued URL actually round-trips through the real GET
//   /calendar/staff/:id/feed.ics route (ical-feed.routes.ts).
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  StaffMember,
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
import { permissionMatrix } from "@materialhub/guards";
import jwt from "jsonwebtoken";
import { app } from "../../app.ts";
import { verifyIcalFeedToken } from "../calendar/ical-feed-token.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

function signVendorUser(id: string, email: string, vm: Array<{ vid: string; r: string }>): string {
  return jwt.sign({ sub: id, email, role: "customer", vm }, config.jwt.accessSecret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

async function req(method: string, path: string, token?: string): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }),
  );
}

describeLive("POST /manage/staff/:id/calendar-feed-url (live DB) — issue outbound feed URL", () => {
  let vendorId = "";
  let staffId = "";
  let otherVendorStaffId = "";
  let managerToken = "";
  let staffRoleToken = "";

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabase();

    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "products.write" },
      { role: "manager", permission: "products.write" },
    ]);

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const vendorMemberRepo = AppDataSource.getRepository(VendorMember);

    async function makeUser(label: string) {
      const u = await userRepo.save(
        userRepo.create({
          first_name: "IcalFeedUrl",
          last_name: label,
          email: `ical-feed-url-${label}-${unique}@test.local`,
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
        name: `Ical Feed URL Test Vendor ${unique}`,
        slug: `ical-feed-url-test-vendor-${unique}`,
        business_name: "Test Spa",
        business_type: "salon",
        contact_email: `ical-feed-url-vendor-${unique}@test.local`,
        contact_phone: "+971500000007",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Ical Feed URL Stylist ${unique}` }),
    );
    staffId = staff.id;

    const otherStaff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Ical Feed URL Other Stylist ${unique}` }),
    );
    otherVendorStaffId = otherStaff.id;

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
        console.error(`[calendar-feed-url.routes.integration.test] cleanup "${label}" failed`, err);
      }
    }

    await step("delete vendor_members", () =>
      AppDataSource.getRepository(VendorMember)
        .createQueryBuilder()
        .delete()
        .where("vendor_id = :id", { id: vendorId })
        .execute(),
    );
    if (vendorId) {
      await step("delete staff", () =>
        AppDataSource.getRepository(StaffMember)
          .createQueryBuilder()
          .delete()
          .where("vendor_id = :id", { id: vendorId })
          .execute(),
      );
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

  it("manager issues a feed URL whose token verifies for this staff id and 401s for a different one", async () => {
    const res = await req("POST", `/manage/staff/${staffId}/calendar-feed-url`, managerToken);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    const url: string = json.data.url;
    expect(url).toContain(`/calendar/staff/${staffId}/feed.ics`);

    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(verifyIcalFeedToken(config.bookings.icalFeedSecret, token as string, staffId)).toBe(
      true,
    );
    expect(
      verifyIcalFeedToken(config.bookings.icalFeedSecret, token as string, otherVendorStaffId),
    ).toBe(false);
  });

  it("re-issuing returns the same URL (deterministic, no state)", async () => {
    const first = await req("POST", `/manage/staff/${staffId}/calendar-feed-url`, managerToken);
    const second = await req("POST", `/manage/staff/${staffId}/calendar-feed-url`, managerToken);
    const firstJson = (await first.json()) as any;
    const secondJson = (await second.json()) as any;
    expect(firstJson.data.url).toBe(secondJson.data.url);
  });

  it("the issued URL round-trips through the real GET feed route", async () => {
    const issueRes = await req("POST", `/manage/staff/${staffId}/calendar-feed-url`, managerToken);
    const issueJson = (await issueRes.json()) as any;
    const url = new URL(issueJson.data.url);

    const feedRes = await app.handle(
      new Request(`http://localhost${url.pathname}${url.search}`, { method: "GET" }),
    );
    expect(feedRes.status).toBe(200);
    expect(feedRes.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
  });

  it("non-manager of the vendor (vendor_member role=staff, lacks products.write): 403", async () => {
    const res = await req("POST", `/manage/staff/${staffId}/calendar-feed-url`, staffRoleToken);
    expect(res.status).toBe(403);
  });

  it("rejects a request with no bearer token", async () => {
    const res = await req("POST", `/manage/staff/${staffId}/calendar-feed-url`);
    expect(res.status).toBe(401);
  });

  it("a nonexistent staff id: 404", async () => {
    const res = await req(
      "POST",
      "/manage/staff/00000000-0000-0000-0000-000000000000/calendar-feed-url",
      managerToken,
    );
    expect(res.status).toBe(404);
  });
});
