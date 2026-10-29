"use client";

import { parseAedInput } from "@/lib/money";
import { useCreateAdjustment } from "@/lib/queries/payouts";
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
import {
	type AdjustmentDirection as Direction,
	toSignedAdjustmentFils,
} from "./CreateAdjustmentDialog.helpers";

// Display only, same local convention as the other payouts dialogs/pages.
function formatAed(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

export function CreateAdjustmentDialog({
	open,
	onOpenChange,
	vendorId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vendorId: string;
}) {
	// The admin only ever types a positive magnitude in AED — the toggle,
	// not the keyboard, decides whether it adds to or claws back from the
	// vendor's balance. There is no minus-sign path into this field.
	const [amountAed, setAmountAed] = useState("");
	const [direction, setDirection] = useState<Direction | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const create = useCreateAdjustment();

	// parseAedInput does exactly Math.round(aed * 100) and rejects negative
	// or unparsable input; toSignedAdjustmentFils (tested in
	// CreateAdjustmentDialog.helpers.test.ts) then applies the sign from the
	// explicit toggle above — never from anything the admin typed.
	const magnitudeFils = parseAedInput(amountAed);
	const signedFils = toSignedAdjustmentFils(amountAed, direction);

	function reset() {
		setAmountAed("");
		setDirection(null);
		setReason("");
		setError(null);
	}

	function onSubmit() {
		setError(null);
		if (magnitudeFils == null || magnitudeFils <= 0) {
			setError("Enter an amount in AED greater than zero.");
			return;
		}
		if (!direction) {
			setError("Choose whether this credits or claws back from the vendor.");
			return;
		}
		if (!reason.trim()) {
			setError("A reason is required.");
			return;
		}
		if (signedFils == null || signedFils === 0) {
			setError("Enter a non-zero amount.");
			return;
		}
		create.mutate(
			{ vendorId, amountFils: signedFils, reason: reason.trim() },
			{
				onSuccess: () => {
					onOpenChange(false);
					reset();
				},
				onError: (err: unknown) => {
					const msg = (err as { response?: { data?: { message?: string } } })
						?.response?.data?.message;
					setError(msg ?? "Failed to create adjustment");
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) reset();
				onOpenChange(o);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Payout Adjustment</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<span className="text-sm font-medium">
							Direction <span className="text-destructive">*</span>
						</span>
						<div className="mt-1 grid grid-cols-2 gap-2">
							<Button
								type="button"
								variant={direction === "credit" ? "default" : "outline"}
								className={
									direction === "credit"
										? "bg-green-600 hover:bg-green-700 text-white"
										: "text-green-700"
								}
								onClick={() => setDirection("credit")}
							>
								Credit vendor
							</Button>
							<Button
								type="button"
								variant={direction === "clawback" ? "destructive" : "outline"}
								className={direction === "clawback" ? "" : "text-destructive"}
								onClick={() => setDirection("clawback")}
							>
								Clawback from vendor
							</Button>
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Credit adds to the vendor's payout balance. Clawback deducts
							from it — the amount below should still be entered as a
							positive number.
						</p>
					</div>

					<div>
						<label htmlFor="adj-amount" className="text-sm font-medium">
							Amount (AED) <span className="text-destructive">*</span>
						</label>
						<Input
							id="adj-amount"
							type="number"
							min="0"
							step="0.01"
							inputMode="decimal"
							placeholder="0.00"
							value={amountAed}
							onChange={(e) => setAmountAed(e.target.value)}
						/>
						{signedFils != null && (
							<p
								className={`text-xs mt-1 ${
									signedFils < 0 ? "text-destructive" : "text-green-600"
								}`}
							>
								{signedFils < 0
									? `This deducts ${formatAed(Math.abs(signedFils))} from the vendor's payout balance.`
									: `This adds ${formatAed(signedFils)} to the vendor's payout balance.`}
							</p>
						)}
					</div>

					<div>
						<label htmlFor="adj-reason" className="text-sm font-medium">
							Reason <span className="text-destructive">*</span>
						</label>
						<textarea
							id="adj-reason"
							rows={3}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Why is this off-system correction being made?"
							className="w-full px-3 py-2 border rounded-md text-sm"
						/>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => {
							onOpenChange(false);
							reset();
						}}
					>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={create.isPending}>
						{create.isPending ? "Saving…" : "Create Adjustment"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
