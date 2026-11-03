"use client";

import type { OrderRow } from "@/components/account/types";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/account/account-ui";
import { OrderCard } from "@/components/account/order-parts";
import { useOrders } from "@/lib/queries/orders";
import { Package } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export default function OrdersPage() {
	const t = useTranslations("account");
	const locale = useLocale();
	const { data, isLoading, isError, refetch } = useOrders();
	const orders: OrderRow[] = data ?? [];

	return (
		<div>
			<PageHeader title={t("orderHistory")} description={t("orderHistoryIntro")} />
			{isLoading ? (
				<ListSkeleton rows={4} />
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : orders.length === 0 ? (
				<EmptyState
					icon={Package}
					title={t("ordersEmptyTitle")}
					body={t("ordersEmptyBody")}
					action={{ label: t("startBrowsing"), href: `/${locale}` }}
				/>
			) : (
				<ul className="m-0 grid list-none gap-3 p-0">
					{orders.map((order) => (
						<OrderCard key={order.id} order={order} />
					))}
				</ul>
			)}
		</div>
	);
}
