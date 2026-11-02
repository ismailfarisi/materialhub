"use client";

import type { WalletTxRow } from "@/components/account/types";
import { EmptyState, ErrorState, PageHeader, Panel, PanelHead, Skeleton } from "@/components/account/account-ui";
import { statusLabel } from "@/components/account/status";
import { useWallet, useWalletTransactions } from "@/lib/queries/account";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export default function WalletPage() {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const tType = useTranslations("account.walletTxType");
	const locale = useLocale();
	const wallet = useWallet();
	const txs = useWalletTransactions();
	const txList: WalletTxRow[] = txs.data || [];

	const amount = (v: number) => (
		<span className={cn("font-mono tabular-nums", v > 0 ? "text-green-800" : "text-nl-cacao")}>
			{v > 0 ? "+" : v < 0 ? "−" : ""}
			{formatPrice(Math.abs(v), "AED", locale)}
		</span>
	);

	return (
		<div>
			<PageHeader title={t("wallet")} description={t("walletIntro")} />

			<div className="grid gap-4">
				<Panel className="grid gap-2 p-5 md:p-6">
					<span className="mill-label text-nl-russet">{t("walletBalance")}</span>
					{wallet.isLoading ? (
						<Skeleton className="h-9 w-44" />
					) : wallet.isError ? (
						<ErrorState onRetry={() => wallet.refetch()} />
					) : (
						<p className="m-0 font-display text-[clamp(28px,4vw,36px)] font-semibold leading-none tracking-[-0.02em] tabular-nums text-nl-cacao">
							{formatPrice(wallet.data?.balance || 0, "AED", locale)}
						</p>
					)}
				</Panel>

				<Panel>
					<PanelHead title={t("transactions")} />
					{txs.isLoading ? (
						<div className="grid gap-4 p-4 md:p-5" aria-label={tCommon("loading")}>
							{Array.from({ length: 4 }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
								<div key={i} className="flex items-center justify-between gap-4">
									<div className="grid gap-2">
										<Skeleton className="h-3.5 w-28" />
										<Skeleton className="h-3 w-40" />
									</div>
									<Skeleton className="h-4 w-20" />
								</div>
							))}
						</div>
					) : txs.isError ? (
						<div className="p-4 md:p-5">
							<ErrorState onRetry={() => txs.refetch()} />
						</div>
					) : txList.length === 0 ? (
						<div className="p-4 md:p-5">
							<EmptyState icon={Wallet} title={t("walletEmptyTitle")} body={t("walletEmptyBody")} className="border-0 py-8" />
						</div>
					) : (
						<>
							{/* Mobile: stacked rows */}
							<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0 md:hidden">
								{txList.map((tx) => (
									<li key={tx.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-4 py-3">
										<span className="text-sm font-medium text-nl-cacao">{statusLabel(tType, tx.type)}</span>
										<span className="row-span-2 self-center text-[14px]">{amount(tx.amount)}</span>
										<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">{formatDate(tx.created_at, locale)}</span>
										{tx.description && <span className="col-span-2 break-words text-[13px] text-nl-russet">{tx.description}</span>}
									</li>
								))}
							</ul>
							{/* Desktop: table */}
							<div className="hidden md:block">
								<table className="w-full border-collapse text-sm">
									<thead>
										<tr className="border-b border-nl-cacao/10">
											<th scope="col" className="mill-label px-5 py-3 text-start font-semibold text-nl-russet">{tCommon("date")}</th>
											<th scope="col" className="mill-label px-5 py-3 text-start font-semibold text-nl-russet">{tCommon("type")}</th>
											<th scope="col" className="mill-label px-5 py-3 text-start font-semibold text-nl-russet">{tCommon("description")}</th>
											<th scope="col" className="mill-label px-5 py-3 text-end font-semibold text-nl-russet">{tCommon("amount")}</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-nl-cacao/10">
										{txList.map((tx) => (
											<tr key={tx.id}>
												<td className="whitespace-nowrap px-5 py-3 font-mono text-[13px] tabular-nums text-nl-russet">{formatDate(tx.created_at, locale)}</td>
												<td className="px-5 py-3 text-nl-cacao">{statusLabel(tType, tx.type)}</td>
												<td className="px-5 py-3 text-nl-russet">{tx.description || "—"}</td>
												<td className="whitespace-nowrap px-5 py-3 text-end text-[14px]">{amount(tx.amount)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</>
					)}
				</Panel>
			</div>
		</div>
	);
}
