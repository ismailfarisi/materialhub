// ical-parse.test.ts
//
// Pure function tests — no DB, no Redis, runs unconditionally.
import { describe, expect, it } from "bun:test";
import { parseICal } from "./ical-parse.ts";

function vcalendar(veventBody: string): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", veventBody, "END:VCALENDAR"].join(
    "\r\n",
  );
}

describe("parseICal — line unfolding", () => {
  it("unfolds a CRLF-folded continuation (CRLF + leading space)", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:fold-crlf@materialhubuae.com",
        "SUMMARY:Deep Tissue Mas",
        " sage",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const events = parseICal(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Deep Tissue Massage");
  });

  it("unfolds a bare-LF-folded continuation (LF + leading tab)", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:fold-lf@materialhubuae.com",
      "SUMMARY:Deep Tissue Mas",
      "\tsage",
      "DTSTART:20260810T100000Z",
      "DTEND:20260810T103000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const events = parseICal(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe("Deep Tissue Massage");
  });
});

describe("parseICal — DTSTART/DTEND forms", () => {
  it("parses UTC form (trailing Z) as-is", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:utc-1@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "SUMMARY:Haircut",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.startsAt.toISOString()).toBe("2026-08-10T10:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-08-10T10:30:00.000Z");
  });

  it("treats floating local time (no Z, no TZID) as UTC — documented simplification", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:floating-1@materialhubuae.com",
        "DTSTART:20260810T100000",
        "DTEND:20260810T103000",
        "SUMMARY:Haircut",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.startsAt.toISOString()).toBe("2026-08-10T10:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-08-10T10:30:00.000Z");
  });

  it("resolves a TZID= parameter via the platform Intl database", () => {
    // America/New_York is EDT (UTC-4) in July 2026 — 09:00 local = 13:00 UTC.
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:tzid-1@materialhubuae.com",
        "DTSTART;TZID=America/New_York:20260715T090000",
        "DTEND;TZID=America/New_York:20260715T100000",
        "SUMMARY:Consult call",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.startsAt.toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });
});

describe("parseICal — all-day events", () => {
  it("expands a single all-day event (VALUE=DATE, no DTEND) to [00:00, +1 day)", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:allday-1@materialhubuae.com",
        "DTSTART;VALUE=DATE:20260715",
        "SUMMARY:Vendor closed",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.startsAt.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });

  it("treats a multi-day all-day DTEND;VALUE=DATE as EXCLUSIVE per RFC 5545 §3.6.1", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:allday-2@materialhubuae.com",
        "DTSTART;VALUE=DATE:20260715",
        "DTEND;VALUE=DATE:20260718",
        "SUMMARY:Vendor on leave",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    // 15th, 16th, 17th busy; the 18th (DTEND date) is NOT included.
    expect(event?.startsAt.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-07-18T00:00:00.000Z");
  });

  it("treats VALUE=date (lowercase) as all-day per RFC 5545", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:allday-lowercase@materialhubuae.com",
        "DTSTART;VALUE=date:20260715",
        "SUMMARY:Case insensitive",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.startsAt.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });
});

describe("parseICal — missing DTEND", () => {
  it("falls back to DURATION when DTEND is absent", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:dur-1@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DURATION:PT1H30M",
        "SUMMARY:Long appointment",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.startsAt.toISOString()).toBe("2026-08-10T10:00:00.000Z");
    expect(event?.endsAt.toISOString()).toBe("2026-08-10T11:30:00.000Z");
  });

  it("skips a timed event with neither DTEND nor DURATION (documented choice)", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:noend-1@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "SUMMARY:Ambiguous",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parseICal(ics)).toHaveLength(0);
  });
});

describe("parseICal — UID / malformed / CANCELLED handling", () => {
  it("skips an event with no UID", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "SUMMARY:No uid",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parseICal(ics)).toHaveLength(0);
  });

  it("never throws on garbage input — returns an empty array", () => {
    expect(() => parseICal("not an ics file at all\n\x00\x01{{{")).not.toThrow();
    expect(parseICal("not an ics file at all\n\x00\x01{{{")).toEqual([]);
    expect(() => parseICal("")).not.toThrow();
    expect(parseICal("")).toEqual([]);
  });

  it("skips a malformed VEVENT (unparseable DTSTART) without throwing, keeps valid siblings", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:bad-1@materialhubuae.com",
        "DTSTART:not-a-date",
        "DTEND:20260810T103000Z",
        "SUMMARY:Broken",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:good-1@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "SUMMARY:Fine",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const events = parseICal(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("good-1@materialhubuae.com");
  });

  it("excludes STATUS:CANCELLED events", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:cancelled-1@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "STATUS:CANCELLED",
        "SUMMARY:Cancelled slot",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parseICal(ics)).toHaveLength(0);
  });

  it("gracefully handles missing END:VEVENT (unterminated block dropped)", () => {
    // A VEVENT that starts but never ends should be silently dropped, not crash.
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      "BEGIN:VEVENT",
      "UID:incomplete-1@materialhubuae.com",
      "DTSTART:20260810T100000Z",
      "DTEND:20260810T103000Z",
      "SUMMARY:Unterminated event",
      // Missing END:VEVENT — event block just ends at EOF
      "END:VCALENDAR",
    ].join("\r\n");

    expect(() => parseICal(ics)).not.toThrow();
    expect(parseICal(ics)).toHaveLength(0);
  });
});

describe("parseICal — TEXT unescaping", () => {
  it("unescapes \\n, \\\\, \\;, \\, in SUMMARY", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:esc-1@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "SUMMARY:Wax\\; Trim\\, Style\\\\Extra\\nLine",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.summary).toBe("Wax; Trim, Style\\Extra\nLine");
  });

  it("unescapes UID to mirror SUMMARY handling", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:booking\\,with\\;special\\\\chars@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "SUMMARY:Test",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const [event] = parseICal(ics);
    expect(event?.uid).toBe("booking,with;special\\chars@materialhubuae.com");
  });
});

describe("parseICal — monotonicity guard (endsAt > startsAt)", () => {
  it("skips an event with DTEND before DTSTART (reversed range)", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:reversed-1@materialhubuae.com",
        "DTSTART:20260810T110000Z",
        "DTEND:20260810T100000Z",
        "SUMMARY:Reversed",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parseICal(ics)).toHaveLength(0);
  });

  it("skips an event with negative DURATION", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:negdur-1@materialhubuae.com",
        "DTSTART:20260810T110000Z",
        "DURATION:-PT1H",
        "SUMMARY:Negative duration",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parseICal(ics)).toHaveLength(0);
  });

  it("skips an event with zero-length duration (DTEND == DTSTART)", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:zerolen-1@materialhubuae.com",
        "DTSTART:20260810T110000Z",
        "DTEND:20260810T110000Z",
        "SUMMARY:Zero length",
        "END:VEVENT",
      ].join("\r\n"),
    );

    expect(parseICal(ics)).toHaveLength(0);
  });

  it("keeps valid events when siblings have reversed ranges", () => {
    const ics = vcalendar(
      [
        "BEGIN:VEVENT",
        "UID:bad-reversed@materialhubuae.com",
        "DTSTART:20260810T110000Z",
        "DTEND:20260810T100000Z",
        "SUMMARY:Bad",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:good-valid@materialhubuae.com",
        "DTSTART:20260810T100000Z",
        "DTEND:20260810T103000Z",
        "SUMMARY:Good",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const events = parseICal(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("good-valid@materialhubuae.com");
  });
});

describe("parseICal — realistic Google-Calendar-style multi-event feed", () => {
  // Inline fixture: VTIMEZONE block (skipped, not parsed), a TZID-qualified
  // timed event, an all-day event, a folded SUMMARY, and a CANCELLED event
  // that must be excluded.
  const fixture = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Vendor Personal Calendar",
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "X-LIC-LOCATION:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "DTSTART;TZID=America/New_York:20260715T090000",
    "DTEND;TZID=America/New_York:20260715T100000",
    "DTSTAMP:20260701T120000Z",
    "UID:tzevent-001@google.com",
    "CREATED:20260701T110000Z",
    "DESCRIPTION:",
    "LAST-MODIFIED:20260701T110000Z",
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "SUMMARY:Client consult call",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260720",
    "DTEND;VALUE=DATE:20260721",
    "DTSTAMP:20260701T120000Z",
    "UID:allday-002@google.com",
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "SUMMARY:Vendor closed - annual leave",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20260722T130000Z",
    "DTEND:20260722T133000Z",
    "DTSTAMP:20260701T120000Z",
    "UID:folded-003@google.com",
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "SUMMARY:This is a deliberately very long summary line that exceeds sevent",
    " y-five octets so Google Calendar folds it across two physical lines",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20260725T090000Z",
    "DTEND:20260725T093000Z",
    "DTSTAMP:20260701T120000Z",
    "UID:cancelled-004@google.com",
    "SEQUENCE:1",
    "STATUS:CANCELLED",
    "SUMMARY:Old slot (cancelled)",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("parses exactly the 3 non-cancelled events with exact expected Dates", () => {
    const events = parseICal(fixture);
    expect(events).toHaveLength(3);

    const byUid = new Map(events.map((e) => [e.uid, e]));

    const tzEvent = byUid.get("tzevent-001@google.com");
    expect(tzEvent?.startsAt.toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(tzEvent?.endsAt.toISOString()).toBe("2026-07-15T14:00:00.000Z");
    expect(tzEvent?.summary).toBe("Client consult call");

    const allDayEvent = byUid.get("allday-002@google.com");
    expect(allDayEvent?.startsAt.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(allDayEvent?.endsAt.toISOString()).toBe("2026-07-21T00:00:00.000Z");
    expect(allDayEvent?.summary).toBe("Vendor closed - annual leave");

    const foldedEvent = byUid.get("folded-003@google.com");
    expect(foldedEvent?.startsAt.toISOString()).toBe("2026-07-22T13:00:00.000Z");
    expect(foldedEvent?.endsAt.toISOString()).toBe("2026-07-22T13:30:00.000Z");
    expect(foldedEvent?.summary).toBe(
      "This is a deliberately very long summary line that exceeds seventy-five octets so Google Calendar folds it across two physical lines",
    );

    expect(byUid.has("cancelled-004@google.com")).toBe(false);
  });
});
