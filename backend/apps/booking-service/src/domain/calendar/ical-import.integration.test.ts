// ical-import.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1) — exercises IcalImportService.sync against
// the REAL staff_engagements capacity ledger + the real no_double_book EXCLUDE
// constraint, driving sync(subscription, feedText) directly with fixture iCal
// text (NO network / no real URL fetch). Mirrors the manage/*.integration.test
// shape (ensureDatabase in beforeAll, raw cleanup in afterAll). The
// notification queue is a spy (assert enqueue, not real Redis consumption); the
// availability cache is omitted (undefined) so no Redis is touched — "blocked
// availability" is asserted via the EXCLUDE constraint itself (an overlapping
// reserve 409s), which is exactly what the read-side availability engine reads.
//
// Covers the Task 4 brief's five live-DB assertions:
//   1. a two-event feed creates external_import engagements that block the slot;
//   2. re-importing the same feed is idempotent (no duplicates);
//   3. an event removed from the feed is released (its slot frees);
//   4. an event overlapping a pre-existing confirmed engagement lands
//      `conflicted` + enqueues vendor_booking_conflict (not skipped);
//   5. cancelling the blocker then re-syncing promotes it to `confirmed`.
// Plus: DELETE (CalendarSubscriptionService.remove) releases imported capacity.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  EngagementKind,
  EngagementStatus,
  LocationMembership,
  StaffCalendarSubscription,
  StaffEngagement,
  StaffLocation,
  StaffMember,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorLocation,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import { ConflictError } from "@materialhub/plugins";
import { EngagementService } from "../engagement/engagement.service.ts";
import { CalendarSubscriptionService } from "../manage/calendar-subscription.service.ts";
import { IcalImportService } from "./ical-import.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const unique = Date.now();

function icsStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
function buildFeed(
  events: Array<{ uid: string; start: Date; end: Date; summary?: string }>,
): string {
  const vevents = events
    .map((e) =>
      [
        "BEGIN:VEVENT",
        `UID:${e.uid}`,
        `DTSTART:${icsStamp(e.start)}`,
        `DTEND:${icsStamp(e.end)}`,
        ...(e.summary ? [`SUMMARY:${e.summary}`] : []),
        "END:VEVENT",
      ].join("\n"),
    )
    .join("\n");
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${vevents}\nEND:VCALENDAR`;
}

// 12 days out (distinct from Task 1/2's 8/9-day fixture windows).
const BASE_DAY = new Date(Date.now() + 12 * 24 * 3_600_000);
function slot(hourUtc: number, minutes = 60): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(
      BASE_DAY.getUTCFullYear(),
      BASE_DAY.getUTCMonth(),
      BASE_DAY.getUTCDate(),
      hourUtc,
      0,
      0,
    ),
  );
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

describeLive("IcalImportService.sync (live DB) — inbound iCal import", () => {
  let vendorId = "";
  let locationId = "";
  let ownerUserId = "";

  const notifications: Array<Record<string, unknown>> = [];
  const notificationQueue = {
    async add(_name: string, data: unknown) {
      notifications.push(data as Record<string, unknown>);
    },
  };
  const vendorOwnerLookup = {
    async findOwnerUserId() {
      return ownerUserId;
    },
  };

  let service: IcalImportService;
  let engagementService: EngagementService;
  let subscriptionRepo: ReturnType<typeof AppDataSource.getRepository<StaffCalendarSubscription>>;
  let engagementRepo: ReturnType<typeof AppDataSource.getRepository<StaffEngagement>>;

  const createdStaffIds: string[] = [];
  const createdSubscriptionIds: string[] = [];

  async function makeStaffWithSubscription(
    label: string,
  ): Promise<{ staffId: string; subscription: StaffCalendarSubscription }> {
    const staffRepo = AppDataSource.getRepository(StaffMember);
    const staffLocationRepo = AppDataSource.getRepository(StaffLocation);
    const staff = await staffRepo.save(
      staffRepo.create({ vendor_id: vendorId, name: `iCal ${label} ${unique}` }),
    );
    createdStaffIds.push(staff.id);
    await staffLocationRepo.save(
      staffLocationRepo.create({ staff_member_id: staff.id, vendor_location_id: locationId }),
    );
    const subscription = await subscriptionRepo.save(
      subscriptionRepo.create({
        staff_member_id: staff.id,
        vendor_id: vendorId,
        ical_url: `https://cal.example/${label}-${unique}.ics`,
        is_active: true,
      }),
    );
    createdSubscriptionIds.push(subscription.id);
    return { staffId: staff.id, subscription };
  }

  function importRowsFor(subId: string): Promise<StaffEngagement[]> {
    return engagementRepo.find({ where: { external_source: subId } });
  }

  beforeAll(async () => {
    await ensureDatabase();
    subscriptionRepo = AppDataSource.getRepository(StaffCalendarSubscription);
    engagementRepo = AppDataSource.getRepository(StaffEngagement);

    const userRepo = AppDataSource.getRepository(User);
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const locationRepo = AppDataSource.getRepository(VendorLocation);

    const owner = await userRepo.save(
      userRepo.create({
        first_name: "iCal",
        last_name: "Owner",
        email: `ical-owner-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    ownerUserId = owner.id;

    const vendor = await vendorRepo.save(
      vendorRepo.create({
        name: `iCal Import Vendor ${unique}`,
        slug: `ical-import-vendor-${unique}`,
        business_name: "Test Spa",
        business_type: "salon",
        contact_email: `ical-vendor-${unique}@test.local`,
        contact_phone: "+971500000009",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const location = await locationRepo.save(
      locationRepo.create({ vendor_id: vendorId, name: "Main Branch", is_active: true }),
    );
    locationId = location.id;

    // staffRepo used by the service for the conflict-notification staff_name.
    service = new IcalImportService(
      subscriptionRepo,
      engagementRepo,
      new EngagementService(engagementRepo), // no cache -> no Redis
      AppDataSource.getRepository(StaffMember),
      notificationQueue,
      vendorOwnerLookup,
    );
    engagementService = new EngagementService(engagementRepo);
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[ical-import.integration.test] cleanup "${label}" failed`, err);
      }
    }
    if (vendorId) {
      await step("delete engagements", () =>
        engagementRepo
          .createQueryBuilder()
          .delete()
          .where("vendor_id = :id", { id: vendorId })
          .execute(),
      );
    }
    if (createdSubscriptionIds.length) {
      await step("delete subscriptions", () =>
        subscriptionRepo
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdSubscriptionIds })
          .execute(),
      );
    }
    if (createdStaffIds.length) {
      await step("delete staff_locations", () =>
        AppDataSource.getRepository(StaffLocation)
          .createQueryBuilder()
          .delete()
          .where("staff_member_id IN (:...ids)", { ids: createdStaffIds })
          .execute(),
      );
      await step("delete staff", () =>
        AppDataSource.getRepository(StaffMember)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdStaffIds })
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
    if (ownerUserId) {
      await step("delete user", () =>
        AppDataSource.getRepository(User)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: ownerUserId })
          .execute(),
      );
    }
  }, 30_000);

  it("imports a two-event feed, blocks slots, is idempotent, and releases removed events", async () => {
    const { staffId, subscription } = await makeStaffWithSubscription("lifecycle");
    const a = slot(9);
    const b = slot(11);
    const feedBoth = buildFeed([
      { uid: "evt-a", start: a.start, end: a.end, summary: "Google appt A" },
      { uid: "evt-b", start: b.start, end: b.end, summary: "Google appt B" },
    ]);

    // 1. First import -> two confirmed external_import engagements.
    const res1 = await service.sync(subscription, feedBoth, new Date());
    expect(res1.inserted).toBe(2);

    const confirmed1 = (await importRowsFor(subscription.id)).filter(
      (r) => r.status === EngagementStatus.confirmed,
    );
    expect(confirmed1.length).toBe(2);
    expect(confirmed1.every((r) => r.kind === EngagementKind.external_import)).toBe(true);

    // Availability is blocked: an overlapping reserve on A's slot 409s.
    // try/catch (not expect().rejects) — the .rejects matcher interacts badly
    // with the shared pg pool under bun test on a query that throws 23P01.
    let blocked = false;
    try {
      await engagementService.reserve({
        staffMemberId: staffId,
        vendorId,
        startsAt: a.start,
        endsAt: a.end,
        kind: EngagementKind.manual_block,
        status: EngagementStatus.confirmed,
      });
    } catch (err) {
      blocked = err instanceof ConflictError;
    }
    expect(blocked).toBe(true);

    // 2. Re-import the SAME feed -> idempotent (still exactly two, no dupes).
    const res2 = await service.sync(subscription, feedBoth, new Date());
    expect(res2.unchanged).toBe(2);
    expect(res2.inserted).toBe(0);
    const confirmed2 = (await importRowsFor(subscription.id)).filter(
      (r) => r.status === EngagementStatus.confirmed,
    );
    expect(confirmed2.length).toBe(2);

    // 3. Drop B from the feed -> B is released, its slot frees.
    const feedA = buildFeed([{ uid: "evt-a", start: a.start, end: a.end }]);
    const res3 = await service.sync(subscription, feedA, new Date());
    expect(res3.released).toBe(1);
    const confirmed3 = (await importRowsFor(subscription.id)).filter(
      (r) => r.status === EngagementStatus.confirmed,
    );
    expect(confirmed3.length).toBe(1);
    expect(confirmed3[0]?.external_ref).toBe("evt-a");

    // B's slot is now free: a reserve there succeeds.
    const freed = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: b.start,
      endsAt: b.end,
      kind: EngagementKind.manual_block,
      status: EngagementStatus.confirmed,
    });
    expect(freed.id).toBeTruthy();
  }, 30_000);

  it("lands a conflict as conflicted + notifies, then promotes to confirmed once the blocker is cancelled", async () => {
    const { staffId, subscription } = await makeStaffWithSubscription("conflict");
    const c = slot(14);
    notifications.length = 0;

    // Pre-existing confirmed marketplace engagement occupying C's slot.
    const blocker = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: c.start,
      endsAt: c.end,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
    });

    const feedC = buildFeed([{ uid: "evt-c", start: c.start, end: c.end, summary: "Fresha C" }]);

    // 4. Import C -> collides with the blocker -> lands conflicted + notifies.
    const res1 = await service.sync(subscription, feedC, new Date());
    expect(res1.conflicted).toBe(1);
    expect(res1.notified).toBe(1);

    const importRows = await importRowsFor(subscription.id);
    const conflictedRow = importRows.find((r) => r.external_ref === "evt-c");
    expect(conflictedRow?.status).toBe(EngagementStatus.conflicted);

    // The notification carries the exact conflict-template variables.
    expect(notifications.length).toBe(1);
    const evt = notifications[0] as any;
    expect(evt.notificationType).toBe("vendor_booking_conflict");
    expect(evt.userId).toBe(ownerUserId);
    expect(evt.variables.existing_summary).toBe("MaterialHub booking");
    expect(evt.variables.conflicting_summary).toBe("Fresha C");
    expect(evt.variables.conflicting_starts_at).toBe(c.start.toISOString());

    // Re-sync while STILL blocked -> stays conflicted, NO re-notification (anti-spam).
    const res2 = await service.sync(subscription, feedC, new Date());
    expect(res2.stillConflicted).toBe(1);
    expect(res2.promoted).toBe(0);
    expect(notifications.length).toBe(1);

    // 5. Cancel the blocker, then re-sync -> the conflicted row promotes to confirmed.
    await engagementService.release(blocker.id);
    const res3 = await service.sync(subscription, feedC, new Date());
    expect(res3.promoted).toBe(1);

    const promoted = (await importRowsFor(subscription.id)).find((r) => r.external_ref === "evt-c");
    expect(promoted?.status).toBe(EngagementStatus.confirmed);
    expect(notifications.length).toBe(1); // still no re-notification
  }, 30_000);

  it("expands a recurring (RRULE) feed into one engagement PER occurrence, is idempotent, and releases an EXDATEd occurrence (review C1)", async () => {
    const { staffId, subscription } = await makeStaffWithSubscription("recurring");
    // A weekly recurring VEVENT whose first occurrence is BASE_DAY at 10:00 UTC.
    // `now` is injected so the expansion window is deterministic relative to it.
    const now = new Date();
    const first = new Date(
      Date.UTC(BASE_DAY.getUTCFullYear(), BASE_DAY.getUTCMonth(), BASE_DAY.getUTCDate(), 10, 0, 0),
    );
    const firstEnd = new Date(first.getTime() + 60 * 60_000);
    const rruleFeed = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:weekly-${unique}@google.com`,
      `DTSTART:${icsStamp(first)}`,
      `DTEND:${icsStamp(firstEnd)}`,
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "SUMMARY:Weekly standing client",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    // 1. Import -> 3 confirmed external_import occurrences (one per week), each
    //    with a distinct `{uid}#{occurrenceStart}` external_ref.
    const res1 = await service.sync(subscription, rruleFeed, now);
    expect(res1.inserted).toBe(3);
    const confirmed1 = (await importRowsFor(subscription.id)).filter(
      (r) => r.status === EngagementStatus.confirmed,
    );
    expect(confirmed1.length).toBe(3);
    expect(new Set(confirmed1.map((r) => r.external_ref)).size).toBe(3);
    expect(confirmed1.every((r) => r.external_ref?.includes("#"))).toBe(true);

    // The first occurrence's slot is blocked.
    let blocked = false;
    try {
      await engagementService.reserve({
        staffMemberId: staffId,
        vendorId,
        startsAt: first,
        endsAt: firstEnd,
        kind: EngagementKind.manual_block,
        status: EngagementStatus.confirmed,
      });
    } catch (err) {
      blocked = err instanceof ConflictError;
    }
    expect(blocked).toBe(true);

    // 2. Re-import the SAME feed -> idempotent (all 3 unchanged, no dupes).
    const res2 = await service.sync(subscription, rruleFeed, now);
    expect(res2.unchanged).toBe(3);
    expect(res2.inserted).toBe(0);

    // 3. EXDATE the SECOND occurrence -> it is released, its slot frees.
    const second = new Date(first.getTime() + 7 * 24 * 3_600_000);
    const secondEnd = new Date(second.getTime() + 60 * 60_000);
    const exdatedFeed = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:weekly-${unique}@google.com`,
      `DTSTART:${icsStamp(first)}`,
      `DTEND:${icsStamp(firstEnd)}`,
      "RRULE:FREQ=WEEKLY;COUNT=3",
      `EXDATE:${icsStamp(second)}`,
      "SUMMARY:Weekly standing client",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const res3 = await service.sync(subscription, exdatedFeed, now);
    expect(res3.released).toBe(1);
    const confirmed3 = (await importRowsFor(subscription.id)).filter(
      (r) => r.status === EngagementStatus.confirmed,
    );
    expect(confirmed3.length).toBe(2);

    // The EXDATEd (second) occurrence's slot is now free.
    const freed = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: second,
      endsAt: secondEnd,
      kind: EngagementKind.manual_block,
      status: EngagementStatus.confirmed,
    });
    expect(freed.id).toBeTruthy();
  }, 30_000);

  it("removing a subscription (CalendarSubscriptionService.remove) releases its imported capacity", async () => {
    const { staffId, subscription } = await makeStaffWithSubscription("delete");
    const d = slot(16);
    const feedD = buildFeed([{ uid: "evt-d", start: d.start, end: d.end }]);
    await service.sync(subscription, feedD, new Date());

    const crud = new CalendarSubscriptionService(
      AppDataSource.getRepository(StaffMember),
      AppDataSource.getRepository(StaffLocation),
      subscriptionRepo,
      engagementRepo,
      {
        locationRepo: AppDataSource.getRepository(VendorLocation),
        membershipRepo: AppDataSource.getRepository(LocationMembership),
      },
      // no cache -> no Redis
    );

    // Owner role -> fast-path location access; releases the engagement + soft-deletes the row.
    await crud.remove({ userId: ownerUserId, vendorId, role: "owner" }, staffId);

    const rows = await importRowsFor(subscription.id);
    expect(rows.every((r) => r.status === EngagementStatus.released)).toBe(true);

    // The slot is free again.
    const freed = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt: d.start,
      endsAt: d.end,
      kind: EngagementKind.manual_block,
      status: EngagementStatus.confirmed,
    });
    expect(freed.id).toBeTruthy();

    // Subscription soft-deleted (not found by the default, non-deleted query).
    const stillThere = await subscriptionRepo.findOne({
      where: { staff_member_id: staffId },
    });
    expect(stillThere).toBeNull();
  }, 30_000);
});
