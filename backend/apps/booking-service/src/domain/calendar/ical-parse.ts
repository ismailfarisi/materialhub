// ical-parse.ts
//
// Phase 6 Task 3 (docs/superpowers/plans/2026-07-08-booking-phase-6-offplatform.md,
// "Pure iCal parse + generate") — a hand-rolled, dependency-free VEVENT
// extractor for VCALENDAR text. No external iCal library (repo convention:
// small pure utils, not third-party parsers — see interval-math.ts). PURE —
// no I/O, never throws (garbage input just yields fewer/zero events), used by
// Task 4's inbound poller (IcalImportService) to read a vendor's external
// calendar feed and by this module's own generate/parse round-trip tests.
//
// ─── Simplifications (documented per the Task 3 brief) ─────────────────────
//   1. Floating local time (DTSTART/DTEND with no `Z` suffix and no `TZID=`
//      parameter) is treated as UTC. This platform is single-timezone (UAE,
//      Asia/Dubai) and Task 4's import is busy-time-only (no cross-TZ display
//      requirement) — a floating time is far more likely to already BE the
//      vendor's local wall clock than anything else, and misreading it by a
//      few hours only shifts a busy-block, it never drops one.
//   2. `TZID=` is resolved via the JS platform's Intl/ICU timezone database
//      (a "double-format" offset lookup, see `resolveTzidToUtc` below), NOT a
//      full VTIMEZONE parser. VTIMEZONE blocks (and any nested
//      STANDARD/DAYLIGHT sub-components) are skipped entirely — we trust the
//      IANA name on the TZID param over hand-parsing the RRULE-based
//      transition rules a VTIMEZONE block encodes. If Intl doesn't recognize
//      the TZID (non-IANA or a Microsoft "Standard Time" name), the event
//      falls back to the floating/UTC treatment in (1). This is a known
//      simplification: a wall time that falls in a DST-transition's skipped
//      or repeated hour can be off by up to an hour; acceptable for
//      busy-time capacity blocking.
//   3. All-day events (`DTSTART;VALUE=DATE:YYYYMMDD`) expand to the full
//      day(s) starting 00:00 UTC on that date. Per RFC 5545 §3.6.1, a
//      `DTEND;VALUE=DATE` is EXCLUSIVE (the day it names is NOT part of the
//      event) — we use it as-is. An all-day DTSTART with no DTEND at all
//      defaults to a single day (RFC 5545's own default for DATE-valued
//      DTSTART), i.e. `[00:00, +1 day)`.
//   4. Missing DTEND on a TIMED (DATE-TIME) event: falls back to `DURATION`
//      if present; if neither DTEND nor DURATION is present, the event is
//      SKIPPED. (RFC 5545 technically defaults an untimed DTEND to
//      "same instant as DTSTART", but a zero-length busy-time block is
//      useless for capacity blocking and would only add noise to Task 4's
//      idempotency ledger — skipping is the more useful choice here.)
//   5. Events with no UID are SKIPPED — Task 4's idempotency key is
//      `external_ref = uid`; an event without one can never be tracked
//      across re-syncs, so it cannot be safely imported.
//   6. Malformed events (bad dates, unparseable lines, etc.) are skipped
//      individually; the parser never throws, even on fully garbage input —
//      it returns whatever valid VEVENTs it could extract.
//   7. `STATUS:CANCELLED` events are excluded from the result entirely.
//   8. TEXT values (currently just SUMMARY) are unescaped per RFC 5545
//      §3.3.11 (`\\`, `\;`, `\,`, `\n`/`\N`).
//   9. Recurrence (RRULE/EXDATE/RECURRENCE-ID/RDATE) is CAPTURED RAW here, NOT
//      expanded — parseICal still returns exactly one ParsedIcalEvent per
//      VEVENT (the master's first occurrence for a recurring series; an
//      override VEVENT is returned as its own entry carrying `recurrenceId`).
//      Bounded expansion into per-occurrence entries lives in the pure
//      `ical-recurrence.ts` layer, driven with an injected `now` by Task 4's
//      import service (Phase 6 review C1). Callers that don't expand (e.g. the
//      generate/parse round-trip tests) see the master occurrence unchanged —
//      backward compatible.

export interface ParsedIcalEvent {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary?: string;
  // ── Recurrence metadata (Phase 6 C1) — populated ONLY when the VEVENT
  // carried the corresponding property; a plain non-recurring event leaves
  // all of these undefined (backward compatible). All times are epoch ms in
  // UTC, resolved through the same DTSTART parsing rules above. ──
  rrule?: string; // raw RRULE value, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"
  exDates?: number[]; // EXDATE occurrence starts (epoch ms), multi-value + multi-line merged
  recurrenceId?: number; // RECURRENCE-ID (epoch ms): this VEVENT overrides that one occurrence
  hasRDate?: boolean; // RDATE present -> unsupported, expander imports master-only
}

// ─── RFC 5545 §3.3.11 TEXT unescaping (inverse of ical-feed.ts's
// escapeIcsText) ────────────────────────────────────────────────────────────
// Order matters: unescape `\\` LAST, or a literal `\\n` in the source would
// be misread as an escaped newline.
function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// ─── RFC 5545 §3.1 line unfolding ──────────────────────────────────────────
// A folded line is continued by a CRLF (or bare LF) immediately followed by a
// single space or tab; the fold + the leading whitespace char are removed.
// Normalizing CRLF→LF first lets one pass handle both CRLF and bare-LF input.
function unfoldLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

// ── Resource limits (review finding 1 — remote OOM) ─────────────────────────
// `fetchIcalFeedSafely` caps the FEED BODY at 2 MB, but a 2 MB body is not a
// bounded amount of WORK: a minimal VEVENT is ~107 bytes, so 2 MB is ~19.5k
// events, and giving each one `RRULE:FREQ=DAILY` expanded to ~1.8M occurrences
// (measured) — hundreds of MB of heap in a 384 MB service, followed by one
// serial INSERT + cache invalidation PER OCCURRENCE, on a concurrency-1 cron.
// A vendor pointing `ical_url` at a host they control could OOM the poller
// every tick and starve every other vendor's sync behind it.
//
// The cap is therefore on the WORK, not just the bytes. 5000 VEVENTs is far
// beyond any real staff calendar export (Google/Outlook emit recurring events
// as master+RRULE, so even a heavily-booked chair is low hundreds) while
// keeping the parse bounded.
export const MAX_PARSED_EVENTS = 5000;

/**
 * Thrown when a feed exceeds a hard resource limit (event count here,
 * expanded-occurrence count in ical-recurrence.ts). Deliberately NOT swallowed
 * by parseICal's "never throws on malformed input" contract: a limit breach
 * must fail the whole sync with a classified, vendor-visible `last_sync_error`
 * rather than silently importing an arbitrary truncated prefix of the feed —
 * a partial import would delete (release) every engagement whose uid fell past
 * the cut, silently freeing real busy time.
 */
export class IcalLimitExceededError extends Error {
  constructor(public readonly limit: string) {
    super(`ical_limit_exceeded:${limit}`);
  }
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

// Minimal `NAME;PARAM=VAL;...:VALUE` property-line parser. Does not handle
// quoted-string param values containing `:` or `;` (not needed for the
// DTSTART/DTEND/DURATION/UID/SUMMARY/STATUS properties this module reads).
function parseIcsLine(line: string): IcsProperty | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = head.split(";");
  const name = parts[0]?.trim().toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined) continue;
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toUpperCase();
    const val = part
      .slice(eqIdx + 1)
      .trim()
      .replace(/^"|"$/g, "");
    params[key] = val;
  }
  return { name, params, value };
}

// ─── VEVENT extraction ──────────────────────────────────────────────────────
// Walks BEGIN:/END: nesting and collects raw property lines that belong
// DIRECTLY to a top-level VEVENT (i.e. skips VTIMEZONE/STANDARD/DAYLIGHT
// entirely, and skips nested sub-components like VALARM inside a VEVENT so
// their properties — e.g. a VALARM's own DESCRIPTION — never leak into the
// event's property set).
function extractVEventLineGroups(lines: string[], maxEvents: number): string[][] {
  const events: string[][] = [];
  const stack: string[] = [];
  let current: string[] | null = null;

  for (const rawLine of lines) {
    if (events.length > maxEvents) throw new IcalLimitExceededError("too_many_events");
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (/^BEGIN:/i.test(trimmed)) {
      const comp = trimmed.slice("BEGIN:".length).trim().toUpperCase();
      stack.push(comp);
      if (comp === "VEVENT" && stack[stack.length - 2] === "VCALENDAR") {
        current = [];
      }
      continue;
    }
    if (/^END:/i.test(trimmed)) {
      const comp = trimmed.slice("END:".length).trim().toUpperCase();
      if (comp === "VEVENT" && current) {
        events.push(current);
        current = null;
      }
      stack.pop();
      continue;
    }
    if (current && stack[stack.length - 1] === "VEVENT") {
      current.push(line);
    }
  }
  return events;
}

// ─── DTSTART/DTEND value parsing ───────────────────────────────────────────

interface ParsedIcsDate {
  date: Date;
  isAllDay: boolean;
}

// Standard "double-format" IANA offset lookup: format the same instant in
// both UTC and the target zone, diff the wall-clock results to get the
// zone's offset at that instant, then apply it. One pass (not iterated
// across the DST boundary) — see simplification (2) in the module header.
function resolveTzidToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tzid: string,
): Date | null {
  try {
    const guessUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tzid,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(new Date(guessUtcMs));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const zonedWallAsUtcMs = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    const offsetMs = zonedWallAsUtcMs - guessUtcMs;
    return new Date(guessUtcMs - offsetMs);
  } catch {
    // Unknown TZID to the platform's Intl database — caller falls back to
    // treating the value as floating/UTC.
    return null;
  }
}

function parseIcsDate(prop: IcsProperty): ParsedIcsDate | null {
  const value = prop.value.trim();

  if (prop.params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(value)) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const [, ys, mos, ds] = m;
    return {
      date: new Date(Date.UTC(Number(ys), Number(mos) - 1, Number(ds))),
      isAllDay: true,
    };
  }

  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, ys, mos, ds, hs, mis, ss, z] = m;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mis);
  const s = Number(ss);

  if (z) {
    return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), isAllDay: false };
  }

  const tzid = prop.params.TZID;
  if (tzid) {
    const resolved = resolveTzidToUtc(y, mo, d, h, mi, s, tzid);
    if (resolved) return { date: resolved, isAllDay: false };
  }

  // Floating local time (no Z, no resolvable TZID) — treated as UTC. See
  // simplification (1) in the module header.
  return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), isAllDay: false };
}

// ISO 8601 duration (RFC 5545 §3.3.6), e.g. `PT1H30M`, `P1D`, `-PT15M`.
function parseIcsDurationMs(value: string): number | null {
  const m = value
    .trim()
    .match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = m;
  if (!weeks && !days && !hours && !minutes && !seconds) return null;
  const totalSeconds =
    (Number(weeks ?? 0) * 7 + Number(days ?? 0)) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return (sign === "-" ? -1 : 1) * totalSeconds * 1000;
}

const DAY_MS = 86_400_000;

function buildEvent(props: IcsProperty[]): ParsedIcalEvent | null {
  const find = (name: string) => props.find((p) => p.name === name);

  const uidProp = find("UID")?.value?.trim();
  if (!uidProp) return null; // simplification (5): no UID → not trackable, skip
  // Unescape UID to mirror SUMMARY handling (RFC 5545 §3.3.11 TEXT unescaping)
  const uid = unescapeIcsText(uidProp);

  const status = find("STATUS")?.value?.trim().toUpperCase();
  if (status === "CANCELLED") return null; // (7)

  const dtstartProp = find("DTSTART");
  if (!dtstartProp) return null;
  const startParsed = parseIcsDate(dtstartProp);
  if (!startParsed) return null;

  let endsAt: Date;
  const dtendProp = find("DTEND");
  if (dtendProp) {
    const endParsed = parseIcsDate(dtendProp);
    if (!endParsed) return null;
    endsAt = endParsed.date; // DTEND;VALUE=DATE is already exclusive — (3)
  } else {
    const durationProp = find("DURATION");
    if (durationProp) {
      const ms = parseIcsDurationMs(durationProp.value);
      if (ms == null) return null;
      endsAt = new Date(startParsed.date.getTime() + ms);
    } else if (startParsed.isAllDay) {
      endsAt = new Date(startParsed.date.getTime() + DAY_MS); // (3)
    } else {
      return null; // (4): timed event, no DTEND, no DURATION → skip
    }
  }

  // Monotonicity guard: reversed/zero-length busy blocks are meaningless and a
  // reversed tstzrange throws in Postgres. Skip events where endsAt <= startsAt.
  if (endsAt.getTime() <= startParsed.date.getTime()) {
    return null;
  }

  const summaryProp = find("SUMMARY");
  const summary = summaryProp ? unescapeIcsText(summaryProp.value) : undefined;

  // ── Recurrence metadata (captured raw; expanded by ical-recurrence.ts) ──
  const rrule = find("RRULE")?.value?.trim() || undefined;

  // EXDATE may appear on multiple lines and each line may be comma-separated
  // (RFC 5545 §3.8.5.1). Merge every value; parse each through parseIcsDate so
  // TZID=/Z/floating all resolve the same way DTSTART does.
  const exDates: number[] = [];
  for (const p of props) {
    if (p.name !== "EXDATE") continue;
    for (const part of p.value.split(",")) {
      const parsed = parseIcsDate({ name: "EXDATE", params: p.params, value: part });
      if (parsed) exDates.push(parsed.date.getTime());
    }
  }

  const recurrenceIdProp = find("RECURRENCE-ID");
  let recurrenceId: number | undefined;
  if (recurrenceIdProp) {
    const parsed = parseIcsDate(recurrenceIdProp);
    if (parsed) recurrenceId = parsed.date.getTime();
  }

  const hasRDate = props.some((p) => p.name === "RDATE");

  return {
    uid,
    startsAt: startParsed.date,
    endsAt,
    summary,
    ...(rrule ? { rrule } : {}),
    ...(exDates.length ? { exDates } : {}),
    ...(recurrenceId !== undefined ? { recurrenceId } : {}),
    ...(hasRDate ? { hasRDate: true } : {}),
  };
}

/**
 * Extracts VEVENTs from a VCALENDAR string. PURE, never throws — malformed
 * input yields fewer (or zero) events rather than an exception, since
 * Task 4's poller must survive a badly-formed vendor feed without crashing
 * the sync job. See the module header for the full list of parsing
 * simplifications (TZID via Intl only, no VTIMEZONE parser, floating times
 * treated as UTC, all-day expansion, missing-DTEND/UID/CANCELLED handling).
 */
export function parseICal(text: string, opts?: { maxEvents?: number }): ParsedIcalEvent[] {
  const maxEvents = opts?.maxEvents ?? MAX_PARSED_EVENTS;
  const results: ParsedIcalEvent[] = [];
  try {
    const lines = unfoldLines(text);
    const rawGroups = extractVEventLineGroups(lines, maxEvents);
    for (const rawLines of rawGroups) {
      try {
        const props = rawLines.map(parseIcsLine).filter((p): p is IcsProperty => p !== null);
        const event = buildEvent(props);
        if (event) results.push(event);
      } catch {
        // Malformed VEVENT — skip it, never throw (6).
      }
    }
  } catch (err) {
    // A LIMIT breach is the one deliberate exception to "never throws" — it
    // must reach the caller so the sync can be failed and reported, never
    // degraded into a silent partial import (see the class doc above).
    if (err instanceof IcalLimitExceededError) throw err;
    // Totally malformed input — return whatever we managed to collect.
  }
  return results;
}
