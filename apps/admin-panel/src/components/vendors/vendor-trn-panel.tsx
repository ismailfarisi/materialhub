"use client";

import { TrnValue } from "@/components/business/trn-value";
import { apiErrorMessage, formatDate } from "@/lib/business.helpers";
import { useVendorTrnVerification } from "@/lib/queries/vendors";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	StatusBadge,
	toast,
} from "@materialhub/ui";

export interface VendorTrnFields {
	id: string;
	trn?: string | null;
	trn_verified_at?: string | null;
	trn_format_valid?: boolean;
}

/** Vendor detail → Profile: the vendor's TRN, its format check and verified state. */
export function VendorTrnPanel({ vendor }: { vendor: VendorTrnFields }) {
	const mutation = useVendorTrnVerification();
	const verified = !!vendor.trn_verified_at;
	const formatValid = !!vendor.trn_format_valid;

	function setVerified(next: boolean) {
		mutation.mutate(
			{ id: vendor.id, verified: next },
			{
				onSuccess: () =>
					toast({ title: next ? "TRN marked verified" : "TRN unverified" }),
				onError: (err) =>
					toast({
						title: "Could not update the TRN",
						description: apiErrorMessage(err, "Try again."),
						variant: "destructive",
					}),
			},
		);
	}

	return (
		<Card>
			<CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
				<CardTitle className="text-base font-semibold">
					Tax registration (TRN)
				</CardTitle>
				{vendor.trn &&
					(verified ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setVerified(false)}
							disabled={mutation.isPending}
						>
							Unverify
						</Button>
					) : (
						<Button
							size="sm"
							onClick={() => setVerified(true)}
							disabled={mutation.isPending || !formatValid}
							title={
								formatValid ? undefined : "Fix the TRN format before verifying"
							}
						>
							Mark TRN verified
						</Button>
					))}
			</CardHeader>
			<CardContent>
				<dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
					<div>
						<dt className="text-xs text-taupe mb-0.5">TRN</dt>
						<dd>
							<TrnValue
								trn={vendor.trn}
								formatValid={formatValid}
								emptyLabel="Not provided"
							/>
						</dd>
					</div>
					<div>
						<dt className="text-xs text-taupe mb-0.5">Verification</dt>
						<dd className="flex flex-wrap items-center gap-2">
							<StatusBadge
								status={verified ? "verified" : "not_verified"}
								colorMap={{
									verified: "bg-amber/10 text-amber border border-amber/30",
									not_verified:
										"bg-caramel/10 text-caramel border border-caramel/30",
								}}
							/>
							{verified && (
								<span className="text-xs text-taupe tabular-nums">
									{formatDate(vendor.trn_verified_at)}
								</span>
							)}
						</dd>
					</div>
					<div className="sm:col-span-1">
						<dt className="text-xs text-taupe mb-0.5">Used for</dt>
						<dd className="text-sm text-cacao">
							Seller TRN on this vendor&rsquo;s VAT tax invoices.
						</dd>
					</div>
				</dl>
				{!vendor.trn && (
					<p className="mt-3 text-sm text-taupe">
						The vendor adds it in Store Settings, or you can enter it with Edit
						on the profile above.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
