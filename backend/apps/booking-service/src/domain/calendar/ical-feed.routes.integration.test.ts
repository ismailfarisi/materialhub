// ical-feed.routes.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1) — boots the real booking-service `app`
// and drives GET /calendar/staff/:id/feed.ics end-to-end: real
// staff_engagements rows of mixed kind/status, a real signed token
// (ical-feed-token.ts against the real config.bookings.icalFeedSecret), no
// JWT (this route is public/token-signed — see jwt-auth.ts's isPublicRoute
// bypass + app.ts's mounting of icalFeedRoutes). Mirrors
// block-time.routes.integration.test.ts's fixture-setup shape (vendor +
// location + staff via repos, raw INSERT for engagement rows the same way
// its "marketplace-kind engagement" fixture does, cleanup in afterAll).
//
// Covers the Task 5 brief's live-DB assertion:
//   "create engagements of mixed kinds/statuses -> feed contains exactly the
//   right ones; bad token -> 401."
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import {
  AppDataSource,
  EngagementKind,
  EngagementStatus,
  StaffEngagement,
  StaffMember,
  Vendor,
  VendorLocation,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { app } from "../../app.ts";
import { signIcalFeedToken } from "./ical-feed-token.ts";
import { parseICal } from "./ical-parse.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

async function get(path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, { method: "GET" }));
}

const BASE_DAY = new Date(Date.now() + 10 * 24 * 3_600_000); // 10 days out
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

async function insertEngagement(
  staffId: string,
  vendorId: string,
  kind: EngagementKind,
  status: EngagementStatus,
): Promise<{ id: string; slot: { start: Date; end: Date } }> {
  const slot = nextSlot();
  const [row] = await AppDataSource.query(
    `INSERT INTO staff_engagements
       (staff_member_id, vendor_id, starts_at, ends_at, status, kind)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz,
        $5::staff_engagements_status_enum, $6::staff_engagements_kind_enum)
     RETURNING *`,
    [staffId, vendorId, slot.start.toISOString(), slot.end.toISOString(), status, kind],
  );
  return { id: row.id, slot };
}

describeLive("GET /calendar/staff/:id/feed.ics (live DB) — outbound iCal feed", () => {
  let vendorId = "";
  let staffId = "";
  let otherStaffId = "";

  const createdEngagementIds: string[] = [];

  beforeAll(async () => {
    await ensureDatabase();

    const vendorRepo = AppDataSource.getRepository(Vendor);
    const locationRepo = AppDataSource.getRepository(VendorLocation);
    const staffRepo = AppDataSource.getRepository(StaffMember);

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `Ical Feed Test Vendor ${unique}`,
        slug: `ical-feed-test-vendor-${unique}`,
        business_name: "Test Spa",
        business_type: "salon",
        contact_email: `ical-feed-vendor-${unique}@test.local`,
        contact_phone: "+971500000006",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    await locationRepo.save(
      locationRepo.create({ vendor_id: vendorId, name: "Downtown Branch", is_active: true }),
    );

    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Ical Feed Stylist ${unique}` }),
    );
    staffId = staff.id;

    const otherStaff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `Ical Feed Other Stylist ${unique}` }),
    );
    otherStaffId = otherStaff.id;
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[ical-feed.routes.integration.test] cleanup "${label}" failed`, err);
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
    if (staffId || otherStaffId) {
      await step("delete staff", () =>
        AppDataSource.getRepository(StaffMember)
          .createQueryBuilder()
          .delete()
          .where("vendor_id = :id", { id: vendorId })
          .execute(),
      );
    }
    if (vendorId) {
      await step("delete location", () =>
        AppDataSource.getRepository(VendorLocation)
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
  }, 30_000);

  it("feed contains exactly the confirmed, non-external_import engagements for this staff member", async () => {
    const included1 = await insertEngagement(
      staffId,
      vendorId,
      EngagementKind.marketplace_booking,
      EngagementStatus.confirmed,
    );
    createdEngagementIds.push(included1.id);
    const included2 = await insertEngagement(
      staffId,
      vendorId,
      EngagementKind.break,
      EngagementStatus.confirmed,
    );
    createdEngagementIds.push(included2.id);

    const excludedHeld = await insertEngagement(
      staffId,
      vendorId,
      EngagementKind.marketplace_booking,
      EngagementStatus.held,
    );
    createdEngagementIds.push(excludedHeld.id);
    const excludedImport = await insertEngagement(
      staffId,
      vendorId,
      EngagementKind.external_import,
      EngagementStatus.confirmed,
    );
    createdEngagementIds.push(excludedImport.id);
    const excludedCancelled = await insertEngagement(
      staffId,
      vendorId,
      EngagementKind.manual_block,
      EngagementStatus.cancelled,
    );
    createdEngagementIds.push(excludedCancelled.id);
    const excludedOtherStaff = await insertEngagement(
      otherStaffId,
      vendorId,
      EngagementKind.marketplace_booking,
      EngagementStatus.confirmed,
    );
    createdEngagementIds.push(excludedOtherStaff.id);

    const token = signIcalFeedToken(config.bookings.icalFeedSecret, staffId);
    const res = await get(`/calendar/staff/${staffId}/feed.ics?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain(`staff-${staffId}.ics`);

    const body = await res.text();
    const events = parseICal(body);
    const uids = events.map((e) => e.uid).sort();
    expect(uids).toEqual(
      [`engagement-${included1.id}@materialhubuae.com`, `engagement-${included2.id}@materialhubuae.com`].sort(),
    );

    const summaries = new Map(events.map((e) => [e.uid, e.summary]));
    expect(summaries.get(`engagement-${included1.id}@materialhubuae.com`)).toBe("MaterialHub booking");
    expect(summaries.get(`engagement-${included2.id}@materialhubuae.com`)).toBe("Blocked");
  });

  it("missing token: 401", async () => {
    const res = await get(`/calendar/staff/${staffId}/feed.ics`);
    expect(res.status).toBe(401);
  });

  it("malformed/garbage token: 401", async () => {
    const res = await get(`/calendar/staff/${staffId}/feed.ics?token=not-a-real-token`);
    expect(res.status).toBe(401);
  });

  it("a token issued for a different staff member: 401 (never leaks)", async () => {
    const tokenForOther = signIcalFeedToken(config.bookings.icalFeedSecret, otherStaffId);
    const res = await get(
      `/calendar/staff/${staffId}/feed.ics?token=${encodeURIComponent(tokenForOther)}`,
    );
    expect(res.status).toBe(401);
  });

  it("valid-format token for a staff id that doesn't exist at all: 401, never a 404 or 200", async () => {
    const unknownStaffId = "00000000-0000-0000-0000-000000000000";
    const guessedToken = signIcalFeedToken(config.bookings.icalFeedSecret, staffId); // wrong id on purpose
    const res = await get(
      `/calendar/staff/${unknownStaffId}/feed.ics?token=${encodeURIComponent(guessedToken)}`,
    );
    expect(res.status).toBe(401);
  });
});
