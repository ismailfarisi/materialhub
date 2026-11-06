import { describe, expect, it } from "bun:test";
import {
  DeliveryEstimateService,
  normaliseDeliverySettings,
  pickRateTransit,
  validateDeliverySettings,
} from "./delivery-estimate.service.ts";
import { PublicHolidayService } from "./public-holiday.service.ts";

const VENDOR = "11111111-1111-4111-8111-111111111111";
const OTHER_VENDOR = "22222222-2222-4222-8222-222222222222";

const warehouse = (over: Record<string, unknown> = {}) => ({
  id: "wh-1",
  vendor_id: VENDOR,
  name: "Al Quoz board store",
  emirate: "Dubai",
  is_active: true,
  is_default: true,
  dispatch_cutoff_time: "14:00",
  handling_days: 0,
  working_days: [1, 2, 3, 4, 5],
  same_day_emirates: ["Dubai"],
  next_day_emirates: ["Sharjah"],
  ...over,
});

const rate = (over: Record<string, unknown> = {}) => ({
  id: "r",
  vendor_id: null,
  zone_id: null,
  zone: null,
  method: "standard",
  is_active: true,
  estimated_days_min: 2,
  estimated_days_max: 3,
  ...over,
});

/** A query builder stub that ignores filters and returns `rows`. */
const qb = (rows: unknown[]) => {
  const b: any = {};
  for (const m of ["select", "where", "andWhere", "leftJoinAndSelect", "orderBy"]) b[m] = () => b;
  b.getMany = async () => rows;
  return b;
};

function makeService(opts: {
  warehouses?: any[];
  products?: any[];
  rates?: any[];
  holidays?: any[];
}) {
  const whs = opts.warehouses ?? [warehouse()];
  const warehouseRepo: any = {
    findOne: async ({ where }: any) =>
      whs.find(
        (w) =>
          (where.id ? w.id === where.id : true) &&
          (where.vendor_id ? w.vendor_id === where.vendor_id : true) &&
          w.is_active,
      ) ?? null,
  };
  const productRepo: any = { createQueryBuilder: () => qb(opts.products ?? []) };
  const rateRepo: any = { createQueryBuilder: () => qb(opts.rates ?? []) };
  let holidayQueries = 0;
  const holidayRepo: any = {
    createQueryBuilder: () => {
      holidayQueries++;
      return qb(opts.holidays ?? []);
    },
  };
  const svc = new DeliveryEstimateService(warehouseRepo, productRepo, rateRepo, holidayRepo);
  return { svc, holidayQueries: () => holidayQueries };
}

const monday10 = new Date("2026-11-09T10:00:00+04:00");

describe("pickRateTransit", () => {
  it("prefers a vendor rate for the destination zone", () => {
    const rates = [
      rate({ id: "platform", estimated_days_min: 3, estimated_days_max: 5 }),
      rate({ id: "vendor", vendor_id: VENDOR, estimated_days_min: 2, estimated_days_max: 2 }),
      rate({
        id: "vendor-zone",
        vendor_id: VENDOR,
        zone_id: "z",
        zone: { emirate: "Fujairah" },
        estimated_days_min: 1,
        estimated_days_max: 2,
      }),
    ];
    expect(pickRateTransit(rates as any, VENDOR, "Fujairah")).toEqual({ min: 1, max: 2 });
    expect(pickRateTransit(rates as any, VENDOR, "Ajman")).toEqual({ min: 2, max: 2 });
  });

  it("ignores other vendors, other methods and rates without days", () => {
    const rates = [
      rate({ vendor_id: OTHER_VENDOR, estimated_days_min: 0, estimated_days_max: 0 }),
      rate({ method: "express", estimated_days_min: 1, estimated_days_max: 1 }),
      rate({ estimated_days_min: null }),
    ];
    expect(pickRateTransit(rates as any, VENDOR, "Dubai")).toBeNull();
    expect(pickRateTransit(rates as any, VENDOR, "Dubai", "express")).toEqual({ min: 1, max: 1 });
  });
});

describe("delivery settings validation", () => {
  it("accepts good settings and canonicalises emirates", () => {
    const s = {
      same_day_emirates: ["dubai", "Dubai"],
      next_day_emirates: ["DUBAI", "abu_dhabi"],
      working_days: [5, 1, 1],
    };
    expect(() => validateDeliverySettings(s)).not.toThrow();
    expect(normaliseDeliverySettings(s)).toEqual({
      same_day_emirates: ["Dubai"],
      next_day_emirates: ["Abu Dhabi"],
      working_days: [1, 5],
    });
  });

  it("rejects bad cutoffs, handling, working days and emirates", () => {
    expect(() => validateDeliverySettings({ dispatch_cutoff_time: "25:00" })).toThrow();
    expect(() => validateDeliverySettings({ handling_days: -1 })).toThrow();
    expect(() => validateDeliverySettings({ working_days: [] })).toThrow();
    expect(() => validateDeliverySettings({ working_days: [7] })).toThrow();
    expect(() => validateDeliverySettings({ same_day_emirates: ["Muscat"] })).toThrow();
  });
});

describe("DeliveryEstimateService", () => {
  it("estimates from the vendor's default warehouse", async () => {
    const { svc } = makeService({});
    const e = await svc.estimate({ vendorId: VENDOR, emirate: "dubai", now: monday10 });
    expect(e.warehouse_id).toBe("wh-1");
    expect(e.destination_emirate).toBe("Dubai");
    expect(e.speed).toBe("same_day");
    expect(e.earliest).toBe("2026-11-09");
  });

  it("applies the largest product handling override", async () => {
    const { svc } = makeService({
      products: [
        { id: "p1", handling_days_override: null },
        { id: "p2", handling_days_override: 3 },
        { id: "p3", handling_days_override: 1 },
      ],
    });
    const e = await svc.estimate({
      vendorId: VENDOR,
      emirate: "Dubai",
      productIds: ["p1", "p2", "p3"],
      now: monday10,
    });
    expect(e.handlingDays).toBe(3);
    expect(e.dispatchDate).toBe("2026-11-12");
  });

  it("skips holidays from the admin list", async () => {
    const { svc } = makeService({
      holidays: [
        { holiday_date: "2026-12-02", is_estimate: true },
        { holiday_date: "2026-12-03", is_estimate: false },
      ],
    });
    const e = await svc.estimate({
      vendorId: VENDOR,
      emirate: "Sharjah",
      now: new Date("2026-12-01T15:00:00+04:00"),
    });
    expect(e.dispatchDate).toBe("2026-12-04");
    expect(e.dependsOnEstimatedHoliday).toBe(true);
  });

  it("uses the chosen method's rate", async () => {
    const { svc } = makeService({
      rates: [rate({ method: "express", estimated_days_min: 1, estimated_days_max: 1 })],
    });
    const e = await svc.estimate({
      vendorId: VENDOR,
      emirate: "Dubai",
      method: "express",
      now: monday10,
    });
    expect(e.basis).toBe("shipping_rate");
    expect(e.earliest).toBe("2026-11-10");
  });

  it("rejects an unknown emirate and a missing origin", async () => {
    const { svc } = makeService({});
    await expect(svc.estimate({ vendorId: VENDOR, emirate: "Muscat" })).rejects.toThrow();
    await expect(svc.estimate({ emirate: "Dubai" })).rejects.toThrow();
  });

  it("returns one estimate per supplier and an error for a supplier without a warehouse", async () => {
    const { svc, holidayQueries } = makeService({
      warehouses: [
        warehouse(),
        warehouse({
          id: "wh-2",
          vendor_id: OTHER_VENDOR,
          emirate: "Sharjah",
          same_day_emirates: [],
          next_day_emirates: [],
        }),
      ],
    });
    const out = await svc.estimateBatch({
      emirate: "Dubai",
      now: monday10,
      groups: [
        { vendor_id: VENDOR },
        { vendor_id: OTHER_VENDOR },
        { vendor_id: "33333333-3333-4333-8333-333333333333" },
      ],
    });
    expect(out).toHaveLength(3);
    expect(out[0].estimate?.speed).toBe("same_day");
    expect(out[1].estimate?.basis).toBe("default");
    expect(out[1].estimate?.earliest).toBe("2026-11-11");
    expect(out[2].estimate).toBeNull();
    expect(out[2].error).toContain("no active warehouse");
    expect(holidayQueries()).toBe(1);
  });

  it("caches holidays until invalidated", async () => {
    const { svc, holidayQueries } = makeService({});
    await svc.estimate({ vendorId: VENDOR, emirate: "Dubai", now: monday10 });
    await svc.estimate({ vendorId: VENDOR, emirate: "Dubai", now: monday10 });
    expect(holidayQueries()).toBe(1);
    svc.invalidateHolidays();
    await svc.estimate({ vendorId: VENDOR, emirate: "Dubai", now: monday10 });
    expect(holidayQueries()).toBe(2);
  });

  it("previews unsaved settings without touching the saved warehouse", async () => {
    const wh = warehouse();
    const { svc } = makeService({ warehouses: [wh] });
    const e = await svc.preview(
      wh as any,
      { dispatch_cutoff_time: "09:00", same_day_emirates: [] },
      "Dubai",
      monday10,
    );
    expect(e.basis).toBe("default");
    expect(e.dispatchDate).toBe("2026-11-10");
    expect(wh.dispatch_cutoff_time).toBe("14:00");
    await expect(
      svc.preview(wh as any, { handling_days: 99 }, "Dubai", monday10),
    ).rejects.toThrow();
  });
});

describe("PublicHolidayService", () => {
  const makeRepo = (rows: any[] = []) => ({
    rows,
    findOne: async ({ where }: any) =>
      rows.find((r) => (where.id ? r.id === where.id : r.holiday_date === where.holiday_date)) ??
      null,
    create: (x: any) => x,
    save: async (x: any) => {
      if (!x.id) {
        x.id = `h${rows.length + 1}`;
        rows.push(x);
      }
      return x;
    },
    remove: async (x: any) => {
      rows.splice(rows.indexOf(x), 1);
    },
  });

  it("creates, edits and deletes holidays and tells the estimator", async () => {
    let changes = 0;
    const repo = makeRepo();
    const svc = new PublicHolidayService(repo as any, () => changes++);
    const h = await svc.create({ holiday_date: "2027-06-06", name: " Hijri New Year " });
    expect(h.name).toBe("Hijri New Year");
    expect(h.is_estimate).toBe(true);
    await svc.update(h.id, { is_estimate: false, name_ar: "رأس السنة الهجرية" });
    expect(repo.rows[0].is_estimate).toBe(false);
    await svc.remove(h.id);
    expect(repo.rows).toHaveLength(0);
    expect(changes).toBe(3);
  });

  it("rejects duplicate and impossible dates", async () => {
    const repo = makeRepo([{ id: "h1", holiday_date: "2026-12-02", name: "National Day" }]);
    const svc = new PublicHolidayService(repo as any);
    await expect(svc.create({ holiday_date: "2026-12-02", name: "Again" })).rejects.toThrow();
    await expect(svc.create({ holiday_date: "2026-02-30", name: "Nope" })).rejects.toThrow();
    await expect(svc.create({ holiday_date: "2026-12-05", name: "  " })).rejects.toThrow();
  });
});
