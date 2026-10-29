"use client";

import { useAdjustDraft } from "@/lib/queries/payouts";
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
import { signedAedToFils } from "./payout-actions.helpers";

function formatAed(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

export function AdjustDraftDialog({
	open,
	onOpenChange,
	payoutId,
	currentNetFils,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	payoutId: string;
	currentNetFils: number;
}) {
	const [amountAed, setAmountAed] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const adjust = useAdjustDraft();

	// Signed: negative claws back, positive credits. signedAedToFils rounds
	// rather than truncates — 12.34 * 100 is 1233.9999999999998 in float, and
	// a silent one-fil drift in a payout is a reconciliation failure later.
	const amountFils = signedAedToFils(amountAed);
	const nextNet = currentNetFils + amountFils;
	const netNotPositive = amountFils !== 0 && nextNet <= 0;

	const canSubmit =
		amountFils !== 0 && !!reason.trim() && !netNotPositive && !adjust.isPending;

	function onSubmit() {
		setError(null);
		adjust.mutate(
			{ id: payoutId, amountFils, reason: reason.trim() },
			{
				onSuccess: () => {
					onOpenChange(false);
					setAmountAed("");
					setReason("");
				},
				onError: (err: unknown) => {
					const msg = (err as { response?: { data?: { message?: string } } })
						?.response?.data?.message;
					setError(msg ?? "Failed to adjust draft");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Adjust Draft Amount</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						Writes an adjustment settled against this draft and changes its net.
						For a correction that should land in the vendor's <em>next</em>{" "}
						payout, use the adjustment ledger on the vendor page instead.
					</p>
					<div>
						<label htmlFor="adj-amount" className="text-sm font-medium">
							Amount (AED, negative to claw back)
						</label>
						<Input
							id="adj-amount"
							type="number"
							step="0.01"
							value={amountAed}
							onChange={(e) => setAmountAed(e.target.value)}
							placeholder="-25.00"
						/>
					</div>
					<div>
						<label htmlFor="adj-reason" className="text-sm font-medium">
							Reason
						</label>
						<Input
							id="adj-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Damaged goods credit"
							maxLength={255}
						/>
					</div>
					<div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Current net</span>
							<span>{formatAed(currentNetFils)}</span>
						</div>
						<div className="flex justify-between font-semibold pt-1 border-t">
							<span>New net</span>
							<span>{formatAed(nextNet)}</span>
						</div>
					</div>
					{netNotPositive && (
						<p className="text-sm text-destructive">
							This adjustment would leave a net of {formatAed(nextNet)}. A payout
							must be positive — reject the draft instead, and the balance will
							net against the vendor's next period.
						</p>
					)}
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={!canSubmit}>
						{adjust.isPending ? "Adjusting…" : "Apply adjustment"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
