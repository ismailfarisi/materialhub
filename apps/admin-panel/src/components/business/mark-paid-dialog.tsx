"use client";

import { apiErrorMessage, todayInDubai } from "@/lib/business.helpers";
import { formatAedGrouped } from "@/lib/money";
import {
	type Receivable,
	useMarkReceivablePaid,
} from "@/lib/queries/receivables";
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
	toast,
} from "@materialhub/ui";
import { useEffect, useState } from "react";

export function MarkPaidDialog({
	receivable,
	onClose,
}: {
	receivable: Receivable | null;
	onClose: () => void;
}) {
	const markPaid = useMarkReceivablePaid();
	const [reference, setReference] = useState("");
	const [paidAt, setPaidAt] = useState("");
	const [error, setError] = useState<string | null>(null);
	const today = todayInDubai();

	useEffect(() => {
		if (receivable) {
			setReference("");
			setPaidAt("");
			setError(null);
		}
	}, [receivable]);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!receivable || !reference.trim()) return;
		if (paidAt && paidAt > today) {
			setError("The paid date can't be in the future.");
			return;
		}
		setError(null);
		markPaid.mutate(
			{
				orderId: receivable.order_id,
				reference: reference.trim(),
				paid_at: paidAt || undefined,
			},
			{
				onSuccess: () => {
					toast({
						title: `${receivable.order_number} marked paid`,
						description:
							"The business's credit is freed and the vendors' commissions can now settle.",
					});
					onClose();
				},
				onError: (err) =>
					setError(apiErrorMessage(err, "Could not mark this order paid.")),
			},
		);
	}

	return (
		<Dialog
			open={receivable !== null}
			onOpenChange={(v) => {
				if (!v && !markPaid.isPending) onClose();
			}}
		>
			<DialogContent className="max-w-md">
				<form onSubmit={submit}>
					<DialogHeader>
						<DialogTitle>Mark paid</DialogTitle>
						{receivable && (
							<DialogDescription>
								<span className="font-mono tabular-nums">
									{receivable.order_number}
								</span>{" "}
								from {receivable.legal_name},{" "}
								<span className="tabular-nums font-medium text-cacao">
									{formatAedGrouped(receivable.amount_fils)}
								</span>
								. Record this only once the transfer is in the MaterialHub bank
								account; it releases the vendor payouts for the order.
							</DialogDescription>
						)}
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-1.5">
							<Label htmlFor="mp-reference">Payment reference (required)</Label>
							<Input
								id="mp-reference"
								className="font-mono"
								placeholder="e.g. bank transfer reference FT26310ABC123"
								value={reference}
								onChange={(e) => setReference(e.target.value)}
								autoComplete="off"
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="mp-date">Paid on (optional)</Label>
							<Input
								id="mp-date"
								type="date"
								className="tabular-nums"
								max={today}
								value={paidAt}
								onChange={(e) => setPaidAt(e.target.value)}
							/>
							<p className="text-xs text-taupe">Leave empty to use today.</p>
						</div>
						{error && (
							<p role="alert" className="text-sm text-russet">
								{error}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={markPaid.isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={!reference.trim() || markPaid.isPending}
						>
							{markPaid.isPending ? "Saving…" : "Mark paid"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
