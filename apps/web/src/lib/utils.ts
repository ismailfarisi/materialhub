import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `orderId` looks like a UUID — order rows are
 * `@PrimaryGeneratedColumn("uuid")`, and `GET /buyer/orders/:id` 400s on
 * anything else. The Tamara `?order=` query param is untrusted the moment it
 * comes back through a redirect: it's unconfirmed whether Tamara appends its
 * own query params to the merchant success URL, and if it does so naively,
 * `searchParams.get("order")` could return a malformed value. Treat a
 * malformed value the same as a missing one rather than firing a doomed
 * request.
 */
export function isValidOrderId(orderId: string | undefined | null): orderId is string {
  return !!orderId && UUID_PATTERN.test(orderId);
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-AE",
  ar: "ar-AE",
  hi: "hi-IN",
  ur: "ur-PK",
  ml: "ml-IN",
};

export function formatPrice(
  amountInFils: number,
  currency: string = "AED",
  locale: string = "en"
): string {
  const amount = amountInFils / 100;
  return new Intl.NumberFormat(LOCALE_MAP[locale] || locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(
  dateStr: string,
  locale: string = "en",
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(dateStr).toLocaleDateString(
    LOCALE_MAP[locale] || locale,
    options || { year: "numeric", month: "short", day: "numeric" }
  );
}

export function formatCompactNumber(count: number, locale: string = "en"): string {
  return new Intl.NumberFormat(LOCALE_MAP[locale] || locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

/**
 * True when `timeZone` is an IANA zone this runtime's Intl actually accepts.
 *
 * Every `*InZone` helper below feeds its argument to Intl, which throws a
 * RangeError on an unknown zone — and these helpers run during render, so an
 * attacker-or-typo-supplied `?tz=` query param would white-screen the whole
 * page. Validate at the BOUNDARY (where the untrusted value enters — e.g.
 * `/book/[slug]`'s searchParams) and fall back to a real, known zone; the
 * try/catch inside the formatters is only a last-resort guard so a bad value
 * degrades to UTC instead of crashing.
 */
export function isValidTimeZone(timeZone: string | undefined | null): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Falls back to UTC (an always-valid zone) rather than throwing mid-render. */
function safeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

/**
 * Wall-clock time-of-day for a UTC ISO instant, rendered in a specific IANA
 * timezone (e.g. the booking availability response's `timezone` field).
 * Use this instead of formatDate for booking slot times — the browser's
 * local timezone is NOT the right zone to render in.
 */
export function formatTimeInZone(
  isoString: string,
  timeZone: string,
  locale: string = "en"
): string {
  return new Date(isoString).toLocaleTimeString(LOCALE_MAP[locale] || locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeZone(timeZone),
  });
}

/** Calendar date for a UTC ISO instant, rendered in a specific IANA timezone. */
export function formatDateInZone(
  isoString: string,
  timeZone: string,
  locale: string = "en",
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(isoString).toLocaleDateString(LOCALE_MAP[locale] || locale, {
    ...(options || { weekday: "short", month: "short", day: "numeric" }),
    timeZone: safeZone(timeZone),
  });
}

/**
 * Returns the offering-timezone calendar date as "YYYY-MM-DD" for a UTC ISO
 * instant — used to bucket availability slots into day groups independent
 * of the browser's local timezone (en-CA locale formats as YYYY-MM-DD).
 */
export function dateKeyInZone(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleDateString("en-CA", { timeZone });
}

/** 0-23 local hour for a UTC ISO instant in a specific IANA timezone — used to bucket slots into morning/afternoon/evening. */
export function hourInZone(isoString: string, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(new Date(isoString));
  // "24" is returned for midnight by some environments — normalize to 0.
  const hour = Number.parseInt(formatted, 10);
  return hour === 24 ? 0 : hour;
}

/** "YYYY-MM-DD" for "today" in a specific IANA timezone. */
export function todayKeyInZone(timeZone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

/**
 * Add `days` to a "YYYY-MM-DD" key (as produced by dateKeyInZone /
 * todayKeyInZone) using UTC-anchored calendar arithmetic — pure integer
 * date math with no timezone/DST interference. Use this (never
 * Date.setDate() on a browser-local Date) to step an offering-timezone
 * date key forward/back so the resulting key never drifts into the
 * browser's own timezone.
 */
export function addDaysToDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/**
 * A UTC-midnight ISO instant for a "YYYY-MM-DD" key. Pair ALWAYS with
 * `timeZone: "UTC"` when formatting (e.g. via formatDateInZone) so the
 * rendered label can never disagree with the key it was derived from —
 * the key is already the correct offering-timezone calendar date; this
 * just gives Intl an instant to format without reintroducing any zone
 * conversion.
 */
export function dateKeyToUtcIso(key: string): string {
  return `${key}T00:00:00.000Z`;
}
