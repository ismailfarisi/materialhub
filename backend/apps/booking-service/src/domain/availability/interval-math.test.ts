import { describe, expect, it } from "bun:test";
import {
  applyBookingWindow,
  composeSlots,
  dayRangeUtc,
  expandWorkingHours,
  localDaysInRange,
  sliceIntoSlots,
  subtractIntervals,
  timeOfDayMinutes,
  zonedTimeToUtc,
} from "./interval-math.ts";

const iso = (s: string) => new Date(s);

describe("subtractIntervals", () => {
  it("removes an overlapping busy interval from the middle", () => {
    const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T17:00:00Z") }];
    const busy = [{ start: iso("2026-07-10T12:00:00Z"), end: iso("2026-07-10T13:00:00Z") }];
    const out = subtractIntervals(free, busy);
    expect(out).toHaveLength(2);
    expect(out[0]!.start.toISOString()).toBe("2026-07-10T09:00:00.000Z");
    expect(out[0]!.end.toISOString()).toBe("2026-07-10T12:00:00.000Z");
    expect(out[1]!.start.toISOString()).toBe("2026-07-10T13:00:00.000Z");
    expect(out[1]!.end.toISOString()).toBe("2026-07-10T17:00:00.000Z");
  });

  it("treats adjacent (touching) intervals as non-overlapping", () => {
    const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T17:00:00Z") }];
    // busy ends exactly where a later window would start — half-open, so 09:00
    // remains free right up to 10:00.
    const busy = [{ start: iso("2026-07-10T17:00:00Z"), end: iso("2026-07-10T18:00:00Z") }];
    const out = subtractIntervals(free, busy);
    expect(out).toHaveLength(1);
    expect(out[0]!.end.toISOString()).toBe("2026-07-10T17:00:00.000Z");
  });

  it("merges overlapping busy intervals before subtracting", () => {
    const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T17:00:00Z") }];
    const busy = [
      { start: iso("2026-07-10T11:00:00Z"), end: iso("2026-07-10T13:00:00Z") },
      { start: iso("2026-07-10T12:00:00Z"), end: iso("2026-07-10T14:00:00Z") },
    ];
    const out = subtractIntervals(free, busy);
    expect(out).toHaveLength(2);
    expect(out[0]!.end.toISOString()).toBe("2026-07-10T11:00:00.000Z");
    expect(out[1]!.start.toISOString()).toBe("2026-07-10T14:00:00.000Z");
  });

  it("drops a window fully covered by busy", () => {
    const free = [{ start: iso("2026-07-10T12:00:00Z"), end: iso("2026-07-10T13:00:00Z") }];
    const busy = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T17:00:00Z") }];
    expect(subtractIntervals(free, busy)).toHaveLength(0);
  });
});

describe("zonedTimeToUtc + expandWorkingHours (DST correctness)", () => {
  it("converts Asia/Dubai wall-clock to UTC (no DST, UTC+4)", () => {
    // 09:00 Dubai == 05:00 UTC year-round.
    expect(zonedTimeToUtc(2026, 7, 10, 9, 0, "Asia/Dubai").toISOString()).toBe(
      "2026-07-10T05:00:00.000Z",
    );
  });

  it("reflects the DST offset change across spring-forward in America/New_York", () => {
    // 2026-03-08 is the US spring-forward day; by 09:00 local the zone is EDT
    // (UTC-4), so 09:00 local == 13:00 UTC. In winter (Jan) 09:00 EST (UTC-5) ==
    // 14:00 UTC. Same rule, different UTC hour ⇒ DST-aware.
    const rule = { day_of_week: 0, start_time: "09:00", end_time: "17:00" }; // Sunday
    const march = expandWorkingHours(
      [rule],
      { from: iso("2026-03-08T00:00:00Z"), to: iso("2026-03-09T00:00:00Z") },
      "America/New_York",
    );
    expect(march).toHaveLength(1);
    expect(march[0]!.start.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(march[0]!.end.toISOString()).toBe("2026-03-08T21:00:00.000Z");

    const janRule = { day_of_week: 4, start_time: "09:00", end_time: "17:00" }; // Thursday
    const jan = expandWorkingHours(
      [janRule],
      { from: iso("2026-01-08T00:00:00Z"), to: iso("2026-01-09T00:00:00Z") },
      "America/New_York",
    );
    expect(jan[0]!.start.toISOString()).toBe("2026-01-08T14:00:00.000Z");
  });

  it("only expands rules whose day_of_week matches and within effective range", () => {
    const rules = [
      { day_of_week: 5, start_time: "10:00", end_time: "18:00" }, // Friday
      {
        day_of_week: 5,
        start_time: "10:00",
        end_time: "18:00",
        effective_from: "2026-08-01",
      }, // not yet effective
    ];
    // 2026-07-10 is a Friday. Range covers just that day.
    const out = expandWorkingHours(
      rules,
      { from: iso("2026-07-10T00:00:00Z"), to: iso("2026-07-11T00:00:00Z") },
      "Asia/Dubai",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.start.toISOString()).toBe("2026-07-10T06:00:00.000Z"); // 10:00 Dubai
  });
});

// The hazards are the two local days that are not 24h long. These lock in the
// documented behaviour so a future "simplification" of the tz math is caught.
describe("DST transition days (America/New_York)", () => {
  it("maps the NONEXISTENT local 02:00–03:00 on spring-forward onto the real gap hour", () => {
    // 2026-03-08: local clocks jump 02:00 EST → 03:00 EDT, so no wall-clock time
    // 02:00–02:59 exists. The rule must still resolve to a real, non-empty,
    // 1-hour UTC window (01:00 EST = 06:00Z → 03:00 EDT = 07:00Z) and must not
    // produce an inverted or zero-length interval.
    const out = expandWorkingHours(
      [{ day_of_week: 0, start_time: "02:00", end_time: "03:00" }],
      { from: iso("2026-03-08T00:00:00Z"), to: iso("2026-03-09T12:00:00Z") },
      "America/New_York",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.start.toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(out[0]!.end.toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("counts a shift spanning spring-forward as its REAL elapsed duration", () => {
    // Local 01:00→04:00 is only 2 real hours on the 23-hour day.
    const out = expandWorkingHours(
      [{ day_of_week: 0, start_time: "01:00", end_time: "04:00" }],
      { from: iso("2026-03-08T00:00:00Z"), to: iso("2026-03-09T12:00:00Z") },
      "America/New_York",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.end.getTime() - out[0]!.start.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("covers BOTH repetitions of the AMBIGUOUS hour on fall-back", () => {
    // 2026-11-01: 01:00–01:59 local happens twice (EDT then EST). A 01:00–02:00
    // rule resolves to the first 01:00 (05:00Z) through 02:00 EST (07:00Z) — two
    // real hours — so the staff member is bookable for the whole repeated hour
    // rather than only one of the two.
    const out = expandWorkingHours(
      [{ day_of_week: 0, start_time: "01:00", end_time: "02:00" }],
      { from: iso("2026-11-01T00:00:00Z"), to: iso("2026-11-02T12:00:00Z") },
      "America/New_York",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(out[0]!.end.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(out[0]!.end.getTime() - out[0]!.start.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("returns a 23-hour span for the spring-forward local day", () => {
    const { from, to } = dayRangeUtc("2026-03-08", "America/New_York");
    expect(from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("returns a 25-hour span for the fall-back local day", () => {
    const { from, to } = dayRangeUtc("2026-11-01", "America/New_York");
    expect(from.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

// Regression guard for finding #12: a `date` column hydrated as a Date must not
// stringify to "Mon Jul 20 2026 ..." and silently make a bounded rule
// permanently effective.
describe("effective_from / effective_to as Date objects", () => {
  const range = { from: iso("2026-07-10T00:00:00Z"), to: iso("2026-07-11T00:00:00Z") };

  it("suppresses a rule that is not yet effective", () => {
    const out = expandWorkingHours(
      [
        {
          day_of_week: 5, // 2026-07-10 is a Friday
          start_time: "10:00",
          end_time: "18:00",
          effective_from: new Date("2026-08-01T00:00:00Z"),
        },
      ],
      range,
      "Asia/Dubai",
    );
    expect(out).toHaveLength(0);
  });

  it("suppresses a rule whose effectivity has expired", () => {
    const out = expandWorkingHours(
      [
        {
          day_of_week: 5,
          start_time: "10:00",
          end_time: "18:00",
          effective_to: new Date("2026-06-30T00:00:00Z"),
        },
      ],
      range,
      "Asia/Dubai",
    );
    expect(out).toHaveLength(0);
  });

  it("keeps a rule that is effective on the day", () => {
    const out = expandWorkingHours(
      [
        {
          day_of_week: 5,
          start_time: "10:00",
          end_time: "18:00",
          effective_from: new Date("2026-07-01T00:00:00Z"),
          effective_to: new Date("2026-12-31T00:00:00Z"),
        },
      ],
      range,
      "Asia/Dubai",
    );
    expect(out).toHaveLength(1);
  });
});

describe("sliceIntoSlots degenerate options", () => {
  const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T17:00:00Z") }];

  it("returns nothing (and does not loop forever) for stepMinutes = 0", () => {
    const slots = sliceIntoSlots(free, {
      durationMinutes: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      stepMinutes: 0,
    });
    expect(slots).toHaveLength(0);
  });

  it("returns nothing for a negative step", () => {
    expect(
      sliceIntoSlots(free, {
        durationMinutes: 30,
        bufferBefore: 0,
        bufferAfter: 0,
        stepMinutes: -15,
      }),
    ).toHaveLength(0);
  });

  it("returns nothing for zero or negative duration", () => {
    const base = { bufferBefore: 0, bufferAfter: 0, stepMinutes: 15 };
    expect(sliceIntoSlots(free, { ...base, durationMinutes: 0 })).toHaveLength(0);
    expect(sliceIntoSlots(free, { ...base, durationMinutes: -30 })).toHaveLength(0);
  });
});

describe("timeOfDayMinutes", () => {
  it("compares unpadded and padded times numerically", () => {
    expect(timeOfDayMinutes("9:00")).toBe(540);
    expect(timeOfDayMinutes("09:00")).toBe(540);
    expect(timeOfDayMinutes("10:00")).toBe(600);
    // The string comparison this replaces got these backwards.
    expect(timeOfDayMinutes("9:00") < timeOfDayMinutes("10:00")).toBe(true);
  });

  it("accepts seconds and rejects garbage", () => {
    expect(timeOfDayMinutes("17:30:00")).toBe(1050);
    expect(Number.isNaN(timeOfDayMinutes("abc"))).toBe(true);
    expect(Number.isNaN(timeOfDayMinutes("25:00"))).toBe(true);
    expect(Number.isNaN(timeOfDayMinutes(""))).toBe(true);
  });
});

describe("sliceIntoSlots", () => {
  it("carves fixed-duration slots stepping by stepMinutes", () => {
    const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T10:00:00Z") }];
    const slots = sliceIntoSlots(free, {
      durationMinutes: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      stepMinutes: 15,
    });
    // 09:00, 09:15, 09:30 (09:30+30=10:00 fits); 09:45 would end 10:15 (no).
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-07-10T09:00:00.000Z",
      "2026-07-10T09:15:00.000Z",
      "2026-07-10T09:30:00.000Z",
    ]);
    expect(slots[0]!.end.toISOString()).toBe("2026-07-10T09:30:00.000Z");
  });

  it("requires the full duration+buffers footprint to fit", () => {
    const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T10:00:00Z") }];
    // footprint = 10 + 30 + 10 = 50min. First start = 09:10, service ends 09:40,
    // + 10 after = 09:50 ≤ 10:00 ✓. Next start 09:25 → footprint ends 10:05 ✗.
    const slots = sliceIntoSlots(free, {
      durationMinutes: 30,
      bufferBefore: 10,
      bufferAfter: 10,
      stepMinutes: 15,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]!.start.toISOString()).toBe("2026-07-10T09:10:00.000Z");
    expect(slots[0]!.end.toISOString()).toBe("2026-07-10T09:40:00.000Z");
  });

  it("returns nothing when the window is smaller than the footprint", () => {
    const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T09:20:00Z") }];
    const slots = sliceIntoSlots(free, {
      durationMinutes: 30,
      bufferBefore: 0,
      bufferAfter: 0,
      stepMinutes: 15,
    });
    expect(slots).toHaveLength(0);
  });
});

describe("localDaysInRange / dayRangeUtc (timezone-aware)", () => {
  it("lists the local days a UTC range spans in Asia/Dubai", () => {
    // 2026-07-09T21:00Z is already 2026-07-10 01:00 in Dubai (UTC+4).
    const days = localDaysInRange(
      iso("2026-07-09T21:00:00Z"),
      iso("2026-07-11T05:00:00Z"),
      "Asia/Dubai",
    );
    expect(days).toEqual(["2026-07-10", "2026-07-11"]);
  });

  it("returns the UTC bounds of one Dubai calendar day", () => {
    const { from, to } = dayRangeUtc("2026-07-10", "Asia/Dubai");
    expect(from.toISOString()).toBe("2026-07-09T20:00:00.000Z"); // 00:00 Dubai
    expect(to.toISOString()).toBe("2026-07-10T20:00:00.000Z"); // next 00:00 Dubai
  });
});

describe("composeSlots (travel buffer + booking window)", () => {
  const free = [{ start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T11:00:00Z") }];

  it("pads travel buffer onto both sides of the footprint for home-visits", () => {
    // duration 30, travel 15 → footprint 15+30+15 = 60min. First start = 09:15,
    // ends 09:45, +15 travel = 10:00. Step 30 → next start 09:45 → footprint ends
    // 10:30 ✓; 10:15 → 11:00 ✓ (== window end); 10:45 → 11:30 ✗.
    const slots = composeSlots(
      free,
      {
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        slotStepMinutes: 30,
        minNoticeMinutes: 0,
        maxAdvanceDays: 365,
        travelBufferMinutes: 15,
      },
      iso("2026-07-01T00:00:00Z"),
    );
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-07-10T09:15:00.000Z",
      "2026-07-10T09:45:00.000Z",
      "2026-07-10T10:15:00.000Z",
    ]);
  });

  it("still applies the min-notice window after slicing", () => {
    const slots = composeSlots(
      free,
      {
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        slotStepMinutes: 60,
        minNoticeMinutes: 120,
        maxAdvanceDays: 365,
      },
      iso("2026-07-10T08:30:00Z"), // earliest bookable = 10:30
    );
    // 09:00 and 10:00 are inside notice window; only 10:00+? starts: 09:00,10:00
    // (10:00+30=10:30 fits). Both < 10:30 earliest → filtered out → empty.
    expect(slots).toHaveLength(0);
  });
});

describe("applyBookingWindow", () => {
  const slots = [
    { start: iso("2026-07-10T09:00:00Z"), end: iso("2026-07-10T09:30:00Z") },
    { start: iso("2026-07-10T12:00:00Z"), end: iso("2026-07-10T12:30:00Z") },
    { start: iso("2026-09-01T09:00:00Z"), end: iso("2026-09-01T09:30:00Z") },
  ];

  it("filters slots inside [now+minNotice, now+maxAdvance]", () => {
    const out = applyBookingWindow(slots, {
      now: iso("2026-07-10T10:00:00Z"),
      minNoticeMinutes: 60, // earliest 11:00
      maxAdvanceDays: 30, // latest 2026-08-09
    });
    // 09:00 is in the past (< earliest), 09-01 is beyond 30d; only 12:00 survives.
    expect(out).toHaveLength(1);
    expect(out[0]!.start.toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });
});
