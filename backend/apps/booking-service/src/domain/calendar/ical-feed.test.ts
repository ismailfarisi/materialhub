// ical-feed.test.ts
//
// Pure function tests — no DB, no Redis, runs unconditionally.
import { describe, expect, it } from "bun:test";
import { buildBookingReminderIcs, generateICal } from "./ical-feed.ts";
import { parseICal } from "./ical-parse.ts";

describe("generateICal", () => {
  const now = new Date("2026-08-09T10:00:00.000Z");

  it("emits a VCALENDAR header, one VEVENT per input event, CRLF-joined", () => {
    const ics = generateICal(
      [
        {
          uid: "evt-1@materialhubuae.com",
          summary: "Haircut",
          startsAt: new Date("2026-08-10T10:00:00Z"),
          endsAt: new Date("2026-08-10T10:30:00Z"),
        },
        {
          uid: "evt-2@materialhubuae.com",
          summary: "Manicure",
          startsAt: new Date("2026-08-11T09:00:00Z"),
          endsAt: new Date("2026-08-11T09:45:00Z"),
        },
      ],
      { now },
    );

    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:PUBLISH");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(2);
    expect(lines).toContain("UID:evt-1@materialhubuae.com");
    expect(lines).toContain("DTSTAMP:20260809T100000Z");
    expect(lines).toContain("DTSTART:20260810T100000Z");
    expect(lines).toContain("DTEND:20260810T103000Z");
    expect(lines).toContain("SUMMARY:Haircut");
    expect(lines).toContain("UID:evt-2@materialhubuae.com");
    expect(lines).toContain("SUMMARY:Manicure");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("includes X-WR-CALNAME only when opts.calName is provided", () => {
    const endsAt = new Date(now.getTime() + 3600000); // 1 hour later
    const withName = generateICal(
      [{ uid: "evt-1@materialhubuae.com", summary: "Haircut", startsAt: now, endsAt }],
      { now, calName: "Test Salon Bookings" },
    );
    expect(withName).toContain("X-WR-CALNAME:Test Salon Bookings");

    const withoutName = generateICal(
      [{ uid: "evt-1@materialhubuae.com", summary: "Haircut", startsAt: now, endsAt }],
      { now },
    );
    expect(withoutName).not.toContain("X-WR-CALNAME");
  });

  it("defaults DTSTAMP to now() when opts.now is omitted (non-deterministic but present)", () => {
    const endsAt = new Date(now.getTime() + 3600000); // 1 hour later
    const ics = generateICal([
      { uid: "evt-1@materialhubuae.com", summary: "Haircut", startsAt: now, endsAt },
    ]);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it("escapes commas, semicolons, backslashes, and newlines in TEXT fields", () => {
    const ics = generateICal(
      [
        {
          uid: "evt-esc@materialhubuae.com",
          summary: "Wax; Trim, Style\\Extra\nLine",
          startsAt: now,
          endsAt: now,
          description: "Note: a,b;c",
        },
      ],
      { now },
    );
    expect(ics).toContain("SUMMARY:Wax\\; Trim\\, Style\\\\Extra\\nLine");
    expect(ics).toContain("DESCRIPTION:Note: a\\,b\\;c");
  });

  it("omits LOCATION/DESCRIPTION when not provided", () => {
    const endsAt = new Date(now.getTime() + 3600000); // 1 hour later
    const ics = generateICal(
      [{ uid: "evt-1@materialhubuae.com", summary: "Haircut", startsAt: now, endsAt }],
      { now },
    );
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("folds a SUMMARY line longer than 75 octets per RFC 5545 §3.1", () => {
    const longSummary = "A".repeat(120);
    const ics = generateICal(
      [
        {
          uid: "evt-long@materialhubuae.com",
          summary: longSummary,
          startsAt: now,
          endsAt: new Date(now.getTime() + 3600000), // 1 hour later
        },
      ],
      { now },
    );

    const physicalLines = ics.split("\r\n");
    const summaryLineIdx = physicalLines.findIndex((l) => l.startsWith("SUMMARY:"));
    expect(summaryLineIdx).toBeGreaterThanOrEqual(0);
    // The folded continuation is the very next physical line and starts with
    // a single leading space (RFC 5545 folding).
    expect(physicalLines[summaryLineIdx + 1]?.startsWith(" ")).toBe(true);
    // No physical line in the whole document exceeds 75 octets.
    for (const line of physicalLines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // Round-trips through parseICal back to the original unfolded summary.
    const [parsed] = parseICal(ics);
    expect(parsed?.summary).toBe(longSummary);
  });

  it("round-trips: parseICal(generateICal(events)) returns the same uid/start/end set", () => {
    const events = [
      {
        uid: "rt-1@materialhubuae.com",
        summary: "Deep Tissue Massage",
        startsAt: new Date("2026-09-01T08:00:00Z"),
        endsAt: new Date("2026-09-01T09:00:00Z"),
        location: "Marina Walk Salon",
        description: "Booking BK-100",
      },
      {
        uid: "rt-2@materialhubuae.com",
        summary: "Beard Trim",
        startsAt: new Date("2026-09-02T14:15:00Z"),
        endsAt: new Date("2026-09-02T14:45:00Z"),
      },
    ];
    const ics = generateICal(events, { now });
    const parsed = parseICal(ics);

    expect(parsed.length).toBe(events.length);
    const actual = parsed
      .map((e) => ({ uid: e.uid, start: e.startsAt.getTime(), end: e.endsAt.getTime() }))
      .sort((a, b) => a.uid.localeCompare(b.uid));
    const expected = events
      .map((e) => ({ uid: e.uid, start: e.startsAt.getTime(), end: e.endsAt.getTime() }))
      .sort((a, b) => a.uid.localeCompare(b.uid));
    expect(actual).toEqual(expected);
  });

  it("round-trips UID containing RFC-special characters (comma, semicolon, backslash)", () => {
    const originalUid = "booking-id,with;special\\chars@materialhubuae.com";
    const events = [
      {
        uid: originalUid,
        summary: "Test Event",
        startsAt: new Date("2026-09-01T08:00:00Z"),
        endsAt: new Date("2026-09-01T09:00:00Z"),
      },
    ];
    const ics = generateICal(events, { now });
    const [parsed] = parseICal(ics);

    // The UID should be unescaped back to the original value
    expect(parsed?.uid).toBe(originalUid);
  });
});

// ─── buildBookingReminderIcs (absorbed from the old reminders/ical-vevent.ts,
// tests moved verbatim from that file's test suite) ────────────────────────
describe("buildBookingReminderIcs", () => {
  const now = new Date("2026-08-09T10:00:00.000Z");
  const startsAt = new Date("2026-08-10T10:00:00.000Z");
  const endsAt = new Date("2026-08-10T10:30:00.000Z");

  it("emits a single VEVENT with the required RFC 5545 properties, CRLF-joined", () => {
    const ics = buildBookingReminderIcs({
      uid: "booking-abc123@materialhubuae.com",
      summary: "Deep Tissue Massage",
      description: "Booking BK-001 at Test Salon",
      location: "Marina Walk Salon",
      startsAt,
      endsAt,
      now,
    });

    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("UID:booking-abc123@materialhubuae.com");
    expect(lines).toContain("DTSTAMP:20260809T100000Z");
    expect(lines).toContain("DTSTART:20260810T100000Z");
    expect(lines).toContain("DTEND:20260810T103000Z");
    expect(lines).toContain("SUMMARY:Deep Tissue Massage");
    expect(lines).toContain("LOCATION:Marina Walk Salon");
    expect(lines).toContain("DESCRIPTION:Booking BK-001 at Test Salon");
    expect(lines).toContain("END:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("omits LOCATION/DESCRIPTION lines entirely when not provided (not empty-valued)", () => {
    const ics = buildBookingReminderIcs({
      uid: "booking-xyz@materialhubuae.com",
      summary: "Haircut",
      startsAt,
      endsAt,
      now,
    });

    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("escapes commas, semicolons, backslashes, and newlines in TEXT fields (RFC 5545 §3.3.11)", () => {
    const ics = buildBookingReminderIcs({
      uid: "booking-esc@materialhubuae.com",
      summary: "Wax; Trim, Style\\Extra\nLine",
      startsAt,
      endsAt,
      now,
    });

    expect(ics).toContain("SUMMARY:Wax\\; Trim\\, Style\\\\Extra\\nLine");
  });

  it("defaults DTSTAMP to now when `now` is omitted (non-deterministic but present)", () => {
    const ics = buildBookingReminderIcs({
      uid: "booking-nodate@materialhubuae.com",
      summary: "Facial",
      startsAt,
      endsAt,
    });

    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });
});

// ── Review finding 9: bare CR must be escaped ────────────────────────────────
// escapeIcsText handled `\r\n` and `\n` but let a LONE `\r` through into
// SUMMARY:, which is built from vendor-controlled `booking.service_name`.
// Parsers that treat a lone CR as a line terminator would then see injected
// iCalendar properties.
describe("escapeIcsText — line-break injection (review finding 9)", () => {
  const base = {
    uid: "evt-inject@materialhubuae.com",
    startsAt: new Date("2026-08-10T10:00:00Z"),
    endsAt: new Date("2026-08-10T10:30:00Z"),
  };

  it("escapes a BARE carriage return in a vendor-controlled summary", () => {
    const ics = generateICal([{ ...base, summary: "Haircut\rATTENDEE:mailto:attacker@evil.test" }]);

    // The raw CR must not survive anywhere in the emitted feed...
    const summaryLine = ics.split("\r\n").find((l) => l.startsWith("SUMMARY:"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain(String.raw`\n`);
    expect(summaryLine).not.toContain("\r");
    // ...and the injected property must remain part of the SUMMARY value
    // rather than becoming a property of its own.
    expect(ics.split("\r\n").some((l) => l.startsWith("ATTENDEE:"))).toBe(false);
  });

  it.each([
    ["\r", "bare CR"],
    ["\n", "bare LF"],
    ["\r\n", "CRLF"],
  ])("escapes %p (%s) so no injected line becomes its own property", (sep) => {
    const ics = generateICal([{ ...base, summary: `Facial${sep}DESCRIPTION:injected` }]);
    expect(ics.split("\r\n").some((l) => l.startsWith("DESCRIPTION:injected"))).toBe(false);
  });

  it("collapses a CRLF to exactly one escaped newline, not two", () => {
    const ics = generateICal([{ ...base, summary: "A\r\nB" }]);
    const summaryLine = ics.split("\r\n").find((l) => l.startsWith("SUMMARY:"));
    expect(summaryLine).toBe(String.raw`SUMMARY:A\nB`);
  });
});
