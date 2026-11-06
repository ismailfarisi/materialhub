import { describe, expect, it } from "bun:test";
import {
  type EstimateInput,
  type OriginSettings,
  dayToIsoDate,
  dubaiDayNumber,
  dubaiMinuteOfDay,
  estimateDelivery,
  isoDateToDay,
  normaliseEmirate,
  parseCutoff,
  weekday,
} from "./delivery-estimate.ts";

/** An instant given as Dubai wall-clock time. */
const dubai = (local: string) => new Date(`${local}:00+04:00`);

const origin = (over: Partial<OriginSettings> = {}): OriginSettings => ({
  emirate: "Dubai",
  dispatchCutoffTime: "14:00",
  handlingDays: 0,
  workingDays: [1, 2, 3, 4, 5],
  sameDayEmirates: ["Dubai"],
  nextDayEmirates: ["Sharjah", "Ajman", "Abu Dhabi"],
  ...over,
});

const run = (over: Partial<EstimateInput> & { now: Date }) =>
  estimateDelivery({
    origin: origin(),
    destinationEmirate: "Dubai",
    holidays: new Map(),
    ...over,
  });

describe("calendar helpers", () => {
  it("knows the weekday of fixture dates", () => {
    expect(weekday(isoDateToDay("2026-11-06"))).toBe(5); // Friday
    expect(weekday(isoDateToDay("2026-11-09"))).toBe(1); // Monday
    expect(weekday(isoDateToDay("2026-11-08"))).toBe(0); // Sunday
    expect(dayToIsoDate(isoDateToDay("2027-03-09"))).toBe("2027-03-09");
  });

  it("reads the Dubai date, not the UTC date", () => {
    // 21:30 UTC on Monday is 01:30 on Tuesday in Dubai.
    const instant = new Date("2026-11-09T21:30:00Z");
    expect(dayToIsoDate(dubaiDayNumber(instant))).toBe("2026-11-10");
    expect(dubaiMinuteOfDay(instant)).toBe(90);
  });

  it("parses cutoffs and rejects bad ones", () => {
    expect(parseCutoff("14:00")).toBe(840);
    expect(parseCutoff("09:30:00")).toBe(570);
    expect(() => parseCutoff("24:00")).toThrow(RangeError);
    expect(() => parseCutoff("2pm")).toThrow(RangeError);
  });

  it("normalises emirate spellings", () => {
    expect(normaliseEmirate("abu_dhabi")).toBe("Abu Dhabi");
    expect(normaliseEmirate("RAS-AL-KHAIMAH")).toBe("Ras Al Khaimah");
    expect(normaliseEmirate("  dubai ")).toBe("Dubai");
    expect(normaliseEmirate("rak")).toBe("Ras Al Khaimah");
    expect(normaliseEmirate("Muscat")).toBeNull();
    expect(normaliseEmirate(null)).toBeNull();
  });
});

describe("cutoff boundary", () => {
  it("ships today when ordered before the cutoff", () => {
    const e = run({ now: dubai("2026-11-09T10:00") });
    expect(e.dispatchDate).toBe("2026-11-09");
    expect(e.earliest).toBe("2026-11-09");
    expect(e.speed).toBe("same_day");
    expect(e.sameDay).toBe(true);
    expect(e.minutesToCutoff).toBe(240);
    expect(e.cutoffAt).toBe("2026-11-09T10:00:00.000Z");
  });

  it("still counts one minute before the cutoff", () => {
    const e = run({ now: dubai("2026-11-09T13:59") });
    expect(e.earliest).toBe("2026-11-09");
    expect(e.minutesToCutoff).toBe(1);
  });

  it("rolls to the next working day at exactly the cutoff", () => {
    const e = run({ now: dubai("2026-11-09T14:00") });
    expect(e.dispatchDate).toBe("2026-11-10");
    expect(e.earliest).toBe("2026-11-10");
    expect(e.speed).toBe("next_day");
    // The countdown now points at tomorrow's cutoff, which holds the same date.
    expect(e.cutoffAt).toBe("2026-11-10T10:00:00.000Z");
    expect(e.minutesToCutoff).toBe(24 * 60);
  });

  it("rounds a part minute up", () => {
    const now = new Date(dubai("2026-11-09T13:58").getTime() + 30_000);
    expect(run({ now }).minutesToCutoff).toBe(2);
  });
});

describe("handling days", () => {
  it("adds handling on working days only", () => {
    // Thursday, handling 2: Fri, then Mon (Sat/Sun off).
    const e = run({ now: dubai("2026-11-12T09:00"), origin: origin({ handlingDays: 2 }) });
    expect(e.dispatchDate).toBe("2026-11-16");
    expect(e.earliest).toBe("2026-11-16");
    expect(e.speed).toBe("standard");
  });

  it("uses the product override for made-to-order items", () => {
    const e = run({
      now: dubai("2026-11-09T09:00"),
      origin: origin({ handlingDays: 1 }),
      handlingDaysOverride: 5,
    });
    expect(e.handlingDays).toBe(5);
    expect(e.dispatchDate).toBe("2026-11-16"); // Mon + 5 working days
  });

  it("accepts an override of zero", () => {
    const e = run({
      now: dubai("2026-11-09T09:00"),
      origin: origin({ handlingDays: 3 }),
      handlingDaysOverride: 0,
    });
    expect(e.dispatchDate).toBe("2026-11-09");
  });
});

describe("weekends", () => {
  it("does not dispatch on Friday or Saturday when the warehouse is closed", () => {
    // Friday 10:00 with a Sun–Thu warehouse: day zero is Sunday.
    const e = run({
      now: dubai("2026-11-06T10:00"),
      origin: origin({ workingDays: [0, 1, 2, 3, 4] }),
      destinationEmirate: "Sharjah",
    });
    expect(e.dispatchDate).toBe("2026-11-08");
    expect(e.earliest).toBe("2026-11-09"); // next-day zone, Monday
  });

  it("dispatches on Saturday when the warehouse opts in", () => {
    const e = run({
      now: dubai("2026-11-06T15:00"), // Friday after the cutoff
      origin: origin({ workingDays: [1, 2, 3, 4, 5, 6] }),
      destinationEmirate: "Dubai",
    });
    expect(e.dispatchDate).toBe("2026-11-07");
    expect(e.earliest).toBe("2026-11-07");
    expect(e.speed).toBe("next_day");
  });

  it("skips Sunday in transit when the carrier does not deliver", () => {
    const e = run({
      now: dubai("2026-11-07T10:00"), // Saturday
      origin: origin({ workingDays: [1, 2, 3, 4, 5, 6] }),
      destinationEmirate: "Abu Dhabi", // next-day zone
    });
    expect(e.dispatchDate).toBe("2026-11-07");
    expect(e.earliest).toBe("2026-11-09");
  });

  it("delivers on Sunday when the carrier days include it", () => {
    const e = run({
      now: dubai("2026-11-07T10:00"),
      origin: origin({ workingDays: [1, 2, 3, 4, 5, 6] }),
      destinationEmirate: "Abu Dhabi",
      carrierDays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(e.earliest).toBe("2026-11-08");
  });

  it("moves a same-day parcel dispatched on a non-delivery day", () => {
    const e = run({
      now: dubai("2026-11-08T10:00"), // Sunday
      origin: origin({ workingDays: [0, 1, 2, 3, 4] }),
    });
    expect(e.dispatchDate).toBe("2026-11-08");
    expect(e.earliest).toBe("2026-11-09");
    expect(e.speed).toBe("next_day");
  });

  it("rejects a warehouse with no working days", () => {
    expect(() =>
      run({ now: dubai("2026-11-09T10:00"), origin: origin({ workingDays: [] }) }),
    ).toThrow(RangeError);
  });
});

describe("public holidays", () => {
  const nationalDay = new Map([
    ["2026-12-02", true],
    ["2026-12-03", true],
  ]);

  it("skips holidays for handling and transit, and flags estimated ones", () => {
    const e = run({
      now: dubai("2026-12-01T10:00"), // Tuesday
      origin: origin({ handlingDays: 1 }),
      destinationEmirate: "Sharjah",
      holidays: nationalDay,
    });
    expect(e.dispatchDate).toBe("2026-12-04"); // Wed/Thu are holidays
    expect(e.earliest).toBe("2026-12-05");
    expect(e.dependsOnEstimatedHoliday).toBe(true);
  });

  it("treats a holiday today as a closed day", () => {
    const e = run({ now: dubai("2026-12-02T09:00"), holidays: nationalDay });
    expect(e.dispatchDate).toBe("2026-12-04");
    expect(e.cutoffAt).toBe("2026-12-04T10:00:00.000Z");
  });

  it("does not flag confirmed holidays", () => {
    const e = run({
      now: dubai("2026-12-01T15:00"),
      holidays: new Set(["2026-12-02", "2026-12-03"]),
    });
    expect(e.dispatchDate).toBe("2026-12-04");
    expect(e.dependsOnEstimatedHoliday).toBe(false);
  });

  it("does not flag holidays outside the window", () => {
    const e = run({ now: dubai("2026-11-09T10:00"), holidays: nationalDay });
    expect(e.dependsOnEstimatedHoliday).toBe(false);
  });

  it("skips holidays in carrier transit", () => {
    const e = run({
      now: dubai("2026-12-01T10:00"),
      destinationEmirate: "Fujairah",
      rateTransit: { min: 1, max: 3 },
      holidays: nationalDay,
    });
    expect(e.dispatchDate).toBe("2026-12-01");
    expect(e.earliest).toBe("2026-12-04");
    expect(e.latest).toBe("2026-12-07"); // Fri, Sat, (Sun off) Mon
  });
});

describe("transit sources", () => {
  it("uses a shipping rate when the emirate is in neither list", () => {
    const e = run({
      now: dubai("2026-11-09T10:00"),
      destinationEmirate: "Fujairah",
      rateTransit: { min: 2, max: 3 },
    });
    expect(e.basis).toBe("shipping_rate");
    expect(e.earliest).toBe("2026-11-11");
    expect(e.latest).toBe("2026-11-12");
  });

  it("lets a chosen method's rate win over the lists", () => {
    const e = run({
      now: dubai("2026-11-09T10:00"),
      destinationEmirate: "Dubai",
      rateTransit: { min: 2, max: 4 },
      preferRateTransit: true,
    });
    expect(e.basis).toBe("shipping_rate");
    expect(e.speed).toBe("standard");
  });

  it("ignores a malformed rate", () => {
    const e = run({
      now: dubai("2026-11-09T10:00"),
      destinationEmirate: "Fujairah",
      rateTransit: { min: 3, max: 1 },
    });
    expect(e.basis).toBe("default");
  });

  it("falls back to default transit within and across emirates", () => {
    const within = run({
      now: dubai("2026-11-09T10:00"),
      origin: origin({ sameDayEmirates: [], nextDayEmirates: [] }),
      destinationEmirate: "dubai",
    });
    expect(within.basis).toBe("default");
    expect(within.transitDays).toEqual({ min: 1, max: 2 });
    expect(within.earliest).toBe("2026-11-10");
    expect(within.latest).toBe("2026-11-11");

    const across = run({
      now: dubai("2026-11-09T10:00"),
      origin: origin({ sameDayEmirates: [], nextDayEmirates: [] }),
      destinationEmirate: "Ras Al Khaimah",
    });
    expect(across.transitDays).toEqual({ min: 2, max: 4 });
    expect(across.latest).toBe("2026-11-13");
  });

  it("matches list entries regardless of spelling", () => {
    const e = run({
      now: dubai("2026-11-09T10:00"),
      origin: origin({ sameDayEmirates: ["abu_dhabi"], nextDayEmirates: [] }),
      destinationEmirate: "Abu Dhabi",
    });
    expect(e.basis).toBe("same_day_zone");
  });
});
