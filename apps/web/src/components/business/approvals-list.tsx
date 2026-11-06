"use client";

import {
	EmptyState,
	ErrorState,
	FormMessage,
	ListSkeleton,
	Panel,
	Select,
	StatusBadge,
	Textarea,
	type Tone,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import type {
	Approval,
	ApprovalStatus,
	BusinessMe,
} from "@/lib/business/types";
import { useApprovals, useDecideApproval } from "@/lib/queries/business";
import { formatDate } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";
import {
	Amount,
	SegmentedFilter,
	SpecValue,
	useAmountText,
} from "./business-ui";

export const APPROVAL_TONE: Record<ApprovalStatus, Tone> = {
	pending: "warning",
	approved: "success",
	rejected: "error",
	used: "neutral",
	expired: "neutral",
	cancelled: "neutral",
};

type View = "pending" | "history";
type HistoryStatus = Exclude<ApprovalStatus, "pending"> | "all";
const HISTORY: HistoryStatus[] = [
	"all",
	"approved",
	"rejected",
	"used",
	"expired",
	"cancelled",
];

export function ApprovalsList({ data }: { data: BusinessMe }) {
	const t = useTranslations("business.approvals");
	const money = useAmountText();
	const [view, setView] = useState<View>("pending");
	const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("all");
	const filterId = useId();
	const canDecideRole =
		data.membership?.role === "admin" || data.membership?.role === "approver";
	const status = view === "pending" ? "pending" : historyStatus;
	const query = useApprovals(status, !!data.account);
	// "All decisions" leaves out requests still waiting; they live under Waiting.
	const rows = (query.data ?? []).filter((a) =>
		view === "pending" ? a.status === "pending" : a.status !== "pending",
	);
	const threshold = data.account?.approval_threshold_fils ?? null;

	return (
		<div className="grid gap-4">
			<p className="m-0 max-w-[65ch] text-sm text-nl-russet">
				{canDecideRole
					? threshold != null
						? t("introDecide", { amount: money(threshold) })
						: t("introDecideNoLimit")
					: t("introBuyer")}
			</p>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<SegmentedFilter<View>
					label={t("filterLabel")}
					value={view}
					onChange={setView}
					options={[
						{ value: "pending", label: t("waiting") },
						{ value: "history", label: t("history") },
					]}
				/>
				{view === "history" && (
					<div className="flex items-center gap-2">
						<label htmlFor={filterId} className="text-[13px] text-nl-russet">
							{t("historyFilter")}
						</label>
						<Select
							id={filterId}
							className="h-10 w-auto min-w-[10rem]"
							value={historyStatus}
							onChange={(e) =>
								setHistoryStatus(e.target.value as HistoryStatus)
							}
						>
							{HISTORY.map((s) => (
								<option key={s} value={s}>
									{s === "all" ? t("allStatuses") : t(`status.${s}`)}
								</option>
							))}
						</Select>
					</div>
				)}
			</div>

			{query.isLoading ? (
				<ListSkeleton rows={2} />
			) : query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : rows.length === 0 ? (
				<EmptyState
					icon={ClipboardCheck}
					title={view === "pending" ? t("emptyTitle") : t("emptyHistoryTitle")}
					body={view === "pending" ? t("emptyBody") : t("emptyHistoryBody")}
				/>
			) : (
				<ul className="m-0 grid list-none gap-3 p-0">
					{rows.map((a) => (
						<ApprovalCard key={a.id} approval={a} />
					))}
				</ul>
			)}
		</div>
	);
}

export function ApprovalCard({ approval: a }: { approval: Approval }) {
	const t = useTranslations("business.approvals");
	const tForm = useTranslations("business.form");
	const locale = useLocale();
	const decide = useDecideApproval();
	const [note, setNote] = useState("");
	const [failed, setFailed] = useState(false);
	const noteId = useId();
	const busy = decide.isPending;
	const requester = a.requested_by.name || a.requested_by.email;

	const act = (action: "approve" | "reject" | "cancel") => {
		if (action === "cancel" && !confirm(t("withdrawConfirm"))) return;
		setFailed(false);
		decide.mutate(
			{ id: a.id, action, ...(note.trim() ? { note: note.trim() } : {}) },
			{ onError: () => setFailed(true) },
		);
	};

	return (
		<Panel as="li">
			<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-nl-cacao/10 px-4 py-3 md:px-5">
				<div className="grid min-w-0 gap-0.5">
					<p className="m-0 break-words text-[14.5px] font-medium text-nl-cacao">
						{t("from", { name: requester })}
					</p>
					<p className="m-0 text-[13px] text-nl-russet">
						{t("sentOn", { date: formatDate(a.created_at, locale) })} ·{" "}
						{t("items", { count: a.item_count })}
					</p>
				</div>
				<div className="grid justify-items-end gap-1 text-end">
					<StatusBadge tone={APPROVAL_TONE[a.status]}>
						{t(`status.${a.status}`)}
					</StatusBadge>
					<Amount
						fils={a.amount_fils}
						className="text-[15px] font-medium text-nl-cacao"
					/>
				</div>
			</div>

			<ul className="m-0 grid list-none divide-y divide-nl-cacao/[0.07] px-4 p-0 md:px-5">
				{a.items.map((it, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: snapshot lines have no id
						key={i}
						className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 py-2.5"
					>
						<span className="min-w-0 break-words text-[14px] text-nl-cacao">
							{it.product_name}
							{it.variant_name && (
								<span className="text-nl-russet"> · {it.variant_name}</span>
							)}
						</span>
						<Amount
							fils={it.line_total_fils}
							className="text-[13.5px] text-nl-cacao"
						/>
						<span className="text-[12.5px] text-nl-russet">
							{it.vendor_name && <>{it.vendor_name} · </>}
							<bdi dir="ltr" className="font-mono tabular-nums">
								{it.quantity} × <Amount fils={it.unit_price_fils} />
							</bdi>
						</span>
					</li>
				))}
			</ul>

			<div className="grid gap-3 border-t border-nl-cacao/10 px-4 py-3 md:px-5">
				{a.note && (
					<p className="m-0 text-[13.5px] text-nl-cacao">
						<span className="text-nl-russet">{t("buyerNote")}: </span>
						{a.note}
					</p>
				)}
				{a.decided_by && a.decided_at && (
					<p className="m-0 text-[13px] text-nl-russet">
						{t("decided", {
							status: t(
								`status.${a.status === "used" ? "approved" : a.status}`,
							),
							name: a.decided_by.name || a.decided_by.email,
							date: formatDate(a.decided_at, locale),
						})}
					</p>
				)}
				{a.decision_note && a.decided_by && (
					<p className="m-0 text-[13.5px] text-nl-cacao">
						<span className="text-nl-russet">
							{t("decisionNote", {
								name: a.decided_by.name || a.decided_by.email,
							})}
							:{" "}
						</span>
						{a.decision_note}
					</p>
				)}
				{a.status === "approved" && a.expires_at && (
					<p className="m-0 text-[13px] text-nl-russet">
						{t("validUntil", {
							date: formatDate(a.expires_at, locale, {
								day: "numeric",
								month: "short",
								hour: "2-digit",
								minute: "2-digit",
							}),
						})}
					</p>
				)}
				{a.order_id && a.order_number && (
					<Link
						href={`/${locale}/account/orders/${a.order_id}`}
						className="justify-self-start text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao"
					>
						{t("order")}{" "}
						<SpecValue className="text-[13px]">{a.order_number}</SpecValue>
					</Link>
				)}

				{a.status === "pending" && a.can_decide && (
					<div className="grid gap-3">
						<div className="grid gap-1.5">
							<label
								htmlFor={noteId}
								className="text-[13px] font-medium text-nl-cacao"
							>
								{t("noteLabel")}
								<span className="ms-1.5 font-normal text-nl-russet">
									({tForm("optional")})
								</span>
							</label>
							<Textarea
								id={noteId}
								rows={2}
								className="min-h-[72px]"
								value={note}
								onChange={(e) => setNote(e.target.value)}
							/>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="primary"
								size="sm"
								disabled={busy}
								onClick={() => act("approve")}
							>
								{t("approve")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => act("reject")}
							>
								{t("reject")}
							</Button>
						</div>
					</div>
				)}
				{a.status === "pending" && !a.can_decide && (
					<div>
						<Button
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => act("cancel")}
						>
							{t("withdraw")}
						</Button>
					</div>
				)}
				{failed && <FormMessage tone="error">{t("failed")}</FormMessage>}
			</div>
		</Panel>
	);
}
