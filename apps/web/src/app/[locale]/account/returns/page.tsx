"use client";

import type { ReturnRow } from "@/components/account/types";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/account/account-ui";
import { returnTone, statusLabel } from "@/components/account/status";
import { useReturns } from "@/lib/queries/orders";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { ChevronRight, PackageX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

const STATUS_OPTIONS = ["", "requested", "approved", "shipped_back", "received", "refunded", "rejected"] as const;

export default function ReturnsPage() {
	const t = useTranslations("returns");
	const locale = useLocale();
	const [status, setStatus] = useState<string>("");
	const { data, isLoading, isError, refetch } = useReturns({ page: 1 });
	// useReturns already unwraps response.data to the array; tolerate either
	// a bare array or a paginated envelope just in case.
	const items: ReturnRow[] = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
	const filtered = status ? items.filter((r) => r.status === status) : items;
	const tStatus = (k: string) => t(`statuses.${k}`);

	return (
		<div>
			<PageHeader title={t("title")} description={t("intro")} />

			{items.length > 0 && (
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
								{s ? tStatus(s) : t("statuses.all")}
							</button>
						);
					})}
				</fieldset>
			)}

			{isLoading ? (
				<ListSkeleton rows={3} />
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : items.length === 0 ? (
				<EmptyState
					icon={PackageX}
					title={t("empty")}
					body={t("emptyBody")}
					action={{ label: t("goToOrders"), href: `/${locale}/account/orders` }}
				/>
			) : filtered.length === 0 ? (
				<EmptyState title={t("emptyFiltered")} action={{ label: t("statuses.all"), onClick: () => setStatus("") }} />
			) : (
				<Panel as="div">
					<div className="hidden grid-cols-[minmax(0,1fr)_140px_150px_130px_16px] gap-4 border-b border-nl-cacao/10 px-5 py-3 md:grid">
						<span className="mill-label text-nl-russet">{t("returnNumber")}</span>
						<span className="mill-label text-nl-russet">{t("requestedOn")}</span>
						<span className="mill-label text-nl-russet">{t("statusLabel")}</span>
						<span className="mill-label text-end text-nl-russet">{t("refundAmount")}</span>
						<span />
					</div>
					<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
						{filtered.map((ret) => (
							<li key={ret.id}>
								<Link
									href={`/${locale}/account/returns/${ret.id}`}
									className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-nl-cacao/[0.025] md:grid-cols-[minmax(0,1fr)_140px_150px_130px_16px] md:px-5"
								>
									<span className="truncate font-mono text-[14px] font-medium tabular-nums text-nl-cacao">
										{ret.return_number ?? ret.id.slice(0, 8)}
									</span>
									<span className="order-3 font-mono text-[13px] tabular-nums text-nl-russet md:order-none">
										{ret.created_at ? formatDate(ret.created_at, locale) : "—"}
									</span>
									<span className="order-2 justify-self-end md:order-none md:justify-self-start">
										<StatusBadge tone={returnTone(ret.status)}>{statusLabel(tStatus, ret.status)}</StatusBadge>
									</span>
									<span className="order-4 justify-self-end font-mono text-[14px] tabular-nums text-nl-cacao md:order-none">
										{ret.refund_amount != null ? formatPrice(ret.refund_amount, "AED", locale) : "—"}
									</span>
									<ChevronRight
										className="hidden h-4 w-4 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 md:block"
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
