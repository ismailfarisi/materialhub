"use client";

import {
	Field,
	FormMessage,
	Input,
	Panel,
	PanelHead,
	StatusBadge,
	Textarea,
	type Tone,
} from "@/components/account/account-ui";
import { OptionTile } from "@/components/checkout/checkout-ui";
import { Button } from "@/components/swatch";
import {
	aedInputToFils,
	apiErrorCode,
	creditMeterTone,
	netTermsDays,
} from "@/lib/business/net-terms";
import type {
	BusinessMe,
	CreditAccount,
	CreditStatus,
	NetTerms,
} from "@/lib/business/types";
import { useApplyNetTerms } from "@/lib/queries/business";
import { formatDate } from "@/lib/utils";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Amount, CreditMeter, useAmountText } from "./business-ui";

export const CREDIT_TONE: Record<CreditStatus, Tone> = {
	applied: "warning",
	approved: "success",
	rejected: "error",
	suspended: "error",
};

/** Pay on invoice: apply, wait, or see the credit line. */
export function NetTermsPanel({ data }: { data: BusinessMe }) {
	const t = useTranslations("business.terms");
	const credit = data.credit;
	const verified = data.account?.verification_status === "verified";
	const isAdmin = data.membership?.role === "admin";

	return (
		<Panel>
			<PanelHead
				title={t("statusTitle")}
				meta={
					<StatusBadge tone={credit ? CREDIT_TONE[credit.status] : "neutral"}>
						{t(`status.${credit?.status ?? "none"}`)}
					</StatusBadge>
				}
			/>
			<div className="p-4 md:p-5">
				{credit?.status === "approved" ? (
					<ApprovedCredit credit={credit} />
				) : credit?.status === "applied" ? (
					<Applied credit={credit} />
				) : credit?.status === "rejected" || credit?.status === "suspended" ? (
					<Closed
						credit={credit}
						canReapply={isAdmin && verified && credit.status === "rejected"}
					/>
				) : !verified ? (
					<Blocked title={t("needsVerifiedTitle")} body={t("needsVerified")} />
				) : !isAdmin ? (
					<Blocked body={t("adminOnly")} />
				) : (
					<ApplyForm />
				)}
			</div>
		</Panel>
	);
}

function Blocked({ title, body }: { title?: string; body: string }) {
	return (
		<div className="flex items-start gap-3">
			<ShieldCheck
				className="mt-0.5 h-5 w-5 shrink-0 text-nl-russet"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
			<div className="grid gap-1">
				{title && <p className="m-0 font-medium text-nl-cacao">{title}</p>}
				<p className="m-0 max-w-[60ch] text-[14px] text-nl-russet">{body}</p>
			</div>
		</div>
	);
}

function Applied({ credit }: { credit: CreditAccount }) {
	const t = useTranslations("business.terms");
	const locale = useLocale();
	const money = useAmountText();
	return (
		<p className="m-0 max-w-[65ch] text-[14px] text-nl-cacao">
			{t("appliedBody", {
				date: formatDate(credit.applied_at, locale),
				terms: t(credit.terms),
				amount: money(credit.requested_limit_fils ?? 0),
			})}
		</p>
	);
}

function Closed({
	credit,
	canReapply,
}: { credit: CreditAccount; canReapply: boolean }) {
	const t = useTranslations("business.terms");
	return (
		<div className="grid gap-4">
			<div className="grid gap-1">
				<p className="m-0 text-[14px] text-nl-cacao">
					{credit.status === "rejected"
						? t("rejectedBody")
						: t("suspendedBody")}
				</p>
				{credit.decision_note && (
					<p className="m-0 text-[13.5px] text-nl-russet">
						{t("decisionNote", { note: credit.decision_note })}
					</p>
				)}
			</div>
			{canReapply && (
				<div className="border-t border-nl-cacao/10 pt-4">
					<ApplyForm />
				</div>
			)}
		</div>
	);
}

function ApprovedCredit({ credit }: { credit: CreditAccount }) {
	const t = useTranslations("business.terms");
	const locale = useLocale();
	const money = useAmountText();
	const tone = creditMeterTone(credit);
	const days = netTermsDays(credit.terms) ?? 30;

	return (
		<div className="grid gap-5">
			<dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
				<Figure label={t("available")} strong>
					<Amount fils={credit.available_fils} />
				</Figure>
				<Figure label={t("used")}>
					<Amount fils={credit.outstanding_fils} />
				</Figure>
				<Figure label={t("limit")}>
					<Amount fils={credit.credit_limit_fils} />
				</Figure>
				<Figure label={t("termsRow")}>
					<span className="text-[15px] text-nl-cacao">{t(credit.terms)}</span>
				</Figure>
			</dl>

			<div className="grid gap-2">
				<div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
					<span className="text-nl-russet">{t("meterLabel")}</span>
					<span className="font-mono tabular-nums text-nl-cacao">
						<bdi dir="ltr">
							{Math.round(
								(credit.outstanding_fils /
									Math.max(1, credit.credit_limit_fils)) *
									100,
							)}
							%
						</bdi>
					</span>
				</div>
				<CreditMeter
					limitFils={credit.credit_limit_fils}
					usedFils={credit.outstanding_fils}
					tone={tone}
					label={t("meterLabel")}
					valueText={t("meterValue", {
						used: money(credit.outstanding_fils),
						limit: money(credit.credit_limit_fils),
					})}
				/>
			</div>

			{credit.overdue_count > 0 && (
				<output className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/[0.05] px-3.5 py-3">
					<AlertCircle
						className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
						strokeWidth={2}
						aria-hidden="true"
					/>
					<div className="grid gap-2">
						<p className="m-0 text-[13.5px] text-nl-cacao">
							<span className="font-medium text-destructive">
								{t("overdue")}:{" "}
							</span>
							{t("overdueBody", {
								count: credit.overdue_count,
								amount: money(credit.overdue_fils),
							})}
						</p>
						<Link
							href={`/${locale}/account/business/invoices?status=overdue`}
							className="justify-self-start text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao"
						>
							{t("viewOverdue")}
						</Link>
					</div>
				</output>
			)}

			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-nl-cacao/10 pt-4">
				<p className="m-0 max-w-[60ch] text-[13.5px] text-nl-russet">
					{t("howItWorks", { days })}
				</p>
				{credit.overdue_count === 0 && credit.outstanding_fils > 0 && (
					<Link
						href={`/${locale}/account/business/invoices?status=unpaid`}
						className="text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao"
					>
						{t("viewUnpaid")}
					</Link>
				)}
			</div>
		</div>
	);
}

function Figure({
	label,
	strong,
	children,
}: { label: string; strong?: boolean; children: React.ReactNode }) {
	return (
		<div className="grid content-start gap-1">
			<dt className="mill-label text-nl-russet">{label}</dt>
			<dd
				className={
					strong
						? "m-0 text-[20px] font-medium text-nl-cacao"
						: "m-0 text-[15px] text-nl-cacao"
				}
			>
				{children}
			</dd>
		</div>
	);
}

function ApplyForm() {
	const t = useTranslations("business");
	const apply = useApplyNetTerms();
	const [terms, setTerms] = useState<NetTerms>("net_30");
	const [limit, setLimit] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	async function submit(e: FormEvent) {
		e.preventDefault();
		const fils = aedInputToFils(limit);
		if (fils == null || fils <= 0) return setError(t("errors.amount"));
		setError(null);
		try {
			await apply.mutateAsync({
				terms,
				requested_limit_fils: fils,
				...(note.trim() ? { note: note.trim() } : {}),
			});
		} catch (err) {
			const code = apiErrorCode(err);
			setError(
				code &&
					[
						"NOT_VERIFIED",
						"TERMS_ALREADY_ACTIVE",
						"BUSINESS_ROLE_REQUIRED",
					].includes(code)
					? t(`errors.${code}` as "errors.generic")
					: t("errors.generic"),
			);
		}
	}

	return (
		<form onSubmit={submit} noValidate className="grid gap-5">
			<p className="m-0 font-display text-[15.5px] font-semibold text-nl-cacao">
				{t("terms.applyTitle")}
			</p>
			<fieldset className="m-0 grid gap-2 border-0 p-0">
				<legend className="mb-1.5 p-0 text-[13px] font-medium text-nl-cacao">
					{t("terms.termsLabel")}
				</legend>
				<div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
					{(["net_30", "net_60"] as const).map((v) => (
						<OptionTile
							key={v}
							name="net-terms"
							value={v}
							checked={terms === v}
							onSelect={() => setTerms(v)}
						>
							<span className="grid">
								<span className="font-medium text-nl-cacao">
									{t(`terms.${v}`)}
								</span>
								<span className="text-[13px] text-nl-russet">
									{t(`terms.${v}Hint`)}
								</span>
							</span>
						</OptionTile>
					))}
				</div>
			</fieldset>
			<Field
				label={t("terms.requestedLimit")}
				hint={t("terms.requestedLimitHint")}
				className="max-w-sm"
			>
				{(p) => (
					<Input
						{...p}
						dir="ltr"
						inputMode="decimal"
						placeholder="50,000"
						className="font-mono tabular-nums rtl:text-end"
						value={limit}
						onChange={(e) => setLimit(e.target.value)}
					/>
				)}
			</Field>
			<Field label={t("terms.note")} optional>
				{(p) => (
					<Textarea
						{...p}
						rows={3}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				)}
			</Field>
			{error && <FormMessage tone="error">{error}</FormMessage>}
			<div>
				<Button type="submit" variant="primary" disabled={apply.isPending}>
					{apply.isPending ? t("terms.applying") : t("terms.apply")}
				</Button>
			</div>
		</form>
	);
}
