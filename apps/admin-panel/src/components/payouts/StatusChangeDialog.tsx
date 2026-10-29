"use client";

import { useUpdatePayoutStatus } from "@/lib/queries/payouts";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@materialhub/ui";
import { useState } from "react";
import type { PayoutRail } from "./payout-actions.helpers";

export function StatusChangeDialog({
	open,
	onOpenChange,
	payoutId,
	status,
	rail,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	payoutId: string;
	status: "paid" | "failed";
	rail: PayoutRail | null;
}) {
	const [notes, setNotes] = useState("");
	const [reference, setReference] = useState("");
	const [error, setError] = useState<string | null>(null);
	const update = useUpdatePayoutStatus();

	const isFailed = status === "failed";
	const title = isFailed ? "Mark Failed" : "Mark Paid";

	// The server requires this on the manual rail: with no Stripe call, the
	// operator's bank reference is the only evidence the money left.
	const needsReference = status === "paid" && rail === "manual_bank_transfer";

	function onSubmit() {
		setError(null);
		if (isFailed && !notes.trim()) {
			setError("Notes are required when marking failed.");
			return;
		}
		if (needsReference && !reference.trim()) {
			setError("A bank reference is required when marking a manual transfer paid.");
			return;
		}
		update.mutate(
			{
				id: payoutId,
				status,
				notes: notes.trim() || undefined,
				reference: reference.trim() || undefined,
			},
			{
				onSuccess: () => {
					onOpenChange(false);
					setNotes("");
					setReference("");
				},
				onError: (err: unknown) => {
					const msg = (err as { response?: { data?: { message?: string } } })
						?.response?.data?.message;
					setError(msg ?? "Failed to update status");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<label htmlFor="status-notes" className="text-sm font-medium">
						Notes {isFailed && <span className="text-destructive">*</span>}
					</label>
					<textarea
						id="status-notes"
						rows={4}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder={isFailed ? "Why is this failing?" : "Optional notes…"}
						className="w-full px-3 py-2 border rounded-md text-sm"
					/>
					{needsReference && (
						<div>
							<label htmlFor="bank-reference" className="text-sm font-medium">
								Bank reference <span className="text-destructive">*</span>
							</label>
							<Input
								id="bank-reference"
								value={reference}
								onChange={(e) => setReference(e.target.value)}
								placeholder="FT26073012345"
								maxLength={255}
							/>
							<p className="text-xs text-muted-foreground mt-1">
								The transaction reference from your banking portal. Recorded as
								this payout's gateway reference, which marks it as settled and
								non-voidable.
							</p>
						</div>
					)}
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant={isFailed ? "destructive" : "default"}
						onClick={onSubmit}
						disabled={update.isPending}
					>
						{update.isPending ? "Saving…" : title}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
