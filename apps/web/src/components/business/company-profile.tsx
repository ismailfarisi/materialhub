"use client";

import {
	FormMessage,
	Input,
	PageHeader,
	Panel,
	PanelHead,
	StatusBadge,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { aedInputToFils } from "@/lib/business/net-terms";
import type { BusinessMe } from "@/lib/business/types";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useUpdateBusiness } from "@/lib/queries/business";
import { formatDate } from "@/lib/utils";
import { ChevronRight, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useState } from "react";
import { BusinessForm } from "./business-form";
import {
	Amount,
	InfoRow,
	RoleBadge,
	SpecValue,
	Toggle,
	VerificationBadge,
	useAmountText,
} from "./business-ui";
import { CREDIT_TONE } from "./net-terms-panel";

export function CompanyProfile({ data }: { data: BusinessMe }) {
	const t = useTranslations("business");
	const tEmirates = useTranslations("emirates");
	const locale = useLocale();
	const update = useUpdateBusiness();
	const [editing, setEditing] = useState(false);
	const [saved, setSaved] = useState(false);
	const account = data.account;
	if (!account) return null;
	const isAdmin = data.membership?.role === "admin";
	const addr = account.billing_address;
	const emirate = UAE_EMIRATES.find((e) => e.value === addr?.emirate);

	return (
		<div className="grid gap-4">
			<PageHeader
				title={account.legal_name}
				description={t("profile.intro")}
				action={
					isAdmin && !editing ? (
						<Button
							variant="outline"
							onClick={() => {
								setEditing(true);
								setSaved(false);
							}}
						>
							<Pencil
								className="h-4 w-4"
								strokeWidth={1.75}
								aria-hidden="true"
							/>
							{t("profile.edit")}
						</Button>
					) : null
				}
				className="mb-2 md:mb-4"
			/>

			{/* Verification */}
			<Panel as="div" className="grid gap-2 p-4 md:p-5">
				<div className="flex flex-wrap items-center gap-2">
					<VerificationBadge status={account.verification_status} />
					{data.membership && (
						<span className="ms-auto inline-flex items-center gap-2 text-[13px] text-nl-russet">
							{t("profile.yourRole")}
							<RoleBadge role={data.membership.role} />
						</span>
					)}
				</div>
				<p className="m-0 max-w-[65ch] text-[13.5px] text-nl-russet">
					{account.verification_status === "verified" ? (
						account.verified_at ? (
							t("verification.verifiedBody", {
								date: formatDate(account.verified_at, locale),
							})
						) : null
					) : account.verification_status === "rejected" ? (
						<>
							<span className="text-nl-cacao">
								{t("verification.rejectedBody", {
									reason: account.rejection_reason ?? "—",
								})}
							</span>{" "}
							{t("verification.rejectedNext")}
						</>
					) : (
						t("verification.pendingBody")
					)}
				</p>
			</Panel>

			{saved && !editing && (
				<FormMessage tone="success">{t("form.saved")}</FormMessage>
			)}

			{editing ? (
				<Panel>
					<PanelHead title={t("profile.editTitle")} />
					<div className="p-4 md:p-5">
						<BusinessForm
							initial={account}
							submitLabel={t("form.save")}
							busyLabel={t("form.saving")}
							busy={update.isPending}
							onCancel={() => setEditing(false)}
							onSubmit={async (input) => {
								await update.mutateAsync(input);
								setEditing(false);
								setSaved(true);
							}}
						/>
					</div>
				</Panel>
			) : (
				<Panel>
					<PanelHead title={t("profile.detailsTitle")} />
					<dl className="m-0 grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2 md:p-5">
						<InfoRow label={t("profile.legalName")}>
							{account.legal_name}
						</InfoRow>
						{account.trade_name && (
							<InfoRow label={t("profile.tradeName")}>
								{account.trade_name}
							</InfoRow>
						)}
						<InfoRow label={t("profile.licence")}>
							<span className="grid gap-0.5">
								<SpecValue>{account.trade_licence_number}</SpecValue>
								<span className="text-[13px] text-nl-russet">
									{[
										account.trade_licence_issuer,
										t("profile.licenceExpires", {
											date: formatDate(account.trade_licence_expiry, locale),
										}),
									]
										.filter(Boolean)
										.join(" · ")}
								</span>
							</span>
						</InfoRow>
						<InfoRow label={t("profile.licenceDoc")}>
							{account.has_licence_document
								? t("profile.licenceDocOnFile")
								: t("profile.licenceDocMissing")}
						</InfoRow>
						<InfoRow label={t("profile.trn")}>
							{account.vat_registered && account.trn ? (
								<SpecValue className="text-[14.5px]">{account.trn}</SpecValue>
							) : (
								<span className="text-nl-russet">{t("profile.notVat")}</span>
							)}
						</InfoRow>
						<InfoRow label={t("profile.billing")}>
							<address className="grid gap-0.5 not-italic">
								<span>
									{[addr.line1, addr.line2].filter(Boolean).join(", ")}
								</span>
								<span>
									{[
										addr.city,
										emirate ? tEmirates(emirate.labelKey) : addr.emirate,
									]
										.filter(Boolean)
										.join(", ")}
								</span>
								{addr.po_box && (
									<span className="text-[13px] text-nl-russet">
										{t("form.poBox")}{" "}
										<SpecValue className="text-[13px]">{addr.po_box}</SpecValue>
									</span>
								)}
							</address>
						</InfoRow>
						<InfoRow label={t("profile.peppol")} className="sm:col-span-2">
							<span className="grid gap-1">
								{account.peppol_participant_id ? (
									<SpecValue>{account.peppol_participant_id}</SpecValue>
								) : (
									<span className="text-nl-russet">
										{t("profile.peppolNone")}
									</span>
								)}
								<span className="max-w-[65ch] text-[13px] leading-relaxed text-nl-russet">
									{t("profile.peppolHint")}
								</span>
							</span>
						</InfoRow>
					</dl>
				</Panel>
			)}

			<ApprovalLimitPanel
				threshold={account.approval_threshold_fils}
				isAdmin={isAdmin}
			/>
			<TermsSummary data={data} />
		</div>
	);
}

function ApprovalLimitPanel({
	threshold,
	isAdmin,
}: { threshold: number | null; isAdmin: boolean }) {
	const t = useTranslations("business");
	const money = useAmountText();
	const update = useUpdateBusiness();
	const id = useId();
	const [on, setOn] = useState(threshold != null);
	const [value, setValue] = useState(
		threshold != null ? String(threshold / 100) : "",
	);
	const [msg, setMsg] = useState<{
		tone: "success" | "error";
		text: string;
	} | null>(null);

	const save = async () => {
		const fils = on ? aedInputToFils(value) : null;
		if (on && (fils == null || fils <= 0))
			return setMsg({ tone: "error", text: t("errors.amount") });
		try {
			await update.mutateAsync({ approval_threshold_fils: fils });
			setMsg({ tone: "success", text: t("profile.limitSaved") });
		} catch {
			setMsg({ tone: "error", text: t("errors.generic") });
		}
	};

	return (
		<Panel>
			<PanelHead title={t("profile.limitTitle")} />
			<div className="grid gap-4 p-4 md:p-5">
				<p className="m-0 max-w-[65ch] text-[13.5px] text-nl-russet">
					{t("profile.limitBody")}
				</p>
				{isAdmin ? (
					<>
						<Toggle
							id={`${id}-on`}
							checked={on}
							onChange={(v) => {
								setOn(v);
								setMsg(null);
							}}
							label={t("profile.limitEnable")}
						/>
						{on && (
							<div className="grid max-w-xs gap-1.5">
								<label
									htmlFor={`${id}-amt`}
									className="text-[13px] font-medium text-nl-cacao"
								>
									{t("profile.limitInput")}
								</label>
								<Input
									id={`${id}-amt`}
									dir="ltr"
									inputMode="decimal"
									className="font-mono tabular-nums rtl:text-end"
									value={value}
									onChange={(e) => {
										setValue(e.target.value);
										setMsg(null);
									}}
								/>
							</div>
						)}
						<div className="flex flex-wrap items-center gap-3">
							<Button
								variant="primary"
								size="sm"
								disabled={update.isPending}
								onClick={save}
							>
								{update.isPending ? t("form.saving") : t("profile.limitSave")}
							</Button>
							{msg && <FormMessage tone={msg.tone}>{msg.text}</FormMessage>}
						</div>
					</>
				) : (
					<div className="grid gap-1">
						<p className="m-0 text-[14.5px] text-nl-cacao">
							{threshold != null
								? t("profile.limitValue", { amount: money(threshold) })
								: t("profile.limitOff")}
						</p>
						<p className="m-0 text-[13px] text-nl-russet">
							{t("profile.limitAdminOnly")}
						</p>
					</div>
				)}
			</div>
		</Panel>
	);
}

function TermsSummary({ data }: { data: BusinessMe }) {
	const t = useTranslations("business");
	const locale = useLocale();
	const credit = data.credit;
	return (
		<Panel as="div">
			<Link
				href={`/${locale}/account/business/terms`}
				className="group flex items-center gap-3 rounded-md px-4 py-4 transition-colors hover:bg-nl-cacao/[0.03] md:px-5"
			>
				<span className="grid min-w-0 flex-1 gap-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className="font-display text-[15.5px] font-semibold text-nl-cacao">
							{t("profile.termsTitle")}
						</span>
						<StatusBadge tone={credit ? CREDIT_TONE[credit.status] : "neutral"}>
							{t(`terms.status.${credit?.status ?? "none"}`)}
						</StatusBadge>
					</span>
					{credit?.status === "approved" ? (
						<span className="text-[13.5px] text-nl-russet">
							{t("terms.available")}{" "}
							<Amount fils={credit.available_fils} className="text-nl-cacao" />{" "}
							· {t(`terms.${credit.terms}`)}
						</span>
					) : (
						<span className="text-[13.5px] text-nl-russet">
							{t("profile.termsApply")}
						</span>
					)}
				</span>
				<ChevronRight
					className="h-4 w-4 shrink-0 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
			</Link>
		</Panel>
	);
}
