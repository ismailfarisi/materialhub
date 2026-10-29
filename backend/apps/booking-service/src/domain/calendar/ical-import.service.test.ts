// ical-import.service.test.ts
//
// Mocked unit tests for IcalImportService.sync — the full diff matrix, driven
// with fixture iCal text and constructor-injected fakes (no DB, no Redis, no
// network). Verifies: insert new / patch moved / release removed / unchanged
// no-write / conflict -> conflicted + notify once / promotion retry success &
// failure / removed-while-conflicted released / move-conflict -> release +
// conflicted.
import { describe, expect, it, mock } from "bun:test";
import { EngagementKind, EngagementStatus } from "@materialhub/database";
import { ConflictError } from "@materialhub/plugins";
import { IcalImportService } from "./ical-import.service.ts";

// ── Fixture feed builder ────────────────────────────────────────────────────
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

const SUBSCRIPTION = {
  id: "sub-1",
  staff_member_id: "staff-1",
  vendor_id: "vendor-1",
  ical_url: "https://cal.example/x.ics",
} as any;

const T0 = new Date("2026-08-01T09:00:00.000Z");
const T1 = new Date("2026-08-01T10:00:00.000Z");
const T2 = new Date("2026-08-01T11:00:00.000Z");

function existingRow(overrides: Record<string, unknown>) {
  return {
    id: "eng-existing",
    staff_member_id: "staff-1",
    vendor_id: "vendor-1",
    kind: EngagementKind.external_import,
    status: EngagementStatus.confirmed,
    external_source: "sub-1",
    external_ref: "uid-1",
    starts_at: T0,
    ends_at: T1,
    ...overrides,
  };
}

interface SetupOpts {
  existing?: Array<Record<string, unknown>>;
  conflictOnConfirm?: boolean; // reserve(confirmed) throws ConflictError
  moveConflict?: boolean; // move() throws ConflictError
  confirmFail?: boolean; // confirm() throws 23P01
  blocker?: Record<string, unknown> | null;
}

function setup(opts: SetupOpts = {}) {
  const existing = opts.existing ?? [];
  const engagementService = {
    reserve: mock(async (input: any) => {
      if (opts.conflictOnConfirm && input.status === EngagementStatus.confirmed) {
        throw new ConflictError("slot unavailable");
      }
      return { id: `eng-${input.externalRef}-${input.status}`, ...input };
    }),
    move: mock(async () => {
      if (opts.moveConflict) throw new ConflictError("slot unavailable");
      return {};
    }),
    release: mock(async (_engagementId: string) => {}),
    confirm: mock(async () => {
      if (opts.confirmFail) throw { code: "23P01" };
    }),
  };
  const engagementRepo = {
    find: mock(async () => existing),
    createQueryBuilder: () => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      orderBy() {
        return this;
      },
      getOne: async () => opts.blocker ?? null,
    }),
  };
  const staffRepo = { findOne: mock(async () => ({ id: "staff-1", name: "Alice" })) };
  const notificationQueue = { add: mock(async (_name: string, _payload: any) => {}) };
  const vendorOwnerLookup = { findOwnerUserId: mock(async () => "vendor-user-1") };

  const service = new IcalImportService(
    {} as any,
    engagementRepo as any,
    engagementService as any,
    staffRepo as any,
    notificationQueue as any,
    vendorOwnerLookup as any,
  );
  return {
    service,
    engagementService,
    engagementRepo,
    staffRepo,
    notificationQueue,
    vendorOwnerLookup,
  };
}

describe("IcalImportService.sync — diff matrix", () => {
  it("inserts a brand-new event as a confirmed import row", async () => {
    const { service, engagementService } = setup();
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T1, summary: "Haircut" }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.inserted).toBe(1);
    expect(res.conflicted).toBe(0);
    expect(engagementService.reserve).toHaveBeenCalledTimes(1);
    const arg = engagementService.reserve.mock.calls[0]![0];
    expect(arg.status).toBe(EngagementStatus.confirmed);
    expect(arg.kind).toBe(EngagementKind.external_import);
    expect(arg.externalSource).toBe("sub-1");
    expect(arg.externalRef).toBe("uid-1");
  });

  it("moves an existing confirmed row when the feed times change", async () => {
    const { service, engagementService } = setup({ existing: [existingRow({})] });
    // same uid, new end time
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T2 }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.moved).toBe(1);
    expect(engagementService.move).toHaveBeenCalledTimes(1);
    expect(engagementService.reserve).not.toHaveBeenCalled();
  });

  it("does not write when a confirmed row is unchanged", async () => {
    const { service, engagementService } = setup({ existing: [existingRow({})] });
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T1 }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.unchanged).toBe(1);
    expect(engagementService.reserve).not.toHaveBeenCalled();
    expect(engagementService.move).not.toHaveBeenCalled();
    expect(engagementService.release).not.toHaveBeenCalled();
  });

  it("releases a row whose uid disappeared from the feed", async () => {
    const { service, engagementService } = setup({ existing: [existingRow({})] });
    const feed = buildFeed([]); // empty feed

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.released).toBe(1);
    expect(engagementService.release).toHaveBeenCalledTimes(1);
    expect(engagementService.release.mock.calls[0]![0]).toBe("eng-existing");
  });

  it("lands a conflict as `conflicted` and notifies the vendor exactly once", async () => {
    const { service, engagementService, notificationQueue } = setup({
      conflictOnConfirm: true,
      blocker: {
        kind: EngagementKind.marketplace_booking,
        starts_at: T0,
        ends_at: T1,
      },
    });
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T1, summary: "Fresha appt" }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.conflicted).toBe(1);
    expect(res.notified).toBe(1);
    // reserve called twice: once confirmed (threw) + once conflicted (succeeded)
    expect(engagementService.reserve).toHaveBeenCalledTimes(2);
    expect(engagementService.reserve.mock.calls[1]![0].status).toBe(EngagementStatus.conflicted);
    // notification emitted exactly once with the 7 flat variables
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
    const payload = notificationQueue.add.mock.calls[0]![1] as any;
    expect(payload.notificationType).toBe("vendor_booking_conflict");
    expect(payload.userId).toBe("vendor-user-1");
    expect(payload.variables).toEqual({
      staff_name: "Alice",
      existing_summary: "MaterialHub booking",
      existing_starts_at: T0.toISOString(),
      existing_ends_at: T1.toISOString(),
      conflicting_summary: "Fresha appt",
      conflicting_starts_at: T0.toISOString(),
      conflicting_ends_at: T1.toISOString(),
    });
  });

  it("retries promoting a still-present conflicted row to confirmed (success)", async () => {
    const { service, engagementService, notificationQueue } = setup({
      existing: [existingRow({ status: EngagementStatus.conflicted })],
    });
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T1 }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.promoted).toBe(1);
    expect(res.stillConflicted).toBe(0);
    expect(engagementService.confirm).toHaveBeenCalledTimes(1);
    // no re-notification on a promotion attempt
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("keeps a conflicted row conflicted when promotion still collides (23P01), no notify", async () => {
    const { service, engagementService, notificationQueue } = setup({
      existing: [existingRow({ status: EngagementStatus.conflicted })],
      confirmFail: true,
    });
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T1 }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.stillConflicted).toBe(1);
    expect(res.promoted).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it("releases a conflicted row that disappeared from the feed", async () => {
    const { service, engagementService } = setup({
      existing: [existingRow({ status: EngagementStatus.conflicted })],
    });
    const feed = buildFeed([]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.released).toBe(1);
    expect(engagementService.release).toHaveBeenCalledTimes(1);
  });

  it("skips MaterialHub's own echoed outbound UID (engagement-*@materialhubuae.com) — no write, no conflict, others unaffected (review I2)", async () => {
    const { service, engagementService, notificationQueue } = setup();
    const feed = buildFeed([
      // an echoed MaterialHub booking (same UID shape the outbound feed emits)
      { uid: "engagement-abc-123@materialhubuae.com", start: T0, end: T1, summary: "Echoed booking" },
      // a genuine external event alongside it
      { uid: "real-fresha-1", start: T1, end: T2, summary: "Fresha appt" },
    ]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    // Only the genuine event is imported; the echo is skipped entirely.
    expect(res.inserted).toBe(1);
    expect(res.conflicted).toBe(0);
    expect(notificationQueue.add).not.toHaveBeenCalled();
    expect(engagementService.reserve).toHaveBeenCalledTimes(1);
    expect(engagementService.reserve.mock.calls[0]![0].externalRef).toBe("real-fresha-1");
  });

  it("skips an echoed outbound UID even with an occurrence suffix (review I2 + C1 interplay)", async () => {
    const { service, engagementService } = setup();
    const feed = buildFeed([
      { uid: "engagement-abc-123@materialhubuae.com#20260801T090000Z", start: T0, end: T1 },
    ]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.inserted).toBe(0);
    expect(engagementService.reserve).not.toHaveBeenCalled();
  });

  it("on a move collision, frees the old slot and lands the event conflicted + notifies", async () => {
    const { service, engagementService, notificationQueue } = setup({
      existing: [existingRow({})],
      moveConflict: true,
      blocker: { kind: EngagementKind.walk_in, starts_at: T0, ends_at: T2 },
    });
    const feed = buildFeed([{ uid: "uid-1", start: T0, end: T2 }]);

    const res = await service.sync(SUBSCRIPTION, feed, new Date());

    expect(res.moved).toBe(0);
    expect(res.conflicted).toBe(1);
    expect(res.notified).toBe(1);
    expect(engagementService.release).toHaveBeenCalledTimes(1); // old slot freed
    // conflicted insert
    const conflictedInsert = engagementService.reserve.mock.calls.find(
      (c: any) => c[0].status === EngagementStatus.conflicted,
    );
    expect(conflictedInsert).toBeDefined();
    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
  });
});
