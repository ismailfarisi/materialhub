"use client";

import { useMemo } from "react";
import type { CalendarEngagement } from "@/lib/queries/calendar";
import type { StaffMember } from "@/lib/queries/staff";
import { minutesSinceMidnightInZone, todayKeyInZone, wallClockInZoneToIso } from "@/lib/booking/tz";
import { CalendarGrid, type DropResult } from "./CalendarGrid";

interface DayGridProps {
	dateKey: string;
	staffList: StaffMember[];
	engagements: CalendarEngagement[];
	timezone: string;
	canWrite: boolean;
	onCellClick: (staffId: string, startIso: string) => void;
	onDropReschedule: (
		engagement: CalendarEngagement,
		newStaffId: string,
		newStartIso: string,
		newEndIso: string,
	) => void;
	nowIso: string;
}

export function DayGrid({
	dateKey,
	staffList,
	engagements,
	timezone,
	canWrite,
	onCellClick,
	onDropReschedule,
	nowIso,
}: DayGridProps) {
	const columns = useMemo(
		() => staffList.map((s) => ({ key: s.id, label: s.name })),
		[staffList],
	);

	const engagementsByColumn = useMemo(() => {
		const map = new Map<string, CalendarEngagement[]>();
		for (const s of staffList) map.set(s.id, []);
		for (const e of engagements) {
			const bucket = map.get(e.staff_member_id);
			if (bucket) bucket.push(e);
		}
		return map;
	}, [staffList, engagements]);

	const isToday = dateKey === todayKeyInZone(timezone);
	const nowMinutes = isToday ? minutesSinceMidnightInZone(nowIso, timezone) : null;

	function handleCellClick(staffId: string, minutesFromMidnight: number) {
		onCellClick(staffId, wallClockInZoneToIso(dateKey, minutesFromMidnight, timezone));
	}

	function handleDrop({ engagement, targetColumnKey, newStartMinutesInZone }: DropResult) {
		const durationMinutes = Math.round(
			(new Date(engagement.ends_at).getTime() - new Date(engagement.starts_at).getTime()) /
				60_000,
		);
		const newStartIso = wallClockInZoneToIso(dateKey, newStartMinutesInZone, timezone);
		const newEndIso = wallClockInZoneToIso(dateKey, newStartMinutesInZone + durationMinutes, timezone);
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
			showNowLineForColumn={() => isToday}
			nowMinutesInZone={nowMinutes}
			emptyMessage="No active staff at this location yet."
		/>
	);
}
