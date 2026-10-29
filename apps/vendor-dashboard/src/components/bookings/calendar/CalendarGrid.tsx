"use client";

import { useMemo, useState } from "react";
import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { CalendarEngagement } from "@/lib/queries/calendar";
import {
	PX_PER_MIN,
	ROW_MINUTES,
	ROW_PX,
	assignLanes,
	computeGridRange,
	durationToHeightPx,
	minutesToTopPx,
	snapTo15,
} from "@/lib/booking/grid-layout";
import { dayClippedEndMinutes, minutesSinceMidnightInZone } from "@/lib/booking/tz";
import { EngagementBlock } from "./EngagementBlock";
import { EngagementDetailPopover } from "./EngagementDetailPopover";
import { Popover, PopoverAnchor, cn } from "@materialhub/ui";
import { Plus } from "@phosphor-icons/react";

export interface CalendarColumnDef {
	key: string;
	label: string;
	sublabel?: string;
}

export interface DropResult {
	engagement: CalendarEngagement;
	targetColumnKey: string;
	newStartMinutesInZone: number;
}

interface CalendarGridProps {
	columns: CalendarColumnDef[];
	engagementsByColumn: Map<string, CalendarEngagement[]>;
	timezone: string;
	canWrite: boolean;
	onCellClick: (columnKey: string, minutesFromMidnight: number) => void;
	onDrop: (result: DropResult) => void;
	/** Which columns get the "now" indicator line (day view: all if today; week view: today's only). */
	showNowLineForColumn?: (columnKey: string) => boolean;
	nowMinutesInZone?: number | null;
	emptyMessage?: string;
}

function hourLabel(minuteFromMidnight: number): string {
	const h = Math.floor(minuteFromMidnight / 60);
	const period = h < 12 ? "AM" : "PM";
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${h12} ${period}`;
}

function engagementBounds(
	e: CalendarEngagement,
	timezone: string,
): { startMin: number; endMin: number } {
	const startMin = minutesSinceMidnightInZone(e.starts_at, timezone);
	const endMin = Math.max(startMin + 15, dayClippedEndMinutes(e.starts_at, e.ends_at, timezone));
	return { startMin, endMin };
}

export function CalendarGrid({
	columns,
	engagementsByColumn,
	timezone,
	canWrite,
	onCellClick,
	onDrop,
	showNowLineForColumn,
	nowMinutesInZone,
	emptyMessage,
}: CalendarGridProps) {
	const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);

	const { startMin, endMin } = useMemo(() => {
		const bounds: Array<{ startMin: number; endMin: number }> = [];
		for (const list of engagementsByColumn.values()) {
			for (const e of list) bounds.push(engagementBounds(e, timezone));
		}
		return computeGridRange(bounds);
	}, [engagementsByColumn, timezone]);

	const totalMinutes = endMin - startMin;
	const gridHeight = (totalMinutes / ROW_MINUTES) * ROW_PX;

	const hourMarks: number[] = [];
	for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hourMarks.push(m);
	const rowStarts: number[] = [];
	for (let m = startMin; m < endMin; m += ROW_MINUTES) rowStarts.push(m);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

	function handleDragEnd(event: DragEndEvent) {
		const engagement = event.active.data.current?.engagement as CalendarEngagement | undefined;
		const targetColumnKey = event.over?.id as string | undefined;
		if (!engagement || !targetColumnKey) return;
		const originStartMin = minutesSinceMidnightInZone(engagement.starts_at, timezone);
		const deltaMinutes = event.delta.y / PX_PER_MIN;
		const newStartMinutesInZone = snapTo15(
			Math.max(0, Math.min(24 * 60 - 15, originStartMin + deltaMinutes)),
		);
		onDrop({ engagement, targetColumnKey, newStartMinutesInZone });
	}

	if (columns.length === 0) {
		return (
			<div className="py-12 text-center text-sm text-taupe">
				{emptyMessage ?? "No staff to show."}
			</div>
		);
	}

	return (
		<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
			<div className="flex border border-pearl/24 rounded-xs overflow-hidden bg-background">
				{/* Time gutter */}
				<div className="w-14 shrink-0 border-r border-pearl/24 bg-linen/40">
					<div className="h-12 border-b border-pearl/24" />
					<div className="relative" style={{ height: gridHeight }}>
						{hourMarks.map((m) => (
							<div
								key={m}
								className="absolute left-0 right-0 -translate-y-1/2 pr-1.5 text-right text-[10px] text-taupe"
								style={{ top: minutesToTopPx(m, startMin) }}
							>
								{hourLabel(m)}
							</div>
						))}
					</div>
				</div>

				{/* Columns */}
				<div className="flex-1 flex overflow-x-auto">
					{columns.map((col) => (
						<GridColumn
							key={col.key}
							col={col}
							engagements={engagementsByColumn.get(col.key) ?? []}
							timezone={timezone}
							canWrite={canWrite}
							startMin={startMin}
							gridHeight={gridHeight}
							rowStarts={rowStarts}
							onCellClick={onCellClick}
							selectedEngagementId={selectedEngagementId}
							setSelectedEngagementId={setSelectedEngagementId}
							showNowLine={showNowLineForColumn?.(col.key) ?? false}
							nowMinutesInZone={nowMinutesInZone ?? null}
							endMin={endMin}
						/>
					))}
				</div>
			</div>
		</DndContext>
	);
}

function GridColumn({
	col,
	engagements,
	timezone,
	canWrite,
	startMin,
	endMin,
	gridHeight,
	rowStarts,
	onCellClick,
	selectedEngagementId,
	setSelectedEngagementId,
	showNowLine,
	nowMinutesInZone,
}: {
	col: CalendarColumnDef;
	engagements: CalendarEngagement[];
	timezone: string;
	canWrite: boolean;
	startMin: number;
	endMin: number;
	gridHeight: number;
	rowStarts: number[];
	onCellClick: (columnKey: string, minutesFromMidnight: number) => void;
	selectedEngagementId: string | null;
	setSelectedEngagementId: (id: string | null) => void;
	showNowLine: boolean;
	nowMinutesInZone: number | null;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: col.key });

	const lanes = useMemo(
		() => assignLanes(engagements.map((e) => ({ id: e.id, ...engagementBounds(e, timezone) }))),
		[engagements, timezone],
	);

	return (
		<div className="flex-1 min-w-[150px] border-r border-pearl/16 last:border-r-0">
			<div className="h-12 border-b border-pearl/24 flex flex-col items-center justify-center px-1 sticky top-0 bg-background z-10">
				<p className="text-xs font-semibold text-cacao truncate max-w-full">{col.label}</p>
				{col.sublabel && (
					<p className="text-[10px] text-taupe truncate max-w-full">{col.sublabel}</p>
				)}
			</div>
			<div
				ref={setNodeRef}
				className={cn("relative", isOver && "bg-amber/5")}
				style={{ height: gridHeight }}
			>
				{/* Hour gridlines + click-to-create rows (behind blocks) */}
				{rowStarts.map((rowStart) => (
					<button
						key={rowStart}
						type="button"
						disabled={!canWrite}
						onClick={() => onCellClick(col.key, rowStart)}
						className={cn(
							"absolute left-0 right-0 border-t border-pearl/14 group",
							rowStart % 60 === 0 && "border-t-pearl/28",
							canWrite && "hover:bg-amber/5",
						)}
						style={{ top: minutesToTopPx(rowStart, startMin), height: ROW_PX }}
						aria-label={canWrite ? `Create at ${col.label}` : undefined}
					>
						{canWrite && (
							<Plus
								size={11}
								className="opacity-0 group-hover:opacity-40 absolute right-1 top-1/2 -translate-y-1/2 text-taupe"
							/>
						)}
					</button>
				))}

				{showNowLine &&
					nowMinutesInZone !== null &&
					nowMinutesInZone >= startMin &&
					nowMinutesInZone <= endMin && (
						<div
							className="absolute left-0 right-0 h-px bg-amber z-20 pointer-events-none"
							style={{ top: minutesToTopPx(nowMinutesInZone, startMin) }}
						>
							<div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-amber" />
						</div>
					)}

				{engagements.map((e) => {
					const lane = lanes.get(e.id) ?? { lane: 0, laneCount: 1 };
					const { startMin: startM, endMin: endM } = engagementBounds(e, timezone);
					const widthPct = 100 / lane.laneCount;
					return (
						<Popover
							key={e.id}
							open={selectedEngagementId === e.id}
							onOpenChange={(open) => setSelectedEngagementId(open ? e.id : null)}
						>
							<PopoverAnchor className="contents">
								<EngagementBlock
									engagement={e}
									timezone={timezone}
									top={minutesToTopPx(startM, startMin)}
									height={durationToHeightPx(endM - startM)}
									left={`calc(${lane.lane * widthPct}% + 2px)`}
									width={`calc(${widthPct}% - 4px)`}
									canWrite={canWrite}
									onClick={() => setSelectedEngagementId(e.id)}
								/>
							</PopoverAnchor>
							{selectedEngagementId === e.id && (
								<EngagementDetailPopover
									engagement={e}
									timezone={timezone}
									canWrite={canWrite}
									columnEngagements={engagements}
									onSelectEngagement={setSelectedEngagementId}
								/>
							)}
						</Popover>
					);
				})}
			</div>
		</div>
	);
}
