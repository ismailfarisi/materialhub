"use client";

import { Input, Label } from "@materialhub/ui";

/**
 * A date + time input pair that is explicitly read/written as wall-clock
 * time IN A GIVEN TIMEZONE (never the browser's) — the calendar's create
 * dialogs need this because the location filter can be any IANA zone, not
 * just the vendor's own browser zone. Mirrors the intent of TimeOffPanel's
 * Dubai-only `dubaiWallClockToIso`, generalized via tz.ts's
 * `wallClockInZoneToIso` two-pass Intl correction (works for any zone).
 * Deliberately native `<input type="date">` + `<input type="time">`
 * (no datetime-local — that control's value has no timezone of its own and
 * is easy to misinterpret as browser-local).
 */
export function ZonedDateTimeFields({
	label,
	timezone,
	dateKey,
	minutesFromMidnight,
	onChange,
}: {
	label: string;
	timezone: string;
	dateKey: string;
	minutesFromMidnight: number;
	onChange: (dateKey: string, minutesFromMidnight: number) => void;
}) {
	const hh = String(Math.floor(minutesFromMidnight / 60) % 24).padStart(2, "0");
	const mm = String(minutesFromMidnight % 60).padStart(2, "0");

	return (
		<div className="grid grid-cols-2 gap-2">
			<div>
				<Label className="text-xs">
					{label} date <span className="text-taupe">({timezone})</span>
				</Label>
				<Input
					type="date"
					value={dateKey}
					onChange={(e) => e.target.value && onChange(e.target.value, minutesFromMidnight)}
				/>
			</div>
			<div>
				<Label className="text-xs">{label} time</Label>
				<Input
					type="time"
					value={`${hh}:${mm}`}
					onChange={(e) => {
						const [h, m] = e.target.value.split(":").map(Number);
						if (Number.isFinite(h) && Number.isFinite(m)) onChange(dateKey, h * 60 + m);
					}}
				/>
			</div>
		</div>
	);
}
