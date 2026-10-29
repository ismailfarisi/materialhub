import { describe, expect, it } from "bun:test";
import type { StaffMember, StaffTimeOff, StaffWorkingHours } from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { AvailabilityRuleService } from "./availability-rule.service.ts";

const VENDOR = "00000000-0000-0000-0000-00000000000a";
const STAFF = "staff-1";

function make(opts?: { staffFindOne?: () => Promise<Partial<StaffMember> | null> }) {
  const savedHours: Array<Partial<StaffWorkingHours>> = [];
  const savedOff: Array<Partial<StaffTimeOff>> = [];
  const workingHoursRepo = {
    create: (o: Partial<StaffWorkingHours>) => o,
    save: (o: Partial<StaffWorkingHours>) => {
      savedHours.push(o);
      return Promise.resolve({ id: "wh1", ...o });
    },
    find: () => Promise.resolve([]),
    findOne: () => Promise.resolve(null),
    softRemove: () => Promise.resolve({}),
  } as unknown as Repository<StaffWorkingHours>;
  const timeOffRepo = {
    create: (o: Partial<StaffTimeOff>) => o,
    save: (o: Partial<StaffTimeOff>) => {
      savedOff.push(o);
      return Promise.resolve({ id: "to1", ...o });
    },
    find: () => Promise.resolve([]),
    findOne: () => Promise.resolve(null),
    softRemove: () => Promise.resolve({}),
  } as unknown as Repository<StaffTimeOff>;
  const staffRepo = {
    findOne: opts?.staffFindOne ?? (() => Promise.resolve({ id: STAFF, vendor_id: VENDOR })),
  } as unknown as Repository<StaffMember>;
  return {
    svc: new AvailabilityRuleService(workingHoursRepo, timeOffRepo, staffRepo),
    savedHours,
    savedOff,
  };
}

// Harness with a cache + offering repo, to observe the invalidation horizon.
function makeWithCache(maxAdvanceDays: number | null) {
  const invalidated: string[][] = [];
  const cache = {
    invalidateHorizon(_staffId: string, from: Date, days: number) {
      horizons.push(days);
      void from;
      return Promise.resolve();
    },
    invalidate(_staffId: string, days: string[]) {
      invalidated.push(days);
      return Promise.resolve();
    },
    invalidateRange: () => Promise.resolve(),
    // biome-ignore lint/suspicious/noExplicitAny: minimal AvailabilityCache fake
  } as any;
  const horizons: number[] = [];
  const offeringQb = {
    select: () => offeringQb,
    where: () => offeringQb,
    andWhere: () => offeringQb,
    getRawOne: () => Promise.resolve({ max: maxAdvanceDays }),
  };
  const offeringRepo = {
    createQueryBuilder: () => offeringQb,
    // biome-ignore lint/suspicious/noExplicitAny: minimal repo fake
  } as any;
  const workingHoursRepo = {
    create: (o: Partial<StaffWorkingHours>) => o,
    save: (o: Partial<StaffWorkingHours>) => Promise.resolve({ id: "wh1", ...o }),
    // biome-ignore lint/suspicious/noExplicitAny: minimal repo fake
  } as any;
  const staffRepo = {
    findOne: () => Promise.resolve({ id: STAFF, vendor_id: VENDOR }),
    // biome-ignore lint/suspicious/noExplicitAny: minimal repo fake
  } as any;
  const svc = new AvailabilityRuleService(
    workingHoursRepo,
    // biome-ignore lint/suspicious/noExplicitAny: unused in these cases
    {} as any,
    staffRepo,
    cache,
    offeringRepo,
  );
  return { svc, horizons, invalidated };
}

describe("AvailabilityRuleService.addWorkingHours", () => {
  it("throws NotFoundError when the staff member is not the vendor's", async () => {
    const { svc } = make({ staffFindOne: () => Promise.resolve(null) });
    await expect(
      svc.addWorkingHours(VENDOR, STAFF, {
        day_of_week: 1,
        start_time: "09:00",
        end_time: "17:00",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an out-of-range day_of_week", async () => {
    const { svc } = make();
    await expect(
      svc.addWorkingHours(VENDOR, STAFF, {
        day_of_week: 7,
        start_time: "09:00",
        end_time: "17:00",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects start_time >= end_time", async () => {
    const { svc } = make();
    await expect(
      svc.addWorkingHours(VENDOR, STAFF, {
        day_of_week: 1,
        start_time: "17:00",
        end_time: "09:00",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("creates a valid rule with null defaults for optional fields", async () => {
    const { svc, savedHours } = make();
    const rule = await svc.addWorkingHours(VENDOR, STAFF, {
      day_of_week: 2,
      start_time: "10:00",
      end_time: "18:00",
    });
    expect(rule.staff_member_id).toBe(STAFF);
    expect(rule.location_id).toBeNull();
    expect(savedHours).toHaveLength(1);
  });
});

// Finding #11 — the old guard compared times as strings, so "9:00" > "10:00".
describe("AvailabilityRuleService time validation", () => {
  it("accepts an unpadded start_time that is genuinely before end_time", async () => {
    const { svc, savedHours } = make();
    const rule = await svc.addWorkingHours(VENDOR, STAFF, {
      day_of_week: 1,
      start_time: "9:00",
      end_time: "10:00",
    });
    expect(rule.start_time).toBe("9:00");
    expect(savedHours).toHaveLength(1);
  });

  it("still rejects an unpadded start_time that is after end_time", async () => {
    const { svc } = make();
    await expect(
      svc.addWorkingHours(VENDOR, STAFF, {
        day_of_week: 1,
        start_time: "9:00",
        end_time: "8:00",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects an unparseable time", async () => {
    const { svc } = make();
    await expect(
      svc.addWorkingHours(VENDOR, STAFF, {
        day_of_week: 1,
        start_time: "morning",
        end_time: "17:00",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

// Finding #10 — a fixed 120-day horizon left days 121..max_advance_days stale.
describe("AvailabilityRuleService invalidation horizon", () => {
  const RULE = { day_of_week: 1, start_time: "09:00", end_time: "17:00" };

  it("covers the vendor's real max_advance_days", async () => {
    const { svc, horizons } = makeWithCache(365);
    await svc.addWorkingHours(VENDOR, STAFF, RULE);
    expect(horizons).toEqual([365]);
  });

  it("keeps a floor for vendors with a short max_advance_days", async () => {
    const { svc, horizons } = makeWithCache(30);
    await svc.addWorkingHours(VENDOR, STAFF, RULE);
    expect(horizons).toEqual([120]);
  });

  it("caps an absurd max_advance_days", async () => {
    const { svc, horizons } = makeWithCache(36_500);
    await svc.addWorkingHours(VENDOR, STAFF, RULE);
    expect(horizons).toEqual([730]);
  });

  it("falls back to the floor when the vendor has no offerings", async () => {
    const { svc, horizons } = makeWithCache(null);
    await svc.addWorkingHours(VENDOR, STAFF, RULE);
    expect(horizons).toEqual([120]);
  });
});

describe("AvailabilityRuleService.addTimeOff", () => {
  it("rejects starts_at >= ends_at", async () => {
    const { svc } = make();
    await expect(
      svc.addTimeOff(VENDOR, STAFF, {
        starts_at: "2026-08-02T10:00:00Z",
        ends_at: "2026-08-01T10:00:00Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("creates a valid time-off, coercing the ISO strings to Dates", async () => {
    const { svc, savedOff } = make();
    const off = await svc.addTimeOff(VENDOR, STAFF, {
      starts_at: "2026-08-01T09:00:00Z",
      ends_at: "2026-08-01T17:00:00Z",
      reason: "Leave",
    });
    expect(off.staff_member_id).toBe(STAFF);
    expect(off.starts_at).toBeInstanceOf(Date);
    expect(savedOff).toHaveLength(1);
  });
});
