"use client";

import { useVoidPayout } from "@/lib/queries/payouts";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@materialhub/ui";
import { useState } from "react";
import { voidErrorMessage } from "./payout-actions.helpers";

export function VoidPayoutDialog({
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
	const voidPayout = useVoidPayout();

	function onSubmit() {
		setError(null);
		if (!reason.trim()) {
			setError("A reason is required to void a payout.");
			return;
		}
		voidPayout.mutate(
			{ id: payoutId, reason: reason.trim() },
			{
				onSuccess: () => {
					onOpenChange(false);
					setReason("");
				},
				onError: (err: unknown) => setError(voidErrorMessage(err)),
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Void Failed Payout</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						This payout failed with no gateway reference, so no money left the
						platform. Voiding releases its claimed commissions, adjustments and
						licence holds back into the payable pool so a future payout can pick
						them up, and soft-deletes this payout. No money moves.
					</p>
					<p className="text-sm text-muted-foreground">
						Without this, the commissions this payout claimed stay locked to it
						forever and the vendor can never be paid for them.
					</p>
					<label htmlFor="void-reason" className="text-sm font-medium">
						Reason <span className="text-destructive">*</span>
					</label>
					<textarea
						id="void-reason"
						rows={4}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Why is this failed payout being voided?"
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
						disabled={voidPayout.isPending}
					>
						{voidPayout.isPending ? "Voiding…" : "Void payout"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
