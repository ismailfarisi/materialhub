"use client";

import { useRejectDraft } from "@/lib/queries/payouts";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@materialhub/ui";
import { useState } from "react";

export function RejectDraftDialog({
	open,
	onOpenChange,
	payoutId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	payoutId: string;
}) {
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const reject = useRejectDraft();

	function onSubmit() {
		setError(null);
		if (!reason.trim()) {
			setError("A reason is required to reject a draft.");
			return;
		}
		reject.mutate(
			{ id: payoutId, reason: reason.trim() },
			{
				onSuccess: () => {
					onOpenChange(false);
					setReason("");
				},
				onError: (err: unknown) => {
					const msg = (err as { response?: { data?: { message?: string } } })
						?.response?.data?.message;
					setError(msg ?? "Failed to reject payout");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reject Draft Payout</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						Rejecting releases this draft's claimed commissions and
						adjustments back into the payable pool so they can be picked up
						by a future payout, and soft-deletes the draft. No money moves.
					</p>
					<label htmlFor="reject-reason" className="text-sm font-medium">
						Reason <span className="text-destructive">*</span>
					</label>
					<textarea
						id="reject-reason"
						rows={4}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Why is this draft being rejected?"
						className="w-full px-3 py-2 border rounded-md text-sm"
					/>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onSubmit}
						disabled={reject.isPending}
					>
						{reject.isPending ? "Rejecting…" : "Reject Draft"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
