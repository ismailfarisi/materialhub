"use client";

import { NetTermsPanel } from "@/components/business/net-terms-panel";
import {
	NET_TERMS_COLORS,
	TrnValue,
	VERIFICATION_COLORS,
	openSignedUrl,
} from "@/components/business/trn-value";
import { apiErrorMessage, formatDate } from "@/lib/business.helpers";
import { formatAedGrouped } from "@/lib/money";
import {
	type AdminBusinessDetail,
	useBusinessAccount,
	useDecideVerification,
	useOpenBusinessLicence,
} from "@/lib/queries/business-accounts";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Label,
	Skeleton,
	StatusBadge,
	Textarea,
	toast,
} from "@materialhub/ui";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useState } from "react";

function Field({
	label,
	children,
	full,
}: { label: string; children: ReactNode; full?: boolean }) {
	return (
		<div className={full ? "sm:col-span-2" : undefined}>
			<dt className="text-xs text-taupe mb-0.5">{label}</dt>
			<dd className="text-sm text-cacao">{children}</dd>
		</div>
	);
}

export default function BusinessAccountDetailPage() {
	const { id } = useParams<{ id: string }>();
	const { data: account, isLoading, isError } = useBusinessAccount(id);
	const decide = useDecideVerification();
	const licence = useOpenBusinessLicence();
	const [rejectOpen, setRejectOpen] = useState(false);
	const [reason, setReason] = useState("");

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-10 w-72" />
				<div className="grid gap-4 lg:grid-cols-3">
					<Skeleton className="h-80 lg:col-span-2" />
					<Skeleton className="h-80" />
				</div>
			</div>
		);
	}

	if (isError || !account) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-4">
				<p className="text-taupe">This business account could not be loaded.</p>
				<Button variant="outline" asChild>
					<Link href="/business-accounts">Back to business accounts</Link>
				</Button>
			</div>
		);
	}

	const a: AdminBusinessDetail = account;
	const canVerify = a.verification_status !== "verified";
	const canReject = a.verification_status !== "rejected";

	function verify() {
		decide.mutate(
			{ id, decision: "verified" },
			{
				onSuccess: () => toast({ title: `${a.legal_name} verified` }),
				onError: (err) =>
					toast({
						title: "Could not verify",
						description: apiErrorMessage(err, "Try again."),
						variant: "destructive",
					}),
			},
		);
	}

	function reject() {
		if (!reason.trim()) return;
		decide.mutate(
			{ id, decision: "rejected", reason: reason.trim() },
			{
				onSuccess: () => {
					setRejectOpen(false);
					setReason("");
					toast({ title: "Verification rejected" });
				},
				onError: (err) =>
					toast({
						title: "Could not reject",
						description: apiErrorMessage(err, "Try again."),
						variant: "destructive",
					}),
			},
		);
	}

	function openLicence() {
		openSignedUrl(
			() => licence.mutateAsync(id),
			(err) =>
				toast({
					title: "Could not open the licence",
					description: apiErrorMessage(err, "Try again."),
					variant: "destructive",
				}),
		);
	}

	const addr = a.billing_address;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 md:flex-row md:items-start">
				<div className="flex-1 min-w-0">
					<Link
						href="/business-accounts"
						className="inline-flex items-center gap-1.5 text-sm text-taupe hover:text-cacao mb-2"
					>
						<ArrowLeft size={14} aria-hidden /> Business accounts
					</Link>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-xl font-bold text-cacao">{a.legal_name}</h1>
						<StatusBadge
							status={a.verification_status}
							colorMap={VERIFICATION_COLORS}
						/>
						{a.credit && (
							<span className="inline-flex items-center gap-1 text-xs text-taupe">
								Net terms
								<StatusBadge
									status={a.credit.status}
									colorMap={NET_TERMS_COLORS}
								/>
							</span>
						)}
					</div>
					{a.trade_name && (
						<p className="text-sm text-taupe">Trading as {a.trade_name}</p>
					)}
				</div>
				<div className="flex flex-wrap gap-2">
					{canReject && (
						<Button
							variant="outline"
							className="text-russet border-russet/40 hover:bg-russet/5"
							onClick={() => setRejectOpen(true)}
							disabled={decide.isPending}
						>
							{a.verification_status === "verified"
								? "Revoke verification"
								: "Reject"}
						</Button>
					)}
					{canVerify && (
						<Button onClick={verify} disabled={decide.isPending}>
							{decide.isPending ? "Saving…" : "Verify business"}
						</Button>
					)}
				</div>
			</div>

			{a.verification_status === "rejected" && a.rejection_reason && (
				<div className="rounded-xs border border-russet/30 bg-russet/5 px-4 py-3 text-sm text-cacao">
					<span className="font-medium text-russet">Rejected: </span>
					{a.rejection_reason}
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-3 items-start">
				<div className="space-y-4 lg:col-span-2 min-w-0">
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
							<CardTitle className="text-base font-semibold">
								Company profile
							</CardTitle>
							<Button
								variant="outline"
								size="sm"
								onClick={openLicence}
								disabled={!a.has_licence_document || licence.isPending}
								title={
									a.has_licence_document
										? "Opens a link that works for 5 minutes"
										: "No licence document uploaded"
								}
							>
								<FileText size={14} aria-hidden />
								{a.has_licence_document ? "View licence" : "No licence file"}
							</Button>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
								<Field label="Legal name">{a.legal_name}</Field>
								<Field label="Trade name">{a.trade_name || "—"}</Field>
								<Field label="Trade licence no.">
									<span className="font-mono tabular-nums">
										{a.trade_licence_number}
									</span>
								</Field>
								<Field label="Issued by">{a.trade_licence_issuer || "—"}</Field>
								<Field label="Licence expiry">
									{a.licence_expired ? (
										<span className="inline-flex items-center gap-1 font-medium text-russet tabular-nums">
											<AlertTriangle size={13} aria-hidden />
											Expired {formatDate(a.trade_licence_expiry)}
										</span>
									) : (
										<span className="tabular-nums">
											{formatDate(a.trade_licence_expiry)}
										</span>
									)}
								</Field>
								<Field label="VAT registered">
									{a.vat_registered ? "Yes" : "No"}
								</Field>
								<Field label="TRN">
									{a.vat_registered || a.trn ? (
										<TrnValue trn={a.trn} formatValid={a.trn_format_valid} />
									) : (
										<span className="text-taupe">Not VAT-registered</span>
									)}
								</Field>
								<Field label="Peppol participant ID">
									{a.peppol_participant_id ? (
										<span className="font-mono tabular-nums">
											{a.peppol_participant_id}
										</span>
									) : (
										"—"
									)}
								</Field>
								<Field label="Order approval limit">
									{a.approval_threshold_fils == null ? (
										<span className="text-taupe">Off</span>
									) : (
										<span className="tabular-nums">
											Above {formatAedGrouped(a.approval_threshold_fils)}
										</span>
									)}
								</Field>
								<Field label="Created">
									<span className="tabular-nums">
										{formatDate(a.created_at)}
									</span>
									{a.owner && (
										<span className="text-taupe">
											{" "}
											by {a.owner.name ?? a.owner.email}
										</span>
									)}
								</Field>
								{a.verified_at && (
									<Field label="Verified">
										<span className="tabular-nums">
											{formatDate(a.verified_at)}
										</span>
									</Field>
								)}
							</dl>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base font-semibold">
								Billing address
							</CardTitle>
						</CardHeader>
						<CardContent>
							<address className="not-italic text-sm text-cacao leading-relaxed">
								{addr.line1}
								{addr.line2 && (
									<>
										<br />
										{addr.line2}
									</>
								)}
								<br />
								{addr.city}, {addr.emirate}
								{addr.po_box && (
									<>
										<br />
										P.O. Box <span className="tabular-nums">{addr.po_box}</span>
									</>
								)}
								<br />
								United Arab Emirates
							</address>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base font-semibold">
								Members{" "}
								<span className="text-taupe font-normal tabular-nums">
									({a.members.length})
								</span>
							</CardTitle>
						</CardHeader>
						<CardContent>
							{a.members.length === 0 ? (
								<p className="text-sm text-taupe">No members.</p>
							) : (
								<table className="w-full text-sm" data-stack="md">
									<thead className="text-left text-xs uppercase tracking-wide text-taupe">
										<tr>
											<th className="py-2 font-semibold">Member</th>
											<th className="py-2 font-semibold">Role</th>
											<th className="py-2 font-semibold">Status</th>
											<th className="py-2 font-semibold">Joined</th>
										</tr>
									</thead>
									<tbody>
										{a.members.map((m) => (
											<tr key={m.id} className="border-t border-pearl/40">
												<td className="py-2" data-card-title>
													<p className="font-medium text-cacao">
														{m.name ?? m.email}
													</p>
													{m.name && (
														<p className="text-xs text-taupe font-normal">
															{m.email}
														</p>
													)}
												</td>
												<td className="py-2 capitalize" data-label="Role">
													{m.role}
												</td>
												<td className="py-2" data-label="Status">
													<StatusBadge
														status={m.status}
														colorMap={{
															active:
																"bg-amber/10 text-amber border border-amber/30",
															invited:
																"bg-caramel/10 text-caramel border border-caramel/30",
														}}
													/>
												</td>
												<td className="py-2 tabular-nums" data-label="Joined">
													{m.joined_at
														? formatDate(m.joined_at)
														: `Invited ${formatDate(m.invited_at)}`}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4 min-w-0">
					<NetTermsPanel account={a} />
				</div>
			</div>

			<Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							{a.verification_status === "verified"
								? "Revoke verification"
								: "Reject verification"}
						</DialogTitle>
						<DialogDescription>
							The business admin sees this reason and can fix the licence or
							TRN, which sends the account back for review.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5 py-2">
						<Label htmlFor="reject-reason">Reason (required)</Label>
						<Textarea
							id="reject-reason"
							placeholder="e.g. Trade licence on file is for a different legal entity."
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							rows={4}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRejectOpen(false)}
							disabled={decide.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={reject}
							disabled={!reason.trim() || decide.isPending}
						>
							{decide.isPending ? "Saving…" : "Reject"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
