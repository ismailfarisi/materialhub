// manage-calendar.service.test.ts
//
// Mocked-repo unit tests (no live DB) for ManageCalendarService (Task 0A).
// Mirrors block-time.service.test.ts's harness shape: a fake query builder
// recording every where/andWhere/orderBy call + params (so tests can assert
// which SQL fragments were built, e.g. "no kind filter -> all kinds
// included"), and the same LocationScopeRepos fakes used by
// guards/location-scope.test.ts / block-time.service.test.ts. Live-DB
// integration coverage (real overlap/403/404 behavior) is out of scope here
// per repo convention (bun test + a shared pg pool flakes on multi-op live-DB
// tests).
import { describe, expect, it, mock } from "bun:test";
import { EngagementKind, EngagementStatus } from "@materialhub/database";
import { ForbiddenError, UnprocessableEntityError } from "@materialhub/plugins";
import { ManageCalendarService } from "./manage-calendar.service.ts";

const ACTOR = { userId: "user-1", vendorId: "vendor-1", role: "manager" };
const LOCATION_SCOPED_ACTOR = { userId: "user-2", vendorId: "vendor-1", role: "staff" };

function baseQuery(overrides: Record<string, unknown> = {}) {
  return {
    from: "2026-08-10T00:00:00Z",
    to: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

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
  engagementResult?: Record<string, unknown>[];
  bookings?: Record<string, unknown>[];
  users?: Record<string, unknown>[];
  locationScope?: {
    locations?: Array<{ id: string; vendor_id: string }>;
    memberships?: Array<{ vendor_location_id: string; user_id: string; role: string }>;
  };
}) {
  const qbCalls: Array<{ method: string; sql?: unknown; params?: unknown }> = [];
  // biome-ignore lint/suspicious/noExplicitAny: minimal fake query builder
  const qb: any = {};
  for (const method of ["where", "andWhere", "orderBy"]) {
    qb[method] = mock((sql?: unknown, params?: unknown) => {
      qbCalls.push({ method, sql, params });
      return qb;
    });
  }
  qb.getMany = mock(async () => opts.engagementResult ?? []);

  const engagementRepo = {
    createQueryBuilder: mock(() => qb),
  };

  const bookingFind = mock(async () => opts.bookings ?? []);
  const bookingRepo = { find: bookingFind };

  const userFind = mock(async () => opts.users ?? []);
  const userRepo = { find: userFind };

  const locationScope = makeLocationScope(opts.locationScope ?? {});

  const svc = new ManageCalendarService(
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    engagementRepo as any,
    bookingRepo as any,
    userRepo as any,
    locationScope as any,
  );

  return { svc, engagementRepo, bookingRepo, bookingFind, userRepo, userFind, qb, qbCalls };
}

describe("ManageCalendarService.list — range validation", () => {
  it("missing from/to: UnprocessableEntityError, before any query is built", async () => {
    const { svc, engagementRepo } = makeHarness({});

    await expect(svc.list(ACTOR, {})).rejects.toBeInstanceOf(UnprocessableEntityError);
    expect(engagementRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("unparsable from/to: UnprocessableEntityError", async () => {
    const { svc } = makeHarness({});

    await expect(
      svc.list(ACTOR, baseQuery({ from: "garbage", to: "also-garbage" })),
    ).rejects.toBeInstanceOf(UnprocessableEntityError);
  });

  it("to before from: UnprocessableEntityError", async () => {
    const { svc } = makeHarness({});

    await expect(
      svc.list(ACTOR, baseQuery({ from: "2026-08-11T00:00:00Z", to: "2026-08-10T00:00:00Z" })),
    ).rejects.toBeInstanceOf(UnprocessableEntityError);
  });

  it("range exceeding 62 days: UnprocessableEntityError", async () => {
    const { svc } = makeHarness({});

    await expect(
      svc.list(ACTOR, baseQuery({ from: "2026-01-01T00:00:00Z", to: "2026-06-01T00:00:00Z" })),
    ).rejects.toBeInstanceOf(UnprocessableEntityError);
  });

  it("range exactly at 62 days: passes validation (query is built)", async () => {
    const { svc, engagementRepo } = makeHarness({});

    await svc.list(ACTOR, baseQuery({ from: "2026-01-01T00:00:00Z", to: "2026-03-04T00:00:00Z" }));

    expect(engagementRepo.createQueryBuilder).toHaveBeenCalled();
  });
});

describe("ManageCalendarService.list — kind/status inclusion", () => {
  it("includes all engagement kinds — no kind filter applied to the query", async () => {
    const { svc, qbCalls } = makeHarness({});

    await svc.list(ACTOR, baseQuery());

    expect(qbCalls.some((c) => String(c.sql).includes("e.kind"))).toBe(false);
  });

  it("status filter is held/confirmed/conflicted only (released/cancelled excluded)", async () => {
    const { svc, qbCalls } = makeHarness({});

    await svc.list(ACTOR, baseQuery());

    const statusCall = qbCalls.find(
      (c) => c.method === "andWhere" && String(c.sql).includes("e.status IN"),
    );
    expect(statusCall).toBeDefined();
    expect((statusCall?.params as Record<string, unknown>)?.statuses).toEqual([
      EngagementStatus.held,
      EngagementStatus.confirmed,
      EngagementStatus.conflicted,
    ]);
  });

  it("optional staff_member_id filter is applied when provided", async () => {
    const { svc, qbCalls } = makeHarness({});

    await svc.list(ACTOR, baseQuery({ staffMemberId: "staff-9" }));

    const staffCall = qbCalls.find(
      (c) =>
        c.method === "andWhere" && String(c.sql).includes("e.staff_member_id = :staffMemberId"),
    );
    expect(staffCall).toBeDefined();
  });
});

describe("ManageCalendarService.list — location scoping", () => {
  it("owner/manager: unrestricted, no location filter applied to the query", async () => {
    const { svc, qbCalls } = makeHarness({});

    await svc.list(ACTOR, baseQuery());

    expect(qbCalls.some((c) => String(c.sql).includes("vendor_location_id"))).toBe(false);
  });

  it("location-scoped actor with no managed locations: returns [] without ever building the query", async () => {
    const { svc, engagementRepo } = makeHarness({
      locationScope: { locations: [], memberships: [] },
    });

    const result = await svc.list(LOCATION_SCOPED_ACTOR, baseQuery());

    expect(result).toEqual([]);
    expect(engagementRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("location-scoped actor with a managed location: query restricted to that location's staff", async () => {
    const { svc, qbCalls } = makeHarness({
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [{ vendor_location_id: "loc-1", user_id: "user-2", role: "manager" }],
      },
    });

    await svc.list(LOCATION_SCOPED_ACTOR, baseQuery());

    const locationFilter = qbCalls.find(
      (c) => c.method === "andWhere" && String(c.sql).includes("vendor_location_id IN"),
    );
    expect(locationFilter).toBeDefined();
    expect((locationFilter?.params as Record<string, unknown>)?.scopedLocationIds).toEqual([
      "loc-1",
    ]);
  });

  // Review finding 5 — the scoping predicate must key a BOOKING on the
  // booking's own `location_id`, not on the staff member's branch links. A
  // staff member linked to branches A and B satisfies the link-based predicate
  // for both, so an A-scoped request was returning B's bookings — including
  // customer_name / notes / price_fils via mapBooking.
  it("scopes bookings on the booking's OWN location_id, not the staff member's links", async () => {
    const { svc, qbCalls } = makeHarness({
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [{ vendor_location_id: "loc-1", user_id: "user-2", role: "manager" }],
      },
    });

    await svc.list(LOCATION_SCOPED_ACTOR, baseQuery());

    const locationFilter = qbCalls.find(
      (c) => c.method === "andWhere" && String(c.sql).includes("vendor_location_id IN"),
    );
    const sql = String(locationFilter?.sql).replace(/\s+/g, " ");

    // A booking is in scope iff ITS OWN location_id is one the actor manages.
    expect(sql).toContain("FROM bookings b");
    expect(sql).toContain("b.location_id IN (:...scopedLocationIds)");
    // The staff-link fallback applies ONLY to engagements with no booking row
    // (manual_block / break / external_import — no customer data).
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("FROM staff_locations sl");
  });

  it("explicit vendor_location_id the actor doesn't manage: rejects, never queries", async () => {
    const { svc, engagementRepo } = makeHarness({
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
        memberships: [],
      },
    });

    await expect(
      svc.list(LOCATION_SCOPED_ACTOR, baseQuery({ vendorLocationId: "loc-1" })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(engagementRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("explicit vendor_location_id owned by a different vendor: rejects", async () => {
    const { svc } = makeHarness({
      locationScope: {
        locations: [{ id: "loc-1", vendor_id: "some-other-vendor" }],
        memberships: [],
      },
    });

    await expect(svc.list(ACTOR, baseQuery({ vendorLocationId: "loc-1" }))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("ManageCalendarService.list — booking-summary mapping", () => {
  const ENGAGEMENT_WITH_MARKETPLACE_BOOKING = {
    id: "eng-1",
    staff_member_id: "staff-1",
    kind: EngagementKind.marketplace_booking,
    status: EngagementStatus.confirmed,
    starts_at: new Date("2026-08-10T10:00:00Z"),
    ends_at: new Date("2026-08-10T10:30:00Z"),
    external_source: null,
    external_ref: null,
  };
  const ENGAGEMENT_WITH_WALKIN_BOOKING = {
    id: "eng-2",
    staff_member_id: "staff-1",
    kind: EngagementKind.walk_in,
    status: EngagementStatus.confirmed,
    starts_at: new Date("2026-08-10T11:00:00Z"),
    ends_at: new Date("2026-08-10T11:30:00Z"),
    external_source: null,
    external_ref: null,
  };
  const ENGAGEMENT_BLOCK_ONLY = {
    id: "eng-3",
    staff_member_id: "staff-1",
    kind: EngagementKind.manual_block,
    status: EngagementStatus.confirmed,
    starts_at: new Date("2026-08-10T12:00:00Z"),
    ends_at: new Date("2026-08-10T12:30:00Z"),
    external_source: "Stocktake",
    external_ref: null,
  };

  it("marketplace booking: customer_name resolved from the batched users lookup", async () => {
    const { svc } = makeHarness({
      engagementResult: [ENGAGEMENT_WITH_MARKETPLACE_BOOKING],
      bookings: [
        {
          id: "bk-1",
          engagement_id: "eng-1",
          booking_number: "BK1",
          status: "confirmed",
          source: "marketplace",
          payment_mode: "deposit",
          service_name: "Haircut",
          price_fils: 10000,
          notes: null,
          location_id: "loc-1",
          customer_user_id: "user-9",
          customer_name: null,
        },
      ],
      users: [{ id: "user-9", first_name: "Sara", last_name: "Khan" }],
    });

    const rows = await svc.list(ACTOR, baseQuery());

    expect(rows).toHaveLength(1);
    expect(rows[0]?.booking?.customer_name).toBe("Sara Khan");
    expect(rows[0]?.booking?.booking_number).toBe("BK1");
  });

  it("marketplace booking whose user row is missing: customer_name is null, never throws", async () => {
    const { svc } = makeHarness({
      engagementResult: [ENGAGEMENT_WITH_MARKETPLACE_BOOKING],
      bookings: [
        {
          id: "bk-1",
          engagement_id: "eng-1",
          booking_number: "BK1",
          status: "confirmed",
          source: "marketplace",
          payment_mode: "deposit",
          service_name: "Haircut",
          price_fils: 10000,
          notes: null,
          location_id: "loc-1",
          customer_user_id: "user-missing",
          customer_name: null,
        },
      ],
      users: [],
    });

    const rows = await svc.list(ACTOR, baseQuery());

    expect(rows[0]?.booking?.customer_name).toBeNull();
  });

  it("walk-in booking: customer_name comes straight from bookings.customer_name, no user lookup", async () => {
    const { svc, userFind } = makeHarness({
      engagementResult: [ENGAGEMENT_WITH_WALKIN_BOOKING],
      bookings: [
        {
          id: "bk-2",
          engagement_id: "eng-2",
          booking_number: "BK2",
          status: "confirmed",
          source: "walk_in",
          payment_mode: "pay_at_venue",
          service_name: "Manicure",
          price_fils: 5000,
          notes: null,
          location_id: "loc-1",
          customer_user_id: null,
          customer_name: "Walk-in Customer",
        },
      ],
    });

    const rows = await svc.list(ACTOR, baseQuery());

    expect(rows[0]?.booking?.customer_name).toBe("Walk-in Customer");
    // No marketplace customer_user_id present -> the batched user lookup is
    // never even called.
    expect(userFind).not.toHaveBeenCalled();
  });

  it("engagement with no matching booking (e.g. a block): booking is null", async () => {
    const { svc, bookingFind } = makeHarness({
      engagementResult: [ENGAGEMENT_BLOCK_ONLY],
      bookings: [],
    });

    const rows = await svc.list(ACTOR, baseQuery());

    expect(rows[0]?.booking).toBeNull();
    expect(rows[0]?.external_source).toBe("Stocktake");
    expect(bookingFind).toHaveBeenCalledTimes(1);
  });

  it("multiple engagements: booking and user lookups are each a single batched call, not per-row", async () => {
    const { svc, bookingFind, userFind } = makeHarness({
      engagementResult: [
        ENGAGEMENT_WITH_MARKETPLACE_BOOKING,
        ENGAGEMENT_WITH_WALKIN_BOOKING,
        ENGAGEMENT_BLOCK_ONLY,
      ],
      bookings: [
        {
          id: "bk-1",
          engagement_id: "eng-1",
          booking_number: "BK1",
          status: "confirmed",
          source: "marketplace",
          payment_mode: "deposit",
          service_name: "Haircut",
          price_fils: 10000,
          notes: null,
          location_id: "loc-1",
          customer_user_id: "user-9",
          customer_name: null,
        },
        {
          id: "bk-2",
          engagement_id: "eng-2",
          booking_number: "BK2",
          status: "confirmed",
          source: "walk_in",
          payment_mode: "pay_at_venue",
          service_name: "Manicure",
          price_fils: 5000,
          notes: null,
          location_id: "loc-1",
          customer_user_id: null,
          customer_name: "Walk-in Customer",
        },
      ],
      users: [{ id: "user-9", first_name: "Sara", last_name: "Khan" }],
    });

    const rows = await svc.list(ACTOR, baseQuery());

    expect(rows).toHaveLength(3);
    expect(bookingFind).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledTimes(1);
  });

  it("zero engagements in range: returns [] without touching bookingRepo/userRepo", async () => {
    const { svc, bookingFind, userFind } = makeHarness({ engagementResult: [] });

    const rows = await svc.list(ACTOR, baseQuery());

    expect(rows).toEqual([]);
    expect(bookingFind).not.toHaveBeenCalled();
    expect(userFind).not.toHaveBeenCalled();
  });
});
