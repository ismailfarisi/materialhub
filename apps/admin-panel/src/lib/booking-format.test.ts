import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatFils,
  marketplaceDayRange,
} from "./booking-format";

describe("formatFils", () => {
  it("converts fils to AED with two decimals", () => {
    expect(formatFils(12345)).toBe("AED 123.45");
  });

  it("renders zero", () => {
    expect(formatFils(0)).toBe("AED 0.00");
  });

  it("pads a value below one dirham", () => {
    expect(formatFils(5)).toBe("AED 0.05");
  });

  it("renders an em dash for null", () => {
    expect(formatFils(null)).toBe("—");
  });

  it("renders an em dash for undefined", () => {
    expect(formatFils(undefined)).toBe("—");
  });
});

describe("formatDateTime", () => {
  // starts_at/ends_at are timestamptz. This pins the fix: the viewer's
  // browser/CI timezone must never leak into the rendered wall-clock time —
  // it must always read as Asia/Dubai (GST, UTC+4, no DST), labelled as such.
  // 2026-07-20T10:30:00Z -> 14:30 in Asia/Dubai.
  it("renders in Asia/Dubai time labelled GST, regardless of the environment's local timezone", () => {
    expect(formatDateTime("2026-07-20T10:30:00Z")).toBe("20 Jul 2026, 02:30 PM GST");
  });

  // 2026-07-20T21:00:00Z -> 2026-07-21T01:00 in Asia/Dubai: the UTC+4 shift
  // must roll the calendar date forward, not just the clock.
  it("rolls the date forward across the UTC+4 offset", () => {
    expect(formatDateTime("2026-07-20T21:00:00Z")).toBe("21 Jul 2026, 01:00 AM GST");
  });

  it("renders an em dash for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("renders an em dash for undefined", () => {
    expect(formatDateTime(undefined)).toBe("—");
  });
});

// The picker hands back local calendar days (react-day-picker sets `to` to
// LOCAL midnight of the end day). Sending those instants straight to a
// `starts_at <= :to` comparison dropped every booking on the last selected day.
// Boundaries must be resolved in the marketplace timezone the list renders in.
describe("marketplaceDayRange", () => {
  it("starts the range at 00:00 GST of the selected day", () => {
    const { from } = marketplaceDayRange(new Date(2026, 6, 20), undefined);
    expect(from).toBe("2026-07-19T20:00:00.000Z");
  });

  it("ends the range at 23:59:59.999 GST of the selected day, not its midnight", () => {
    const { to } = marketplaceDayRange(undefined, new Date(2026, 6, 20));
    expect(to).toBe("2026-07-20T19:59:59.999Z");
  });

  it("keeps a booking at 14:00 GST on the last selected day inside the range", () => {
    const { to } = marketplaceDayRange(new Date(2026, 6, 1), new Date(2026, 6, 20));
    // 2026-07-20 14:00 GST === 10:00Z
    expect(new Date("2026-07-20T10:00:00.000Z").toISOString() <= (to as string)).toBe(true);
  });

  it("covers a single-day range end to end", () => {
    const { from, to } = marketplaceDayRange(new Date(2026, 6, 20), new Date(2026, 6, 20));
    expect(from).toBe("2026-07-19T20:00:00.000Z");
    expect(to).toBe("2026-07-20T19:59:59.999Z");
  });

  it("returns undefined for absent bounds so the filter is omitted", () => {
    expect(marketplaceDayRange(undefined, undefined)).toEqual({
      from: undefined,
      to: undefined,
    });
  });

  it("is independent of the admin's own browser timezone", () => {
    // Built from the picker's local Y/M/D, never from the raw instant, so a
    // London or Karachi admin selecting "20 Jul" gets the same UAE day.
    const morning = marketplaceDayRange(undefined, new Date(2026, 6, 20, 0, 0));
    const evening = marketplaceDayRange(undefined, new Date(2026, 6, 20, 23, 30));
    expect(morning.to).toBe(evening.to);
  });
});

describe("formatDate", () => {
  it("renders the marketplace day, not the viewer's local day", () => {
    // 2026-07-20T22:30Z is 21 Jul 02:30 in Dubai.
    expect(formatDate("2026-07-20T22:30:00.000Z")).toBe("21 Jul 2026");
  });

  it("renders an em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });
});
