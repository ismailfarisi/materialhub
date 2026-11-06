"use client";

import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
	Panel,
	StatusBadge,
} from "@/components/account/account-ui";
import { requestTone } from "@/components/rfq/status";
import { Button, PriceTag } from "@/components/swatch";
import { useQuoteRequests } from "@/lib/queries/rfq";
import { cn, formatDate } from "@/lib/utils";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

const STATUS_OPTIONS = [
	"",
	"open",
	"quoted",
	"accepted",
	"closed",
	"cancelled",
] as const;

export default function QuotesPage() {
	const t = useTranslations("rfq.list");
	const tStatus = useTranslations("rfq.status");
	const tUnits = useTranslations("rfq.units");
	const tCount = useTranslations("rfq.unitsCount");
	const locale = useLocale();
	const [status, setStatus] = useState<string>("");
	const { data, isLoading, isError, refetch } = useQuoteRequests({ status });
	const items = data?.items ?? [];

	return (
		<div>
			<PageHeader
				title={t("title")}
				description={t("intro")}
				action={
					<Button asChild variant="outline">
						<Link href={`/${locale}/account/quotes/new`}>
							<Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
							{t("newRequest")}
						</Link>
					</Button>
				}
			/>

			<fieldset className="scrollbar-hide -mx-4 mb-4 flex min-w-0 gap-1.5 overflow-x-auto border-0 px-4 py-0 md:mx-0 md:flex-wrap md:px-0">
				<legend className="sr-only">{t("statusFilter")}</legend>
				{STATUS_OPTIONS.map((s) => {
					const active = status === s;
					return (
						<button
							key={s || "all"}
							type="button"
							aria-pressed={active}
							onClick={() => setStatus(s)}
							className={cn(
								"h-9 shrink-0 rounded-md border px-3 text-[13px] transition-colors",
								active
									? "border-nl-cacao bg-nl-cacao font-medium text-white"
									: "border-nl-cacao/15 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/40",
							)}
						>
							{s ? tStatus(s) : t("all")}
						</button>
					);
				})}
			</fieldset>

			{isLoading ? (
				<ListSkeleton rows={3} />
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : items.length === 0 && !status ? (
				<EmptyState
					icon={FileText}
					title={t("empty")}
					body={t("emptyBody")}
					action={{ label: t("emptyAction"), href: `/${locale}` }}
				/>
			) : items.length === 0 ? (
				<EmptyState
					title={t("emptyFiltered")}
					action={{ label: t("all"), onClick: () => setStatus("") }}
				/>
			) : (
				<Panel as="div">
					<div className="hidden grid-cols-[minmax(0,1fr)_150px_110px_150px_150px_16px] gap-4 border-b border-nl-cacao/10 px-5 py-3 lg:grid">
						<span className="mill-label text-nl-russet">{t("colRequest")}</span>
						<span className="mill-label text-nl-russet">
							{t("colQuantity")}
						</span>
						<span className="mill-label text-nl-russet">{t("colQuotes")}</span>
						<span className="mill-label text-end text-nl-russet">
							{t("colBest")}
						</span>
						<span className="mill-label text-nl-russet">{t("colStatus")}</span>
						<span />
					</div>
					<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
						{items.map((r) => (
							<li key={r.id}>
								<Link
									href={`/${locale}/account/quotes/${r.id}`}
									className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-nl-cacao/[0.025] lg:grid-cols-[minmax(0,1fr)_150px_110px_150px_150px_16px] lg:px-5"
								>
									<span className="grid min-w-0 gap-0.5">
										<span className="truncate text-[14.5px] font-medium text-nl-cacao">
											{r.title}
										</span>
										<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">
											{r.request_number} · {formatDate(r.created_at, locale)}
										</span>
									</span>
									<span className="order-3 text-[13.5px] text-nl-cacao lg:order-none">
										<bdi className="font-mono tabular-nums">
											{tCount(r.unit, { count: r.quantity })}
										</bdi>
									</span>
									<span className="order-4 font-mono text-[13px] tabular-nums text-nl-russet lg:order-none">
										{t("quotesCount", {
											count: r.response_count,
											total: r.suppliers.length,
										})}
									</span>
									<span className="order-5 justify-self-end lg:order-none">
										{r.best_unit_price != null ? (
											<PriceTag
												amount={r.best_unit_price}
												locale={locale}
												unit={tUnits(r.unit)}
												size="sm"
											/>
										) : (
											<span className="text-nl-russet">—</span>
										)}
									</span>
									<span className="order-2 justify-self-end lg:order-none lg:justify-self-start">
										<StatusBadge tone={requestTone(r.status)}>
											{tStatus(r.status)}
										</StatusBadge>
									</span>
									<ChevronRight
										className="hidden h-4 w-4 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 lg:block"
										strokeWidth={1.75}
										aria-hidden="true"
									/>
								</Link>
							</li>
						))}
					</ul>
				</Panel>
			)}
		</div>
	);
}
