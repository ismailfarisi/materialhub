import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDaysToDateKey,
  dateKeyInZone,
  dateKeyToUtcIso,
  formatDateInZone,
  hourInZone,
  todayKeyInZone,
} from "../utils";

/**
 * These helpers decide which calendar day an availability slot is filed
 * under, and which days the booking date-strip offers. If any of them leaks
 * the *browser's* timezone the picker silently shows a slot on the wrong
 * day — the classic booking off-by-one. Every case below pins an explicit
 * instant and an explicit zone.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("dateKeyInZone", () => {
  it("files a late-evening Dubai slot under the Dubai day, not the UTC day", () => {
    // 2026-03-10T21:30Z is 2026-03-11 01:30 in Asia/Dubai (UTC+4).
    expect(dateKeyInZone("2026-03-10T21:30:00.000Z", "Asia/Dubai")).toBe("2026-03-11");
    expect(dateKeyInZone("2026-03-10T21:30:00.000Z", "UTC")).toBe("2026-03-10");
  });

  it("files an early-morning slot under the previous day in a behind-UTC zone", () => {
    // 2026-03-10T02:00Z is 2026-03-09 21:00 in America/New_York.
    expect(dateKeyInZone("2026-03-10T02:00:00.000Z", "America/New_York")).toBe("2026-03-09");
  });

  it("keeps midnight-in-zone on its own day", () => {
    // 2026-03-09T20:00Z is exactly 2026-03-10 00:00 in Asia/Dubai.
    expect(dateKeyInZone("2026-03-09T20:00:00.000Z", "Asia/Dubai")).toBe("2026-03-10");
  });

  it("always produces a zero-padded YYYY-MM-DD key", () => {
    expect(dateKeyInZone("2026-01-05T08:00:00.000Z", "Asia/Dubai")).toBe("2026-01-05");
  });
});

describe("hourInZone", () => {
  it("buckets slots by the offering's local hour, not the browser's", () => {
    // 06:00Z == 10:00 in Dubai (morning) but 06:00 UTC.
    expect(hourInZone("2026-03-10T06:00:00.000Z", "Asia/Dubai")).toBe(10);
    expect(hourInZone("2026-03-10T06:00:00.000Z", "UTC")).toBe(6);
  });

  it("normalises midnight to 0 rather than 24", () => {
    expect(hourInZone("2026-03-09T20:00:00.000Z", "Asia/Dubai")).toBe(0);
  });

  it("places 11:59 in the morning bucket and 12:00 in the afternoon bucket", () => {
    // The picker's grouping is hour < 12 => morning, < 17 => afternoon.
    expect(hourInZone("2026-03-10T07:59:00.000Z", "Asia/Dubai")).toBe(11);
    expect(hourInZone("2026-03-10T08:00:00.000Z", "Asia/Dubai")).toBe(12);
    expect(hourInZone("2026-03-10T13:00:00.000Z", "Asia/Dubai")).toBe(17);
  });
});

describe("todayKeyInZone", () => {
  it("returns tomorrow's Dubai date when it is already past 20:00 UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T21:00:00.000Z"));

    expect(todayKeyInZone("Asia/Dubai")).toBe("2026-03-11");
    expect(todayKeyInZone("UTC")).toBe("2026-03-10");
  });

  it("returns yesterday's New York date just after UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T01:00:00.000Z"));

    expect(todayKeyInZone("America/New_York")).toBe("2026-03-09");
  });
});

describe("addDaysToDateKey", () => {
  it("steps forward across a month boundary", () => {
    expect(addDaysToDateKey("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("steps forward across a year boundary and back again", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDateKey("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("does NOT drift across a DST transition (pure calendar arithmetic)", () => {
    // 2026-03-08 is the US spring-forward date; a Date.setDate()-based
    // implementation running in a DST zone can land on the wrong day here.
    expect(addDaysToDateKey("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysToDateKey("2026-03-08", 1)).toBe("2026-03-09");
    // 2026-10-25 is the EU fall-back date.
    expect(addDaysToDateKey("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDaysToDateKey("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("spans a full 14-day picker window exactly", () => {
    expect(addDaysToDateKey("2026-03-10", 14)).toBe("2026-03-24");
  });

  it("is a no-op for 0 days", () => {
    expect(addDaysToDateKey("2026-03-10", 0)).toBe("2026-03-10");
  });
});

describe("dateKeyToUtcIso + formatDateInZone round-trip", () => {
  it("renders a day-tab label matching the key it came from when paired with UTC", () => {
    const key = "2026-03-11";
    const label = formatDateInZone(dateKeyToUtcIso(key), "UTC", "en", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    expect(label).toContain("11");
    expect(label).toContain("03");
    // And the key survives a round-trip back through dateKeyInZone.
    expect(dateKeyInZone(dateKeyToUtcIso(key), "UTC")).toBe(key);
  });

  it("would shift the label if formatted in a non-UTC zone (why the UTC pairing matters)", () => {
    // Documents the trap the helper's contract exists to avoid: the same
    // instant formatted in a behind-UTC zone renders the PREVIOUS day.
    expect(dateKeyInZone(dateKeyToUtcIso("2026-03-11"), "America/New_York")).toBe("2026-03-10");
  });
});
