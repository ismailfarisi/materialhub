import type { DeliveryEstimate } from "./delivery-api";

const MS_PER_DAY = 86_400_000;
const DUBAI_OFFSET_MS = 4 * 60 * 60_000;

/** Today's date in Asia/Dubai (UTC+4 all year), "YYYY-MM-DD". */
export function dubaiToday(now: Date): string {
	return new Date(now.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
	return new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY)
		.toISOString()
		.slice(0, 10);
}

/** "Tue, 12 Nov" / "الثلاثاء، ١٢ نوفمبر" for a Dubai calendar date. */
export function formatDeliveryDate(iso: string, locale: string): string {
	return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
		weekday: "short",
		day: "numeric",
		month: "short",
		// The ISO date is already a Dubai date; format it as-is.
		timeZone: "UTC",
	}).format(new Date(`${iso}T00:00:00Z`));
}

export type HeadlineKind = "today" | "tomorrow" | "by";

/**
 * Which headline to print. "Get it by" uses the latest date, so the promise
 * never claims more than the estimate. Today and tomorrow are only used when
 * the whole window is that one day, judged against the live clock.
 */
export function headlineFor(
	estimate: Pick<DeliveryEstimate, "earliest" | "latest">,
	now: Date,
): { kind: HeadlineKind; date: string } {
	const today = dubaiToday(now);
	if (estimate.earliest === estimate.latest) {
		if (estimate.latest === today)
			return { kind: "today", date: estimate.latest };
		if (estimate.latest === addDays(today, 1))
			return { kind: "tomorrow", date: estimate.latest };
	}
	return { kind: "by", date: estimate.latest };
}

/** Minutes left before the cutoff that holds this estimate, from the live clock. */
export function minutesLeft(cutoffAt: string, now: Date): number {
	return Math.max(
		0,
		Math.ceil((Date.parse(cutoffAt) - now.getTime()) / 60_000),
	);
}

/** Show "Order within …" only while it is useful: under a day and not passed. */
export const COUNTDOWN_MAX_MINUTES = 24 * 60;

export function splitMinutes(total: number): {
	hours: number;
	minutes: number;
} {
	return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function formatCount(n: number, locale: string): string {
	return new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE").format(n);
}
