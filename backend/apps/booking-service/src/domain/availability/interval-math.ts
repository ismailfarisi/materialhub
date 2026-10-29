// Pure, dependency-free slot math. No DB, no Redis, no Date.now() — every
// "current time" is passed in so the whole module runs in CI and is trivially
// unit-testable. All Date values are UTC instants; local wall-clock times from
// working-hour rules are converted to UTC via the location's IANA timezone so
// DST is handled correctly.

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot {
  start: Date;
  end: Date;
}

// A recurring weekly working-hour rule (mirrors staff_working_hours columns we
// care about). day_of_week: 0=Sunday..6=Saturday. Times are "HH:MM" / "HH:MM:SS".
// effective_from/effective_to are `date` columns. TypeORM's pg driver normally
// hydrates those as "YYYY-MM-DD" strings, but the type is widened to accept a
// Date because a driver/config change that hands back Date objects must not
// silently turn every rule into "always effective" (see ruleEffectiveOn).
export interface WeeklyRule {
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from?: string | Date | null;
  effective_to?: string | Date | null;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface SliceOptions {
  durationMinutes: number;
  bufferBefore: number;
  bufferAfter: number;
  stepMinutes: number;
}

export interface BookingWindowOptions {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  now: Date;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

// ─── Timezone conversion ─────────────────────────────────────────────────────

// Offset (ms) between a timezone's local wall-clock and UTC at the given instant.
// Positive east of UTC. localWallClock = utcInstant + offset.
function tzOffsetMs(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asIfUtc - utc.getTime();
}

// Convert a wall-clock local time (y/mo/d h:mi in `timeZone`) to the UTC instant.
// Two-pass so it stays correct across DST offset changes.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = tzOffsetMs(new Date(naive), timeZone);
  offset = tzOffsetMs(new Date(naive - offset), timeZone);
  return new Date(naive - offset);
}

// ─── Interval subtraction ────────────────────────────────────────────────────

// "HH:MM" / "H:MM" / "HH:MM:SS" → numeric parts. Exported so validators compare
// times numerically instead of lexicographically ("9:00" < "10:00" is false as
// a string).
export function parseTimeOfDay(t: string): { h: number; m: number } {
  const [h, m] = t.split(":");
  return { h: Number(h), m: Number(m) };
}

// Minutes since local midnight, or NaN if `t` is not a parseable time-of-day.
export function timeOfDayMinutes(t: string): number {
  const { h, m } = parseTimeOfDay(t);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return Number.NaN;
  if (h < 0 || h > 24 || m < 0 || m > 59) return Number.NaN;
  return h * 60 + m;
}

// free − busy. Both lists may be unsorted/overlapping. Returns the portions of
// `free` not covered by any `busy` interval, sorted and merged. Half-open
// semantics: touching endpoints do NOT subtract (adjacent is free).
export function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  const merged = mergeIntervals(busy);
  const out: Interval[] = [];
  for (const f of free) {
    let cursor = f.start.getTime();
    const end = f.end.getTime();
    if (cursor >= end) continue;
    for (const b of merged) {
      const bs = b.start.getTime();
      const be = b.end.getTime();
      if (be <= cursor || bs >= end) continue; // no overlap (adjacent ok)
      if (bs > cursor) out.push({ start: new Date(cursor), end: new Date(Math.min(bs, end)) });
      cursor = Math.max(cursor, be);
      if (cursor >= end) break;
    }
    if (cursor < end) out.push({ start: new Date(cursor), end: new Date(end) });
  }
  return out;
}

// Sort by start and coalesce overlapping/adjacent intervals.
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = new Date(cur.end.getTime());
    } else {
      out.push({ start: new Date(cur.start.getTime()), end: new Date(cur.end.getTime()) });
    }
  }
  return out;
}

// ─── Working-hour expansion (recurring weekly → concrete UTC windows) ─────────

// Expand weekly rules into concrete UTC intervals across [range.from, range.to],
// interpreting each rule's start/end as wall-clock time in `timeZone` on each
// matching calendar day. DST-correct because each day's local time is converted
// independently via zonedTimeToUtc.
export function expandWorkingHours(
  rules: WeeklyRule[],
  range: DateRange,
  timeZone: string,
): Interval[] {
  const out: Interval[] = [];
  // Walk calendar days in the target timezone from `from` to `to` inclusive.
  // Anchor on the local date so day boundaries line up with the timezone.
  const startDay = localDateParts(range.from, timeZone);
  const endDay = localDateParts(range.to, timeZone);
  let y = startDay.year;
  let mo = startDay.month;
  let d = startDay.day;
  // Guard against pathological ranges (max ~400 iterations).
  for (let guard = 0; guard < 400; guard++) {
    const dow = dayOfWeekUtcNoon(y, mo, d, timeZone);
    for (const rule of rules) {
      if (rule.day_of_week !== dow) continue;
      if (!ruleEffectiveOn(rule, y, mo, d)) continue;
      const s = parseTimeOfDay(rule.start_time);
      const e = parseTimeOfDay(rule.end_time);
      const start = zonedTimeToUtc(y, mo, d, s.h, s.m, timeZone);
      const end = zonedTimeToUtc(y, mo, d, e.h, e.m, timeZone);
      if (end.getTime() <= start.getTime()) continue;
      // Clip to the requested UTC range.
      const clippedStart = Math.max(start.getTime(), range.from.getTime());
      const clippedEnd = Math.min(end.getTime(), range.to.getTime());
      if (clippedEnd > clippedStart)
        out.push({ start: new Date(clippedStart), end: new Date(clippedEnd) });
    }
    if (y === endDay.year && mo === endDay.month && d === endDay.day) break;
    ({ y, mo, d } = nextDay(y, mo, d));
  }
  return mergeIntervals(out);
}

function localDateParts(utc: Date, timeZone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Day-of-week (0=Sun..6=Sat) for a calendar date in the target timezone.
// Evaluated at local noon to stay clear of any DST midnight transition.
function dayOfWeekUtcNoon(y: number, mo: number, d: number, timeZone: string): number {
  const noon = zonedTimeToUtc(y, mo, d, 12, 0, timeZone);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

// Normalize a `date` column value (string or Date) to "YYYY-MM-DD" so the
// comparisons below are always date-vs-date. Without this, a Date instance
// stringifies to "Mon Jul 20 2026 ..." and every `<`/`>` test fails, making a
// bounded rule look permanently effective.
function toYmd(v: string | Date): string {
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

function ruleEffectiveOn(rule: WeeklyRule, y: number, mo: number, d: number): boolean {
  const day = ymd(y, mo, d);
  if (rule.effective_from && day < toYmd(rule.effective_from)) return false;
  if (rule.effective_to && day > toYmd(rule.effective_to)) return false;
  return true;
}

function nextDay(y: number, mo: number, d: number): { y: number; mo: number; d: number } {
  const dt = new Date(Date.UTC(y, mo - 1, d) + DAY_MS);
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// ─── Slicing free windows into bookable slots ────────────────────────────────

// Carve each free window into candidate service-start slots. A start `s` is
// valid only if the whole footprint [s − bufferBefore, s + duration + bufferAfter]
// fits inside the window. Starts step by stepMinutes from the earliest feasible
// start (windowStart + bufferBefore). The returned slot spans the service itself
// [s, s + duration]; buffers pad against neighbours and are not shown.
export function sliceIntoSlots(freeWindows: Interval[], opts: SliceOptions): Slot[] {
  const { durationMinutes, bufferBefore, bufferAfter, stepMinutes } = opts;
  if (durationMinutes <= 0 || stepMinutes <= 0) return [];
  const durMs = durationMinutes * MINUTE_MS;
  const beforeMs = bufferBefore * MINUTE_MS;
  const afterMs = bufferAfter * MINUTE_MS;
  const stepMs = stepMinutes * MINUTE_MS;
  const footprint = beforeMs + durMs + afterMs;
  const slots: Slot[] = [];
  for (const w of freeWindows) {
    const ws = w.start.getTime();
    const we = w.end.getTime();
    if (we - ws < footprint) continue;
    for (let s = ws + beforeMs; s + durMs + afterMs <= we; s += stepMs) {
      slots.push({ start: new Date(s), end: new Date(s + durMs) });
    }
  }
  return slots;
}

// ─── Calendar-day iteration (timezone-aware) ─────────────────────────────────

// Hard ceiling on days enumerated in one call. Read requests are clamped to 62
// days; the wide caller is cache invalidation over a vendor's max_advance_days
// horizon (capped to MAX_HORIZON_DAYS in AvailabilityRuleService), so this must
// stay above that cap or invalidation would silently truncate.
const MAX_DAYS_IN_RANGE = 800;

// List the local calendar days (YYYY-MM-DD in `timeZone`) touched by [from, to].
export function localDaysInRange(from: Date, to: Date, timeZone: string): string[] {
  if (to.getTime() < from.getTime()) return [];
  const start = localDateParts(from, timeZone);
  const end = localDateParts(to, timeZone);
  const days: string[] = [];
  let { year: y, month: mo, day: d } = start;
  for (let guard = 0; guard < MAX_DAYS_IN_RANGE; guard++) {
    days.push(ymd(y, mo, d));
    if (y === end.year && mo === end.month && d === end.day) break;
    ({ y, mo, d } = nextDay(y, mo, d));
  }
  return days;
}

// UTC bounds [from, to) of a single local calendar day (YYYY-MM-DD in timeZone).
export function dayRangeUtc(day: string, timeZone: string): DateRange {
  const parts = day.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  const from = zonedTimeToUtc(y, mo, d, 0, 0, timeZone);
  const next = nextDay(y, mo, d);
  const to = zonedTimeToUtc(next.y, next.mo, next.d, 0, 0, timeZone);
  return { from, to };
}

function ymd(y: number, mo: number, d: number): string {
  return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

// ─── Offering slot composition ───────────────────────────────────────────────

export interface OfferingSlotParams {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotStepMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  // Home-visit round-trip travel; padded onto both sides of the footprint.
  travelBufferMinutes?: number;
}

// Turn a staff member's FREE windows (already working-hours minus busy) into
// bookable slots for one offering: apply duration + buffers (+ travel) then the
// min-notice/max-advance window.
export function composeSlots(
  freeWindows: Interval[],
  offering: OfferingSlotParams,
  now: Date,
): Slot[] {
  const travel = offering.travelBufferMinutes ?? 0;
  const slots = sliceIntoSlots(freeWindows, {
    durationMinutes: offering.durationMinutes,
    bufferBefore: offering.bufferBeforeMinutes + travel,
    bufferAfter: offering.bufferAfterMinutes + travel,
    stepMinutes: offering.slotStepMinutes,
  });
  return applyBookingWindow(slots, {
    minNoticeMinutes: offering.minNoticeMinutes,
    maxAdvanceDays: offering.maxAdvanceDays,
    now,
  });
}

// ─── Booking-window filter (min notice / max advance) ────────────────────────

// Drop slots that start sooner than minNotice from `now`, or further out than
// maxAdvanceDays from `now`.
export function applyBookingWindow(slots: Slot[], opts: BookingWindowOptions): Slot[] {
  const earliest = opts.now.getTime() + opts.minNoticeMinutes * MINUTE_MS;
  const latest = opts.now.getTime() + opts.maxAdvanceDays * DAY_MS;
  return slots.filter((s) => {
    const t = s.start.getTime();
    return t >= earliest && t <= latest;
  });
}
