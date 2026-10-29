"use client";

import { KIND_ORDER, KIND_STYLE, STATUS_LABEL } from "@/lib/booking/calendar-style";
import { cn } from "@materialhub/ui";

export function CalendarLegend() {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-taupe border-t border-pearl/16 pt-3">
			<div className="flex flex-wrap items-center gap-3">
				{KIND_ORDER.map((kind) => (
					<div key={kind} className="flex items-center gap-1.5">
						<span className={cn("inline-block w-2.5 h-2.5 rounded-[1px]", KIND_STYLE[kind].swatchClass)} />
						{KIND_STYLE[kind].label}
					</div>
				))}
			</div>
			<span className="hidden sm:inline text-pearl">·</span>
			<div className="flex flex-wrap items-center gap-3">
				<span className="flex items-center gap-1.5">
					<span className="inline-block w-4 h-2.5 rounded-[1px] border border-dashed border-taupe/60" />
					{STATUS_LABEL.held}
				</span>
				<span className="flex items-center gap-1.5">
					<span className="inline-block w-4 h-2.5 rounded-[1px] border border-pearl/40 bg-pearl/10" />
					{STATUS_LABEL.confirmed}
				</span>
				<span className="flex items-center gap-1.5">
					<span className="inline-block w-4 h-2.5 rounded-[1px] border-2 border-russet bg-russet/16" />
					{STATUS_LABEL.conflicted}
				</span>
			</div>
			<span className="w-full sm:w-auto text-[11px] italic">
				No cancel action here yet — contact support to cancel a booking.
			</span>
		</div>
	);
}
