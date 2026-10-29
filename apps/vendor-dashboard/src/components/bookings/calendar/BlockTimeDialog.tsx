"use client";

import { useEffect, useState } from "react";
import { useCreateBlock } from "@/lib/queries/calendar";
import type { StaffMember } from "@/lib/queries/staff";
import { dateKeyInZone, minutesSinceMidnightInZone, wallClockInZoneToIso } from "@/lib/booking/tz";
import { ZonedDateTimeFields } from "./ZonedDateTimeFields";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from "@materialhub/ui";

export interface BlockDialogPrefill {
	staffId?: string;
	startIso: string;
}

export function BlockTimeDialog({
	open,
	onOpenChange,
	timezone,
	vendorLocationId,
	staffOptions,
	prefill,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	timezone: string;
	vendorLocationId: string | undefined;
	staffOptions: StaffMember[];
	prefill: BlockDialogPrefill | null;
}) {
	const createBlock = useCreateBlock();

	const [kind, setKind] = useState<"manual_block" | "break">("manual_block");
	const [staffId, setStaffId] = useState("");
	const [dateKey, setDateKey] = useState("");
	const [startMin, setStartMin] = useState(9 * 60);
	const [durationMinutes, setDurationMinutes] = useState(30);
	const [reason, setReason] = useState("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: deliberately re-seeds only when the dialog opens.
	useEffect(() => {
		if (!open) return;
		const startIso = prefill?.startIso ?? new Date().toISOString();
		setKind("manual_block");
		setStaffId(prefill?.staffId ?? staffOptions[0]?.id ?? "");
		setDateKey(dateKeyInZone(startIso, timezone));
		setStartMin(minutesSinceMidnightInZone(startIso, timezone));
		setDurationMinutes(30);
		setReason("");
	}, [open]);

	async function submit() {
		if (!vendorLocationId) {
			toast({ title: "Select a location first", variant: "destructive" });
			return;
		}
		if (!staffId) {
			toast({ title: "Select a staff member", variant: "destructive" });
			return;
		}
		if (durationMinutes <= 0) {
			toast({ title: "Duration must be greater than 0", variant: "destructive" });
			return;
		}
		const startsAt = wallClockInZoneToIso(dateKey, startMin, timezone);
		const endsAt = wallClockInZoneToIso(dateKey, startMin + durationMinutes, timezone);
		try {
			await createBlock.mutateAsync({
				staff_member_id: staffId,
				vendor_location_id: vendorLocationId,
				starts_at: startsAt,
				ends_at: endsAt,
				kind,
				reason: reason.trim() || null,
			});
			toast({ title: kind === "break" ? "Break added" : "Time blocked" });
			onOpenChange(false);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			if (e?.response?.status === 409) {
				toast({
					title: "Overlaps an existing engagement",
					description: "Pick a different time for this staff member.",
					variant: "destructive",
				});
				return;
			}
			toast({
				title: "Could not save",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !createBlock.isPending && onOpenChange(v)}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Block time or break</DialogTitle>
					<DialogDescription>
						Removes this window from the staff member's availability. No customer is
						involved.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div>
						<Label className="text-xs">Type</Label>
						<Select value={kind} onValueChange={(v) => setKind(v as "manual_block" | "break")}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="manual_block">Blocked time (e.g. closed, stocktake)</SelectItem>
								<SelectItem value="break">Break</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div>
						<Label className="text-xs">Staff</Label>
						<Select value={staffId} onValueChange={setStaffId}>
							<SelectTrigger>
								<SelectValue placeholder="Select staff" />
							</SelectTrigger>
							<SelectContent>
								{staffOptions.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{staffOptions.length === 0 && (
							<p className="text-xs text-destructive mt-1">
								No staff are linked to this location yet.
							</p>
						)}
					</div>

					<ZonedDateTimeFields
						label="Start"
						timezone={timezone}
						dateKey={dateKey}
						minutesFromMidnight={startMin}
						onChange={(k, m) => {
							setDateKey(k);
							setStartMin(m);
						}}
					/>

					<div>
						<Label className="text-xs">Duration (minutes)</Label>
						<Input
							type="number"
							min={5}
							step={5}
							value={durationMinutes}
							onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
						/>
					</div>

					<div>
						<Label className="text-xs">Reason (optional)</Label>
						<Input
							maxLength={128}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder={kind === "break" ? "e.g. Lunch" : "e.g. Stocktake"}
						/>
					</div>
				</div>

				<DialogFooter className="mt-2">
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createBlock.isPending}>
						Cancel
					</Button>
					<Button type="button" onClick={submit} disabled={createBlock.isPending}>
						{createBlock.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
