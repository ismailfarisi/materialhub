"use client";

import { useMemo, useState } from "react";
import type { CalendarEngagement } from "@/lib/queries/calendar";
import {
	useCompleteBooking,
	useDeleteBlock,
	useNoShowBooking,
} from "@/lib/queries/calendar";
import { KIND_STYLE, STATUS_LABEL } from "@/lib/booking/calendar-style";
import { formatTimeInZone } from "@/lib/booking/tz";
import { engagementLabel } from "./EngagementBlock";
import {
	Button,
	ConfirmDialog,
	PopoverContent,
	StatusBadge,
	Textarea,
	toast,
} from "@materialhub/ui";

const STATUS_COLORS: Record<string, string> = {
	held: "bg-taupe/10 text-taupe border border-taupe/30",
	confirmed: "bg-amber/10 text-amber border border-amber/30",
	conflicted: "bg-russet/10 text-russet border border-russet/30",
};

const PAYMENT_MODE_LABEL: Record<string, string> = {
	prepay: "Prepay",
	deposit: "Deposit",
	pay_at_venue: "Pay at venue",
};

const NO_SHOW_GRACE_HOURS = 24; // documented client-side approximation of the server's grace window

function apiErrorMessage(err: unknown, fallback: string): string {
	const e = err as { response?: { data?: { message?: string } } };
	return e?.response?.data?.message ?? fallback;
}

// Fix cycle 1 (Minor 4): client-side time-range intersection against the
// already-loaded calendar rows for this column (same staff member, by
// construction — day columns are per-staff and week view requires a single
// selected staff upstream). Half-open interval overlap: [s1,e1) x [s2,e2).
function findOverlappingEngagements(
	target: CalendarEngagement,
	candidates: CalendarEngagement[],
): CalendarEngagement[] {
	const startMs = new Date(target.starts_at).getTime();
	const endMs = new Date(target.ends_at).getTime();
	return candidates.filter((o) => {
		if (o.id === target.id || o.staff_member_id !== target.staff_member_id) return false;
		const oStartMs = new Date(o.starts_at).getTime();
		const oEndMs = new Date(o.ends_at).getTime();
		return oStartMs < endMs && startMs < oEndMs;
	});
}

export function EngagementDetailPopover({
	engagement,
	timezone,
	canWrite,
	columnEngagements,
	onSelectEngagement,
}: {
	engagement: CalendarEngagement;
	timezone: string;
	canWrite: boolean;
	/** All engagements currently loaded in this engagement's grid column (same staff). */
	columnEngagements: CalendarEngagement[];
	/** Selects (and thereby opens the popover for) another loaded engagement. */
	onSelectEngagement: (id: string) => void;
}) {
	const [noShowOpen, setNoShowOpen] = useState(false);
	const [noShowReason, setNoShowReason] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);

	const completeMutation = useCompleteBooking();
	const noShowMutation = useNoShowBooking();
	const deleteBlock = useDeleteBlock();

	const kindStyle = KIND_STYLE[engagement.kind];
	const booking = engagement.booking;
	const now = Date.now();
	const startsAtMs = new Date(engagement.starts_at).getTime();
	const endsAtMs = new Date(engagement.ends_at).getTime();
	const noShowWindowEndsMs = endsAtMs + NO_SHOW_GRACE_HOURS * 60 * 60 * 1000;

	// Fix cycle 1 (Minor 4): for a conflicted engagement, surface every
	// overlapping row for the same staff. For a non-conflicted (e.g.
	// confirmed) engagement, surface it only when the thing it overlaps is
	// itself flagged conflicted — the "other side" of the collision.
	const overlaps = useMemo(
		() => findOverlappingEngagements(engagement, columnEngagements),
		[engagement, columnEngagements],
	);
	const conflictCounterparts =
		engagement.status === "conflicted" ? overlaps : overlaps.filter((o) => o.status === "conflicted");

	const isBlockKind = engagement.kind === "manual_block" || engagement.kind === "break";
	const canComplete = canWrite && booking?.status === "confirmed";
	const completeDisabled = now < startsAtMs;
	const canNoShow =
		canWrite && booking?.status === "confirmed" && now >= startsAtMs && now < noShowWindowEndsMs;
	const isHomeVisit = !!booking && booking.location_id === null;

	async function handleComplete() {
		if (!booking) return;
		try {
			await completeMutation.mutateAsync(booking.id);
			toast({ title: "Marked complete" });
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { error?: string } } };
			if (e?.response?.data?.error === "complete_window") {
				toast({
					title: "Can't complete yet",
					description: "This booking hasn't started yet.",
					variant: "destructive",
				});
			} else {
				toast({
					title: "Could not mark complete",
					description: apiErrorMessage(err, "Please try again."),
					variant: "destructive",
				});
			}
		}
	}

	async function handleNoShow() {
		if (!booking) return;
		try {
			const result = await noShowMutation.mutateAsync({
				bookingId: booking.id,
				reason: noShowReason.trim() || undefined,
			});
			toast({
				title: "Marked as no-show",
				description: `Forfeit: AED ${(result.forfeit_fils / 100).toFixed(2)} · Refund: AED ${(result.refund_fils / 100).toFixed(2)} (${result.action})`,
			});
			setNoShowOpen(false);
			setNoShowReason("");
		} catch (err: unknown) {
			const e = err as { response?: { data?: { error?: string } } };
			const code = e?.response?.data?.error;
			if (code === "no_show_window") {
				toast({
					title: "Outside the no-show window",
					description: "This booking is no longer eligible to be marked as a no-show.",
					variant: "destructive",
				});
			} else if (code === "invalid_booking_transition") {
				toast({
					title: "Can't mark no-show",
					description: "This booking is no longer in a state that allows this.",
					variant: "destructive",
				});
			} else {
				toast({
					title: "Could not mark no-show",
					description: apiErrorMessage(err, "Please try again."),
					variant: "destructive",
				});
			}
		}
	}

	async function handleDeleteBlock() {
		try {
			await deleteBlock.mutateAsync(engagement.id);
			toast({ title: engagement.kind === "break" ? "Break removed" : "Block removed" });
		} catch (err: unknown) {
			toast({
				title: "Could not remove",
				description: apiErrorMessage(err, "Please try again."),
				variant: "destructive",
			});
		}
	}

	return (
		<PopoverContent side="right" align="start" className="w-80 space-y-3">
			<div className="flex items-start justify-between gap-2">
				<div>
					<p className="text-xs uppercase tracking-wide text-taupe">{kindStyle.label}</p>
					<p className="text-sm font-semibold text-cacao">{engagementLabel(engagement)}</p>
				</div>
				<StatusBadge status={engagement.status} colorMap={STATUS_COLORS} />
			</div>

			<p className="text-xs text-taupe">
				{formatTimeInZone(engagement.starts_at, timezone)} – {formatTimeInZone(engagement.ends_at, timezone)}
			</p>

			{engagement.status === "conflicted" && (
				<p className="text-xs text-russet bg-russet/8 border border-russet/25 rounded-xs px-2 py-1.5">
					This overlaps another engagement for the same staff member — two customers, one
					chair. Resolve by editing or removing one of them.
				</p>
			)}

			{conflictCounterparts.length > 0 && (
				<div className="space-y-1 rounded-xs border border-russet/25 bg-russet/5 px-2 py-1.5">
					<p className="text-[10px] font-semibold uppercase tracking-wide text-russet">
						Conflicts with
					</p>
					{conflictCounterparts.map((o) => (
						<button
							key={o.id}
							type="button"
							onClick={() => onSelectEngagement(o.id)}
							className="block w-full text-left text-xs text-cacao hover:text-russet hover:underline"
						>
							<span className="font-medium">{KIND_STYLE[o.kind].label}</span>
							{" — "}
							{engagementLabel(o)}
							{" · "}
							{formatTimeInZone(o.starts_at, timezone)}–
							{formatTimeInZone(o.ends_at, timezone)}
						</button>
					))}
				</div>
			)}

			{booking && (
				<div className="space-y-1 text-xs text-cacao">
					<Row label="Booking #" value={booking.booking_number} />
					<Row label="Service" value={booking.service_name} />
					{booking.customer_name && <Row label="Customer" value={booking.customer_name} />}
					<Row label="Payment" value={PAYMENT_MODE_LABEL[booking.payment_mode] ?? booking.payment_mode} />
					<Row label="Price" value={`AED ${(booking.price_fils / 100).toFixed(2)}`} />
					{booking.notes && <Row label="Notes" value={booking.notes} />}
					{booking.status === "pending_payment" && (
						<p className="text-taupe italic">
							Payment pending — this hold clears automatically if checkout isn't completed.
						</p>
					)}
				</div>
			)}

			{isBlockKind && (
				<p className="text-xs text-cacao">
					Reason: {engagement.external_source || <span className="text-taupe">Not given</span>}
				</p>
			)}

			{engagement.kind === "external_import" && (
				<p className="text-xs text-taupe">
					Synced from an external calendar. Edit or remove it at the source calendar — changes
					here aren't possible.
				</p>
			)}

			{/* "Why can't I drag this" — addressed inline per engagement kind, since
			    there's no live drag-gesture to intercept for kinds that never
			    register as draggable (see EngagementBlock.tsx / calendar-style.ts). */}
			{engagement.kind === "walk_in" || engagement.kind === "phone" ? (
				<p className="text-[11px] text-taupe italic">
					Walk-in and phone bookings can't be dragged to reschedule — cancel and recreate
					instead.
				</p>
			) : engagement.kind === "marketplace_booking" && isHomeVisit ? (
				<p className="text-[11px] text-taupe italic">
					Home-visit bookings can't be dragged to reschedule from here — cancel and recreate if
					the time needs to change.
				</p>
			) : isBlockKind ? (
				<p className="text-[11px] text-taupe italic">Delete and recreate to move a block.</p>
			) : null}

			{booking && booking.status === "confirmed" && (
				<p className="text-[11px] text-taupe italic">
					No cancel action here yet — contact support to cancel this booking.
				</p>
			)}

			{canWrite && (canComplete || canNoShow || isBlockKind) && (
				<div className="flex flex-wrap gap-1.5 pt-1 border-t border-pearl/20">
					{canComplete && (
						<Button
							type="button"
							size="sm"
							className="h-7 text-xs"
							disabled={completeDisabled || completeMutation.isPending}
							title={completeDisabled ? "Can't complete before the booking starts" : undefined}
							onClick={handleComplete}
						>
							Mark complete
						</Button>
					)}
					{canNoShow && !noShowOpen && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							onClick={() => setNoShowOpen(true)}
						>
							Mark no-show
						</Button>
					)}
					{isBlockKind && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-7 text-xs text-destructive"
							onClick={() => setDeleteOpen(true)}
						>
							Delete
						</Button>
					)}
				</div>
			)}

			{noShowOpen && (
				<div className="space-y-2 rounded-md border border-amber/30 bg-amber/5 p-2">
					<Textarea
						placeholder="Reason (optional)"
						rows={2}
						value={noShowReason}
						onChange={(e) => setNoShowReason(e.target.value)}
						className="text-xs"
					/>
					<div className="flex gap-1.5">
						<Button
							type="button"
							size="sm"
							className="h-7 flex-1 text-xs"
							disabled={noShowMutation.isPending}
							onClick={handleNoShow}
						>
							Confirm no-show
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-7 flex-1 text-xs"
							onClick={() => setNoShowOpen(false)}
							disabled={noShowMutation.isPending}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			<ConfirmDialog
				open={deleteOpen}
				title={engagement.kind === "break" ? "Remove this break?" : "Remove this block?"}
				description="This frees the slot immediately."
				confirmLabel="Remove"
				destructive
				busy={deleteBlock.isPending}
				onConfirm={handleDeleteBlock}
				onClose={() => setDeleteOpen(false)}
			/>
		</PopoverContent>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-2">
			<span className="text-taupe">{label}</span>
			<span className="font-medium text-right">{value}</span>
		</div>
	);
}
