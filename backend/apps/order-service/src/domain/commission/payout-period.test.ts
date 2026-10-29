import { describe, expect, it } from "bun:test";
import { closedPeriodFor, isSupportedPayoutSchedule } from "./payout-period.ts";

describe("closedPeriodFor", () => {
  it("closes a weekly period on Monday, covering the prior Mon-Sun", () => {
    expect(closedPeriodFor("weekly", new Date("2026-07-20T01:00:00Z"))).toEqual({
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
    });
  });

  it("returns null mid-week", () => {
    expect(closedPeriodFor("weekly", new Date("2026-07-22T01:00:00Z"))).toBeNull();
  });

  it("closes a monthly period on the 1st, covering the prior month", () => {
    expect(closedPeriodFor("monthly", new Date("2026-08-01T01:00:00Z"))).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
  });

  it("closes biweekly on the 1st and 16th", () => {
    expect(closedPeriodFor("biweekly", new Date("2026-07-16T01:00:00Z"))).toEqual({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-15",
    });
    expect(closedPeriodFor("biweekly", new Date("2026-07-01T01:00:00Z"))).toEqual({
      periodStart: "2026-06-16",
      periodEnd: "2026-06-30",
    });
    expect(closedPeriodFor("biweekly", new Date("2026-07-10T01:00:00Z"))).toBeNull();
  });

  it("returns null for an unknown schedule rather than guessing", () => {
    expect(closedPeriodFor("fortnightly-ish", new Date("2026-07-01T01:00:00Z"))).toBeNull();
  });

  // MINOR (round 4): `daily` is offered in the admin vendor form but fell
  // through to the unknown-schedule `return null` here, so the nightly job
  // read it as "not a closing day" and skipped those vendors every night,
  // forever, with nothing in any log. Implemented rather than removed from
  // the UI - it is the same date math the other three use.
  it("closes a daily period every day, covering yesterday", () => {
    expect(closedPeriodFor("daily", new Date("2026-07-22T01:00:00Z"))).toEqual({
      periodStart: "2026-07-21",
      periodEnd: "2026-07-21",
    });
    // and across a month boundary
    expect(closedPeriodFor("daily", new Date("2026-08-01T01:00:00Z"))).toEqual({
      periodStart: "2026-07-31",
      periodEnd: "2026-07-31",
    });
  });

  it("isSupportedPayoutSchedule distinguishes 'not a closing day' from 'this vendor can never be drafted'", () => {
    expect(isSupportedPayoutSchedule("daily")).toBe(true);
    expect(isSupportedPayoutSchedule("weekly")).toBe(true);
    expect(isSupportedPayoutSchedule("biweekly")).toBe(true);
    expect(isSupportedPayoutSchedule("monthly")).toBe(true);
    expect(isSupportedPayoutSchedule("fortnightly-ish")).toBe(false);
  });
});
