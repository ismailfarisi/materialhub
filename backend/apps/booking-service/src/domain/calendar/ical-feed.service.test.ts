// ical-feed.service.test.ts
//
// Mocked-repo unit tests (no DB) for IcalFeedService.forStaff — confirmed-only
// + external_import-excluded filtering, PII-free generic summaries, and
// deterministic output via an injected `now`. Live-DB coverage (real
// EXCLUDE-constraint-backed engagements, real route auth) lives in
// ical-feed.routes.integration.test.ts.
import { describe, expect, it, mock } from "bun:test";
import { EngagementKind, EngagementStatus, type StaffEngagement } from "@materialhub/database";
import { IcalFeedService } from "./ical-feed.service.ts";
import { generateICal } from "./ical-feed.ts";
import { parseICal } from "./ical-parse.ts";

const NOW = new Date("2026-08-09T10:00:00.000Z");
const STAFF_ID = "staff-1";

function engagement(overrides: Partial<StaffEngagement>): StaffEngagement {
  return {
    id: "eng-default",
    staff_member_id: STAFF_ID,
    vendor_id: "vendor-1",
    slot_range: "",
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
    status: EngagementStatus.confirmed,
    kind: EngagementKind.marketplace_booking,
    external_source: null,
    external_ref: null,
    created_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as StaffEngagement;
}

function setup(engagements: StaffEngagement[]) {
  const engagementRepo = { find: mock(async () => engagements) };
  const service = new IcalFeedService(engagementRepo as any);
  return { service, engagementRepo };
}

describe("IcalFeedService.forStaff", () => {
  it("includes confirmed marketplace_booking/walk_in/phone with the generic 'MaterialHub booking' summary", async () => {
    const fixtures = [
      engagement({ id: "eng-1", kind: EngagementKind.marketplace_booking }),
      engagement({ id: "eng-2", kind: EngagementKind.walk_in }),
      engagement({ id: "eng-3", kind: EngagementKind.phone }),
    ];
    const { service } = setup(fixtures);

    const ics = await service.forStaff(STAFF_ID, NOW);

    expect(ics).toContain("UID:engagement-eng-1@materialhubuae.com");
    expect(ics).toContain("UID:engagement-eng-2@materialhubuae.com");
    expect(ics).toContain("UID:engagement-eng-3@materialhubuae.com");
    expect((ics.match(/SUMMARY:MaterialHub booking/g) ?? []).length).toBe(3);
  });

  it("includes confirmed manual_block/break with the generic 'Blocked' summary", async () => {
    const fixtures = [
      engagement({ id: "eng-block", kind: EngagementKind.manual_block }),
      engagement({ id: "eng-break", kind: EngagementKind.break }),
    ];
    const { service } = setup(fixtures);

    const ics = await service.forStaff(STAFF_ID, NOW);

    expect((ics.match(/SUMMARY:Blocked/g) ?? []).length).toBe(2);
  });

  it("excludes external_import engagements even when confirmed (loop-avoidance)", async () => {
    const fixtures = [
      engagement({ id: "eng-keep", kind: EngagementKind.marketplace_booking }),
      engagement({
        id: "eng-imported",
        kind: EngagementKind.external_import,
        status: EngagementStatus.confirmed,
      }),
    ];
    const { service } = setup(fixtures);

    const ics = await service.forStaff(STAFF_ID, NOW);

    expect(ics).toContain("UID:engagement-eng-keep@materialhubuae.com");
    expect(ics).not.toContain("eng-imported");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it("excludes non-confirmed statuses (held, released, cancelled, conflicted)", async () => {
    const fixtures = [
      engagement({ id: "eng-held", status: EngagementStatus.held }),
      engagement({ id: "eng-released", status: EngagementStatus.released }),
      engagement({ id: "eng-cancelled", status: EngagementStatus.cancelled }),
      engagement({ id: "eng-conflicted", status: EngagementStatus.conflicted }),
      engagement({ id: "eng-confirmed", status: EngagementStatus.confirmed }),
    ];
    const { service } = setup(fixtures);

    const ics = await service.forStaff(STAFF_ID, NOW);

    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect(ics).toContain("UID:engagement-eng-confirmed@materialhubuae.com");
  });

  it("never includes LOCATION or DESCRIPTION (no PII fields populated)", async () => {
    const { service } = setup([engagement({ id: "eng-1" })]);
    const ics = await service.forStaff(STAFF_ID, NOW);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("produces deterministic output for an injected `now` — exact string match", async () => {
    const fixtures = [
      engagement({
        id: "eng-1",
        kind: EngagementKind.marketplace_booking,
        starts_at: new Date("2026-08-10T10:00:00Z"),
        ends_at: new Date("2026-08-10T10:30:00Z"),
      }),
    ];
    const { service } = setup(fixtures);

    const ics = await service.forStaff(STAFF_ID, NOW);

    const expected = generateICal(
      [
        {
          uid: "engagement-eng-1@materialhubuae.com",
          summary: "MaterialHub booking",
          startsAt: new Date("2026-08-10T10:00:00Z"),
          endsAt: new Date("2026-08-10T10:30:00Z"),
        },
      ],
      { now: NOW, calName: "MaterialHub Bookings" },
    );
    expect(ics).toBe(expected);
  });

  it("round-trips a valid .ics through Task 3's parseICal", async () => {
    const fixtures = [
      engagement({
        id: "eng-rt",
        kind: EngagementKind.phone,
        starts_at: new Date("2026-09-01T08:00:00Z"),
        ends_at: new Date("2026-09-01T09:00:00Z"),
      }),
    ];
    const { service } = setup(fixtures);

    const ics = await service.forStaff(STAFF_ID, NOW);
    const parsed = parseICal(ics);

    expect(parsed.length).toBe(1);
    expect(parsed[0]?.uid).toBe("engagement-eng-rt@materialhubuae.com");
    expect(parsed[0]?.summary).toBe("MaterialHub booking");
    expect(parsed[0]?.startsAt.getTime()).toBe(new Date("2026-09-01T08:00:00Z").getTime());
    expect(parsed[0]?.endsAt.getTime()).toBe(new Date("2026-09-01T09:00:00Z").getTime());
  });

  it("returns a valid empty VCALENDAR when there are no qualifying engagements", async () => {
    const { service } = setup([]);
    const ics = await service.forStaff(STAFF_ID, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("defaults `now` to the current time when omitted", async () => {
    const { service } = setup([]);
    const ics = await service.forStaff(STAFF_ID);
    expect(ics).toContain("BEGIN:VCALENDAR");
  });
});
