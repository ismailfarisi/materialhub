"use client";

import type { CalendarEngagement } from "@/lib/queries/calendar";
import { formatDayLabelInZone, formatTimeInZone } from "@/lib/booking/tz";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@materialhub/ui";

export interface PendingReschedule {
	engagement: CalendarEngagement;
	newStartIso: string;
	newEndIso: string;
	targetStaffId: string;
	targetStaffName: string;
}

export function RescheduleConfirmDialog({
	pending,
	timezone,
	busy,
	onConfirm,
	onClose,
}: {
	pending: PendingReschedule | null;
	timezone: string;
	busy: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const open = !!pending;
	const staffChanged = pending && pending.targetStaffId !== pending.engagement.staff_member_id;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Move this booking?</DialogTitle>
					{pending && (
						<DialogDescription asChild>
							<div className="space-y-2 text-sm text-cacao">
								<p>
									{pending.engagement.booking?.customer_name ??
										pending.engagement.booking?.service_name ??
										"This booking"}
								</p>
								<p>
									<span className="text-taupe">From </span>
									{formatDayLabelInZone(pending.engagement.starts_at, timezone)}{" "}
									{formatTimeInZone(pending.engagement.starts_at, timezone)}–
									{formatTimeInZone(pending.engagement.ends_at, timezone)}
								</p>
								<p>
									<span className="text-taupe">To </span>
									{formatDayLabelInZone(pending.newStartIso, timezone)}{" "}
									{formatTimeInZone(pending.newStartIso, timezone)}–
									{formatTimeInZone(pending.newEndIso, timezone)}
									{staffChanged && <> · {pending.targetStaffName}</>}
								</p>
							</div>
						</DialogDescription>
					)}
				</DialogHeader>
				<DialogFooter className="mt-2">
					<Button type="button" variant="outline" disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<Button type="button" disabled={busy} onClick={onConfirm}>
						{busy ? "Moving…" : "Move booking"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
