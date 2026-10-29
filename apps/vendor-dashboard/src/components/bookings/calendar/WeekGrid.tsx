"use client";

import { useMemo } from "react";
import type { CalendarEngagement } from "@/lib/queries/calendar";
import {
	addDaysToDateKey,
	dateKeyInZone,
	dateKeyToUtcIso,
	formatDayLabelInZone,
	minutesSinceMidnightInZone,
	todayKeyInZone,
	wallClockInZoneToIso,
} from "@/lib/booking/tz";
import { CalendarGrid, type DropResult } from "./CalendarGrid";

interface WeekGridProps {
	weekStartKey: string; // Sunday
	engagements: CalendarEngagement[];
	timezone: string;
	canWrite: boolean;
	onCellClick: (dateKey: string, startIso: string) => void;
	onDropReschedule: (
		engagement: CalendarEngagement,
		newDateKey: string,
		newStartIso: string,
		newEndIso: string,
	) => void;
	nowIso: string;
}

export function WeekGrid({
	weekStartKey,
	engagements,
	timezone,
	canWrite,
	onCellClick,
	onDropReschedule,
	nowIso,
}: WeekGridProps) {
	const dayKeys = useMemo(
		() => Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStartKey, i)),
		[weekStartKey],
	);

	const columns = useMemo(
		() =>
			dayKeys.map((key) => ({
				key,
				label: formatDayLabelInZone(dateKeyToUtcIso(key), "UTC"),
			})),
		[dayKeys],
	);

	const engagementsByColumn = useMemo(() => {
		const map = new Map<string, CalendarEngagement[]>();
		for (const key of dayKeys) map.set(key, []);
		for (const e of engagements) {
			const key = dateKeyInZone(e.starts_at, timezone);
			const bucket = map.get(key);
			if (bucket) bucket.push(e);
		}
		return map;
	}, [dayKeys, engagements, timezone]);

	const todayKey = todayKeyInZone(timezone);
	const nowMinutes = minutesSinceMidnightInZone(nowIso, timezone);

	function handleCellClick(dateKey: string, minutesFromMidnight: number) {
		onCellClick(dateKey, wallClockInZoneToIso(dateKey, minutesFromMidnight, timezone));
	}

	function handleDrop({ engagement, targetColumnKey, newStartMinutesInZone }: DropResult) {
		const durationMinutes = Math.round(
			(new Date(engagement.ends_at).getTime() - new Date(engagement.starts_at).getTime()) /
				60_000,
		);
		const newStartIso = wallClockInZoneToIso(targetColumnKey, newStartMinutesInZone, timezone);
		const newEndIso = wallClockInZoneToIso(
			targetColumnKey,
			newStartMinutesInZone + durationMinutes,
			timezone,
		);
		onDropReschedule(engagement, targetColumnKey, newStartIso, newEndIso);
	}

	return (
		<CalendarGrid
			columns={columns}
			engagementsByColumn={engagementsByColumn}
			timezone={timezone}
			canWrite={canWrite}
			onCellClick={handleCellClick}
			onDrop={handleDrop}
			showNowLineForColumn={(colKey) => colKey === todayKey}
			nowMinutesInZone={nowMinutes}
			emptyMessage="No staff selected."
		/>
	);
}
