"use client";

import { useApproveDraft, useRevealBank } from "@/lib/queries/payouts";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@materialhub/ui";
import { useState } from "react";
import {
	type PayoutRail,
	payRailLabel,
	railRequiresStripeAccount,
} from "./payout-actions.helpers";

function formatAed(fils: number | null | undefined) {
	if (fils == null) return "—";
	return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function ApproveDraftDialog({
	open,
	onOpenChange,
	payoutId,
	vendorName,
	periodStart,
	periodEnd,
	netAmountFils,
	commissionCount,
	vendorHasStripeAccount,
	isSuperAdmin,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	payoutId: string;
	vendorName: string;
	periodStart: string;
	periodEnd: string;
	netAmountFils: number;
	commissionCount: number;
	vendorHasStripeAccount: boolean;
	isSuperAdmin: boolean;
}) {
	const [error, setError] = useState<string | null>(null);
	const approve = useApproveDraft();
	const [rail, setRail] = useState<PayoutRail>("manual_bank_transfer");
	const [bank, setBank] = useState<Awaited<
		ReturnType<ReturnType<typeof useRevealBank>["mutateAsync"]>
	> | null>(null);
	const reveal = useRevealBank();

	const stripeBlocked = railRequiresStripeAccount(rail) && !vendorHasStripeAccount;

	function onSubmit() {
		setError(null);
		approve.mutate(
			{ id: payoutId, rail },
			{
				onSuccess: () => onOpenChange(false),
				onError: (err: unknown) => {
					const msg = (err as { response?: { data?: { message?: string } } })
						?.response?.data?.message;
					setError(msg ?? "Failed to pay payout");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pay Payout</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Vendor</span>
							<span className="font-medium">{vendorName}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Period</span>
							<span>
								{formatDate(periodStart)} – {formatDate(periodEnd)}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Commissions</span>
							<span>{commissionCount}</span>
						</div>
						<div className="flex justify-between font-semibold pt-1 border-t">
							<span>Net amount</span>
							<span>{formatAed(netAmountFils)}</span>
						</div>
					</div>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">How are you paying this?</legend>

						<label className="flex items-start gap-2 text-sm cursor-pointer">
							<input
								type="radio"
								name="payout-rail"
								className="mt-1"
								checked={rail === "manual_bank_transfer"}
								onChange={() => setRail("manual_bank_transfer")}
							/>
							<span>
								Manual bank transfer
								<span className="block text-xs text-muted-foreground">
									You send it from your banking portal. Nothing is transferred by the system.
								</span>
							</span>
						</label>

						<label
							className={`flex items-start gap-2 text-sm ${
								vendorHasStripeAccount ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
							}`}
						>
							<input
								type="radio"
								name="payout-rail"
								className="mt-1"
								disabled={!vendorHasStripeAccount}
								checked={rail === "stripe_connect"}
								onChange={() => setRail("stripe_connect")}
							/>
							<span>
								Stripe Connect transfer
								<span className="block text-xs text-muted-foreground">
									{vendorHasStripeAccount
										? "Queues a real transfer to the vendor's connected account immediately."
										: "Unavailable — this vendor has no Stripe connected account."}
								</span>
							</span>
						</label>
					</fieldset>

					{rail === "manual_bank_transfer" ? (
						<div className="rounded-md border bg-muted/50 px-3 py-2 text-sm space-y-2">
							<p>
								This records your intent to pay and moves the payout to Processing.{" "}
								<strong>No money moves automatically.</strong> Send the transfer from your
								banking portal, then come back and Mark Paid with the bank reference.
							</p>
							{isSuperAdmin && !bank && (
								<Button
									variant="outline"
									size="sm"
									disabled={reveal.isPending}
									onClick={async () => {
										setError(null);
										try {
											setBank(await reveal.mutateAsync(payoutId));
										} catch (err: unknown) {
											const msg = (
												err as { response?: { data?: { message?: string } } }
											)?.response?.data?.message;
											setError(msg ?? "Failed to reveal bank details");
										}
									}}
								>
									{reveal.isPending ? "Revealing…" : "Reveal full bank details"}
								</Button>
							)}
							{bank && (
								<>
									{bank.account_deleted && (
										<div
											role="alert"
											className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-sm text-destructive font-medium"
										>
											This bank account has been removed by the vendor. Confirm a
											current account before sending any transfer.
										</div>
									)}
									<dl className="text-xs space-y-1">
										<div className="flex justify-between">
											<dt className="text-muted-foreground">Holder</dt>
											<dd>{bank.account_holder_name}</dd>
										</div>
										<div className="flex justify-between">
											<dt className="text-muted-foreground">Bank</dt>
											<dd>{bank.bank_name}</dd>
										</div>
										<div className="flex justify-between">
											<dt className="text-muted-foreground">IBAN</dt>
											<dd className="font-mono">{bank.iban ?? bank.account_number}</dd>
										</div>
										{bank.swift_code && (
											<div className="flex justify-between">
												<dt className="text-muted-foreground">SWIFT</dt>
												<dd className="font-mono">{bank.swift_code}</dd>
											</div>
										)}
									</dl>
								</>
							)}
						</div>
					) : (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							Paying on this rail queues a real Stripe transfer of {formatAed(netAmountFils)}{" "}
							to {vendorName} immediately. This is the only rail that moves money
							automatically, and it cannot be undone.
						</div>
					)}

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={onSubmit}
						disabled={approve.isPending || stripeBlocked}
					>
						{approve.isPending ? "Paying…" : payRailLabel(rail)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
