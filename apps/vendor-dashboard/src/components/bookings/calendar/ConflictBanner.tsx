"use client";

import type { CalendarEngagement } from "@/lib/queries/calendar";
import { formatDayLabelInZone, formatTimeInZone } from "@/lib/booking/tz";
import { WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * Persistent alert banner listing every `conflicted` engagement in the
 * currently-fetched range — each one is an iCal-collision the vendor must
 * resolve by hand (two customers, one chair). Deliberately NOT a toast (it
 * would disappear) and NOT folded into the grid alone (a vendor scanning a
 * busy day could miss a single red block) — this stays pinned above the grid
 * for as long as any conflict exists in range, per the brief.
 */
export function ConflictBanner({
	conflicts,
	timezone,
	staffNameById,
}: {
	conflicts: CalendarEngagement[];
	timezone: string;
	staffNameById: Map<string, string>;
}) {
	const [collapsed, setCollapsed] = useState(false);

	if (conflicts.length === 0) return null;

	return (
		<div className="rounded-xs border-2 border-russet bg-russet/8 px-3 py-2.5">
			<button
				type="button"
				className="flex items-center gap-2 w-full text-left"
				onClick={() => setCollapsed((c) => !c)}
			>
				<WarningCircle size={18} weight="fill" className="text-russet shrink-0" />
				<p className="text-sm font-semibold text-russet flex-1">
					{conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} need attention — two
					customers, one chair
				</p>
				<span className="text-xs text-russet underline">{collapsed ? "Show" : "Hide"}</span>
			</button>
			{!collapsed && (
				<ul className="mt-2 space-y-1 text-xs text-russet">
					{conflicts.map((c) => (
						<li key={c.id} className="flex items-center gap-1.5">
							<span className="font-medium">
								{staffNameById.get(c.staff_member_id) ?? "Unknown staff"}
							</span>
							<span>·</span>
							<span>{formatDayLabelInZone(c.starts_at, timezone)}</span>
							<span>
								{formatTimeInZone(c.starts_at, timezone)}–{formatTimeInZone(c.ends_at, timezone)}
							</span>
							<span>·</span>
							<span>{c.booking?.customer_name ?? c.external_source ?? c.kind}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
