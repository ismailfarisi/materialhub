"use client";

import { Textarea } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import {
	dueDateFor,
	moneyParam,
	netTermsDays,
	netTermsReasonKey,
} from "@/lib/business/net-terms";
import type { CheckoutQuoteBusiness, NetTerms } from "@/lib/business/types";
import { UAE_EMIRATES } from "@/lib/emirates";
import { useBusiness, useRequestApproval } from "@/lib/queries/business";
import {
	type CheckoutQuotePaymentMethod,
	invalidateQuoteEtag,
} from "@/lib/queries/checkout-quote";
import { cn, formatDate } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Clock, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { create } from "zustand";
import { useAmountText } from "./business-ui";

/**
 * Workstream 3 checkout pieces: the "Pay on invoice" option text, its
 * details, the "Invoice to" block and the approval-required panel. Kept here
 * so checkout only gains one-line insertions.
 */

/* ----------------------- approval-required flag ----------------------- */

interface ApprovalGateState {
	/** Set when POST /checkout/initiate answered 403 APPROVAL_REQUIRED. */
	blocked: boolean;
	setBlocked: (v: boolean) => void;
}
export const useApprovalGate = create<ApprovalGateState>((set) => ({
	blocked: false,
	setBlocked: (blocked) => set({ blocked }),
}));

/* ------------------------- net terms helpers -------------------------- */

/** Terms for the method: the method entry, then the quote's business block, then the credit account. */
export function useNetTermsTerms(
	method?: CheckoutQuotePaymentMethod | null,
): NetTerms | null {
	const quoteBusiness = useCheckoutStore((s) => s.quoteData?.business);
	const fromQuote =
		((method as { terms?: NetTerms } | null | undefined)?.terms ??
			quoteBusiness?.terms ??
			null) ||
		null;
	const business = useBusiness(!!method && !fromQuote);
	return fromQuote ?? business.data?.credit?.terms ?? null;
}

/** Label for the net-terms payment option: "Pay on invoice (net 30)". */
export function netTermsMethodName(
	t: (k: string, v?: Record<string, string>) => string,
	terms: NetTerms | null,
) {
	return terms
		? t("methodName", { terms: t(`termsShort.${terms}`) })
		: t("methodNameNoTerms");
}

/** Text inside the payment option: name and either the due-date hint or why it's unavailable. */
export function NetTermsOptionText({
	method,
}: { method: CheckoutQuotePaymentMethod }) {
	const t = useTranslations("business.checkout");
	const locale = useLocale();
	const money = useAmountText();
	const terms = useNetTermsTerms(method);
	const available =
		method.max_amount_fils ?? moneyParam(method.reason_params, "available");

	let hint: string;
	if (!method.available) {
		const key = netTermsReasonKey(method.reason_key).replace(/^checkout\./, "");
		const avail =
			moneyParam(method.reason_params, "available") ??
			method.max_amount_fils ??
			0;
		hint = t(key as "reason.unavailable", { available: money(avail) });
	} else if (terms) {
		hint = t("hint", {
			date: formatDate(dueDateFor(terms).toISOString(), locale),
			days: netTermsDays(terms) ?? 30,
			available: money(available ?? 0),
		});
	} else {
		hint = t("hintNoTerms", { available: money(available ?? 0) });
	}

	return (
		<span className="grid min-w-0 flex-1">
			<span className="font-medium text-nl-cacao">
				{netTermsMethodName(t as never, terms)}
			</span>
			<span
				className={cn(
					"text-[13px]",
					method.available ? "text-nl-russet" : "text-nl-cacao",
				)}
			>
				{hint}
			</span>
		</span>
	);
}

export const NetTermsIcon = FileText;

/** Shown under the method list when "Pay on invoice" is selected. */
export function NetTermsDetails({
	method,
}: { method: CheckoutQuotePaymentMethod }) {
	const t = useTranslations("business.checkout");
	const locale = useLocale();
	const terms = useNetTermsTerms(method);
	if (!method.available) return null;
	return (
		<div className="grid gap-1 border-t border-nl-cacao/10 pt-4 text-[14px]">
			<p className="m-0 text-nl-cacao">
				{terms
					? t("details", {
							date: formatDate(dueDateFor(terms).toISOString(), locale),
						})
					: t("detailsNoDate")}
			</p>
		</div>
	);
}

/* ------------------------- billing + approval ------------------------- */

/** Everything the business block adds to checkout, inserted above the payment step. */
export function BusinessCheckoutBlock() {
	const business = useCheckoutStore((s) => s.quoteData?.business);
	const blocked = useApprovalGate((s) => s.blocked);
	if (!business) return null;
	const status = business.approval?.status;
	const showApproval =
		business.approval_required ||
		blocked ||
		status === "pending" ||
		status === "rejected";
	return (
		<div className="grid gap-4">
			{showApproval && <ApprovalRequiredPanel business={business} />}
			<InvoiceToBlock business={business} />
		</div>
	);
}

export function InvoiceToBlock({
	business,
}: { business: CheckoutQuoteBusiness }) {
	const t = useTranslations("business.checkout");
	const tEmirates = useTranslations("emirates");
	const locale = useLocale();
	const a = business.billing_address;
	const emirate = UAE_EMIRATES.find((e) => e.value === a?.emirate);
	return (
		<section
			aria-labelledby="checkout-invoice-to"
			className="rounded-md bg-nl-pearl px-4 py-4 shadow-card sm:px-6"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2
					id="checkout-invoice-to"
					className="m-0 font-display text-[15.5px] font-semibold tracking-[-0.01em] text-nl-cacao"
				>
					{t("invoiceTo")}
				</h2>
				<Link
					href={`/${locale}/account/business`}
					className="text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
				>
					{t("editInBusiness")}
				</Link>
			</div>
			<dl className="m-0 mt-3 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-[minmax(0,1fr)_auto]">
				<div className="grid min-w-0 gap-0.5">
					<dt className="sr-only">{t("invoiceTo")}</dt>
					<dd className="m-0 break-words font-medium text-nl-cacao">
						{business.legal_name}
					</dd>
					{a && (
						<dd className="m-0 break-words text-[13.5px] text-nl-russet">
							{[
								a.line1,
								a.line2,
								a.city,
								emirate ? tEmirates(emirate.labelKey) : a.emirate,
							]
								.filter(Boolean)
								.join(", ")}
						</dd>
					)}
				</div>
				<div className="grid content-start gap-0.5 sm:text-end">
					<dt className="mill-label text-nl-russet">{t("trn")}</dt>
					<dd className="m-0">
						{business.trn ? (
							<bdi
								dir="ltr"
								className="font-mono text-[13.5px] tabular-nums text-nl-cacao"
							>
								{business.trn}
							</bdi>
						) : (
							<span className="text-[13.5px] text-nl-russet">{t("noTrn")}</span>
						)}
					</dd>
				</div>
			</dl>
		</section>
	);
}

/**
 * "This order is above your company's approval limit": send the cart for
 * approval, then show where the request stands. The quote's `business.approval`
 * carries the status after a refetch.
 */
export function ApprovalRequiredPanel({
	business,
}: { business: CheckoutQuoteBusiness }) {
	const t = useTranslations("business.checkout.approval");
	const locale = useLocale();
	const money = useAmountText();
	const qc = useQueryClient();
	const selectedAddressId = useCheckoutStore((s) => s.selectedAddressId);
	const setBlocked = useApprovalGate((s) => s.setBlocked);
	const blocked = useApprovalGate((s) => s.blocked);
	const request = useRequestApproval();
	const [note, setNote] = useState("");
	const [failed, setFailed] = useState(false);
	const [sentNow, setSentNow] = useState(false);
	const noteId = useId();
	const ref = useRef<HTMLElement>(null);

	// When the 403 arrives after pressing Place order, bring the panel into view.
	useEffect(() => {
		if (blocked)
			ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [blocked]);

	const status = business.approval?.status ?? (sentNow ? "pending" : null);
	const canSend =
		!status ||
		status === "rejected" ||
		status === "expired" ||
		status === "cancelled";
	const approved = status === "approved" && !business.approval_required;

	async function send() {
		setFailed(false);
		try {
			await request.mutateAsync(note.trim() ? { note: note.trim() } : {});
			setSentNow(true);
			setBlocked(false);
			invalidateQuoteEtag(selectedAddressId);
			await qc.invalidateQueries({ queryKey: ["checkout", "quote"] });
		} catch {
			setFailed(true);
		}
	}

	const statusLine =
		status === "pending"
			? { icon: Clock, text: t("pending"), cls: "text-nl-cacao" }
			: approved
				? { icon: Check, text: t("approved"), cls: "text-status-success" }
				: status === "rejected"
					? { icon: AlertCircle, text: t("rejected"), cls: "text-destructive" }
					: status === "expired"
						? { icon: AlertCircle, text: t("expired"), cls: "text-nl-cacao" }
						: null;

	return (
		<section
			ref={ref}
			aria-labelledby="checkout-approval"
			className={cn(
				"grid gap-3 rounded-md border bg-nl-pearl px-4 py-4 sm:px-6",
				approved ? "border-nl-cacao/15" : "border-status-warning/50",
			)}
		>
			<div className="grid gap-1">
				<h2
					id="checkout-approval"
					className="m-0 flex items-center gap-2 font-display text-[15.5px] font-semibold text-nl-cacao"
				>
					<AlertCircle
						className="h-4 w-4 shrink-0 text-status-warning"
						strokeWidth={2}
						aria-hidden="true"
					/>
					{t("title")}
				</h2>
				<p className="m-0 text-[14px] text-nl-cacao">
					{business.approval_threshold_fils != null
						? t("body", { amount: money(business.approval_threshold_fils) })
						: t("bodyNoAmount")}
				</p>
				{canSend && (
					<p className="m-0 max-w-[62ch] text-[13px] text-nl-russet">
						{t("explain")}
					</p>
				)}
			</div>

			{statusLine && (
				<output
					className={cn(
						"m-0 flex items-start gap-2 text-[13.5px]",
						statusLine.cls,
					)}
				>
					<statusLine.icon
						className="mt-0.5 h-4 w-4 shrink-0"
						strokeWidth={2}
						aria-hidden="true"
					/>
					<span>{statusLine.text}</span>
				</output>
			)}

			{canSend && (
				<div className="grid gap-3">
					<div className="grid gap-1.5">
						<label
							htmlFor={noteId}
							className="text-[13px] font-medium text-nl-cacao"
						>
							{t("noteLabel")}
						</label>
						<Textarea
							id={noteId}
							rows={2}
							className="min-h-[72px]"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<Button
							type="button"
							variant="primary"
							disabled={request.isPending}
							onClick={send}
						>
							{request.isPending
								? t("sending")
								: status
									? t("sendAgain")
									: t("send")}
						</Button>
						{failed && (
							<span role="alert" className="text-[13px] text-destructive">
								{t("failed")}
							</span>
						)}
					</div>
				</div>
			)}

			{status === "pending" && (
				<Link
					href={`/${locale}/account/business/approvals`}
					className="justify-self-start text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
				>
					{t("viewRequests")}
				</Link>
			)}
		</section>
	);
}
