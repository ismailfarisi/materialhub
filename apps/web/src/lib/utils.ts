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

