"use client";

import {
	useCreateTimeOff,
	useDeleteTimeOff,
	useTimeOff,
} from "@/lib/queries/working-hours";
import { Button, EmptyState, Input, Label, Textarea, toast } from "@materialhub/ui";
import { CalendarX, Trash } from "@phosphor-icons/react";
import { useState } from "react";

// starts_at/ends_at are sent as ISO instants (constraint: task-5-brief.md).
// Rendered in Asia/Dubai — the platform default timezone — for a simple,
// consistent display rather than resolving a per-location timezone for a
// staff-wide (not location-scoped) time-off entry.
function formatDubai(iso: string): string {
	try {
		return new Date(iso).toLocaleString("en-AE", {
			timeZone: "Asia/Dubai",
			dateStyle: "medium",
			timeStyle: "short",
		});
	} catch {
		return iso;
	}
}

// Fix-cycle-1 finding I-1 — Dubai has been a fixed UTC+4 offset with no DST
// since 1972, so this static-offset conversion is exact, not an
// approximation. `<input type="datetime-local">` values ("YYYY-MM-DDTHH:mm")
// have no offset of their own; `new Date(value)` (the previous code) parses
// them in the BROWSER's local timezone, not Dubai's — so a vendor on a
// non-Dubai-timezone browser typing "09:00" (meaning 9am Dubai) got an
// instant computed from their own OS offset, which then rendered back
// through formatDubai() above as a DIFFERENT Dubai wall-clock time. This
// helper interprets the input as Dubai wall-clock explicitly (regex-parsed,
// never routed through the Date constructor's local-tz parsing), so both
// directions of the round-trip now agree regardless of the vendor's browser
// timezone.
const DUBAI_UTC_OFFSET_HOURS = 4;

function dubaiWallClockToIso(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
	if (!match) throw new Error(`Invalid datetime-local value: ${value}`);
	const [, year, month, day, hour, minute] = match;
	const utcMs = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour) - DUBAI_UTC_OFFSET_HOURS,
		Number(minute),
	);
	return new Date(utcMs).toISOString();
}

export function TimeOffPanel({ staffId, canWrite }: { staffId: string; canWrite: boolean }) {
	const { data: entries = [], isLoading } = useTimeOff(staffId);
	const createTimeOff = useCreateTimeOff(staffId);
	const deleteTimeOff = useDeleteTimeOff(staffId);

	const [adding, setAdding] = useState(false);
	const [startsAt, setStartsAt] = useState("");
	const [endsAt, setEndsAt] = useState("");
	const [reason, setReason] = useState("");

	async function submit() {
		if (!startsAt || !endsAt) {
			toast({ title: "Start and end are required", variant: "destructive" });
			return;
		}
		let startIso: string;
		let endIso: string;
		try {
			startIso = dubaiWallClockToIso(startsAt);
			endIso = dubaiWallClockToIso(endsAt);
		} catch {
			toast({ title: "Invalid date/time", variant: "destructive" });
			return;
		}
		if (startIso >= endIso) {
			toast({
				title: "Invalid range",
				description: "Start must be before end.",
				variant: "destructive",
			});
			return;
		}
		try {
			await createTimeOff.mutateAsync({
				starts_at: startIso,
				ends_at: endIso,
				reason: reason.trim() || undefined,
			});
			toast({ title: "Time off added" });
			setAdding(false);
			setStartsAt("");
			setEndsAt("");
			setReason("");
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not add time off",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	async function remove(id: string) {
		try {
			await deleteTimeOff.mutateAsync(id);
			toast({ title: "Time off removed" });
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not remove time off",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-taupe">
				One-off blocks (vacation, sick leave) that override the weekly
				schedule. Times are entered and shown in Asia/Dubai, regardless of
				your browser's timezone.
			</p>

			{canWrite && !adding && (
				<Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
					Add time off
				</Button>
			)}

			{canWrite && adding && (
				<div className="grid grid-cols-2 gap-3 rounded-lg border border-amber/30 bg-amber/5 p-3">
					<div>
						<Label className="text-xs">Starts (Asia/Dubai)</Label>
						<Input
							type="datetime-local"
							value={startsAt}
							onChange={(e) => setStartsAt(e.target.value)}
						/>
					</div>
					<div>
						<Label className="text-xs">Ends (Asia/Dubai)</Label>
						<Input
							type="datetime-local"
							value={endsAt}
							onChange={(e) => setEndsAt(e.target.value)}
						/>
					</div>
					<div className="col-span-2">
						<Label className="text-xs">Reason (optional)</Label>
						<Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
					</div>
					<div className="col-span-2 flex gap-2">
						<Button type="button" size="sm" disabled={createTimeOff.isPending} onClick={submit}>
							Save
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setAdding(false)}
							disabled={createTimeOff.isPending}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			{!isLoading && entries.length === 0 ? (
				<EmptyState
					icon={<CalendarX size={40} />}
					title="No time off scheduled"
					description={
						canWrite
							? "Add a block for vacation or sick leave."
							: "This staff member has no time off scheduled."
					}
				/>
			) : (
				<div className="rounded-lg border border-pearl/14 divide-y divide-pearl/14">
					{entries.map((entry) => (
						<div key={entry.id} className="flex items-center justify-between px-4 py-3">
							<div>
								<p className="text-sm font-medium">
									{formatDubai(entry.starts_at)} – {formatDubai(entry.ends_at)}
								</p>
								{entry.reason && (
									<p className="text-xs text-muted-foreground">{entry.reason}</p>
								)}
							</div>
							{canWrite && (
								<Button
									variant="ghost"
									size="sm"
									aria-label="Remove time off"
									onClick={() => remove(entry.id)}
									disabled={deleteTimeOff.isPending}
								>
									<Trash size={16} />
								</Button>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
