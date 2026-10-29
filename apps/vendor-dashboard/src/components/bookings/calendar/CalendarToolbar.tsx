"use client";

import type { StaffMember } from "@/lib/queries/staff";
import type { VendorLocation } from "@/lib/queries/locations";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	cn,
} from "@materialhub/ui";
import { CalendarPlus, CaretLeft, CaretRight, Prohibit } from "@phosphor-icons/react";

export type CalendarView = "day" | "week";

export function CalendarToolbar({
	view,
	onViewChange,
	rangeLabel,
	onPrev,
	onNext,
	onToday,
	locations,
	selectedLocationId,
	onLocationChange,
	staff,
	selectedStaffId,
	onStaffChange,
	staffFilterRequired,
	canWrite,
	onNewWalkIn,
	onNewBlock,
}: {
	view: CalendarView;
	onViewChange: (v: CalendarView) => void;
	rangeLabel: string;
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	locations: VendorLocation[];
	selectedLocationId: string | undefined;
	onLocationChange: (id: string) => void;
	staff: StaffMember[];
	selectedStaffId: string;
	onStaffChange: (id: string) => void;
	/** Week view has no "all staff" option — a single staff member is mandatory. */
	staffFilterRequired: boolean;
	canWrite: boolean;
	onNewWalkIn: () => void;
	onNewBlock: () => void;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 justify-between">
				<div className="flex items-center gap-2">
					<div className="flex rounded-xs border border-pearl/28 overflow-hidden">
						{(["day", "week"] as const).map((v) => (
							<button
								key={v}
								type="button"
								onClick={() => onViewChange(v)}
								className={cn(
									"px-3 py-1.5 text-xs font-medium capitalize transition-colors",
									view === v ? "bg-amber text-espresso" : "bg-transparent text-taupe hover:bg-pearl/10",
								)}
							>
								{v}
							</button>
						))}
					</div>
					<div className="flex items-center gap-1">
						<Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev} aria-label="Earlier">
							<CaretLeft size={14} />
						</Button>
						<Button variant="outline" size="sm" className="h-8 text-xs" onClick={onToday}>
							Today
						</Button>
						<Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext} aria-label="Later">
							<CaretRight size={14} />
						</Button>
					</div>
					<p className="text-sm font-semibold text-cacao ml-1">{rangeLabel}</p>
				</div>

				{canWrite && (
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant="outline" onClick={onNewBlock}>
							<Prohibit size={14} className="mr-1.5" /> Block time
						</Button>
						<Button type="button" size="sm" onClick={onNewWalkIn}>
							<CalendarPlus size={14} className="mr-1.5" /> New walk-in
						</Button>
					</div>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<div className="w-48">
					<Select value={selectedLocationId} onValueChange={onLocationChange}>
						<SelectTrigger className="h-9 text-xs">
							<SelectValue placeholder="Select a location" />
						</SelectTrigger>
						<SelectContent>
							{locations.map((l) => (
								<SelectItem key={l.id} value={l.id}>
									{l.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="w-48">
					<Select
						value={selectedStaffId || "__all__"}
						onValueChange={(v) => onStaffChange(v === "__all__" ? "" : v)}
					>
						<SelectTrigger className="h-9 text-xs">
							<SelectValue placeholder="Select staff" />
						</SelectTrigger>
						<SelectContent>
							{!staffFilterRequired && <SelectItem value="__all__">All staff</SelectItem>}
							{staff.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
