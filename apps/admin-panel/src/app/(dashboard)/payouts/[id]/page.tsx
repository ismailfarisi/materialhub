"use client";

import { AddNoteDialog } from "@/components/payouts/AddNoteDialog";
import { AdjustDraftDialog } from "@/components/payouts/AdjustDraftDialog";
import { ApproveDraftDialog } from "@/components/payouts/ApproveDraftDialog";
import { PayoutTimeline } from "@/components/payouts/PayoutTimeline";
import { RejectDraftDialog } from "@/components/payouts/RejectDraftDialog";
import { StatusChangeDialog } from "@/components/payouts/StatusChangeDialog";
import { VoidPayoutDialog } from "@/components/payouts/VoidPayoutDialog";
import {
	availablePayoutActions,
	buildPayoutBreakdown,
	canAdjustDraft,
	payoutStateNotice,
	payoutVendorName,
} from "@/components/payouts/payout-actions.helpers";
import {
	useAdminPayout,
	useAdminPayoutAdjustments,
	useAdminPayoutCommissions,
	useAdminPayoutTimeline,
	useDownloadPayoutStatement,
	useRetryPayout,
} from "@/lib/queries/payouts";
import { useAuthStore } from "@/stores/auth";
import {
	Button,
	Card,
	CardContent,
	Skeleton,
	StatusBadge,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@materialhub/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

type CommissionRow = {
	id: string;
	order_id?: string;
	product_name?: string;
	item_total?: number;
	commission_amount?: number;
	vendor_earning?: number;
};

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

export default function PayoutDetailPage() {
	const params = useParams<{ id: string }>();
	const id = params?.id ?? "";
	const { data: payout, isLoading } = useAdminPayout(id);
	const [page, setPage] = useState(1);
	const commissions = useAdminPayoutCommissions(id, page, 20);
	const timeline = useAdminPayoutTimeline(id);
	const adjustments = useAdminPayoutAdjustments(id);
	const retry = useRetryPayout();
	const statement = useDownloadPayoutStatement();
	const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");

	const [statusDialog, setStatusDialog] = useState<"paid" | "failed" | null>(
		null,
	);
	const [noteOpen, setNoteOpen] = useState(false);
	const [approveOpen, setApproveOpen] = useState(false);
	const [rejectOpen, setRejectOpen] = useState(false);
	const [voidOpen, setVoidOpen] = useState(false);
	const [adjustOpen, setAdjustOpen] = useState(false);

	if (isLoading || !payout) {
		return <Skeleton className="h-72" />;
	}

	const actions = availablePayoutActions(payout);
	const notice = payoutStateNotice(payout);
	const vendorName = payoutVendorName(payout);
	const breakdown = buildPayoutBreakdown(payout);

	return (
		<div className="space-y-5">
			<div className="text-sm text-muted-foreground">
				<Link href="/payouts" className="hover:underline">
					Payouts
				</Link>{" "}
				/ <span className="text-foreground">{payout.payout_reference}</span>
			</div>

			<Card>
				<CardContent className="p-5 space-y-3">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-sm text-muted-foreground">Vendor</p>
							<Link
								href={`/vendors/${payout.vendor_id}`}
								className="text-base font-semibold hover:underline"
							>
								{vendorName}
							</Link>
							<p className="text-sm font-mono text-muted-foreground mt-1">
								{payout.payout_reference}
							</p>
							<p className="text-sm text-muted-foreground mt-1">
								{formatDate(payout.period_start)} –{" "}
								{formatDate(payout.period_end)}
							</p>
						</div>
						<div className="flex flex-col items-end gap-2">
							<StatusBadge status={payout.status} />
							{payout.gateway_reference && (
								<code className="text-xs bg-muted px-2 py-1 rounded">
									{payout.gateway_reference}
								</code>
							)}
							<p className="text-xs text-muted-foreground">
								Created {formatDate(payout.created_at)}
							</p>
							{payout.processed_at && (
								<p className="text-xs text-muted-foreground">
									Processed {formatDate(payout.processed_at)}
								</p>
							)}
						</div>
					</div>

					{notice && (
						<div
							className={`rounded-md border px-3 py-2 text-sm ${
								notice.tone === "danger"
									? "border-destructive/40 bg-destructive/10 text-destructive"
									: notice.tone === "warning"
										? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
										: "border-border bg-muted/60 text-muted-foreground"
							}`}
						>
							<p className="font-medium">{notice.title}</p>
							<p className="mt-0.5">{notice.body}</p>
						</div>
					)}

					{payout.notes && (
						<div
							className={`rounded-md border px-3 py-2 ${
								payout.status === "failed"
									? "border-destructive/40 bg-destructive/10"
									: "border-border bg-muted/60"
							}`}
						>
							<p
								className={`text-xs font-medium ${
									payout.status === "failed"
										? "text-destructive"
										: "text-muted-foreground"
								}`}
							>
								{payout.status === "failed" ? "Failure reason" : "Note"}
							</p>
							<pre className="mt-1 whitespace-pre-wrap break-words text-sm">
								{payout.notes}
							</pre>
						</div>
					)}

					{/*
					  Rows that actually reconcile: the `line` rows sum to Net. Carrier
					  cost is rendered separately because computePayoutTotals never
					  deducts it — the real shipping deduction is shipping_contribution_total.
					*/}
					<div className="pt-3 border-t">
						<dl className="max-w-md text-sm">
							{breakdown
								.filter((r) => r.kind !== "informational")
								.map((r) => (
									<div
										key={r.label}
										className={`flex justify-between gap-4 py-1 ${
											r.kind === "total"
												? "border-t font-semibold mt-1 pt-1"
												: ""
										}`}
									>
										<dt
											className={
												r.kind === "total" ? "" : "text-muted-foreground"
											}
											title={r.hint}
										>
											{r.label}
										</dt>
										<dd
											className={
												r.kind === "line" && r.value < 0
													? "text-destructive tabular-nums"
													: "tabular-nums"
											}
										>
											{r.kind === "line" && r.value < 0
												? `− ${formatAed(Math.abs(r.value))}`
												: formatAed(r.value)}
										</dd>
									</div>
								))}
							{breakdown
								.filter((r) => r.kind === "informational")
								.map((r) => (
									<div
										key={r.label}
										className="flex justify-between gap-4 py-1 text-xs text-muted-foreground border-t mt-2 pt-2"
									>
										<dt title={r.hint}>{r.label} (informational, not deducted)</dt>
										<dd className="tabular-nums">{formatAed(r.value)}</dd>
									</div>
								))}
						</dl>
					</div>

					<div className="flex flex-wrap justify-end gap-2 pt-3 border-t">
						{actions.includes("reject") && (
							<Button
								variant="outline"
								className="text-destructive"
								onClick={() => setRejectOpen(true)}
							>
								Reject
							</Button>
						)}
						{actions.includes("approve") && (
							<Button onClick={() => setApproveOpen(true)}>Pay</Button>
						)}
						{canAdjustDraft(payout) && (
							<Button variant="outline" onClick={() => setAdjustOpen(true)}>
								Adjust amount
							</Button>
						)}
						{actions.includes("mark_paid") && (
							<Button onClick={() => setStatusDialog("paid")}>Mark Paid</Button>
						)}
						{actions.includes("mark_failed") && (
							<Button
								variant="outline"
								className="text-destructive"
								onClick={() => setStatusDialog("failed")}
							>
								Mark Failed
							</Button>
						)}
						{actions.includes("retry") && (
							<Button
								onClick={() => retry.mutate(id)}
								disabled={retry.isPending}
							>
								{retry.isPending ? "Retrying…" : "Retry"}
							</Button>
						)}
						{actions.includes("void") && (
							<Button
								variant="outline"
								className="text-destructive"
								onClick={() => setVoidOpen(true)}
							>
								Void payout
							</Button>
						)}
						{/*
						  Available in every state, including `pending`: the statement is
						  what an operator sends a vendor to agree a draft's figures
						  BEFORE approving it, not only a receipt afterwards. The PDF
						  stamps itself PROVISIONAL for anything short of `paid`.
						*/}
						<Button
							variant="outline"
							onClick={() =>
								statement.mutate({
									id,
									reference: payout.payout_reference,
								})
							}
							disabled={statement.isPending}
						>
							{statement.isPending ? "Preparing…" : "Download statement"}
						</Button>
						<Button variant="outline" onClick={() => setNoteOpen(true)}>
							{payout.notes ? "Edit Note" : "Add Note"}
						</Button>
					</div>
					{retry.isError && (
						<p className="text-sm text-destructive text-right">
							{(retry.error as { response?: { data?: { message?: string } } })
								?.response?.data?.message ?? "Failed to queue a retry"}
						</p>
					)}
					{statement.isError && (
						<p className="text-sm text-destructive text-right">
							{(statement.error as { response?: { data?: { message?: string } } })
								?.response?.data?.message ??
								"Failed to generate the statement PDF"}
						</p>
					)}
				</CardContent>
			</Card>

			<Tabs defaultValue="commissions">
				<TabsList>
					<TabsTrigger value="commissions">Commissions</TabsTrigger>
					<TabsTrigger value="adjustments">Adjustments</TabsTrigger>
					<TabsTrigger value="timeline">Timeline</TabsTrigger>
				</TabsList>
				<TabsContent value="commissions" className="pt-3">
					{commissions.isLoading ? (
						<Skeleton className="h-32" />
					) : (
						<table className="w-full text-sm" data-stack="md">
							<thead className="text-left text-muted-foreground">
								<tr>
									<th className="py-2">Order</th>
									<th>Item</th>
									<th className="text-right">Gross</th>
									<th className="text-right">Commission</th>
									<th className="text-right">Net</th>
								</tr>
							</thead>
							<tbody>
								{(commissions.data?.items ?? []).map((c) => {
									const row = c as CommissionRow;
									return (
										<tr key={row.id} className="border-t">
											<td className="py-2" data-card-title>
												{row.order_id ? (
													<Link
														href={`/orders/${row.order_id}`}
														className="hover:underline"
													>
														{row.order_id?.slice(0, 8)}
													</Link>
												) : (
													"—"
												)}
											</td>
											<td data-label="Item">{row.product_name ?? "—"}</td>
											<td className="text-right" data-label="Gross">
												{formatAed(row.item_total)}
											</td>
											<td className="text-right text-destructive" data-label="Commission">
												- {formatAed(row.commission_amount)}
											</td>
											<td className="text-right font-medium" data-label="Net">
												{formatAed(row.vendor_earning)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
					{commissions.data && (
						<div className="flex items-center justify-between pt-3">
							<p className="text-xs text-muted-foreground">
								Total: {commissions.data.total} commission
								{commissions.data.total === 1 ? "" : "s"}
							</p>
							{commissions.data.total > 20 && (
								<div className="flex justify-end gap-2">
									<Button
										size="sm"
										variant="outline"
										disabled={page === 1}
										onClick={() => setPage((p) => p - 1)}
									>
										Previous
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={page * 20 >= (commissions.data?.total ?? 0)}
										onClick={() => setPage((p) => p + 1)}
									>
										Next
									</Button>
								</div>
							)}
						</div>
					)}
				</TabsContent>
				<TabsContent value="adjustments" className="pt-3">
					{adjustments.isLoading ? (
						<Skeleton className="h-32" />
					) : (adjustments.data ?? []).length === 0 ? (
						<p className="text-sm text-muted-foreground py-4">
							No adjustments claimed by this payout.
						</p>
					) : (
						<>
							<table className="w-full text-sm" data-stack="md">
								<thead className="text-left text-muted-foreground">
									<tr>
										<th className="py-2">Reason</th>
										<th>Source</th>
										<th className="text-right">Amount</th>
										<th className="text-right">Created</th>
									</tr>
								</thead>
								<tbody>
									{(adjustments.data ?? []).map((a) => (
										<tr key={a.id} className="border-t">
											<td className="py-2" data-card-title>
												{a.reason}
											</td>
											<td data-label="Source">{a.source_type}</td>
											<td
												className={`text-right font-medium ${
													a.amount_fils < 0 ? "text-destructive" : "text-green-600"
												}`}
												data-label="Amount"
											>
												{a.amount_fils < 0 ? "− " : "+ "}
												{formatAed(Math.abs(a.amount_fils))}
											</td>
											<td className="text-right" data-label="Created">
												{formatDate(a.created_at)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
							<p className="text-xs text-muted-foreground pt-3">
								Total: {(adjustments.data ?? []).length} adjustment
								{(adjustments.data ?? []).length === 1 ? "" : "s"}
							</p>
						</>
					)}
				</TabsContent>
				<TabsContent value="timeline" className="pt-3">
					<PayoutTimeline
						rows={timeline.data ?? []}
						isLoading={timeline.isLoading}
					/>
				</TabsContent>
			</Tabs>

			{statusDialog && (
				<StatusChangeDialog
					open={!!statusDialog}
					onOpenChange={(o) => !o && setStatusDialog(null)}
					payoutId={id}
					status={statusDialog}
					rail={payout.payout_rail ?? null}
				/>
			)}
			{adjustOpen && (
				<AdjustDraftDialog
					open={adjustOpen}
					onOpenChange={setAdjustOpen}
					payoutId={id}
					currentNetFils={payout.net_amount}
				/>
			)}
			{noteOpen && (
				<AddNoteDialog
					open={noteOpen}
					onOpenChange={setNoteOpen}
					payoutId={id}
					currentNote={payout.notes}
				/>
			)}
			{approveOpen && (
				<ApproveDraftDialog
					open={approveOpen}
					onOpenChange={setApproveOpen}
					payoutId={id}
					vendorName={vendorName}
					periodStart={payout.period_start}
					periodEnd={payout.period_end}
					netAmountFils={payout.net_amount}
					commissionCount={commissions.data?.total ?? 0}
					vendorHasStripeAccount={!!payout.vendor?.stripe_account_id}
					isSuperAdmin={isSuperAdmin}
				/>
			)}
			{rejectOpen && (
				<RejectDraftDialog
					open={rejectOpen}
					onOpenChange={setRejectOpen}
					payoutId={id}
				/>
			)}
			{voidOpen && (
				<VoidPayoutDialog
					open={voidOpen}
					onOpenChange={setVoidOpen}
					payoutId={id}
				/>
			)}
		</div>
	);
}
