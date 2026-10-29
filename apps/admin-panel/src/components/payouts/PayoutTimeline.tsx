"use client";

import type { AuditLogRow } from "@/lib/queries/payouts";
import { Skeleton } from "@materialhub/ui";
import {
	isAlarmAction,
	metadataEntries,
	payoutActionLabel,
} from "./payout-timeline.helpers";

function formatActor(row: AuditLogRow) {
	if (row.actor_role === "system" || !row.actor_id) return "System";
	return row.actor_id;
}

function formatChange(row: AuditLogRow) {
	if (row.action === "payout.status_changed" && row.changes?.status) {
		const { old: o, new: n } = row.changes.status;
		return `${o} → ${n}`;
	}
	return null;
}

export function PayoutTimeline({
	rows,
	isLoading,
}: {
	rows: AuditLogRow[];
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-12" />
				<Skeleton className="h-12" />
				<Skeleton className="h-12" />
			</div>
		);
	}
	if (!rows.length) {
		return (
			<p className="text-sm text-muted-foreground">No timeline entries yet.</p>
		);
	}
	return (
		<ol className="border-l border-muted pl-4 space-y-4">
			{rows.map((row) => {
				const alarm = isAlarmAction(row.action);
				const change = formatChange(row);
				const meta = metadataEntries(row.metadata);
				const note =
					typeof row.metadata?.note === "string"
						? (row.metadata.note as string)
						: null;
				return (
					<li key={row.id} className="relative">
						<span
							className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full ${
								alarm ? "bg-destructive" : "bg-primary"
							}`}
						/>
						<p
							className={`text-sm font-medium ${alarm ? "text-destructive" : ""}`}
						>
							{payoutActionLabel(row.action)}
						</p>
						{change && <p className="text-xs text-muted-foreground">{change}</p>}
						{note && <p className="text-sm mt-1 whitespace-pre-wrap">{note}</p>}
						{meta.length > 0 && (
							<dl
								className={`mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs ${
									alarm
										? "rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5"
										: ""
								}`}
							>
								{meta.map((m) => (
									<div key={m.key} className="contents">
										<dt className="text-muted-foreground">{m.label}</dt>
										<dd className="font-mono break-all">{m.value}</dd>
									</div>
								))}
							</dl>
						)}
						<p className="text-xs text-muted-foreground mt-1">
							{formatActor(row)}{" "}
							{new Date(row.created_at).toLocaleString("en-AE")}
						</p>
					</li>
				);
			})}
		</ol>
	);
}
