// block-time.service.test.ts
//
// Mocked-repo unit tests (no live DB) for BlockTimeService (Phase 6 Task 2).
// Mirrors manual-booking.service.test.ts's shape: the StaffEngagement repo
// exposes `.manager.query` for reserve() (raw INSERT ... RETURNING *) and
// `.findOne`/a fake `.createQueryBuilder()` for delete()/list(), matching
// EngagementService.reserve/release's own contract (engagement.service.ts)
// and this service's own query-builder shape for list(). Live-DB
// overlap/restore/403/404 coverage lives in
// block-time.routes.integration.test.ts.
import { describe, expect, it, mock } from "bun:test";
import { EngagementKind, EngagementStatus } from "@materialhub/database";
import { BadRequestError, ConflictError, NotFoundError } from "@materialhub/plugins";
import { BlockTimeService } from "./block-time.service.ts";

const ACTOR = { userId: "user-1", vendorId: "vendor-1", role: "manager" };
// Fixed reference "now" matching baseInput()'s fixture dates below — create()
// defaults `now` to the real wall clock, and MAX_BLOCK_PAST_DAYS/FUTURE_DAYS
// bound startsAt relative to it, so a hardcoded startsAt drifts out of range
// as real time passes unless every create() call pins `now` alongside it.
const NOW = new Date("2026-08-10T09:00:00Z");

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    staffMemberId: "staff-1",
    vendorLocationId: "loc-1",
    startsAt: "2026-08-10T10:00:00Z",
    endsAt: "2026-08-10T10:30:00Z",
    kind: EngagementKind.manual_block,
    reason: null as string | null,
    ...overrides,
  };
}

// Minimal fake LocationScopeRepos: `locations` and `memberships` are the raw
// rows assertLocationManager/isLocationManagerOfAny/getManagedLocationIds
// query against (same shapes as guards/location-scope.test.ts's `repos()`
// helper, generalized to multiple rows since these new authorization paths
// query across candidate locations, not just one).
function makeLocationScope(opts: {
  locations?: Array<{ id: string; vendor_id: string }>;
  memberships?: Array<{ vendor_location_id: string; user_id: string; role: string }>;
}) {
  const locations = opts.locations ?? [];
  const memberships = opts.memberships ?? [];

  const locationRepo = {
    findOne: mock(
      async ({ where }: { where: { id: string } }) =>
        locations.find((l) => l.id === where.id) ?? null,
    ),
  };
  const membershipRepo = {
    findOne: mock(
      async ({ where }: { where: { vendor_location_id: string; user_id: string } }) =>
        memberships.find(
          (m) => m.vendor_location_id === where.vendor_location_id && m.user_id === where.user_id,
        ) ?? null,
    ),
    find: mock(async ({ where }: { where: { user_id: string } }) =>
      memberships.filter((m) => m.user_id === where.user_id),
    ),
  };

  return { locationRepo, membershipRepo };
}

function makeHarness(opts: {
  staff?: Record<string, unknown> | null;
  staffLocation?: Record<string, unknown> | null;
  engagementQuery?: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  findOneResult?: Record<string, unknown> | null;
  staffLocationLinks?: Array<{ staff_member_id: string; vendor_location_id: string }>;
  locationScope?: {
    locations?: Array<{ id: string; vendor_id: string }>;
    memberships?: Array<{ vendor_location_id: string; user_id: string; role: string }>;
  };
  listResult?: Record<string, unknown>[];
}) {
  const staff = opts.staff === undefined ? { id: "staff-1", vendor_id: "vendor-1" } : opts.staff;
  const staffLocation =
    opts.staffLocation === undefined
      ? { id: "link-1", staff_member_id: "staff-1", vendor_location_id: "loc-1" }
      : opts.staffLocation;

  const staffRepo = { findOne: mock(async () => staff) };
  const staffLocationRepo = {
    findOne: mock(async () => staffLocation),
    find: mock(async ({ where }: { where: { staff_member_id: string } }) =>
      (
        opts.staffLocationLinks ?? [{ staff_member_id: "staff-1", vendor_location_id: "loc-1" }]
      ).filter((l) => l.staff_member_id === where.staff_member_id),
    ),
  };

  const defaultQuery = async (_sql: string, _params?: unknown[]) => [
    {
      id: "eng-1",
      staff_member_id: "staff-1",
      vendor_id: "vendor-1",
      starts_at: new Date("2026-08-10T10:00:00Z"),
      ends_at: new Date("2026-08-10T10:30:00Z"),
      status: "confirmed",
      kind: "manual_block",
    },
  ];

  // Fake query builder for list(): `where`/`andWhere`/`orderBy` chain
  // (recording every call so tests can assert which SQL fragments/params
  // list() built), `getMany` resolves the canned `listResult`.
  const qbCalls: Array<{ method: string; sql?: unknown; params?: unknown }> = [];
  // biome-ignore lint/suspicious/noExplicitAny: minimal fake query builder
  const qb: any = {};
  for (const method of ["where", "andWhere", "orderBy"]) {
    qb[method] = mock((sql?: unknown, params?: unknown) => {
      qbCalls.push({ method, sql, params });
      return qb;
    });
  }
  qb.getMany = mock(async () => opts.listResult ?? []);

  const engagementRepo = {
    manager: {
      query: mock(opts.engagementQuery ?? defaultQuery),
    },
    findOne: mock(async () => (opts.findOneResult === undefined ? null : opts.findOneResult)),
    update: mock(async () => undefined),
    createQueryBuilder: mock(() => qb),
  };

  const locationScope = makeLocationScope(opts.locationScope ?? {});

  const svc = new BlockTimeService(
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    staffRepo as any,
    staffLocationRepo as any,
    engagementRepo as any,
    locationScope as any,
  );

  return { svc, staffRepo, staffLocationRepo, engagementRepo, locationScope, qb, qbCalls };
}

describe("BlockTimeService.create", () => {
  it("manual_block with no reason: engagement confirmed, no reason on external_source", async () => {
    const { svc, engagementRepo } = makeHarness({});

    const result = await svc.create(ACTOR, baseInput(), NOW);

    expect(result.id).toBe("eng-1");
    const call = engagementRepo.manager.query.mock.calls[0];
    const params = call?.[1] as unknown[];
    // external_source is the 7th bound param in EngagementService.reserve's
    // INSERT ($7) — null since no reason was given.
    expect(params[6]).toBeNull();
  });

  it("break with a reason: reason threads through to externalSource", async () => {
    const { svc, engagementRepo } = makeHarness({});

    await svc.create(ACTOR, baseInput({ kind: EngagementKind.break, reason: "Lunch break" }), NOW);

    const call = engagementRepo.manager.query.mock.calls[0];
    const params = call?.[1] as unknown[];
    expect(params[6]).toBe("Lunch break");
    expect(params[5]).toBe(EngagementKind.break);
  });

  it("startsAt >= endsAt: BadRequestError, before any repo lookups", async () => {
    const { svc, staffRepo } = makeHarness({});

    await expect(
      svc.create(
        ACTOR,
        baseInput({ startsAt: "2026-08-10T10:30:00Z", endsAt: "2026-08-10T10:00:00Z" }),
        NOW,
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(staffRepo.findOne).not.toHaveBeenCalled();
  });

  it("staff member not found (or not this vendor's): NotFoundError", async () => {
    const { svc } = makeHarness({ staff: null });
    await expect(svc.create(ACTOR, baseInput(), NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("staff member not linked to the target location: BadRequestError", async () => {
    const { svc } = makeHarness({ staffLocation: null });
    await expect(svc.create(ACTOR, baseInput(), NOW)).rejects.toBeInstanceOf(BadRequestError);
  });

  it("overlapping slot: the ConflictError from EngagementService.reserve propagates", async () => {
    const { svc } = makeHarness({
      engagementQuery: () =>
        Promise.reject(Object.assign(new Error("exclusion"), { code: "23P01" })),
    });

    await expect(svc.create(ACTOR, baseInput(), NOW)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("BlockTimeService.delete", () => {
  it("block belongs to this vendor: released (status set to released)", async () => {
    const { svc, engagementRepo } = makeHarness({
      findOneResult: {
        id: "eng-1",
        vendor_id: "vendor-1",
        kind: EngagementKind.manual_block,
        staff_member_id: "staff-1",
        starts_at: new Date("2026-08-10T10:00:00Z"),
        ends_at: new Date("2026-08-10T10:30:00Z"),
      },
    });

    await svc.delete(ACTOR, "eng-1");

    expect(engagementRepo.update).toHaveBeenCalledWith(
      { id: "eng-1" },
      { status: EngagementStatus.released },
    );
  });

  it("no matching engagement (wrong vendor or nonexistent id): NotFoundError", async () => {
    const { svc } = makeHarness({ findOneResult: null });
    await expect(svc.delete(ACTOR, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("engagement exists for this vendor but is a marketplace booking (not a block kind): NotFoundError, never released", async () => {
    const { svc, engagementRepo } = makeHarness({
      findOneResult: {
        id: "eng-2",
        vendor_id: "vendor-1",
        kind: EngagementKind.marketplace_booking,
        staff_member_id: "staff-1",
        starts_at: new Date("2026-08-10T10:00:00Z"),
        ends_at: new Date("2026-08-10T10:30:00Z"),
      },
    });

    await expect(svc.delete(ACTOR, "eng-2")).rejects.toBeInstanceOf(NotFoundError);
    expect(engagementRepo.update).not.toHaveBeenCalled();
  });

  // ── Location-scoped authorization (fix-cycle-1 finding) ────────────────
  // Simulates the exploitable gap the review flagged: a super_admin has used
  // PUT /admin/role-permissions/:role to grant `products.write` to a
  // location-scoped vendor-member role (here just called "staff" — the
  // actual VendorMemberRole string doesn't matter, only that it's outside
  // VENDOR_MANAGER_ROLES). Such an actor must only be able to release blocks
  // for staff members linked to a location they hold a managing
  // location_membership for.
  const LOCATION_SCOPED_ACTOR = { userId: "user-2", vendorId: "vendor-1", role: "staff" };
  const BLOCK_AT_LOC1 = {
    id: "eng-3",
    vendor_id: "vendor-1",
    kind: EngagementKind.manual_block,
    staff_member_id: "staff-1",
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
  };

  it("location-scoped actor managing the block's location: released", async () => {
    const { svc, engagementRepo } = makeHarness({
      findOneResult: BLOCK_AT_LOC1,
      staffLocationLinks: [{ staff_member_id: "staff-1", vendor_location_id: "loc-1" }],
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [{ vendor_location_id: "loc-1", user_id: "user-2", role: "manager" }],
      },
    });

    await svc.delete(LOCATION_SCOPED_ACTOR, "eng-3");

    expect(engagementRepo.update).toHaveBeenCalledWith(
      { id: "eng-3" },
      { status: EngagementStatus.released },
    );
  });

  it("location-scoped actor NOT managing the block's location: NotFoundError (not Forbidden — no existence leak), never released", async () => {
    const { svc, engagementRepo } = makeHarness({
      findOneResult: BLOCK_AT_LOC1,
      staffLocationLinks: [{ staff_member_id: "staff-1", vendor_location_id: "loc-1" }],
      locationScope: {
        locations: [
          { id: "loc-1", vendor_id: "vendor-1" },
          { id: "loc-2", vendor_id: "vendor-1" },
        ],
        // The actor manages loc-2, NOT loc-1 (where this block's staff
        // member is linked) — same-vendor, cross-location denial.
        memberships: [{ vendor_location_id: "loc-2", user_id: "user-2", role: "manager" }],
      },
    });

    await expect(svc.delete(LOCATION_SCOPED_ACTOR, "eng-3")).rejects.toBeInstanceOf(NotFoundError);
    expect(engagementRepo.update).not.toHaveBeenCalled();
  });

  it("location-scoped actor whose staff member has no location links at all: NotFoundError", async () => {
    const { svc, engagementRepo } = makeHarness({
      findOneResult: BLOCK_AT_LOC1,
      staffLocationLinks: [],
      locationScope: { locations: [], memberships: [] },
    });

    await expect(svc.delete(LOCATION_SCOPED_ACTOR, "eng-3")).rejects.toBeInstanceOf(NotFoundError);
    expect(engagementRepo.update).not.toHaveBeenCalled();
  });

  it("owner/manager fast path is unchanged: released even with zero staff_locations rows returned (never queried)", async () => {
    const { svc, engagementRepo, staffLocationRepo } = makeHarness({
      findOneResult: BLOCK_AT_LOC1,
      staffLocationLinks: [],
    });

    await svc.delete(ACTOR, "eng-3");

    expect(engagementRepo.update).toHaveBeenCalledWith(
      { id: "eng-3" },
      { status: EngagementStatus.released },
    );
    // Owner/manager never triggers the staff_locations lookup at all — same
    // behavior/cost as before this fix.
    expect(staffLocationRepo.find).not.toHaveBeenCalled();
  });
});

describe("BlockTimeService.list", () => {
  function baseQuery(overrides: Record<string, unknown> = {}) {
    return {
      from: "2026-08-10T00:00:00Z",
      to: "2026-08-11T00:00:00Z",
      ...overrides,
    };
  }

  it("malformed from/to: BadRequestError, before any query is built", async () => {
    const { svc, engagementRepo } = makeHarness({});

    await expect(
      svc.list(ACTOR, baseQuery({ from: "garbage", to: "also-garbage" })),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(engagementRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("one of from/to malformed: BadRequestError", async () => {
    const { svc } = makeHarness({});
    await expect(svc.list(ACTOR, baseQuery({ from: "not-a-date" }))).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("owner/manager: unrestricted, no location filter applied to the query", async () => {
    const { svc, qbCalls } = makeHarness({ listResult: [] });

    await svc.list(ACTOR, baseQuery());

    expect(qbCalls.some((c) => String(c.sql).includes("vendor_location_id"))).toBe(false);
  });

  it("location-scoped actor with no managed locations: returns [] without ever building the query", async () => {
    const { svc, engagementRepo } = makeHarness({
      locationScope: { locations: [], memberships: [] },
    });
    const LOCATION_SCOPED_ACTOR = { userId: "user-2", vendorId: "vendor-1", role: "staff" };

    const result = await svc.list(LOCATION_SCOPED_ACTOR, baseQuery());

    expect(result).toEqual([]);
    expect(engagementRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("location-scoped actor with a managed location: query restricted to that location's staff", async () => {
    const { svc, qbCalls } = makeHarness({
      listResult: [],
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [{ vendor_location_id: "loc-1", user_id: "user-2", role: "manager" }],
      },
    });
    const LOCATION_SCOPED_ACTOR = { userId: "user-2", vendorId: "vendor-1", role: "staff" };

    await svc.list(LOCATION_SCOPED_ACTOR, baseQuery());

    const locationFilter = qbCalls.find(
      (c) => c.method === "andWhere" && String(c.sql).includes("vendor_location_id IN"),
    );
    expect(locationFilter).toBeDefined();
    expect((locationFilter?.params as Record<string, unknown>)?.managedLocationIds).toEqual([
      "loc-1",
    ]);
  });

  it("vendor_location_id filter for a location the actor doesn't manage: rejects, never queries", async () => {
    const { svc, engagementRepo } = makeHarness({
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [],
      },
    });
    const LOCATION_SCOPED_ACTOR = { userId: "user-2", vendorId: "vendor-1", role: "staff" };

    await expect(
      svc.list(LOCATION_SCOPED_ACTOR, baseQuery({ vendorLocationId: "loc-1" })),
    ).rejects.toThrow();
    expect(engagementRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
