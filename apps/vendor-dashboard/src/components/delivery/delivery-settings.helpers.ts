import type {
	DeliveryPreview,
	WarehouseDeliverySettings,
} from "@/lib/queries/delivery";

export const EMIRATES = [
	"Abu Dhabi",
	"Dubai",
	"Sharjah",
	"Ajman",
	"Umm Al Quwain",
	"Ras Al Khaimah",
	"Fujairah",
] as const;

/** Monday first, as UAE businesses read a week; values are 0 = Sunday … 6 = Saturday. */
export const WEEKDAYS = [
	{ value: 1, label: "Mon" },
	{ value: 2, label: "Tue" },
	{ value: 3, label: "Wed" },
	{ value: 4, label: "Thu" },
	{ value: 5, label: "Fri" },
	{ value: 6, label: "Sat" },
	{ value: 0, label: "Sun" },
] as const;

export type Speed = "same_day" | "next_day" | "standard";

/** Which list an emirate is in. An emirate is in at most one list. */
export function speedFor(s: WarehouseDeliverySettings, emirate: string): Speed {
	if (s.same_day_emirates.includes(emirate)) return "same_day";
	if (s.next_day_emirates.includes(emirate)) return "next_day";
	return "standard";
}

export function setSpeed(
	s: WarehouseDeliverySettings,
	emirate: string,
	speed: Speed,
): WarehouseDeliverySettings {
	const same = s.same_day_emirates.filter((e) => e !== emirate);
	const next = s.next_day_emirates.filter((e) => e !== emirate);
	if (speed === "same_day") same.push(emirate);
	if (speed === "next_day") next.push(emirate);
	return { ...s, same_day_emirates: same, next_day_emirates: next };
}

export function toggleDay(
	s: WarehouseDeliverySettings,
	day: number,
): WarehouseDeliverySettings {
	const has = s.working_days.includes(day);
	const working_days = has
		? s.working_days.filter((d) => d !== day)
		: [...s.working_days, day].sort((a, b) => a - b);
	return { ...s, working_days };
}

export function validate(s: WarehouseDeliverySettings): string | null {
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.dispatch_cutoff_time))
		return "Enter the cutoff as HH:MM, 24-hour.";
	if (
		!Number.isInteger(s.handling_days) ||
		s.handling_days < 0 ||
		s.handling_days > 60
	)
		return "Handling days must be a whole number from 0 to 60.";
	if (s.working_days.length === 0) return "Pick at least one working day.";
	return null;
}

export function sameSettings(
	a: WarehouseDeliverySettings,
	b: WarehouseDeliverySettings,
): boolean {
	const norm = (s: WarehouseDeliverySettings) =>
		JSON.stringify({
			c: s.dispatch_cutoff_time,
			h: s.handling_days,
			w: [...s.working_days].sort(),
			s: [...s.same_day_emirates].sort(),
			n: [...s.next_day_emirates].sort(),
		});
	return norm(a) === norm(b);
}

export function formatDate(iso: string): string {
	return new Intl.DateTimeFormat("en-AE", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	}).format(new Date(`${iso}T00:00:00Z`));
}

/** The storefront's wording, for the preview card. */
export function previewHeadline(p: DeliveryPreview, now: Date): string {
	const today = new Date(now.getTime() + 4 * 3_600_000)
		.toISOString()
		.slice(0, 10);
	const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
		.toISOString()
		.slice(0, 10);
	if (p.earliest === p.latest && p.latest === today) return "Get it today";
	if (p.earliest === p.latest && p.latest === tomorrow)
		return `Get it tomorrow, ${formatDate(p.latest)}`;
	return `Get it by ${formatDate(p.latest)}`;
}

export function countdown(minutes: number): string | null {
	if (minutes <= 0 || minutes > 24 * 60) return null;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

export const BASIS_LABEL: Record<DeliveryPreview["basis"], string> = {
	same_day_zone: "your same-day list",
	next_day_zone: "your next-day list",
	shipping_rate: "your shipping rate's stated days",
	default: "the platform default (1–2 days in your emirate, 2–4 elsewhere)",
};
