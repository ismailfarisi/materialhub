import { describe, expect, it } from "bun:test";
import {
  ServiceLocationMode,
  type ServiceOffering,
  type StaffMember,
  type VendorLocation,
} from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { AvailabilityCache, type RedisLike } from "./availability-cache.ts";
import { AvailabilityService } from "./availability.service.ts";

// Only the offering repo matters for the guard branches below (they return
// before staff resolution / query-builders). The full slicing + eligibility
// join + engagement exclusion is covered by interval-math.test.ts (pure) and a
// live-DB proof script; here we lock in the mode-selection short-circuits.
function make(offering: Partial<ServiceOffering> | null) {
  const offeringRepo = {
    findOne: () => Promise.resolve(offering),
  } as unknown as Repository<ServiceOffering>;
  const anyRepo = {} as never;
  const svc = new AvailabilityService(
    offeringRepo,
    anyRepo,
    anyRepo,
    anyRepo,
    anyRepo,
    anyRepo,
    anyRepo,
    anyRepo,
    new AvailabilityCache(null),
  );
  return svc;
}

const RANGE = {
  from: new Date("2026-08-10T00:00:00Z"),
  to: new Date("2026-08-11T00:00:00Z"),
  now: new Date("2026-08-01T00:00:00Z"),
};

describe("AvailabilityService mode guards", () => {
  it("throws NotFoundError for an unknown offering", async () => {
    const svc = make(null);
    await expect(svc.getAvailability({ offeringId: "x", ...RANGE })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns empty home_visit result for a premises-only offering asked for a home visit", async () => {
    const svc = make({ id: "o1", vendor_id: "v1", location_mode: ServiceLocationMode.at_premises });
    const res = await svc.getAvailability({
      offeringId: "o1",
      customerAreaId: "area-1",
      ...RANGE,
    });
    expect(res.mode).toBe("home_visit");
    expect(res.slots).toHaveLength(0);
  });

  it("returns empty at_premises result for a home-visit-only offering asked at premises", async () => {
    const svc = make({ id: "o1", vendor_id: "v1", location_mode: ServiceLocationMode.home_visit });
    const res = await svc.getAvailability({ offeringId: "o1", ...RANGE });
    expect(res.mode).toBe("at_premises");
    expect(res.slots).toHaveLength(0);
  });
});

// ─── Mocked-repo harness for staff resolution / rule scoping / holidays ──────
// No DB: every repo is a hand-rolled fake, so these run in CI (which has no
// Postgres). The query-builder fakes record what the service asked for.

interface HoursRow {
  staff_member_id: string;
  location_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface HolidayRow {
  starts_at: string;
  ends_at: string;
}

interface Harness {
  offering: Partial<ServiceOffering>;
  locations: Array<Partial<VendorLocation>>;
  staff: Array<Partial<StaffMember>>;
  hours: HoursRow[];
  holidays?: HolidayRow[];
  redis?: RedisLike;
}

// Matches a TypeORM `find({ where })` condition list against the hours rows,
// understanding both a plain object and the IsNull() FindOperator.
function matchHours(rows: HoursRow[], where: unknown): HoursRow[] {
  const conds = (Array.isArray(where) ? where : [where]) as Array<Record<string, unknown>>;
  return rows.filter((r) =>
    conds.some((c) => {
      if (c.staff_member_id !== r.staff_member_id) return false;
      if (!("location_id" in c)) return true;
      const want = c.location_id;
      // IsNull() hydrates as a FindOperator object, not a string.
      if (want && typeof want === "object") return r.location_id === null;
      return r.location_id === want;
    }),
  );
}

function harness(h: Harness) {
  const staffQuery = {
    joins: [] as Array<{ table: string; params: unknown }>,
    take: 0,
  };
  const staffQb = {
    innerJoin(table: string, _alias: string, _cond: string, params: unknown) {
      staffQuery.joins.push({ table, params });
      return staffQb;
    },
    where: () => staffQb,
    andWhere: () => staffQb,
    orderBy: () => staffQb,
    take(n: number) {
      staffQuery.take = n;
      return staffQb;
    },
    getMany: () => Promise.resolve(h.staff),
  };
  const emptyQb = {
    where: () => emptyQb,
    andWhere: () => emptyQb,
    getMany: () => Promise.resolve([]),
  };
  const holidayQb = {
    where: () => holidayQb,
    andWhere: () => holidayQb,
    getMany: () => Promise.resolve(h.holidays ?? []),
  };

  let hoursWhere: unknown;
  const svc = new AvailabilityService(
    { findOne: () => Promise.resolve(h.offering) } as unknown as Repository<ServiceOffering>,
    { createQueryBuilder: () => staffQb } as unknown as Repository<StaffMember>,
    {
      find: (opts: { where: unknown }) => {
        hoursWhere = opts.where;
        return Promise.resolve(matchHours(h.hours, opts.where));
      },
      // biome-ignore lint/suspicious/noExplicitAny: hand-rolled repo fake
    } as any,
    { createQueryBuilder: () => emptyQb } as never,
    { createQueryBuilder: () => emptyQb } as never,
    {
      findOne: (opts: { where: Record<string, unknown> }) =>
        Promise.resolve(
          opts.where.id
            ? (h.locations.find((l) => l.id === opts.where.id) ?? null)
            : (h.locations.find((l) => l.is_active !== false) ?? null),
        ),
      // biome-ignore lint/suspicious/noExplicitAny: hand-rolled repo fake
    } as any,
    { createQueryBuilder: () => holidayQb } as never,
    { findOne: () => Promise.resolve(null) } as never,
    new AvailabilityCache(h.redis ?? null),
  );
  return { svc, staffQuery, hoursWhere: () => hoursWhere };
}

const OFFERING: Partial<ServiceOffering> = {
  id: "o1",
  vendor_id: "v1",
  location_mode: ServiceLocationMode.at_premises,
  duration_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  slot_step_minutes: 60,
  min_notice_minutes: 0,
  max_advance_days: 365,
};

const DOWNTOWN = { id: "loc-a", vendor_id: "v1", timezone: "Asia/Dubai", is_active: true };
const MARINA = { id: "loc-b", vendor_id: "v1", timezone: "Asia/Dubai", is_active: true };

// 2026-08-10 is a Monday (day_of_week 1).
const MONDAY = {
  from: new Date("2026-08-09T20:00:00Z"), // 2026-08-10 00:00 Dubai
  to: new Date("2026-08-10T20:00:00Z"),
  now: new Date("2026-08-01T00:00:00Z"),
};

// Finding #3 — working-hours rules carry a location_id that was never read.
describe("AvailabilityService working-hours are branch-scoped", () => {
  const hours: HoursRow[] = [
    {
      staff_member_id: "s1",
      location_id: DOWNTOWN.id,
      day_of_week: 1,
      start_time: "09:00",
      end_time: "12:00",
    },
    {
      staff_member_id: "s1",
      location_id: MARINA.id,
      day_of_week: 1,
      start_time: "14:00",
      end_time: "18:00",
    },
  ];

  it("offers only the requested branch's hours", async () => {
    const { svc } = harness({
      offering: OFFERING,
      locations: [DOWNTOWN, MARINA],
      staff: [{ id: "s1", name: "A" }],
      hours,
    });
    const res = await svc.getAvailability({
      offeringId: "o1",
      locationId: MARINA.id,
      ...MONDAY,
    });
    // Marina = 14:00–18:00 Dubai = 10:00–14:00Z. Nothing from the 09:00–12:00
    // Downtown shift (05:00–08:00Z) may appear.
    expect(res.slots.map((s) => s.start)).toEqual([
      "2026-08-10T10:00:00.000Z",
      "2026-08-10T11:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
      "2026-08-10T13:00:00.000Z",
    ]);
  });

  it("treats a NULL location_id rule as applying at every branch", async () => {
    const { svc } = harness({
      offering: OFFERING,
      locations: [DOWNTOWN, MARINA],
      staff: [{ id: "s1", name: "A" }],
      hours: [
        ...hours,
        {
          staff_member_id: "s1",
          location_id: null,
          day_of_week: 1,
          start_time: "19:00",
          end_time: "21:00",
        },
      ],
    });
    const res = await svc.getAvailability({
      offeringId: "o1",
      locationId: MARINA.id,
      ...MONDAY,
    });
    // 19:00–21:00 Dubai = 15:00–17:00Z → the vendor-wide shift is included.
    expect(res.slots.map((s) => s.start)).toContain("2026-08-10T15:00:00.000Z");
  });
});

// Finding #7 — an omitted ?location= must not union every branch.
describe("AvailabilityService branch scoping without ?location=", () => {
  it("falls back to the vendor's default branch and scopes staff to it", async () => {
    const { svc, staffQuery } = harness({
      offering: OFFERING,
      locations: [DOWNTOWN, MARINA],
      staff: [{ id: "s1", name: "A" }],
      hours: [
        {
          staff_member_id: "s1",
          location_id: DOWNTOWN.id,
          day_of_week: 1,
          start_time: "09:00",
          end_time: "12:00",
        },
        {
          staff_member_id: "s1",
          location_id: MARINA.id,
          day_of_week: 1,
          start_time: "14:00",
          end_time: "18:00",
        },
      ],
    });
    const res = await svc.getAvailability({ offeringId: "o1", ...MONDAY });
    // Staff must still be branch-filtered, at the default (first active) branch.
    expect(staffQuery.joins.map((j) => j.table)).toContain("staff_locations");
    expect(
      staffQuery.joins.some((j) => (j.params as { locationId: string }).locationId === DOWNTOWN.id),
    ).toBe(true);
    // …and only Downtown's 09:00–12:00 Dubai (05:00–08:00Z) hours are offered.
    expect(res.slots.map((s) => s.start)).toEqual([
      "2026-08-10T05:00:00.000Z",
      "2026-08-10T06:00:00.000Z",
      "2026-08-10T07:00:00.000Z",
    ]);
  });

  it("does not branch-scope a home visit, and bounds staff fan-out", async () => {
    const { svc, staffQuery } = harness({
      offering: { ...OFFERING, location_mode: ServiceLocationMode.either },
      locations: [DOWNTOWN, MARINA],
      staff: [{ id: "s1", name: "A" }],
      hours: [
        {
          staff_member_id: "s1",
          location_id: MARINA.id,
          day_of_week: 1,
          start_time: "14:00",
          end_time: "18:00",
        },
      ],
    });
    await svc.getAvailability({ offeringId: "o1", ...MONDAY });
    expect(staffQuery.take).toBeGreaterThan(0); // eligible-staff cardinality bound
  });
});

// Findings #5 + #6 — holidays are written by vendor-service (which cannot
// invalidate this cache) so they must be applied fresh, in the branch timezone.
describe("AvailabilityService vendor holidays", () => {
  function fakeRedis() {
    const store = new Map<string, Map<string, string>>();
    const client: RedisLike & { store: typeof store } = {
      store,
      async hGet(key, field) {
        return store.get(key)?.get(field) ?? null;
      },
      async hSet(key, field, value) {
        const h = store.get(key) ?? new Map<string, string>();
        h.set(field, value);
        store.set(key, h);
      },
      async expire() {
        return 1;
      },
      async del(keys) {
        for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
      },
    };
    return client;
  }

  const dubaiHours: HoursRow[] = [
    {
      staff_member_id: "s1",
      location_id: null,
      day_of_week: 1,
      start_time: "09:00",
      end_time: "12:00",
    },
  ];

  it("applies a holiday declared AFTER the day was cached (no stale slots)", async () => {
    const redis = fakeRedis();
    const base = {
      offering: OFFERING,
      locations: [DOWNTOWN],
      staff: [{ id: "s1", name: "A" }],
      hours: dubaiHours,
      redis,
    };
    const warm = harness(base);
    const before = await warm.svc.getAvailability({ offeringId: "o1", ...MONDAY });
    expect(before.slots.length).toBeGreaterThan(0);

    // vendor-service writes the holiday; it never touches this cache.
    const closed = harness({
      ...base,
      holidays: [{ starts_at: "2026-08-10", ends_at: "2026-08-10" }],
    });
    const after = await closed.svc.getAvailability({ offeringId: "o1", ...MONDAY });
    expect(after.slots).toHaveLength(0);
  });

  it("blocks the WHOLE local day in a non-UTC-anchored zone", async () => {
    // 2026-08-10 in America/New_York runs 04:00Z → next 04:00Z. A shift at local
    // 20:00–23:00 (00:00–03:00Z on the 11th) is inside the holiday and must be
    // suppressed — expanding the holiday as a UTC day would have left it open.
    const { svc } = harness({
      offering: OFFERING,
      locations: [{ id: "loc-ny", vendor_id: "v1", timezone: "America/New_York", is_active: true }],
      staff: [{ id: "s1", name: "A" }],
      hours: [
        {
          staff_member_id: "s1",
          location_id: null,
          day_of_week: 1,
          start_time: "20:00",
          end_time: "23:00",
        },
      ],
      holidays: [{ starts_at: "2026-08-10", ends_at: "2026-08-10" }],
    });
    const res = await svc.getAvailability({
      offeringId: "o1",
      from: new Date("2026-08-10T04:00:00Z"),
      to: new Date("2026-08-11T04:00:00Z"),
      now: new Date("2026-08-01T00:00:00Z"),
    });
    expect(res.slots).toHaveLength(0);
  });
});
