"use client";

import { MarkPaidDialog } from "@/components/business/mark-paid-dialog";
import { openSignedUrl } from "@/components/business/trn-value";
import {
	apiErrorMessage,
	daysUntil,
	formatDate,
	isTrnFormatValid,
	receivableStatusLabel,
	termsLabel,
} from "@/lib/business.helpers";
import { formatAedGrouped } from "@/lib/money";
import {
	type Receivable,
	type ReceivableTab,
	useDownloadInvoiceXml,
	useOpenInvoicePdf,
	useReceivables,
} from "@/lib/queries/receivables";
import {
	Button,
	DataTable,
	EmptyState,
	Input,
	Skeleton,
	StatCard,
	Tabs,
	TabsList,
	TabsTrigger,
	toast,
	useDebounce,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Receipt,
	Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const TABS: { value: ReceivableTab; label: string }[] = [
	{ value: "due", label: "Due" },
	{ value: "overdue", label: "Overdue" },
	{ value: "paid", label: "Paid" },
	{ value: "all", label: "All" },
];

const PAGE_SIZE = 20;

function StatusCell({ r }: { r: Receivable }) {
	if (r.status === "overdue") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-russet px-2 py-0.5 text-xs font-semibold text-linen whitespace-nowrap">
				<AlertTriangle size={12} aria-hidden />
				{receivableStatusLabel(r)}
			</span>
		);
	}
	if (r.status === "paid") {
		return (
			<span className="inline-flex items-center rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-xs font-medium text-amber">
				Paid
			</span>
		);
	}
	const d = daysUntil(r.due_at);
	return (
		<span className="inline-flex flex-col items-end md:items-start gap-0.5">
			<span className="inline-flex items-center rounded-full border border-taupe/30 bg-taupe/10 px-2 py-0.5 text-xs font-medium text-taupe">
				Due
			</span>
			<span className="text-xs text-taupe tabular-nums whitespace-nowrap">
				{d <= 0 ? "today" : `in ${d} ${d === 1 ? "day" : "days"}`}
			</span>
		</span>
	);
}

export default function ReceivablesPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const tab = (searchParams.get("status") as ReceivableTab | null) ?? "all";
	const qParam = searchParams.get("q") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const pagination = useMemo(
		() => ({ pageIndex: page - 1, pageSize: PAGE_SIZE }),
		[page],
	);

	const updateParam = useCallback(
		(updates: Record<string, string | null | undefined>, resetPage = true) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value) params.set(key, value);
				else params.delete(key);
			}
			if (resetPage && !updates.page) params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, {
				scroll: false,
			});
		},
		[router, searchParams],
	);

	const [search, setSearch] = useState(qParam);
	const debounced = useDebounce(search, 300);
	// biome-ignore lint/correctness/useExhaustiveDependencies: push the debounced term to the URL only when it changes
	useEffect(() => {
		if (debounced !== qParam) updateParam({ q: debounced || null });
	}, [debounced]);

	const { data, isLoading } = useReceivables({
		status: TABS.some((t) => t.value === tab) ? tab : "all",
		q: qParam || undefined,
		page,
		limit: PAGE_SIZE,
	});
	const summary = data?.summary;
	const rows = data?.items ?? [];
	const total = data?.total ?? 0;
	const pageCount = Math.ceil(total / PAGE_SIZE) || 1;

	const [markTarget, setMarkTarget] = useState<Receivable | null>(null);
	const xml = useDownloadInvoiceXml();
	const pdf = useOpenInvoicePdf();

	function openPdf(invoiceId: string) {
		openSignedUrl(
			() => pdf.mutateAsync(invoiceId),
			(err) =>
				toast({
					title: "Could not open the PDF",
					description: apiErrorMessage(err, "Try again."),
					variant: "destructive",
				}),
		);
	}

	function downloadXml(inv: { id: string; invoice_number: string }) {
		xml.mutate(inv, {
			onError: (err) =>
				toast({
					title: "Could not download the XML",
					description: apiErrorMessage(err, "Try again."),
					variant: "destructive",
				}),
		});
	}

	const columns: ColumnDef<Receivable>[] = [
		{
			id: "order",
			header: "Order",
			meta: { cardTitle: true },
			cell: ({ row }) => (
				<div>
					<Link
						href={`/orders/${row.original.order_id}`}
						className="font-mono text-sm font-medium text-cacao hover:text-primary hover:underline whitespace-nowrap"
					>
						{row.original.order_number}
					</Link>
					<p className="text-xs font-normal text-taupe">
						{termsLabel(row.original.terms)}
					</p>
				</div>
			),
		},
		{
			id: "company",
			header: "Company · TRN",
			meta: { cardLabel: "Company" },
			cell: ({ row }) => (
				<div className="min-w-[11rem]">
					<Link
						href={`/business-accounts/${row.original.business_account_id}`}
						className="text-sm text-cacao hover:text-primary hover:underline"
					>
						{row.original.legal_name}
					</Link>
					{row.original.trn ? (
						<p
							className={`font-mono text-xs tabular-nums ${
								isTrnFormatValid(row.original.trn)
									? "text-taupe"
									: "text-russet"
							}`}
						>
							{row.original.trn}
						</p>
					) : (
						<p className="text-xs text-taupe">No TRN</p>
					)}
				</div>
			),
		},
		{
			id: "amount",
			header: "Amount",
			cell: ({ row }) => (
				<span className="text-sm font-semibold tabular-nums whitespace-nowrap">
					{formatAedGrouped(row.original.amount_fils)}
				</span>
			),
		},
		{
			id: "due",
			header: "Due",
			cell: ({ row }) => (
				<div className="whitespace-nowrap">
					<p
						className={`text-sm tabular-nums ${
							row.original.status === "overdue"
								? "font-semibold text-russet"
								: "text-cacao"
						}`}
					>
						{formatDate(row.original.due_at)}
					</p>
					<p className="text-xs text-taupe tabular-nums">
						Confirmed {formatDate(row.original.confirmed_at)}
					</p>
				</div>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<div className="flex flex-col items-end md:items-start gap-1.5">
					<StatusCell r={row.original} />
					{row.original.status === "paid" ? (
						<div className="text-xs text-taupe">
							<p className="tabular-nums whitespace-nowrap">
								{formatDate(row.original.paid_at)}
							</p>
							{row.original.payment_reference && (
								<p className="font-mono">{row.original.payment_reference}</p>
							)}
						</div>
					) : (
						<Button
							size="sm"
							variant={
								row.original.status === "overdue" ? "default" : "outline"
							}
							className="h-8"
							onClick={() => setMarkTarget(row.original)}
						>
							Mark paid
						</Button>
					)}
				</div>
			),
		},
		{
			id: "invoices",
			header: "Tax invoices",
			cell: ({ row }) =>
				row.original.invoices.length === 0 ? (
					<span className="text-sm text-taupe">None yet</span>
				) : (
					<ul className="space-y-1.5">
						{row.original.invoices.map((inv) => (
							<li
								key={inv.id}
								className="flex items-center justify-end md:justify-start gap-2"
							>
								<span
									className="font-mono text-xs tabular-nums text-cacao whitespace-nowrap"
									title={`${inv.seller_name} · ${formatAedGrouped(inv.total_fils)}`}
								>
									{inv.invoice_number}
								</span>
								<button
									type="button"
									onClick={() => openPdf(inv.id)}
									className="text-xs font-medium text-amber underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-xs"
									aria-label={`Open PDF of ${inv.invoice_number}`}
								>
									PDF
								</button>
								<button
									type="button"
									onClick={() => downloadXml(inv)}
									disabled={xml.isPending}
									className="text-xs font-medium text-amber underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-xs disabled:opacity-50"
									aria-label={`Download UBL XML of ${inv.invoice_number}`}
								>
									XML
								</button>
							</li>
						))}
					</ul>
				),
		},
	];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-cacao mb-1">Receivables</h1>
				<p className="text-taupe text-sm max-w-3xl">
					Orders placed on net terms that the business pays by invoice. Vendor
					payouts for these orders are released only after the payment is marked
					here: until then their commissions stay held.
				</p>
			</div>

			{isLoading && !summary ? (
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					{["a", "b", "c"].map((k) => (
						<Skeleton key={k} className="h-28 rounded-lg" />
					))}
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<StatCard
						title={`Due · ${summary?.due_count ?? 0} orders`}
						value={formatAedGrouped(summary?.due_fils ?? 0)}
						icon={<Clock size={16} className="text-caramel" />}
					/>
					<StatCard
						title={`Overdue · ${summary?.overdue_count ?? 0} orders`}
						value={formatAedGrouped(summary?.overdue_fils ?? 0)}
						icon={<AlertTriangle size={16} className="text-caramel" />}
					/>
					<StatCard
						title={`Paid · ${summary?.paid_count ?? 0} orders`}
						value={formatAedGrouped(summary?.paid_fils ?? 0)}
						icon={<CheckCircle2 size={16} className="text-amber" />}
					/>
				</div>
			)}

			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<Tabs
					value={tab}
					onValueChange={(v) => updateParam({ status: v === "all" ? null : v })}
				>
					<TabsList>
						{TABS.map((t) => {
							const count =
								t.value === "due"
									? summary?.due_count
									: t.value === "overdue"
										? summary?.overdue_count
										: t.value === "paid"
											? summary?.paid_count
											: undefined;
							return (
								<TabsTrigger key={t.value} value={t.value}>
									{t.label}
									{count != null && (
										<span
											className={`ml-1.5 tabular-nums text-xs ${
												t.value === "overdue" && count > 0
													? "font-semibold text-russet"
													: "text-taupe"
											}`}
										>
											{count}
										</span>
									)}
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>
				<div className="relative w-full sm:w-72">
					<Search
						size={16}
						className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe pointer-events-none"
						aria-hidden
					/>
					<Input
						aria-label="Search receivables"
						placeholder="Order no., company or TRN"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-8"
					/>
				</div>
			</div>

			{!isLoading && rows.length === 0 ? (
				<EmptyState
					icon={<Receipt size={40} />}
					title={tab === "overdue" ? "Nothing overdue" : "No receivables here"}
					description={
						qParam
							? "No order matches the search."
							: "Orders paid on invoice appear here once they are confirmed."
					}
				/>
			) : (
				<DataTable
					columns={columns}
					data={rows}
					isLoading={isLoading}
					rowId="order_id"
					pagination={pagination}
					pageCount={pageCount}
					totalCount={total}
					itemLabel="receivables"
					onPaginationChange={(updater) => {
						const next =
							typeof updater === "function" ? updater(pagination) : updater;
						updateParam(
							{ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null },
							false,
						);
					}}
				/>
			)}

			<MarkPaidDialog
				receivable={markTarget}
				onClose={() => setMarkTarget(null)}
			/>
		</div>
	);
}
