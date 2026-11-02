"use client";

import type { OrderRow } from "@/components/account/types";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, Skeleton } from "@/components/account/account-ui";
import { OrderCard } from "@/components/account/order-parts";
import { SectionHead } from "@/components/swatch";
import { useAddresses, useSavedSearches, useWallet, useWishlist } from "@/lib/queries/account";
import { useOrders } from "@/lib/queries/orders";
import { formatPrice } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { ChevronRight, Package } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Account overview: the latest orders first (trade buyers come back to
 * re-order), then a ruled index of what is saved on the account.
 */
export default function AccountOverviewPage() {
	const t = useTranslations("account");
	const locale = useLocale();
	const { user } = useAuthStore();
	const orders = useOrders({ limit: 3 });
	const wallet = useWallet();
	const addresses = useAddresses();
	const wishlist = useWishlist();
	const searches = useSavedSearches();

	const recent: OrderRow[] = (orders.data ?? []).slice(0, 3);
	const count = (n?: number) => (n == null ? null : String(n));

	return (
		<div className="grid gap-10">
			<PageHeader
				title={user?.first_name ? t("greeting", { name: user.first_name }) : t("overview")}
				description={t("overviewIntro")}
			/>

			<section className="grid gap-4">
				<SectionHead
					title={t("recentOrders")}
					action={recent.length > 0 ? { href: `/${locale}/account/orders`, label: t("allOrders") } : undefined}
				/>
				{orders.isLoading ? (
					<ListSkeleton rows={2} />
				) : orders.isError ? (
					<ErrorState onRetry={() => orders.refetch()} />
				) : recent.length === 0 ? (
					<EmptyState
						icon={Package}
						title={t("ordersEmptyTitle")}
						body={t("ordersEmptyBody")}
						action={{ label: t("startBrowsing"), href: `/${locale}` }}
					/>
				) : (
					<ul className="m-0 grid list-none gap-3 p-0">
						{recent.map((o) => (
							<OrderCard key={o.id} order={o} />
						))}
					</ul>
				)}
			</section>

			<section className="grid gap-4">
				<SectionHead title={t("savedOnAccount")} />
				<Panel as="div">
					<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
						<IndexRow
							href={`/${locale}/account/wallet`}
							label={t("walletBalance")}
							loading={wallet.isLoading}
							value={wallet.data ? formatPrice(wallet.data.balance ?? 0, "AED", locale) : null}
						/>
						<IndexRow
							href={`/${locale}/account/addresses`}
							label={t("addresses")}
							loading={addresses.isLoading}
							value={count(addresses.data?.length)}
						/>
						<IndexRow
							href={`/${locale}/account/wishlist`}
							label={t("wishlist")}
							loading={wishlist.isLoading}
							value={count(wishlist.data?.length)}
						/>
						<IndexRow
							href={`/${locale}/account/saved-searches`}
							label={t("savedSearches")}
							loading={searches.isLoading}
							value={count(searches.data?.items?.length)}
						/>
					</ul>
				</Panel>
			</section>
		</div>
	);
}

function IndexRow({
	href,
	label,
	value,
	loading,
}: {
	href: string;
	label: ReactNode;
	value: ReactNode | null;
	loading?: boolean;
}) {
	return (
		<li>
			<Link
				href={href}
				className="group flex min-h-[52px] items-center gap-3 px-4 py-3 transition-colors hover:bg-nl-cacao/[0.025] md:px-5"
			>
				<span className="flex-1 text-sm text-nl-cacao">{label}</span>
				{loading ? (
					<Skeleton className="h-4 w-16" />
				) : (
					<span className="font-mono text-[14px] tabular-nums text-nl-cacao">{value ?? "—"}</span>
				)}
				<ChevronRight
					className="h-4 w-4 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
			</Link>
		</li>
	);
}
