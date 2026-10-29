// ical-feed.ts
//
// Phase 6 Task 3 (docs/superpowers/plans/2026-07-08-booking-phase-6-offplatform.md,
// "Pure iCal parse + generate") — a hand-rolled, dependency-free multi-VEVENT
// VCALENDAR generator. No external iCal library (repo convention: small pure
// utils, not third-party generators). PURE — no I/O, no implicit
// `Date.now()` (DTSTAMP is always derived from an explicit/injectable `now`,
// defaulting to `new Date()` only at the call site) — used by Task 5's
// outbound `.ics` feed endpoint (multi-event) and by `buildBookingReminderIcs`
// below (single-event, absorbed from the Phase 5 reminders helper).
//
// ─── Absorption note ────────────────────────────────────────────────────────
// This file absorbs `domain/reminders/ical-vevent.ts` (Phase 5 Task 6), whose
// own header said Phase 6 should "absorb/replace this file rather than build
// a second, competing single-event helper." `formatIcsUtc` and
// `escapeIcsText` moved here unchanged; `buildBookingReminderIcs` is now a
// thin wrapper over `generateICal` (single-event call) rather than its own
// hand-rolled line-builder — same output shape, same escaping/UTC rules.
// `domain/reminders/reminder-scheduler.ts` now imports
// `buildBookingReminderIcs` from here instead.

/** `YYYYMMDDTHHMMSSZ` per RFC 5545 §3.3.5 (UTC form). */
function formatIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

// RFC 5545 §3.3.11 TEXT escaping — backslash, semicolon, comma, newline.
// Order matters: backslash first, or the escapes inserted below would
// themselves get re-escaped.
//
// The line-break alternation must cover a BARE \r as well as \r\n and \n
// (review finding 9): this escapes vendor-controlled text (a booking's
// `service_name`) into `SUMMARY:`, and a lone CR is treated as a line
// terminator by some iCal parsers — leaving it unescaped lets a vendor inject
// arbitrary iCalendar properties into the feed we serve. `\r\n` stays first in
// the alternation so a CRLF collapses to ONE `\n`, not two.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 §3.1 line folding: a content line SHOULD be split so no physical
// line exceeds 75 OCTETS (not characters — UTF-8 multibyte chars count as
// their byte length), by inserting CRLF + a single leading space before each
// continuation chunk (that leading space itself counts toward that
// continuation line's 75-octet budget). Iterates by Unicode code point so a
// multibyte character is never split across chunks.
function foldLine(line: string): string {
  const MAX_OCTETS = 75;
  if (Buffer.byteLength(line, "utf8") <= MAX_OCTETS) return line;

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  let isFirstChunk = true;

  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    const limit = isFirstChunk ? MAX_OCTETS : MAX_OCTETS - 1; // -1 reserves the leading fold space
    if (currentBytes + chBytes > limit && current.length > 0) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
      isFirstChunk = false;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) chunks.push(current);

  return chunks.map((chunk, i) => (i === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

export interface GenerateIcalEvent {
  uid: string;
  summary: string;
  startsAt: Date;
  endsAt: Date;
  description?: string;
  location?: string;
}

export interface GenerateIcalOptions {
  calName?: string;
  /** DTSTAMP for every VEVENT — defaults to `new Date()`. Pass explicitly in
   * tests (Task 5's feed-endpoint tests need deterministic output). */
  now?: Date;
}

/**
 * Builds a multi-VEVENT VCALENDAR document (CRLF line endings, RFC 5545
 * §3.1 line folding on any property line over 75 octets, UTC DTSTART/DTEND,
 * PRODID/VERSION:2.0, METHOD:PUBLISH). PURE — no `Date.now()` unless
 * `opts.now` is omitted.
 */
export function generateICal(events: GenerateIcalEvent[], opts: GenerateIcalOptions = {}): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MaterialHub//Booking Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (opts.calName) {
    lines.push(foldLine(`X-WR-CALNAME:${escapeIcsText(opts.calName)}`));
  }

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${escapeIcsText(event.uid)}`));
    lines.push(foldLine(`DTSTAMP:${formatIcsUtc(now)}`));
    lines.push(foldLine(`DTSTART:${formatIcsUtc(event.startsAt)}`));
    lines.push(foldLine(`DTEND:${formatIcsUtc(event.endsAt)}`));
    lines.push(foldLine(`SUMMARY:${escapeIcsText(event.summary)}`));
    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(event.location)}`));
    }
    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcsText(event.description)}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ─── buildBookingReminderIcs (absorbed from reminders/ical-vevent.ts) ──────

export interface BookingVeventInput {
  /** Globally unique VEVENT UID — reminder-scheduler.ts uses `booking-{id}@materialhubuae.com`. */
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  /** DTSTAMP — defaults to `new Date()` if omitted. Pass explicitly in tests for determinism. */
  now?: Date;
}

/**
 * Builds a single-VEVENT `.ics` document for a booking reminder email
 * (Phase 5 Task 6 / Task 8). A thin wrapper over `generateICal` — same
 * output shape (UID, DTSTAMP, DTSTART, DTEND, SUMMARY, then optional
 * LOCATION/DESCRIPTION) as the original `ical-vevent.ts` helper this
 * absorbs.
 */
export function buildBookingReminderIcs(input: BookingVeventInput): string {
  return generateICal(
    [
      {
        uid: input.uid,
        summary: input.summary,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        description: input.description,
        location: input.location,
      },
    ],
    { now: input.now },
  );
}
