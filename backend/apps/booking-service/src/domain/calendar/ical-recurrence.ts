// ical-recurrence.ts
//
// Phase 6 review C1 — bounded RRULE expansion layered ON TOP of ical-parse.ts.
// parseICal deliberately returns ONE ParsedIcalEvent per VEVENT (the master's
// first occurrence + captured recurrence metadata); this pure module expands a
// recurring master into one entry PER OCCURRENCE inside a bounded window, so
// Task 4's import diff engine (keyed on `external_ref = uid`) blocks every
// occurrence's slot, not just the first.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Google/Outlook private `.ics` exports emit recurring events as master+RRULE,
// NOT as expanded instances. Without expansion, a weekly standing client blocks
// only its first occurrence — occurrences 2..N are invisible to availability
// and MaterialHub sells those slots (two-customers-one-chair, silently). Expansion
// closes that.
//
// ── Per-occurrence uid (keeps the diff engine UNCHANGED) ─────────────────────
// Each occurrence's uid is `{originalUid}#{occurrenceStartISO-compact}` (e.g.
// `abc@google.com#20260715T090000Z`). The suffix is the occurrence's ORIGINAL
// (RRULE-generated) start, so a RECURRENCE-ID override that MOVES the time keeps
// the SAME uid (same occurrence identity -> the importer emits a `move`, not a
// new row). Occurrences appear/disappear from the window naturally as `now`
// advances, and the importer's existing release-removed logic garbage-collects
// past ones. Non-recurring events keep their BARE uid — backward compatible
// with rows imported before this layer existed (no mass re-key).
//
// ── Window + guards (all documented; `now` injected — never Date.now here) ───
//   • window = [now − 1 day, now + 90 days]  (constants below; overridable for tests)
//   • per-event occurrence cap = 500 (runaway guard on emitted in-window rows)
//   • WHOLE-FEED occurrence cap = 10,000 (review finding 1 — the per-event cap
//     bounds nothing globally; N events × 500 is unbounded in N). Breaching it
//     throws IcalLimitExceededError, the one case where this module is not
//     total — see MAX_TOTAL_OCCURRENCES below for why failing beats truncating.
//   • internal scan cap = 5000 iterations (bounds an ancient-DTSTART/huge-COUNT
//     rule so it can't spin)
//
// ── Supported rules ──────────────────────────────────────────────────────────
//   FREQ=DAILY / WEEKLY / MONTHLY, with INTERVAL, COUNT, UNTIL, EXDATE, and
//   RECURRENCE-ID overrides. WEEKLY additionally supports BYDAY (a list of
//   plain weekday codes, no ordinal prefix). MONTHLY is "simple monthly by the
//   DTSTART day-of-month" (months lacking that day are skipped, RFC 5545).
//
// ── Unsupported rules (import master occurrence only + partial-success note) ──
//   FREQ=YEARLY, BYSETPOS, BYMONTHDAY, BYMONTH, BYWEEKNO/BYYEARDAY, RDATE, and
//   WEEKLY BYDAY with ordinal prefixes. These import only the master's first
//   occurrence and increment `unsupportedCount` so the import service can record
//   a classified `last_sync_error` note ("...partially imported") while still
//   marking the sync successful (last_synced_at updated). Never throws for an
//   unsupported RULE — the only throw in this module is the whole-feed
//   occurrence cap above.
import { IcalLimitExceededError, type ParsedIcalEvent } from "./ical-parse.ts";

const DAY_MS = 86_400_000;

// Expansion window relative to the injected `now`.
export const RECURRENCE_WINDOW_PAST_MS = 1 * DAY_MS; // now − 1 day
export const RECURRENCE_WINDOW_FUTURE_MS = 90 * DAY_MS; // now + 90 days
// Runaway guard: max emitted in-window occurrences PER event.
export const MAX_OCCURRENCES_PER_EVENT = 500;
// Runaway guard: max emitted occurrences ACROSS THE WHOLE FEED (review finding
// 1). The per-event cap alone bounds nothing globally — N events × 500 is still
// unbounded in N, and a 2 MB feed holds thousands of events. This is the cap
// that actually bounds heap and the downstream per-occurrence INSERT count.
// Breaching it throws IcalLimitExceededError (see ical-parse.ts) so the sync
// fails loudly with a classified `last_sync_error` instead of importing an
// arbitrary truncated subset — a truncated import would RELEASE every
// engagement whose uid fell past the cut, silently freeing real busy time.
export const MAX_TOTAL_OCCURRENCES = 10_000;
// Internal generation-scan bound (protects against an ancient DTSTART with a
// huge COUNT never reaching the window).
const MAX_ITERATIONS = 5000;

// Monday-based weekday offset (0 = Monday … 6 = Sunday), used for WEEKLY BYDAY.
const WEEKDAY_OFFSET: Record<string, number> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

export interface ExpandOptions {
  now: Date;
  windowStartMs?: number;
  windowEndMs?: number;
  maxOccurrences?: number;
  // Global (whole-feed) emitted-occurrence cap. Defaults to
  // MAX_TOTAL_OCCURRENCES; overridable so tests can trip it cheaply.
  maxTotalOccurrences?: number;
}

export interface ExpandResult {
  events: ParsedIcalEvent[];
  // Count of RECURRING events whose rule had an unsupported feature and were
  // therefore imported master-occurrence-only (partial success).
  unsupportedCount: number;
}

interface RRule {
  supported: boolean;
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "OTHER";
  interval: number;
  count?: number;
  untilMs?: number;
  byDays?: number[]; // WEEKLY only — sorted Monday-based offsets
}

// Compact ISO used for the occurrence uid suffix (20260715T090000Z).
function compactIso(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function occurrenceUid(baseUid: string, occurrenceStartMs: number): string {
  return `${baseUid}#${compactIso(occurrenceStartMs)}`;
}

function plain(uid: string, startsAt: Date, endsAt: Date, summary?: string): ParsedIcalEvent {
  return summary ? { uid, startsAt, endsAt, summary } : { uid, startsAt, endsAt };
}

// UNTIL is a DATE or DATE-TIME, optionally Z-suffixed. Floating treated as UTC
// (matches ical-parse.ts simplification 1). A DATE-only UNTIL is inclusive of
// the whole day.
function parseUntilMs(value: string): number | undefined {
  const v = value.trim();
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (dt) {
    const [, y, mo, d, h, mi, s] = dt;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }
  const dOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dOnly) {
    const [, y, mo, d] = dOnly;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), 23, 59, 59);
  }
  return undefined;
}

// WEEKLY BYDAY: plain weekday codes only (RFC forbids ordinal prefixes for
// WEEKLY). Any ordinal prefix or junk -> null (rule is unsupported).
function parseByDayWeekly(value: string): number[] | null {
  const days: number[] = [];
  for (const raw of value.split(",")) {
    const code = raw.trim().toUpperCase();
    const off = WEEKDAY_OFFSET[code];
    if (off === undefined) return null; // ordinal prefix or junk -> unsupported
    days.push(off);
  }
  if (!days.length) return null;
  return [...new Set(days)].sort((a, b) => a - b);
}

function parseRRule(value: string): RRule {
  const parts = new Map<string, string>();
  for (const seg of value.split(";")) {
    const eq = seg.indexOf("=");
    if (eq === -1) continue;
    parts.set(seg.slice(0, eq).trim().toUpperCase(), seg.slice(eq + 1).trim());
  }
  const freq = (parts.get("FREQ") ?? "").toUpperCase();
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? "1") || 1);
  const countRaw = parts.get("COUNT");
  const count =
    countRaw !== undefined && Number.isFinite(Number(countRaw)) ? Number(countRaw) : undefined;
  const untilRaw = parts.get("UNTIL");
  const untilMs = untilRaw ? parseUntilMs(untilRaw) : undefined;

  // BY* parts we do NOT handle for the given FREQ make the rule unsupported.
  const hasByDay = parts.has("BYDAY");
  const hasOtherBy =
    parts.has("BYSETPOS") ||
    parts.has("BYMONTHDAY") ||
    parts.has("BYMONTH") ||
    parts.has("BYWEEKNO") ||
    parts.has("BYYEARDAY") ||
    parts.has("BYHOUR") ||
    parts.has("BYMINUTE");

  if (freq === "DAILY") {
    return { supported: !hasByDay && !hasOtherBy, freq: "DAILY", interval, count, untilMs };
  }
  if (freq === "WEEKLY") {
    let byDays: number[] | undefined;
    if (hasByDay) {
      const parsed = parseByDayWeekly(parts.get("BYDAY") as string);
      if (!parsed) return { supported: false, freq: "WEEKLY", interval, count, untilMs };
      byDays = parsed;
    }
    return { supported: !hasOtherBy, freq: "WEEKLY", interval, count, untilMs, byDays };
  }
  if (freq === "MONTHLY") {
    // Simple monthly-by-start-day only: any BYDAY / BYMONTHDAY / BYSETPOS / …
    // is "beyond simple" and unsupported.
    return { supported: !hasByDay && !hasOtherBy, freq: "MONTHLY", interval, count, untilMs };
  }
  return { supported: false, freq: "OTHER", interval, count, untilMs };
}

// nth occurrence start for the index-based frequencies (DAILY / WEEKLY-no-BYDAY
// / MONTHLY). Returns null for a MONTHLY index whose target day-of-month doesn't
// exist that month (e.g. the 31st in a 30-day month) — RFC 5545 skips it.
function nthOccurrenceMs(rule: RRule, dtstartMs: number, n: number): number | null {
  if (rule.freq === "DAILY") return dtstartMs + n * rule.interval * DAY_MS;
  if (rule.freq === "WEEKLY") return dtstartMs + n * rule.interval * 7 * DAY_MS;
  // MONTHLY (simple, by DTSTART day-of-month).
  const d = new Date(dtstartMs);
  const day = d.getUTCDate();
  const cand = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + n * rule.interval,
    day,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return new Date(cand).getUTCDate() === day ? cand : null;
}

// Chronological occurrence starts from DTSTART, EXDATE removed, bounded by
// COUNT / UNTIL / windowEnd / MAX_ITERATIONS. COUNT counts RRULE-generated
// occurrences BEFORE EXDATE removal (RFC 5545). The caller filters to the
// window-start side and applies the per-event emitted cap.
function enumerateSimple(
  rule: RRule,
  dtstartMs: number,
  windowEndMs: number,
  exSet: Set<number> | null,
): number[] {
  const bound = rule.untilMs !== undefined ? Math.min(windowEndMs, rule.untilMs) : windowEndMs;
  const result: number[] = [];
  let generated = 0;
  for (let n = 0, iter = 0; iter < MAX_ITERATIONS; n++, iter++) {
    const startMs = nthOccurrenceMs(rule, dtstartMs, n);
    if (startMs === null) continue; // invalid MONTHLY day -> not an occurrence
    if (rule.count !== undefined && generated >= rule.count) break;
    if (startMs > bound) break;
    generated++;
    if (!exSet || !exSet.has(startMs)) result.push(startMs);
  }
  return result;
}

// WEEKLY + BYDAY: iterate active weeks (every INTERVAL weeks from DTSTART's
// week, WKST=MO), emit the listed weekdays in each. WKST is fixed to Monday (a
// documented simplification; only matters for INTERVAL>1).
function enumerateWeeklyByDay(
  rule: RRule,
  dtstartMs: number,
  windowEndMs: number,
  exSet: Set<number> | null,
): number[] {
  const byDays = rule.byDays as number[];
  const bound = rule.untilMs !== undefined ? Math.min(windowEndMs, rule.untilMs) : windowEndMs;
  const d = new Date(dtstartMs);
  const dowMon = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const weekMonday0 = dtstartMs - dowMon * DAY_MS; // Monday of DTSTART's week, same time-of-day
  const result: number[] = [];
  let generated = 0;
  let iter = 0;
  for (let w = 0; iter < MAX_ITERATIONS; w++) {
    const weekMonday = weekMonday0 + w * rule.interval * 7 * DAY_MS;
    if (weekMonday > bound) break;
    for (const off of byDays) {
      iter++;
      const occ = weekMonday + off * DAY_MS;
      if (occ < dtstartMs || occ > bound) continue;
      if (rule.count !== undefined && generated >= rule.count) return result;
      generated++;
      if (!exSet || !exSet.has(occ)) result.push(occ);
    }
  }
  return result;
}

function enumerateOccurrenceStarts(
  rule: RRule,
  dtstartMs: number,
  windowEndMs: number,
  exDates?: number[],
): number[] {
  const exSet = exDates?.length ? new Set(exDates) : null;
  if (rule.freq === "WEEKLY" && rule.byDays?.length) {
    return enumerateWeeklyByDay(rule, dtstartMs, windowEndMs, exSet);
  }
  return enumerateSimple(rule, dtstartMs, windowEndMs, exSet);
}

/**
 * Expand recurring masters into per-occurrence entries within the window. PURE,
 * never throws. Non-recurring events pass through unchanged (bare uid).
 */
export function expandRecurringEvents(
  events: ParsedIcalEvent[],
  opts: ExpandOptions,
): ExpandResult {
  const nowMs = opts.now.getTime();
  const windowStartMs = opts.windowStartMs ?? nowMs - RECURRENCE_WINDOW_PAST_MS;
  const windowEndMs = opts.windowEndMs ?? nowMs + RECURRENCE_WINDOW_FUTURE_MS;
  const maxOcc = opts.maxOccurrences ?? MAX_OCCURRENCES_PER_EVENT;
  const maxTotal = opts.maxTotalOccurrences ?? MAX_TOTAL_OCCURRENCES;

  // Split RECURRENCE-ID overrides from masters. Overrides are keyed by the
  // ORIGINAL occurrence start (their RECURRENCE-ID value).
  const overridesByUid = new Map<string, Map<number, ParsedIcalEvent>>();
  const masters: ParsedIcalEvent[] = [];
  for (const ev of events) {
    if (ev.recurrenceId !== undefined) {
      let m = overridesByUid.get(ev.uid);
      if (!m) {
        m = new Map();
        overridesByUid.set(ev.uid, m);
      }
      m.set(ev.recurrenceId, ev);
    } else {
      masters.push(ev);
    }
  }

  const out: ParsedIcalEvent[] = [];
  const consumedOverrides = new Map<string, Set<number>>();
  let unsupportedCount = 0;

  // Single choke point for every emission, so the GLOBAL cap can't be bypassed
  // by adding another push site later.
  const emit = (ev: ParsedIcalEvent): void => {
    if (out.length >= maxTotal) {
      throw new IcalLimitExceededError("too_many_occurrences");
    }
    out.push(ev);
  };

  const markConsumed = (uid: string, key: number) => {
    let s = consumedOverrides.get(uid);
    if (!s) {
      s = new Set();
      consumedOverrides.set(uid, s);
    }
    s.add(key);
  };

  for (const master of masters) {
    if (!master.rrule) {
      // Non-recurring — emit unchanged, bare uid (backward compatible).
      emit(plain(master.uid, master.startsAt, master.endsAt, master.summary));
      continue;
    }

    const rule = parseRRule(master.rrule);
    const overrides = overridesByUid.get(master.uid);

    if (!rule.supported || master.hasRDate) {
      // Unsupported recurrence -> import the master's first occurrence only.
      unsupportedCount++;
      const startMs = master.startsAt.getTime();
      const override = overrides?.get(startMs);
      const src = override ?? master;
      const s = src.startsAt.getTime();
      if (s >= windowStartMs && s <= windowEndMs) {
        emit(occurrenceEntry(master.uid, startMs, src.startsAt, src.endsAt, src.summary));
      }
      if (override) markConsumed(master.uid, startMs);
      continue;
    }

    const durationMs = master.endsAt.getTime() - master.startsAt.getTime();
    const starts = enumerateOccurrenceStarts(
      rule,
      master.startsAt.getTime(),
      windowEndMs,
      master.exDates,
    );
    let emitted = 0;
    for (const startMs of starts) {
      if (startMs < windowStartMs) continue;
      const override = overrides?.get(startMs);
      if (override) {
        markConsumed(master.uid, startMs);
        emit(
          occurrenceEntry(
            master.uid,
            startMs,
            override.startsAt,
            override.endsAt,
            override.summary,
          ),
        );
      } else {
        emit(
          occurrenceEntry(
            master.uid,
            startMs,
            new Date(startMs),
            new Date(startMs + durationMs),
            master.summary,
          ),
        );
      }
      emitted++;
      if (emitted >= maxOcc) break;
    }
  }

  // Orphan overrides — a RECURRENCE-ID whose occurrence wasn't produced (no
  // master in the feed, or it fell outside COUNT/UNTIL/EXDATE). Emit at its own
  // (moved) time if in-window, so its busy time is still blocked.
  for (const [uid, m] of overridesByUid) {
    const consumed = consumedOverrides.get(uid);
    for (const [recId, ov] of m) {
      if (consumed?.has(recId)) continue;
      const s = ov.startsAt.getTime();
      if (s < windowStartMs || s > windowEndMs) continue;
      emit(occurrenceEntry(uid, recId, ov.startsAt, ov.endsAt, ov.summary));
    }
  }

  return { events: out, unsupportedCount };
}

function occurrenceEntry(
  baseUid: string,
  occurrenceStartMs: number,
  startsAt: Date,
  endsAt: Date,
  summary?: string,
): ParsedIcalEvent {
  return plain(occurrenceUid(baseUid, occurrenceStartMs), startsAt, endsAt, summary);
}
