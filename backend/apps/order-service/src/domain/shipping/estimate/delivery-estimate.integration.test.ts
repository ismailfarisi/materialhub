import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  DeliveryZone,
  Product,
  PublicHoliday,
  ShippingRate,
  Warehouse,
} from "@materialhub/database";
import { DeliveryEstimateService } from "./delivery-estimate.service.ts";
import { PublicHolidayService } from "./public-holiday.service.ts";

// Runs against a live Postgres with migrations applied (see CLAUDE.md);
// skips itself when the database is unreachable.
let connected = false;
try {
  if (!AppDataSource.isInitialized) {
    AppDataSource.setOptions({ logging: false });
    await AppDataSource.initialize();
  }
  connected = true;
} catch {
  connected = false;
}

const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
const ids: { warehouse?: string; zone?: string; rate?: string; holiday?: string } = {};

describe.skipIf(!connected)("delivery estimate against Postgres", () => {
  let svc: DeliveryEstimateService;
  let holidays: PublicHolidayService;

  beforeAll(async () => {
    const zone = await AppDataSource.getRepository(DeliveryZone).save({
      name: `Fujairah test ${suffix}`,
      slug: `fujairah-test-${suffix.toLowerCase()}`,
      city: "Fujairah",
      emirate: "Fujairah",
    });
    ids.zone = zone.id;
    const wh = await AppDataSource.getRepository(Warehouse).save({
      name: `Greyboard store ${suffix}`,
      code: `DP-${suffix}`,
      address_line_1: "Warehouse 4, Street 12",
      city: "Dubai",
      emirate: "Dubai",
      is_active: true,
      dispatch_cutoff_time: "13:30",
      handling_days: 0,
      working_days: [1, 2, 3, 4, 5, 6],
      same_day_emirates: ["Dubai"],
      next_day_emirates: ["Sharjah"],
    });
    ids.warehouse = wh.id;
    const rate = await AppDataSource.getRepository(ShippingRate).save({
      name: `Fujairah standard ${suffix}`,
      method: "standard",
      zone_id: zone.id,
      base_cost: 2500,
      estimated_days_min: 2,
      estimated_days_max: 3,
      is_active: true,
    });
    ids.rate = rate.id;
    svc = new DeliveryEstimateService(
      AppDataSource.getRepository(Warehouse),
      AppDataSource.getRepository(Product),
      AppDataSource.getRepository(ShippingRate),
      AppDataSource.getRepository(PublicHoliday),
    );
    holidays = new PublicHolidayService(AppDataSource.getRepository(PublicHoliday), () =>
      svc.invalidateHolidays(),
    );
  });

  afterAll(async () => {
    if (!connected) return;
    if (ids.rate) await AppDataSource.getRepository(ShippingRate).delete(ids.rate);
    if (ids.warehouse) await AppDataSource.getRepository(Warehouse).delete(ids.warehouse);
    if (ids.zone) await AppDataSource.getRepository(DeliveryZone).delete(ids.zone);
    if (ids.holiday) await AppDataSource.getRepository(PublicHoliday).delete(ids.holiday);
  });

  it("reads the warehouse's delivery columns", async () => {
    const e = await svc.estimate({
      warehouseId: ids.warehouse,
      emirate: "Dubai",
      productIds: ["00000000-0000-4000-8000-000000000000"],
      now: new Date("2026-11-09T13:00:00+04:00"),
    });
    expect(e.speed).toBe("same_day");
    expect(e.minutesToCutoff).toBe(30);
  });

  it("uses the zone rate joined by emirate", async () => {
    const e = await svc.estimate({
      warehouseId: ids.warehouse,
      emirate: "Fujairah",
      now: new Date("2026-11-09T09:00:00+04:00"),
    });
    expect(e.basis).toBe("shipping_rate");
    expect(e.transitDays).toEqual({ min: 2, max: 3 });
  });

  it("skips the seeded National Day holidays as estimates", async () => {
    const e = await svc.estimate({
      warehouseId: ids.warehouse,
      emirate: "Sharjah",
      now: new Date("2026-12-01T15:00:00+04:00"),
    });
    // Tue after cutoff → Wed 2 and Thu 3 are seeded holidays → dispatch Fri 4, deliver Sat 5.
    expect(e.dispatchDate).toBe("2026-12-04");
    expect(e.earliest).toBe("2026-12-05");
    expect(e.dependsOnEstimatedHoliday).toBe(true);
  });

  it("picks up an admin-added holiday", async () => {
    const created = await holidays.create({
      holiday_date: "2031-01-06",
      name: `Test closure ${suffix}`,
      is_estimate: false,
    });
    ids.holiday = created.id;
    const list = await holidays.list(2031);
    expect(list.some((h) => h.id === created.id)).toBe(true);
    await expect(
      holidays.create({ holiday_date: "2031-01-06", name: "Duplicate" }),
    ).rejects.toThrow();
  });
});
