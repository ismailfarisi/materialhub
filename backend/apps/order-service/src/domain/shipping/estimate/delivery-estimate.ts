// delivery-estimate.ts — pure delivery-promise arithmetic. No I/O.
//
// All calendar reasoning happens in Asia/Dubai. The UAE keeps UTC+4 all year
// (no daylight saving), so a fixed offset is exact and avoids depending on the
// runtime's time-zone database.

export const DUBAI_TIME_ZONE = "Asia/Dubai";
const DUBAI_OFFSET_MINUTES = 4 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** The seven emirates, stored as in `apps/web/src/lib/emirates.ts`. */
export const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;
export type UaeEmirate = (typeof UAE_EMIRATES)[number];

/**
 * Carriers in the UAE deliver Monday to Saturday. Used for transit days when
 * the caller does not pass its own delivery days. 0 = Sunday … 6 = Saturday.
 */
export const DEFAULT_CARRIER_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

/**
 * Transit when neither the warehouse's same/next-day lists nor a shipping rate
 * say anything: within the warehouse's emirate, or across emirates.
 */
export const DEFAULT_TRANSIT = {
  sameEmirate: { min: 1, max: 2 },
  otherEmirate: { min: 2, max: 4 },
} as const;

/** Never search further than this for a working day (guards bad config). */
const MAX_SCAN_DAYS = 120;

export interface OriginSettings {
  emirate: string;
  /** "HH:MM", Asia/Dubai. */
  dispatchCutoffTime: string;
  handlingDays: number;
  /** Dispatch days, 0 = Sunday … 6 = Saturday. */
  workingDays: readonly number[];
  sameDayEmirates: readonly string[];
  nextDayEmirates: readonly string[];
}

export interface TransitDays {
  min: number;
  max: number;
}

export interface EstimateInput {
  now: Date;
  origin: OriginSettings;
  destinationEmirate: string;
  /** Replaces `origin.handlingDays` when set (made-to-order products). */
  handlingDaysOverride?: number | null;
  /** Transit from a matching shipping rate, when one states its days. */
  rateTransit?: TransitDays | null;
  /** When true, rate transit wins over the same/next-day lists (buyer picked a method). */
  preferRateTransit?: boolean;
  /** Holidays as "YYYY-MM-DD" (Dubai dates) → whether the date is an estimate. */
  holidays: ReadonlyMap<string, boolean> | ReadonlySet<string>;
  carrierDays?: readonly number[];
}

export type DeliverySpeed = "same_day" | "next_day" | "standard";
export type TransitBasis = "same_day_zone" | "next_day_zone" | "shipping_rate" | "default";

export interface DeliveryEstimate {
  /** Earliest and latest delivery dates, "YYYY-MM-DD" in Asia/Dubai. */
  earliest: string;
  latest: string;
  /** Day the parcel leaves the warehouse. */
  dispatchDate: string;
  /** The cutoff that, if met, gives this estimate (ISO UTC instant). */
  cutoffAt: string;
  /** Whole minutes from `now` until `cutoffAt` (rounded up, ≥ 0). */
  minutesToCutoff: number;
  speed: DeliverySpeed;
  sameDay: boolean;
  nextDay: boolean;
  handlingDays: number;
  transitDays: TransitDays;
  basis: TransitBasis;
  /** True when a holiday marked as an estimate moved one of the dates. */
  dependsOnEstimatedHoliday: boolean;
  timeZone: typeof DUBAI_TIME_ZONE;
}

// ── Civil-day helpers (a day number counts days since 1970-01-01 in Dubai) ──

export function dubaiDayNumber(instant: Date): number {
  return Math.floor((instant.getTime() + DUBAI_OFFSET_MINUTES * MS_PER_MINUTE) / MS_PER_DAY);
}

export function dubaiMinuteOfDay(instant: Date): number {
  const localMs = instant.getTime() + DUBAI_OFFSET_MINUTES * MS_PER_MINUTE;
  return Math.floor((((localMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_MINUTE);
}

export function dayToIsoDate(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isoDateToDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. Day 0 (1970-01-01) was a Thursday. */
export function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

/** The UTC instant of `minuteOfDay` on Dubai civil day `day`. */
function dubaiInstant(day: number, minuteOfDay: number): Date {
  return new Date(day * MS_PER_DAY + (minuteOfDay - DUBAI_OFFSET_MINUTES) * MS_PER_MINUTE);
}

export function parseCutoff(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  if (!m) throw new RangeError(`Invalid dispatch cutoff "${value}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Map "dubai", "ABU_DHABI", "abu-dhabi", "Ras al Khaimah" to the canonical value. */
export function normaliseEmirate(value: string | null | undefined): UaeEmirate | null {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, UaeEmirate> = { rak: "Ras Al Khaimah", uaq: "Umm Al Quwain" };
  if (aliases[key]) return aliases[key];
  return UAE_EMIRATES.find((e) => e.toLowerCase() === key) ?? null;
}

function holidayLookup(holidays: EstimateInput["holidays"]): (iso: string) => boolean | undefined {
  if (holidays instanceof Map) return (iso) => holidays.get(iso);
  const set = holidays as ReadonlySet<string>;
  return (iso) => (set.has(iso) ? false : undefined);
}

function validateDays(days: readonly number[], label: string): Set<number> {
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (set.size === 0) throw new RangeError(`${label} must include at least one day`);
  return set;
}

/**
 * Estimate when an order placed at `now` arrives.
 *
 * 1. Day zero is today if today is a working, non-holiday day and the Dubai
 *    clock is before the cutoff; otherwise the next such day.
 * 2. Dispatch is day zero plus `handlingDays` working days.
 * 3. Delivery adds transit on carrier delivery days, skipping holidays. A
 *    transit of 0 (same-day) lands on the dispatch day, or the next carrier
 *    day if the carrier does not deliver then.
 *
 * Transit comes from the warehouse's same-day list (0), next-day list (1), a
 * shipping rate's stated days, then `DEFAULT_TRANSIT`. With
 * `preferRateTransit` a rate's days come before the lists.
 */
export function estimateDelivery(input: EstimateInput): DeliveryEstimate {
  const { now, origin } = input;
  const cutoff = parseCutoff(origin.dispatchCutoffTime);
  const working = validateDays(origin.workingDays, "workingDays");
  const carrier = validateDays(input.carrierDays ?? DEFAULT_CARRIER_DAYS, "carrierDays");
  const isHoliday = holidayLookup(input.holidays);
  let estimatedHolidayHit = false;

  const skip = (day: number, allowed: Set<number>): boolean => {
    if (!allowed.has(weekday(day))) return true;
    const h = isHoliday(dayToIsoDate(day));
    if (h === undefined) return false;
    if (h) estimatedHolidayHit = true;
    return true;
  };
  const nextAllowed = (from: number, allowed: Set<number>): number => {
    let d = from;
    for (let i = 0; i < MAX_SCAN_DAYS; i++, d++) if (!skip(d, allowed)) return d;
    throw new RangeError("No working day found within the scan window");
  };
  const advance = (from: number, n: number, allowed: Set<number>): number => {
    let d = from;
    for (let left = n; left > 0; left--) d = nextAllowed(d + 1, allowed);
    return d;
  };

  const today = dubaiDayNumber(now);
  const beforeCutoff = dubaiMinuteOfDay(now) < cutoff;
  const dayZero = !skip(today, working) && beforeCutoff ? today : nextAllowed(today + 1, working);
  const cutoffAt = dubaiInstant(dayZero, cutoff);

  const override = input.handlingDaysOverride;
  const handlingDays = Math.max(
    0,
    Math.floor(override != null && override >= 0 ? override : origin.handlingDays),
  );
  const dispatch = advance(dayZero, handlingDays, working);

  const destination = normaliseEmirate(input.destinationEmirate) ?? input.destinationEmirate;
  const inList = (list: readonly string[]) =>
    list.some((e) => (normaliseEmirate(e) ?? e) === destination);
  const rate =
    input.rateTransit &&
    input.rateTransit.max >= input.rateTransit.min &&
    input.rateTransit.min >= 0
      ? input.rateTransit
      : null;

  let transit: TransitDays;
  let basis: TransitBasis;
  if (rate && input.preferRateTransit) {
    transit = rate;
    basis = "shipping_rate";
  } else if (inList(origin.sameDayEmirates)) {
    transit = { min: 0, max: 0 };
    basis = "same_day_zone";
  } else if (inList(origin.nextDayEmirates)) {
    transit = { min: 1, max: 1 };
    basis = "next_day_zone";
  } else if (rate) {
    transit = rate;
    basis = "shipping_rate";
  } else {
    const sameEmirate = (normaliseEmirate(origin.emirate) ?? origin.emirate) === destination;
    transit = { ...(sameEmirate ? DEFAULT_TRANSIT.sameEmirate : DEFAULT_TRANSIT.otherEmirate) };
    basis = "default";
  }

  const firstCarrierDay = nextAllowed(dispatch, carrier);
  const deliver = (n: number) => (n === 0 ? firstCarrierDay : advance(dispatch, n, carrier));
  const earliest = deliver(transit.min);
  const latest = Math.max(earliest, deliver(transit.max));

  const speed: DeliverySpeed =
    earliest === today ? "same_day" : earliest === today + 1 ? "next_day" : "standard";

  return {
    earliest: dayToIsoDate(earliest),
    latest: dayToIsoDate(latest),
    dispatchDate: dayToIsoDate(dispatch),
    cutoffAt: cutoffAt.toISOString(),
    minutesToCutoff: Math.max(0, Math.ceil((cutoffAt.getTime() - now.getTime()) / MS_PER_MINUTE)),
    speed,
    sameDay: speed === "same_day",
    nextDay: speed === "next_day",
    handlingDays,
    transitDays: transit,
    basis,
    dependsOnEstimatedHoliday: estimatedHolidayHit,
    timeZone: DUBAI_TIME_ZONE,
  };
}
