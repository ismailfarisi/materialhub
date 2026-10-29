"use client";

import { vendorBlockedByMissingBankAccount } from "@/components/payouts/payout-actions.helpers";
import {
	useAdminPayoutEstimate,
	useGeneratePayout,
} from "@/lib/queries/payouts";
import { useVendors } from "@/lib/queries/vendors";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@materialhub/ui";
import Link from "next/link";
import { useState } from "react";

interface VendorItem {
	id: string;
	business_name?: string;
	display_name?: string;
	name?: string;
}

interface VendorsResponse {
	// GET /admin/vendors returns the vendor array under `data` ({ data, total,
	// page, limit }); `items` kept only as a defensive fallback.
	data?: VendorItem[];
	items?: VendorItem[];
}

function formatAed(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

function defaultPeriod() {
	const now = new Date();
	const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const last = new Date(now.getFullYear(), now.getMonth(), 0);
	const fmt = (d: Date) => d.toISOString().slice(0, 10);
	return { start: fmt(first), end: fmt(last) };
}

export function GeneratePayoutDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: vendorsResp } = useVendors({ limit: 100 });
	const vendorsData = vendorsResp as VendorsResponse | undefined;
	const vendors = (vendorsData?.data ?? vendorsData?.items ?? []) as VendorItem[];
	const [vendorId, setVendorId] = useState<string>("");
	const initialPeriod = defaultPeriod();
	const [start, setStart] = useState(initialPeriod.start);
	const [end, setEnd] = useState(initialPeriod.end);
	const [error, setError] = useState<string | null>(null);
	const [force, setForce] = useState(false);

	const estimate = useAdminPayoutEstimate(vendorId || undefined);
	const generate = useGeneratePayout();

	function onSubmit() {
		setError(null);
		generate.mutate(
			{ vendorId, periodStart: start, periodEnd: end, force: force || undefined },
			{
				onSuccess: () => {
					onOpenChange(false);
					setVendorId("");
				},
				onError: (err: unknown) => {
					const msg =
						(err as { response?: { data?: { message?: string } } })?.response
							?.data?.message ?? "Failed to queue payout";
					setError(msg);
				},
			},
		);
	}

	// See vendorBlockedByMissingBankAccount for why this is not a falsy check.
	const missingBankAccount = estimate.data
		? vendorBlockedByMissingBankAccount(estimate.data)
		: false;

	const canSubmit =
		!!vendorId &&
		!!start &&
		!!end &&
		(estimate.data?.pending_count ?? 0) > 0 &&
		!missingBankAccount &&
		!generate.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Generate Payout</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<label htmlFor="gp-vendor" className="text-sm font-medium">
							Vendor
						</label>
						<select
							id="gp-vendor"
							className="mt-1 w-full h-10 px-3 border rounded-md text-sm"
							value={vendorId}
							onChange={(e) => setVendorId(e.target.value)}
						>
							<option value="">Select vendor…</option>
							{vendors.map((v) => (
								<option key={v.id} value={v.id}>
									{v.business_name ?? v.display_name ?? v.name ?? v.id}
								</option>
							))}
						</select>
					</div>

					{vendorId && estimate.data && (
						<div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
							{/*
							  GET /admin/payouts/estimate takes only a vendorId; the
							  controller calls estimateForVendor(vendorId), which passes
							  periodEnd = "2999-12-31". So this figure is EVERYTHING the
							  vendor has payable to date, not what the period below will
							  claim. Labelled as such rather than presented as the draft
							  total — the previous wording let the dialog promise "12 items /
							  AED 4,300" and then 400 with "no pending commissions".
							*/}
							<p className="text-xs text-muted-foreground pb-1">
								All-time payable for this vendor — <strong>not</strong> a
								preview of the period below. The draft will only claim
								commissions that matured on or before the period end, so it may
								be smaller, or empty.
							</p>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									Pending items (all time)
								</span>
								<span>{estimate.data.pending_count}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Gross (ex-VAT)</span>
								<span>{formatAed(estimate.data.gross_amount)}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Commission</span>
								<span>- {formatAed(estimate.data.commission_total)}</span>
							</div>
							<div className="flex justify-between font-semibold pt-1 border-t">
								<span>Net (all time)</span>
								<span>{formatAed(estimate.data.net_amount)}</span>
							</div>
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label htmlFor="gp-period-start" className="text-sm font-medium">
								Period start
							</label>
							<Input
								id="gp-period-start"
								type="date"
								value={start}
								onChange={(e) => setStart(e.target.value)}
							/>
						</div>
						<div>
							<label htmlFor="gp-period-end" className="text-sm font-medium">
								Period end
							</label>
							<Input
								id="gp-period-end"
								type="date"
								value={end}
								onChange={(e) => setEnd(e.target.value)}
							/>
						</div>
					</div>

					<label
						htmlFor="gp-force"
						className="flex items-start gap-2 text-sm cursor-pointer"
					>
						<input
							id="gp-force"
							type="checkbox"
							className="mt-0.5"
							checked={force}
							onChange={(e) => setForce(e.target.checked)}
						/>
						<span>
							Ignore the vendor's minimum payout
							<span className="block text-xs text-muted-foreground">
								Without this, a draft whose net is below the vendor's
								`minimum_payout` is rejected with PAYOUT_BELOW_MINIMUM and there
								is no way to proceed.
							</span>
						</span>
					</label>

					{missingBankAccount && (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							<p className="font-medium">
								This vendor has no primary bank account
							</p>
							<p className="mt-0.5">
								A payout records the account it will be paid into, so a draft
								cannot be generated until one exists. Add one under{" "}
								<Link
									href={`/vendors/${vendorId}`}
									className="underline font-medium"
								>
									the vendor&apos;s Bank Accounts tab
								</Link>
								, then reopen this dialog. The first account added is marked
								primary automatically.
							</p>
						</div>
					)}

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={!canSubmit}>
						{generate.isPending ? "Queuing…" : "Generate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
