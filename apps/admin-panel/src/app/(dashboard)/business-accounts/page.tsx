"use client";

import {
	NET_TERMS_COLORS,
	TrnValue,
	VERIFICATION_COLORS,
} from "@/components/business/trn-value";
import { formatDate, sortForReview, termsLabel } from "@/lib/business.helpers";
import { formatAedGrouped } from "@/lib/money";
import {
	type AdminBusinessRow,
	type NetTermsStatus,
	type VerificationStatus,
	useBusinessAccounts,
} from "@/lib/queries/business-accounts";
import {
	DataTable,
	EmptyState,
	Input,
	SimpleSelect,
	StatusBadge,
	useDebounce,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Building2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const VERIFICATION_OPTIONS = [
	{ label: "Any verification", value: "__all__" },
	{ label: "Pending review", value: "pending" },
	{ label: "Verified", value: "verified" },
	{ label: "Rejected", value: "rejected" },
];

const NET_TERMS_OPTIONS = [
	{ label: "Any net terms", value: "__all__" },
	{ label: "Applied", value: "applied" },
	{ label: "Approved", value: "approved" },
	{ label: "Rejected", value: "rejected" },
	{ label: "Suspended", value: "suspended" },
];

const PAGE_SIZE = 20;

export default function BusinessAccountsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const status = searchParams.get("status") ?? "__all__";
	const netTerms = searchParams.get("net_terms") ?? "__all__";
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
				if (value && value !== "__all__") params.set(key, value);
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

	const { data, isLoading } = useBusinessAccounts({
		status: status !== "__all__" ? (status as VerificationStatus) : undefined,
		net_terms:
			netTerms !== "__all__" ? (netTerms as NetTermsStatus) : undefined,
		q: qParam || undefined,
		page,
		limit: PAGE_SIZE,
	});
	// Counts for the review shortcuts, read from the list total like the
	// payouts page reads its draft count.
	const pendingCount = useBusinessAccounts({ status: "pending", limit: 1 });
	const appliedCount = useBusinessAccounts({ net_terms: "applied", limit: 1 });

	const rows = useMemo(() => sortForReview(data?.items ?? []), [data]);
	const total = data?.total ?? 0;
	const pageCount = Math.ceil(total / PAGE_SIZE) || 1;

	const columns: ColumnDef<AdminBusinessRow>[] = [
		{
			id: "legal_name",
			header: "Legal name",
			meta: { cardTitle: true },
			cell: ({ row }) => (
				<div className="min-w-0">
					<Link
						href={`/business-accounts/${row.original.id}`}
						className="font-medium text-cacao hover:text-primary hover:underline"
					>
						{row.original.legal_name}
					</Link>
					{row.original.trade_name && (
						<p className="text-xs text-taupe">{row.original.trade_name}</p>
					)}
				</div>
			),
		},
		{
			id: "trn",
			header: "TRN",
			cell: ({ row }) =>
				row.original.vat_registered || row.original.trn ? (
					<TrnValue
						trn={row.original.trn}
						formatValid={row.original.trn_format_valid}
					/>
				) : (
					<span className="text-sm text-taupe">Not VAT-registered</span>
				),
		},
		{
			id: "licence",
			header: "Trade licence",
			cell: ({ row }) => (
				<div className="text-sm">
					<p className="font-mono tabular-nums text-cacao">
						{row.original.trade_licence_number}
					</p>
					<p
						className={
							row.original.licence_expired
								? "text-xs font-medium text-russet inline-flex items-center gap-1 whitespace-nowrap"
								: "text-xs text-taupe tabular-nums whitespace-nowrap"
						}
					>
						{row.original.licence_expired && (
							<AlertTriangle size={12} aria-hidden />
						)}
						{row.original.licence_expired ? "Expired " : "Expires "}
						{formatDate(row.original.trade_licence_expiry)}
					</p>
				</div>
			),
		},
		{
			id: "verification",
			header: "Verification",
			cell: ({ row }) => (
				<StatusBadge
					status={row.original.verification_status}
					colorMap={VERIFICATION_COLORS}
				/>
			),
		},
		{
			id: "net_terms",
			header: "Net terms",
			cell: ({ row }) => {
				const c = row.original.credit;
				if (!c) return <span className="text-sm text-taupe">None</span>;
				return (
					<div className="text-sm space-y-0.5">
						<div className="flex items-center gap-1.5 md:justify-start justify-end">
							<StatusBadge status={c.status} colorMap={NET_TERMS_COLORS} />
							<span className="text-xs text-taupe">{termsLabel(c.terms)}</span>
						</div>
						{c.status === "applied" ? (
							<p className="text-xs text-taupe tabular-nums">
								Asks {formatAedGrouped(c.requested_limit_fils)}
							</p>
						) : c.credit_limit_fils > 0 ? (
							<p className="text-xs text-taupe tabular-nums whitespace-nowrap">
								{formatAedGrouped(c.outstanding_fils)} of{" "}
								{formatAedGrouped(c.credit_limit_fils)}
							</p>
						) : null}
						{c.overdue_count > 0 && (
							<p className="text-xs font-medium text-russet">
								{c.overdue_count} overdue
							</p>
						)}
					</div>
				);
			},
		},
		{
			id: "members",
			header: "Members",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
					{row.original.member_count}
				</span>
			),
		},
		{
			id: "created",
			header: "Created",
			cell: ({ row }) => (
				<span className="text-sm text-taupe tabular-nums whitespace-nowrap">
					{formatDate(row.original.created_at)}
				</span>
			),
		},
	];

	const shortcut = (
		active: boolean,
		label: string,
		count: number | undefined,
		onClick: () => void,
	) => (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={`inline-flex items-center gap-2 rounded-xs border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
				active
					? "border-amber bg-amber/10 text-cacao"
					: "border-pearl text-cacao hover:bg-pearl/30"
			}`}
		>
			{label}
			<span className="tabular-nums font-semibold">{count ?? "–"}</span>
		</button>
	);

	const reviewOnly = status === "pending" && netTerms === "__all__";
	const applicationsOnly = netTerms === "applied" && status === "__all__";

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-cacao mb-1">
					Business accounts
				</h1>
				<p className="text-taupe text-sm max-w-3xl">
					Companies buying on MaterialHub. Check the trade licence and TRN
					before verifying; only verified businesses can be given net terms.
				</p>
			</div>

			<div className="flex flex-wrap gap-2">
				{shortcut(
					reviewOnly,
					"Awaiting verification",
					pendingCount.data?.total,
					() =>
						updateParam(
							reviewOnly
								? { status: null, net_terms: null }
								: { status: "pending", net_terms: null },
						),
				)}
				{shortcut(
					applicationsOnly,
					"Net-terms applications",
					appliedCount.data?.total,
					() =>
						updateParam(
							applicationsOnly
								? { status: null, net_terms: null }
								: { status: null, net_terms: "applied" },
						),
				)}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<div className="relative w-full sm:w-72">
					<Search
						size={16}
						className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe pointer-events-none"
						aria-hidden
					/>
					<Input
						aria-label="Search business accounts"
						placeholder="Legal name, TRN or licence no."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-8"
					/>
				</div>
				<SimpleSelect
					value={status}
					onValueChange={(v) => updateParam({ status: v })}
					options={VERIFICATION_OPTIONS}
					className="w-full sm:w-[180px]"
				/>
				<SimpleSelect
					value={netTerms}
					onValueChange={(v) => updateParam({ net_terms: v })}
					options={NET_TERMS_OPTIONS}
					className="w-full sm:w-[180px]"
				/>
			</div>

			{!isLoading && rows.length === 0 ? (
				<EmptyState
					icon={<Building2 size={40} />}
					title="No business accounts match"
					description={
						status !== "__all__" || netTerms !== "__all__" || qParam
							? "Clear a filter or the search to see more."
							: "Business accounts appear here when a buyer registers their company."
					}
				/>
			) : (
				<DataTable
					columns={columns}
					data={rows}
					isLoading={isLoading}
					rowId="id"
					pagination={pagination}
					pageCount={pageCount}
					totalCount={total}
					itemLabel="business accounts"
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
		</div>
	);
}
