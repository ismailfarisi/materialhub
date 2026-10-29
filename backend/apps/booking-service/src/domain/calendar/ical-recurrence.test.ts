// ical-recurrence.test.ts
//
// Pure function tests for the bounded RRULE expander (Phase 6 review C1) — no
// DB, no Redis, runs unconditionally. Each case parses a real VCALENDAR fixture
// through parseICal, then expands with a DETERMINISTIC injected `now`, and
// asserts the EXACT occurrence set (uids + times).
import { describe, expect, it } from "bun:test";
import { parseICal } from "./ical-parse.ts";
import {
  MAX_OCCURRENCES_PER_EVENT,
  RECURRENCE_WINDOW_FUTURE_MS,
  RECURRENCE_WINDOW_PAST_MS,
  expandRecurringEvents,
} from "./ical-recurrence.ts";

function vcalendar(...veventBodies: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    ...veventBodies,
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

// A `now` chosen so the fixtures' occurrences (mid-July 2026) sit inside the
// [now−1d, now+90d] window.
const NOW = new Date("2026-07-01T00:00:00.000Z");

function expand(ics: string, now: Date = NOW) {
  return expandRecurringEvents(parseICal(ics), { now });
}

// Compact-ISO suffix helper (mirrors the module's occurrenceUid).
function occ(uid: string, iso: string): string {
  return `${uid}#${iso}`;
}

describe("expandRecurringEvents — passthrough", () => {
  it("leaves a non-recurring event untouched with its bare uid", () => {
    const ics = vcalendar(
      vevent([
        "UID:plain-1@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "SUMMARY:One-off",
      ]),
    );
    const { events, unsupportedCount } = expand(ics);
    expect(unsupportedCount).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("plain-1@x");
    expect(events[0]?.startsAt.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });
});

describe("expandRecurringEvents — FREQ=DAILY", () => {
  it("expands COUNT daily occurrences with per-occurrence uids", () => {
    const ics = vcalendar(
      vevent([
        "UID:daily@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "SUMMARY:Daily standup",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.uid)).toEqual([
      occ("daily@x", "20260715T090000Z"),
      occ("daily@x", "20260716T090000Z"),
      occ("daily@x", "20260717T090000Z"),
    ]);
    // Each occurrence keeps the 30-minute duration.
    expect(events[1]?.startsAt.toISOString()).toBe("2026-07-16T09:00:00.000Z");
    expect(events[1]?.endsAt.toISOString()).toBe("2026-07-16T09:30:00.000Z");
  });

  it("honors INTERVAL on DAILY", () => {
    const ics = vcalendar(
      vevent([
        "UID:daily2@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-07-17T09:00:00.000Z",
      "2026-07-19T09:00:00.000Z",
    ]);
  });
});

describe("expandRecurringEvents — FREQ=WEEKLY", () => {
  it("expands weekly by DTSTART weekday when no BYDAY", () => {
    // 2026-07-15 is a Wednesday.
    const ics = vcalendar(
      vevent([
        "UID:weekly@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T100000Z",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-07-22T09:00:00.000Z",
      "2026-07-29T09:00:00.000Z",
    ]);
  });

  it("expands WEEKLY;BYDAY=MO,WE,FR (Google-style standing appointment)", () => {
    // DTSTART 2026-07-15 (Wed). BYDAY MO,WE,FR — first occurrence is the Wed
    // itself, then Fri, then next Mon, Wed, Fri...
    const ics = vcalendar(
      vevent([
        "UID:byday@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5",
        "SUMMARY:Standing client",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z", // Wed
      "2026-07-17T09:00:00.000Z", // Fri
      "2026-07-20T09:00:00.000Z", // Mon
      "2026-07-22T09:00:00.000Z", // Wed
      "2026-07-24T09:00:00.000Z", // Fri
    ]);
  });

  it("honors INTERVAL=2 with BYDAY (every other week)", () => {
    const ics = vcalendar(
      vevent([
        "UID:byday2@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;COUNT=3",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-07-29T09:00:00.000Z",
      "2026-08-12T09:00:00.000Z",
    ]);
  });
});

describe("expandRecurringEvents — FREQ=MONTHLY", () => {
  it("expands monthly by DTSTART day-of-month", () => {
    const ics = vcalendar(
      vevent([
        "UID:monthly@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=MONTHLY;COUNT=3",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-08-15T09:00:00.000Z",
      "2026-09-15T09:00:00.000Z",
    ]);
  });

  it("skips months lacking the DTSTART day (RFC 5545) — Jan 31 -> Mar 31", () => {
    // DTSTART Jan 31; Feb has no 31st -> skipped; Mar 31 is next.
    const now = new Date("2026-01-01T00:00:00.000Z");
    const ics = vcalendar(
      vevent([
        "UID:monthly31@x",
        "DTSTART:20260131T090000Z",
        "DTEND:20260131T093000Z",
        "RRULE:FREQ=MONTHLY;COUNT=2",
      ]),
    );
    const { events } = expand(ics, now);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-01-31T09:00:00.000Z",
      "2026-03-31T09:00:00.000Z",
    ]);
  });
});

describe("expandRecurringEvents — UNTIL / window bounds", () => {
  it("stops at UNTIL (inclusive)", () => {
    const ics = vcalendar(
      vevent([
        "UID:until@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;UNTIL=20260717T090000Z",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-07-16T09:00:00.000Z",
      "2026-07-17T09:00:00.000Z",
    ]);
  });

  it("clips an unbounded (no COUNT/UNTIL) weekly rule to the +90d window", () => {
    const ics = vcalendar(
      vevent([
        "UID:inf@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=WEEKLY",
      ]),
    );
    const { events } = expand(ics);
    const windowEnd = NOW.getTime() + RECURRENCE_WINDOW_FUTURE_MS;
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.startsAt.getTime()).toBeLessThanOrEqual(windowEnd);
    }
    // DTSTART 07-15, window end now(07-01)+90d = 09-29 -> 11 weekly occurrences.
    expect(events.length).toBeGreaterThanOrEqual(10);
    expect(events.length).toBeLessThanOrEqual(12);
  });

  it("drops occurrences before the window-start (now − 1 day)", () => {
    // A weekly rule that started well in the past — only in-window occurrences
    // should be emitted (COUNT counts from DTSTART, window filters the rest).
    const now = new Date("2026-07-15T00:00:00.000Z");
    const ics = vcalendar(
      vevent([
        "UID:past@x",
        "DTSTART:20260101T090000Z",
        "DTEND:20260101T093000Z",
        "RRULE:FREQ=WEEKLY",
      ]),
    );
    const { events } = expand(ics, now);
    const windowStart = now.getTime() - RECURRENCE_WINDOW_PAST_MS;
    for (const e of events) {
      expect(e.startsAt.getTime()).toBeGreaterThanOrEqual(windowStart);
    }
  });
});

describe("expandRecurringEvents — EXDATE", () => {
  it("removes an EXDATEd occurrence (single line)", () => {
    const ics = vcalendar(
      vevent([
        "UID:exd@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "EXDATE:20260716T090000Z",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-07-17T09:00:00.000Z",
    ]);
  });

  it("removes EXDATEs given as a multi-value line AND multiple lines", () => {
    const ics = vcalendar(
      vevent([
        "UID:exd2@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;COUNT=5",
        "EXDATE:20260716T090000Z,20260717T090000Z",
        "EXDATE:20260719T090000Z",
      ]),
    );
    const { events } = expand(ics);
    expect(events.map((e) => e.startsAt.toISOString())).toEqual([
      "2026-07-15T09:00:00.000Z",
      "2026-07-18T09:00:00.000Z",
    ]);
  });
});

describe("expandRecurringEvents — RECURRENCE-ID overrides", () => {
  it("an override replaces the matching occurrence and may move its time (uid stays the original occurrence)", () => {
    const ics = vcalendar(
      vevent([
        "UID:ovr@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "SUMMARY:Series",
      ]),
      // Override the 2026-07-16 occurrence, moved to 14:00.
      vevent([
        "UID:ovr@x",
        "RECURRENCE-ID:20260716T090000Z",
        "DTSTART:20260716T140000Z",
        "DTEND:20260716T143000Z",
        "SUMMARY:Moved",
      ]),
    );
    const { events } = expand(ics);
    const byUid = new Map(events.map((e) => [e.uid, e]));
    // Still 3 occurrences, keyed by their ORIGINAL start.
    expect(events).toHaveLength(3);
    const moved = byUid.get(occ("ovr@x", "20260716T090000Z"));
    expect(moved?.startsAt.toISOString()).toBe("2026-07-16T14:00:00.000Z");
    expect(moved?.summary).toBe("Moved");
    // The other two are the plain series.
    expect(byUid.get(occ("ovr@x", "20260715T090000Z"))?.startsAt.toISOString()).toBe(
      "2026-07-15T09:00:00.000Z",
    );
  });
});

describe("expandRecurringEvents — unsupported rules (master-only + note)", () => {
  it("FREQ=YEARLY -> imports the master occurrence only and flags unsupported", () => {
    const ics = vcalendar(
      vevent([
        "UID:yearly@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=YEARLY;COUNT=5",
      ]),
    );
    const { events, unsupportedCount } = expand(ics);
    expect(unsupportedCount).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe(occ("yearly@x", "20260715T090000Z"));
  });

  it("BYSETPOS / BYMONTHDAY / RDATE are unsupported", () => {
    const ics = vcalendar(
      vevent([
        "UID:setpos@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1;COUNT=3",
      ]),
      vevent([
        "UID:mday@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3",
      ]),
      vevent([
        "UID:rdate@x",
        "DTSTART:20260715T090000Z",
        "DTEND:20260715T093000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "RDATE:20260720T090000Z",
      ]),
    );
    const { events, unsupportedCount } = expand(ics);
    expect(unsupportedCount).toBe(3);
    // one master occurrence each
    expect(events).toHaveLength(3);
  });
});

describe("expandRecurringEvents — runaway cap", () => {
  it("caps emitted occurrences per event at MAX_OCCURRENCES_PER_EVENT", () => {
    // A daily rule with a giant COUNT and a wide window -> capped at 500.
    const wideNow = new Date("2026-07-01T00:00:00.000Z");
    const ics = vcalendar(
      vevent([
        "UID:cap@x",
        "DTSTART:20260701T000000Z",
        "DTEND:20260701T003000Z",
        "RRULE:FREQ=DAILY;COUNT=100000",
      ]),
    );
    // Window +9000 days so COUNT, not the window, would otherwise dominate.
    const { events } = expandRecurringEvents(parseICal(ics), {
      now: wideNow,
      windowEndMs: wideNow.getTime() + 9000 * 86_400_000,
    });
    expect(events.length).toBe(MAX_OCCURRENCES_PER_EVENT);
  });
});

describe("expandRecurringEvents — Google-style weekly probe fixture", () => {
  // The exact scenario from the review's C1 probe: a Google export with a
  // weekly recurring VEVENT (master+RRULE). Before C1 this yielded ONE event;
  // it must now yield N in-window occurrences.
  const fixture = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART:20260706T090000Z",
    "DTEND:20260706T100000Z",
    "RRULE:FREQ=WEEKLY;COUNT=52",
    "UID:weekly-standing-001@google.com",
    "SUMMARY:Weekly standing client",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("yields multiple in-window occurrences (not one)", () => {
    const { events } = expandRecurringEvents(parseICal(fixture), {
      now: new Date("2026-07-01T00:00:00.000Z"),
    });
    // ~13-14 weekly occurrences within the 90-day window.
    expect(events.length).toBeGreaterThan(10);
    expect(events.every((e) => e.uid.startsWith("weekly-standing-001@google.com#"))).toBe(true);
    // All within the window and one week apart.
    for (let i = 1; i < events.length; i++) {
      const delta = events[i]!.startsAt.getTime() - events[i - 1]!.startsAt.getTime();
      expect(delta).toBe(7 * 86_400_000);
    }
  });
});
