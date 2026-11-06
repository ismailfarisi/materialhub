"use client";

import {
	EmptyState,
	ErrorState,
	FormMessage,
	ListSkeleton,
	Panel,
	StatusBadge,
	type Tone,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import type { InvoiceRow } from "@/lib/business/types";
import {
	type InvoiceFilter,
	fetchInvoicePdfUrl,
	fetchInvoiceXml,
	useInvoices,
} from "@/lib/queries/business";
import { cn, formatDate } from "@/lib/utils";
import { FileCode2, FileDown, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Amount, SegmentedFilter, SpecValue } from "./business-ui";

const PAGE_SIZE = 20;
const FILTERS: InvoiceFilter[] = ["all", "unpaid", "overdue", "paid"];

export function invoiceStatus(
	inv: Pick<InvoiceRow, "payment_status" | "is_overdue">,
): {
	tone: Tone;
	key: "statusOverdue" | "statusPaid" | "statusUnpaid" | "statusVoid";
} {
	if (inv.payment_status === "void")
		return { tone: "neutral", key: "statusVoid" };
	if (inv.payment_status === "paid")
		return { tone: "success", key: "statusPaid" };
	if (inv.is_overdue) return { tone: "error", key: "statusOverdue" };
	return { tone: "warning", key: "statusUnpaid" };
}

/** Save a Blob under a file name (the XML comes as an attachment). */
function saveBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function InvoicesList() {
	const t = useTranslations("business.invoices");
	const [status, setStatus] = useState<InvoiceFilter>("all");
	const [page, setPage] = useState(1);

	// Deep links from the credit panel: ?status=overdue|unpaid|paid.
	useEffect(() => {
		const s = new URLSearchParams(window.location.search).get("status");
		if (s && (FILTERS as string[]).includes(s)) setStatus(s as InvoiceFilter);
	}, []);

	const query = useInvoices({ page, limit: PAGE_SIZE, status });
	const rows = query.data?.items ?? [];
	const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

	return (
		<div className="grid gap-4">
			<SegmentedFilter<InvoiceFilter>
				label={t("filterLabel")}
				value={status}
				onChange={(v) => {
					setStatus(v);
					setPage(1);
				}}
				options={FILTERS.map((f) => ({ value: f, label: t(`filter.${f}`) }))}
			/>

			{query.isLoading ? (
				<ListSkeleton rows={3} />
			) : query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : rows.length === 0 ? (
				<EmptyState
					icon={FileText}
					title={status === "all" ? t("emptyTitle") : t("emptyFilteredTitle")}
					body={status === "all" ? t("emptyBody") : t("emptyFilteredBody")}
				/>
			) : (
				<>
					<InvoiceTable rows={rows} />
					<ul className="m-0 grid list-none gap-3 p-0 lg:hidden">
						{rows.map((inv) => (
							<InvoiceCard key={inv.id} inv={inv} />
						))}
					</ul>
					{pages > 1 && (
						<nav
							className="flex items-center justify-between gap-3"
							aria-label={t("page", { page, pages })}
						>
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => setPage((p) => p - 1)}
							>
								{t("previous")}
							</Button>
							<span className="text-[13px] tabular-nums text-nl-russet">
								{t("page", { page, pages })}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= pages}
								onClick={() => setPage((p) => p + 1)}
							>
								{t("next")}
							</Button>
						</nav>
					)}
				</>
			)}
		</div>
	);
}

function DateCell({
	value,
	fallback,
}: { value: string | null; fallback?: string }) {
	const locale = useLocale();
	if (!value) return <span className="text-nl-russet">{fallback ?? "—"}</span>;
	return (
		<span className="whitespace-nowrap tabular-nums">
			{formatDate(value, locale)}
		</span>
	);
}

function OrderLink({ inv }: { inv: InvoiceRow }) {
	const locale = useLocale();
	return (
		<Link
			href={`/${locale}/account/orders/${inv.order_id}`}
			className="underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
		>
			<SpecValue className="text-[13px]">{inv.order_number}</SpecValue>
		</Link>
	);
}

function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
	const t = useTranslations("business.invoices");
	const th =
		"mill-label px-3 py-3 text-start font-semibold text-nl-russet first:ps-5 last:pe-5";
	const td = "px-3 py-3.5 align-top first:ps-5 last:pe-5";
	return (
		<Panel as="div" className="hidden overflow-x-auto lg:block">
			<table className="w-full border-collapse text-[14px]">
				<thead className="border-b-2 border-nl-cacao">
					<tr>
						<th scope="col" className={th}>
							{t("number")}
						</th>
						<th scope="col" className={th}>
							{t("seller")}
						</th>
						<th scope="col" className={th}>
							{t("issued")}
						</th>
						<th scope="col" className={th}>
							{t("due")}
						</th>
						<th scope="col" className={th}>
							{t("status")}
						</th>
						<th scope="col" className={cn(th, "text-end")}>
							{t("total")}
						</th>
						<th scope="col" className={cn(th, "text-end")}>
							{t("files")}
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-nl-cacao/10">
					{rows.map((inv) => {
						const st = invoiceStatus(inv);
						return (
							<tr key={inv.id}>
								<td className={td}>
									<div className="grid gap-0.5">
										<SpecValue className="whitespace-nowrap">
											{inv.invoice_number}
										</SpecValue>
										<span className="text-[12.5px] text-nl-russet">
											{t("order")} <OrderLink inv={inv} />
										</span>
									</div>
								</td>
								<td className={td}>
									<div className="grid gap-0.5">
										<span className="text-nl-cacao">{inv.seller_name}</span>
										{inv.seller_trn ? (
											<SpecValue className="text-[12.5px] text-nl-russet">
												{inv.seller_trn}
											</SpecValue>
										) : (
											<span className="text-[12.5px] text-nl-russet">
												{t("noTrn")}
											</span>
										)}
									</div>
								</td>
								<td className={td}>
									<DateCell value={inv.issue_date} />
								</td>
								<td className={td}>
									<span
										className={inv.is_overdue ? "text-destructive" : undefined}
									>
										<DateCell value={inv.due_date} fallback={t("atCheckout")} />
									</span>
								</td>
								<td className={td}>
									<StatusBadge tone={st.tone}>{t(st.key)}</StatusBadge>
								</td>
								<td className={cn(td, "text-end")}>
									<Amount
										fils={inv.total_fils}
										className="font-medium text-nl-cacao"
									/>
								</td>
								<td className={cn(td, "text-end")}>
									<InvoiceDownloads inv={inv} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</Panel>
	);
}

function InvoiceCard({ inv }: { inv: InvoiceRow }) {
	const t = useTranslations("business.invoices");
	const st = invoiceStatus(inv);
	return (
		<Panel as="li">
			<div className="flex items-start justify-between gap-3 px-4 pt-4">
				<div className="grid min-w-0 gap-0.5">
					<SpecValue className="text-[14px] font-medium">
						{inv.invoice_number}
					</SpecValue>
					<span className="text-[13px] text-nl-russet">
						{t("order")} <OrderLink inv={inv} />
					</span>
				</div>
				<StatusBadge tone={st.tone}>{t(st.key)}</StatusBadge>
			</div>
			<dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-[14px]">
				<div className="col-span-2 grid gap-0.5">
					<dt className="text-[12.5px] text-nl-russet">{t("seller")}</dt>
					<dd className="m-0 break-words text-nl-cacao">
						{inv.seller_name}
						<span className="block text-[12.5px] text-nl-russet">
							{inv.seller_trn ? (
								<>
									{t("sellerTrn")}{" "}
									<SpecValue className="text-[12.5px] text-nl-russet">
										{inv.seller_trn}
									</SpecValue>
								</>
							) : (
								t("noTrn")
							)}
						</span>
					</dd>
				</div>
				<div className="grid gap-0.5">
					<dt className="text-[12.5px] text-nl-russet">{t("issued")}</dt>
					<dd className="m-0 text-nl-cacao">
						<DateCell value={inv.issue_date} />
					</dd>
				</div>
				<div className="grid gap-0.5">
					<dt className="text-[12.5px] text-nl-russet">{t("due")}</dt>
					<dd
						className={cn(
							"m-0",
							inv.is_overdue ? "text-destructive" : "text-nl-cacao",
						)}
					>
						<DateCell value={inv.due_date} fallback={t("atCheckout")} />
					</dd>
				</div>
			</dl>
			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-nl-cacao/10 px-4 py-2.5">
				<Amount
					fils={inv.total_fils}
					className="text-[15px] font-medium text-nl-cacao"
				/>
				<InvoiceDownloads inv={inv} />
			</div>
		</Panel>
	);
}

function InvoiceDownloads({ inv }: { inv: InvoiceRow }) {
	const t = useTranslations("business.invoices");
	const [busy, setBusy] = useState<"pdf" | "xml" | null>(null);
	const [failed, setFailed] = useState(false);

	async function pdf() {
		setBusy("pdf");
		setFailed(false);
		// Open the tab inside the click so popup blockers allow it, then point it at the signed URL.
		const win = window.open("", "_blank");
		try {
			const url = await fetchInvoicePdfUrl(inv.id);
			if (win) win.location.href = url;
			else window.location.href = url;
		} catch {
			win?.close();
			setFailed(true);
		} finally {
			setBusy(null);
		}
	}

	async function xml() {
		setBusy("xml");
		setFailed(false);
		try {
			saveBlob(await fetchInvoiceXml(inv.id), `${inv.invoice_number}.xml`);
		} catch {
			setFailed(true);
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="grid justify-items-end gap-1">
			<div className="flex gap-1">
				<Button
					variant="ghost"
					size="sm"
					onClick={pdf}
					disabled={busy !== null}
					aria-label={t("downloadPdf", { number: inv.invoice_number })}
				>
					<FileDown className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
					{t("pdf")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={xml}
					disabled={busy !== null}
					aria-label={t("downloadXml", { number: inv.invoice_number })}
				>
					<FileCode2
						className="h-4 w-4"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
					{t("xml")}
				</Button>
			</div>
			{failed && <FormMessage tone="error">{t("downloadFailed")}</FormMessage>}
		</div>
	);
}
