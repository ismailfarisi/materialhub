"use client";

import { useEffect, useState } from "react";
import { useCreateManualBooking } from "@/lib/queries/calendar";
import type { StaffMember } from "@/lib/queries/staff";
import type { ServiceOffering } from "@/lib/queries/offerings";
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
	Textarea,
	toast,
} from "@materialhub/ui";

export interface WalkInDialogPrefill {
	staffId?: string;
	startIso: string;
}

export function WalkInDialog({
	open,
	onOpenChange,
	timezone,
	vendorLocationId,
	staffOptions,
	services,
	prefill,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	timezone: string;
	vendorLocationId: string | undefined;
	staffOptions: StaffMember[];
	services: ServiceOffering[];
	prefill: WalkInDialogPrefill | null;
}) {
	const createBooking = useCreateManualBooking();

	const [kind, setKind] = useState<"walk_in" | "phone">("walk_in");
	const [staffId, setStaffId] = useState("");
	const [serviceId, setServiceId] = useState<string>("");
	const [dateKey, setDateKey] = useState("");
	const [startMin, setStartMin] = useState(9 * 60);
	const [durationMinutes, setDurationMinutes] = useState(30);
	const [customerName, setCustomerName] = useState("");
	const [customerPhone, setCustomerPhone] = useState("");
	const [notes, setNotes] = useState("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: deliberately re-seeds only when the dialog opens, not on every prefill/staffOptions re-render.
	useEffect(() => {
		if (!open) return;
		const startIso = prefill?.startIso ?? new Date().toISOString();
		setKind("walk_in");
		setStaffId(prefill?.staffId ?? staffOptions[0]?.id ?? "");
		setServiceId("");
		setDateKey(dateKeyInZone(startIso, timezone));
		setStartMin(minutesSinceMidnightInZone(startIso, timezone));
		setDurationMinutes(30);
		setCustomerName("");
		setCustomerPhone("");
		setNotes("");
	}, [open]);

	function handleServiceChange(id: string) {
		setServiceId(id);
		const svc = services.find((s) => s.id === id);
		if (svc) setDurationMinutes(svc.duration_minutes);
	}

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
			await createBooking.mutateAsync({
				staff_member_id: staffId,
				vendor_location_id: vendorLocationId,
				service_id: serviceId || null,
				starts_at: startsAt,
				ends_at: endsAt,
				kind,
				customer_name: customerName.trim() || null,
				customer_phone: customerPhone.trim() || null,
				notes: notes.trim() || null,
			});
			toast({ title: kind === "walk_in" ? "Walk-in added" : "Phone booking added" });
			onOpenChange(false);
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not create booking",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !createBooking.isPending && onOpenChange(v)}>
			<DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>New walk-in or phone booking</DialogTitle>
					<DialogDescription>
						Records the customer directly against the schedule — no online payment happens
						through this dialog.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div>
						<Label className="text-xs">Type</Label>
						<Select value={kind} onValueChange={(v) => setKind(v as "walk_in" | "phone")}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="walk_in">Walk-in</SelectItem>
								<SelectItem value="phone">Phone</SelectItem>
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

					<div>
						<Label className="text-xs">Service (optional)</Label>
						<Select value={serviceId || "__none__"} onValueChange={(v) => handleServiceChange(v === "__none__" ? "" : v)}>
							<SelectTrigger>
								<SelectValue placeholder="No service selected" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__none__">No service selected</SelectItem>
								{services.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name} · {s.duration_minutes} min
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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

					<div className="grid grid-cols-2 gap-2">
						<div>
							<Label className="text-xs">Customer name (optional)</Label>
							<Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
						</div>
						<div>
							<Label className="text-xs">Customer phone (optional)</Label>
							<Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
						</div>
					</div>

					<div>
						<Label className="text-xs">Notes (optional)</Label>
						<Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
					</div>
				</div>

				<DialogFooter className="mt-2">
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createBooking.isPending}>
						Cancel
					</Button>
					<Button type="button" onClick={submit} disabled={createBooking.isPending}>
						{createBooking.isPending ? "Saving…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
