"use client";

import { NET_TERMS_COLORS } from "@/components/business/trn-value";
import {
	apiErrorMessage,
	filsToAedInput,
	formatDate,
	netTermsActions,
	parseCreditLimitInput,
	termsLabel,
} from "@/lib/business.helpers";
import type { PaymentTerms } from "@/lib/business.helpers";
import { formatAedGrouped } from "@/lib/money";
import {
	type AdminBusinessDetail,
	useDecideNetTerms,
} from "@/lib/queries/business-accounts";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	ConfirmDialog,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StatusBadge,
	Textarea,
	toast,
} from "@materialhub/ui";
import { useEffect, useState } from "react";

const TERMS_OPTIONS = [
	{ label: "Net 30 (due 30 days after confirmation)", value: "net_30" },
	{ label: "Net 60 (due 60 days after confirmation)", value: "net_60" },
];

function Row({
	label,
	value,
	tone,
}: { label: string; value: string; tone?: "error" | "strong" }) {
	return (
		<div className="flex items-baseline justify-between gap-4 py-1.5">
			<dt className="text-sm text-taupe">{label}</dt>
			<dd
				className={`text-sm tabular-nums text-right ${
					tone === "error"
						? "font-semibold text-russet"
						: tone === "strong"
							? "font-semibold text-cacao"
							: "text-cacao"
				}`}
			>
				{value}
			</dd>
		</div>
	);
}

export function NetTermsPanel({ account }: { account: AdminBusinessDetail }) {
	const c = account.credit;
	const verified = account.verification_status === "verified";
	const actions = netTermsActions(c?.status, verified);
	const canApprove = actions.includes("approve");
	// Show the approval form for an open application even before the business
	// is verified, so the admin sees the next step; the button stays disabled.
	const offerApprove =
		canApprove ||
		(!verified && (c?.status === "applied" || c?.status === "suspended"));
	const decide = useDecideNetTerms();

	const [editing, setEditing] = useState(c?.status === "applied");
	const [terms, setTerms] = useState<PaymentTerms>(c?.terms ?? "net_30");
	const [limit, setLimit] = useState(
		filsToAedInput(
			c?.status === "applied" ? c.requested_limit_fils : c?.credit_limit_fils,
		),
	);
	const [note, setNote] = useState("");
	const [limitError, setLimitError] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<"rejected" | "suspended" | null>(null);

	// Reset the form when the server state changes (after a decision).
	useEffect(() => {
		setEditing(c?.status === "applied");
		setTerms(c?.terms ?? "net_30");
		setLimit(
			filsToAedInput(
				c?.status === "applied" ? c.requested_limit_fils : c?.credit_limit_fils,
			),
		);
		setNote("");
		setLimitError(null);
	}, [c?.status, c?.terms, c?.credit_limit_fils, c?.requested_limit_fils]);

	function approve() {
		const parsed = parseCreditLimitInput(limit);
		if (!parsed.ok) {
			setLimitError(parsed.error);
			return;
		}
		setLimitError(null);
		decide.mutate(
			{
				id: account.id,
				decision: "approved",
				terms,
				credit_limit_fils: parsed.fils,
				note: note.trim() || undefined,
			},
			{
				onSuccess: () =>
					toast({
						title: `${termsLabel(terms)} approved`,
						description: `Credit limit ${formatAedGrouped(parsed.fils)}.`,
					}),
				onError: (err) =>
					toast({
						title: "Could not approve net terms",
						description: apiErrorMessage(err, "Try again."),
						variant: "destructive",
					}),
			},
		);
	}

	async function decideNegative(decision: "rejected" | "suspended") {
		try {
			await decide.mutateAsync({
				id: account.id,
				decision,
				note: note.trim() || undefined,
			});
			toast({
				title:
					decision === "rejected"
						? "Net terms rejected"
						: "Net terms suspended",
			});
		} catch (err) {
			toast({
				title: "Could not save the decision",
				description: apiErrorMessage(err, "Try again."),
				variant: "destructive",
			});
		}
	}

	return (
		<Card>
			<CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
				<CardTitle className="text-base font-semibold">Net terms</CardTitle>
				{c && <StatusBadge status={c.status} colorMap={NET_TERMS_COLORS} />}
			</CardHeader>
			<CardContent className="space-y-4">
				{!c ? (
					<p className="text-sm text-taupe">
						No application. A business admin can apply for Net 30 or Net 60 from
						their account once the business is verified.
					</p>
				) : (
					<>
						<dl className="divide-y divide-pearl/40">
							<Row
								label={c.status === "applied" ? "Requested terms" : "Terms"}
								value={termsLabel(c.terms)}
							/>
							<Row
								label="Requested limit"
								value={formatAedGrouped(c.requested_limit_fils)}
							/>
							<Row label="Applied" value={formatDate(c.applied_at)} />
							{c.decided_at && (
								<Row label="Decided" value={formatDate(c.decided_at)} />
							)}
						</dl>

						{c.status !== "applied" && (
							<div>
								<h3 className="text-xs font-semibold uppercase tracking-wide text-taupe mb-1">
									Credit
								</h3>
								<dl className="divide-y divide-pearl/40">
									<Row
										label="Credit limit"
										value={formatAedGrouped(c.credit_limit_fils)}
										tone="strong"
									/>
									<Row
										label="Used"
										value={formatAedGrouped(c.outstanding_fils)}
									/>
									<Row
										label="Available"
										value={formatAedGrouped(c.available_fils)}
									/>
									<Row
										label={`Overdue (${c.overdue_count})`}
										value={formatAedGrouped(c.overdue_fils)}
										tone={c.overdue_count > 0 ? "error" : undefined}
									/>
								</dl>
								{c.overdue_count > 0 && (
									<p className="mt-2 text-xs text-russet">
										Pay on invoice is blocked at checkout until the overdue
										invoices are paid.
									</p>
								)}
							</div>
						)}

						{c.decision_note && (
							<p className="text-sm text-cacao rounded-xs bg-pearl/25 px-3 py-2">
								<span className="text-taupe">Note: </span>
								{c.decision_note}
							</p>
						)}
					</>
				)}

				{c && (actions.length > 0 || offerApprove) && (
					<div className="space-y-3 border-t border-pearl/40 pt-4">
						{offerApprove && !editing && (
							<Button
								variant="outline"
								size="sm"
								className="w-full"
								onClick={() => setEditing(true)}
							>
								{c.status === "approved"
									? "Change terms or limit"
									: "Approve net terms"}
							</Button>
						)}

						{offerApprove && editing && (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<Label htmlFor="nt-terms">Terms</Label>
									<Select
										value={terms}
										onValueChange={(v) => setTerms(v as PaymentTerms)}
									>
										<SelectTrigger id="nt-terms" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{TERMS_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="nt-limit">Credit limit (AED)</Label>
									<Input
										id="nt-limit"
										inputMode="decimal"
										className="tabular-nums"
										value={limit}
										onChange={(e) => {
											setLimit(e.target.value);
											if (limitError) setLimitError(null);
										}}
										aria-invalid={!!limitError}
										aria-describedby={limitError ? "nt-limit-error" : undefined}
									/>
									{limitError && (
										<p id="nt-limit-error" className="text-xs text-russet">
											{limitError}
										</p>
									)}
								</div>
							</div>
						)}

						<div className="space-y-1.5">
							<Label htmlFor="nt-note">Note to the business (optional)</Label>
							<Textarea
								id="nt-note"
								rows={2}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="e.g. Limit reviewed after three months of on-time payment."
							/>
						</div>

						<div className="flex flex-wrap gap-2">
							{offerApprove && editing && (
								<Button
									onClick={approve}
									disabled={decide.isPending || !canApprove}
								>
									{decide.isPending
										? "Saving…"
										: c.status === "approved"
											? "Save terms"
											: "Approve"}
								</Button>
							)}
							{actions.includes("reject") && (
								<Button
									variant="outline"
									className="text-russet border-russet/40 hover:bg-russet/5"
									onClick={() => setConfirm("rejected")}
									disabled={decide.isPending}
								>
									Reject
								</Button>
							)}
							{actions.includes("suspend") && (
								<Button
									variant="outline"
									className="text-russet border-russet/40 hover:bg-russet/5"
									onClick={() => setConfirm("suspended")}
									disabled={decide.isPending}
								>
									Suspend
								</Button>
							)}
						</div>
						{!verified && c.status !== "approved" && (
							<p className="text-xs text-taupe">
								Verify the business before approving net terms.
							</p>
						)}
					</div>
				)}
			</CardContent>

			<ConfirmDialog
				open={confirm !== null}
				title={
					confirm === "suspended" ? "Suspend net terms?" : "Reject net terms?"
				}
				description={
					confirm === "suspended"
						? "Pay on invoice stops at checkout straight away. Orders already on terms stay due on their dates."
						: "The business can apply again later."
				}
				confirmLabel={confirm === "suspended" ? "Suspend" : "Reject"}
				destructive
				busy={decide.isPending}
				onConfirm={() => (confirm ? decideNegative(confirm) : undefined)}
				onClose={() => setConfirm(null)}
			/>
		</Card>
	);
}
