"use client";

import { StatusBadge, Textarea } from "@/components/account/account-ui";
import { Button, PriceTag, formatFils } from "@/components/swatch";
import type {
	QuoteRequestDetail,
	QuoteResponse,
	QuoteSupplier,
} from "@/lib/queries/rfq";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { formatQuoteDate, quoteStateTone, supplierTone } from "./status";

type Pending = { supplierId: string; kind: "accept" | "decline" } | null;

export interface ComparisonActions {
	onAccept: (supplierId: string) => Promise<unknown>;
	onDecline: (supplierId: string, reason: string) => Promise<unknown>;
	busy: boolean;
}

/**
 * Quotes side by side. At `md` and up, a table with one column per supplier
 * so price per unit, MOQ, lead time and validity line up across rows; below
 * that, one card per supplier with the same rows in the same order.
 */
export function QuoteComparison({
	request,
	actions,
	readOnly = false,
}: {
	request: QuoteRequestDetail;
	actions?: ComparisonActions;
	readOnly?: boolean;
}) {
	const t = useTranslations("rfq.detail");
	const tSupplier = useTranslations("rfq.supplierStatus");
	const tState = useTranslations("rfq.quoteState");
	const tUnits = useTranslations("rfq.units");
	const tCount = useTranslations("rfq.unitsCount");
	const locale = useLocale();
	const [pending, setPending] = useState<Pending>(null);
	const [reason, setReason] = useState("");

	const suppliers = request.suppliers;
	const live = suppliers
		.map((s) => s.current_response)
		.filter(
			(r): r is QuoteResponse =>
				!!r && (r.display_state === "live" || r.display_state === "accepted"),
		);
	const lowest =
		live.length > 1 ? Math.min(...live.map((r) => r.unit_price)) : null;
	const fastest =
		live.length > 1 ? Math.min(...live.map((r) => r.lead_time_days)) : null;
	const unitLabel = tUnits(request.unit);

	const qty = (n: number) => (
		<bdi className="font-mono tabular-nums">
			{tCount(request.unit, { count: n })}
		</bdi>
	);

	type Row = {
		key: string;
		label: string;
		cell: (s: QuoteSupplier, r: QuoteResponse) => ReactNode;
	};
	const rows: Row[] = [
		{
			key: "price",
			label: t("rowPrice"),
			cell: (_s, r) => (
				<div className="grid justify-items-start gap-1">
					<PriceTag
						amount={r.unit_price}
						locale={locale}
						unit={unitLabel}
						size="md"
					/>
					{lowest != null && r.unit_price === lowest && (
						<Mark>{t("lowest")}</Mark>
					)}
				</div>
			),
		},
		{
			key: "qty",
			label: t("rowQuantity"),
			cell: (_s, r) => (
				<div className="grid gap-0.5">
					<span className="text-[13.5px] text-nl-cacao">
						{qty(r.order_quantity)}
					</span>
					{r.order_quantity > request.quantity && (
						<span className="text-[12.5px] text-nl-russet">
							{t("raisedToMoq")}
						</span>
					)}
				</div>
			),
		},
		{
			key: "total",
			label: t("rowTotal"),
			cell: (_s, r) => (
				<span className="font-mono text-[14px] font-medium tabular-nums text-nl-cacao [unicode-bidi:isolate]">
					AED {formatFils(r.total, locale)}
				</span>
			),
		},
		{
			key: "moq",
			label: t("rowMoq"),
			cell: (_s, r) => (
				<span className="text-[13.5px] text-nl-cacao">{qty(r.moq)}</span>
			),
		},
		{
			key: "lead",
			label: t("rowLead"),
			cell: (_s, r) => (
				<div className="grid justify-items-start gap-1">
					<span className="font-mono text-[13.5px] tabular-nums text-nl-cacao">
						{t("leadDays", { count: r.lead_time_days })}
					</span>
					{fastest != null && r.lead_time_days === fastest && (
						<Mark>{t("fastest")}</Mark>
					)}
				</div>
			),
		},
		{
			key: "valid",
			label: t("rowValid"),
			cell: (_s, r) => (
				<div className="grid justify-items-start gap-1">
					<time
						dateTime={r.valid_until}
						className="font-mono text-[13.5px] tabular-nums text-nl-cacao"
					>
						{formatQuoteDate(r.valid_until, locale)}
					</time>
					<StatusBadge tone={quoteStateTone(r.display_state)}>
						{tState(r.display_state)}
					</StatusBadge>
				</div>
			),
		},
		{
			key: "listing",
			label: t("rowListing"),
			cell: (_s, r) =>
				r.product ? (
					<Link
						href={`/${locale}/product/${r.product.slug}`}
						className="text-[13.5px] text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao"
					>
						{r.product.name}
						{r.variant ? ` · ${r.variant.name}` : ""}
					</Link>
				) : (
					<span className="text-nl-russet">—</span>
				),
		},
		{
			key: "notes",
			label: t("rowNotes"),
			cell: (_s, r) =>
				r.notes ? (
					<p className="m-0 whitespace-pre-wrap text-[13.5px] leading-relaxed text-nl-cacao">
						{r.notes}
					</p>
				) : (
					<span className="text-nl-russet">—</span>
				),
		},
	];

	const header = (s: QuoteSupplier) => (
		<div className="grid justify-items-start gap-1.5">
			<span className="font-display text-[15.5px] font-semibold leading-tight text-nl-cacao">
				{s.vendor?.name ?? "—"}
			</span>
			<StatusBadge tone={supplierTone(s.status)}>
				{tSupplier(s.status)}
			</StatusBadge>
		</div>
	);

	const noQuote = (s: QuoteSupplier) => (
		<p className="m-0 text-[13.5px] text-nl-russet">
			{s.status === "vendor_declined"
				? s.decline_reason
					? `${t("declinedBySupplier")} “${s.decline_reason}”`
					: t("declinedBySupplier")
				: t("awaiting")}
		</p>
	);

	const actionCell = (s: QuoteSupplier) => {
		if (readOnly || !actions) return null;
		const r = s.current_response;
		if (pending?.supplierId === s.id && pending.kind === "accept" && r) {
			return (
				<div className="grid gap-2">
					<p className="m-0 text-[13px] text-nl-cacao">
						{t("acceptConfirm", {
							quantity: tCount(request.unit, { count: r.order_quantity }),
							price: `AED ${formatFils(r.unit_price, locale)}`,
						})}
					</p>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							disabled={actions.busy}
							onClick={async () => {
								await actions.onAccept(s.id).catch(() => undefined);
								setPending(null);
							}}
						>
							{actions.busy ? t("accepting") : t("acceptYes")}
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setPending(null)}>
							{t("acceptNo")}
						</Button>
					</div>
				</div>
			);
		}
		if (pending?.supplierId === s.id && pending.kind === "decline") {
			const id = `decline-${s.id}`;
			return (
				<div className="grid gap-2">
					<label htmlFor={id} className="text-[13px] font-medium text-nl-cacao">
						{t("declineReason")}
					</label>
					<Textarea
						id={id}
						rows={2}
						className="min-h-[64px] text-sm"
						value={reason}
						maxLength={1000}
						placeholder={t("declineReasonPlaceholder")}
						onChange={(e) => setReason(e.target.value)}
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={actions.busy}
							onClick={async () => {
								await actions.onDecline(s.id, reason).catch(() => undefined);
								setPending(null);
								setReason("");
							}}
						>
							{t("declineYes")}
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setPending(null)}>
							{t("declineNo")}
						</Button>
					</div>
				</div>
			);
		}
		if (r?.display_state === "expired") {
			return (
				<p className="m-0 text-[13px] text-nl-russet">{t("expiredNote")}</p>
			);
		}
		if (!s.can_accept && !s.can_decline) return null;
		return (
			<div className="flex flex-wrap gap-2">
				{s.can_accept && (
					<Button
						size="sm"
						onClick={() => setPending({ supplierId: s.id, kind: "accept" })}
					>
						{t("accept")}
					</Button>
				)}
				{s.can_decline && (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setPending({ supplierId: s.id, kind: "decline" })}
					>
						{t("decline")}
					</Button>
				)}
			</div>
		);
	};

	return (
		<>
			{/* md+: one column per supplier */}
			<div className="hidden overflow-x-auto md:block">
				<table className="w-full min-w-[640px] table-fixed border-collapse text-start">
					<caption className="sr-only">{t("compare")}</caption>
					<colgroup>
						<col className="w-[148px] lg:w-[168px]" />
						{suppliers.map((s) => (
							<col key={s.id} />
						))}
					</colgroup>
					<thead>
						<tr className="border-b-2 border-nl-cacao">
							<td className="p-0" />
							{suppliers.map((s) => (
								<th
									key={s.id}
									scope="col"
									className={cn(
										"px-4 pb-3 pt-1 text-start align-bottom font-normal",
										s.status === "accepted" && "bg-green-700/[0.05]",
									)}
								>
									{header(s)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.key} className="border-b border-nl-cacao/10">
								<th
									scope="row"
									className="mill-label py-3 pe-3 text-start align-top text-nl-russet"
								>
									{row.label}
								</th>
								{suppliers.map((s) => (
									<td
										key={s.id}
										className={cn(
											"px-4 py-3 align-top",
											s.status === "accepted" && "bg-green-700/[0.05]",
										)}
									>
										{s.current_response
											? row.cell(s, s.current_response)
											: row.key === "price"
												? noQuote(s)
												: null}
									</td>
								))}
							</tr>
						))}
						{!readOnly && (
							<tr>
								<td />
								{suppliers.map((s) => (
									<td key={s.id} className="px-4 pb-1 pt-4 align-top">
										{actionCell(s)}
									</td>
								))}
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Phone: one card per supplier, same rows */}
			<ul className="m-0 grid list-none gap-3 p-0 md:hidden">
				{suppliers.map((s) => (
					<li
						key={s.id}
						className={cn(
							"rounded-md border border-nl-cacao/12 p-4",
							s.status === "accepted" && "border-green-700/40",
						)}
					>
						{header(s)}
						{s.current_response ? (
							<dl className="m-0 mt-3 grid border-t-2 border-nl-cacao">
								{rows.map((row) => (
									<div
										key={row.key}
										className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-b border-nl-cacao/10 py-2.5"
									>
										<dt className="mill-label pt-0.5 text-nl-russet">
											{row.label}
										</dt>
										<dd className="m-0 min-w-0">
											{row.cell(s, s.current_response as QuoteResponse)}
										</dd>
									</div>
								))}
							</dl>
						) : (
							<div className="mt-3">{noQuote(s)}</div>
						)}
						{!readOnly && (
							<div className="mt-3 empty:hidden">{actionCell(s)}</div>
						)}
					</li>
				))}
			</ul>
		</>
	);
}

/** A factual comparison marker (lowest price, fastest). Ink, not a stock or status colour. */
function Mark({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex h-5 items-center rounded-sm bg-nl-cacao px-1.5 font-sans text-[11.5px] font-medium leading-none text-white">
			{children}
		</span>
	);
}
