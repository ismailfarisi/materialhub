"use client";

import { CartItem } from "@/components/cart/cart-item";
import {
	type CartLineItem,
	cartPieceCount,
	cartSubtotalFils,
	groupBySupplier,
	isLineUnavailable,
} from "@/components/cart/cart-lines";
import { CartSkeleton } from "@/components/cart/cart-skeleton";
import { CartSummary } from "@/components/cart/cart-summary";
import { DeliveryPromise } from "@/components/delivery/delivery-promise";
import { Button, FanDeck, PriceTag } from "@/components/swatch";
import { useCart } from "@/lib/queries/cart";
import { AlertCircle, ArrowRight, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CartPage() {
	const t = useTranslations("cart");
	const locale = useLocale();
	const { data: cart, isLoading, isError, refetch, isRefetching } = useCart();

	// The cart query is often already resolved (header badge) before hydration;
	// render the server's skeleton for the first client pass to match it.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	if (!mounted || isLoading) return <CartSkeleton />;

	if (isError) {
		return (
			<div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8">
				<div className="mx-auto grid max-w-md justify-items-start gap-3 rounded-md bg-nl-pearl p-6 shadow-card">
					<AlertCircle className="h-6 w-6 text-destructive" strokeWidth={1.75} aria-hidden="true" />
					<h1 className="m-0 font-display text-xl font-semibold tracking-[-0.01em] text-nl-cacao">
						{t("loadErrorTitle")}
					</h1>
					<p className="m-0 text-[14px] text-nl-russet">{t("loadErrorBody")}</p>
					<Button variant="primary" onClick={() => refetch()} disabled={isRefetching} className="mt-2">
						{t("retry")}
					</Button>
				</div>
			</div>
		);
	}

	const items: CartLineItem[] = cart?.items ?? [];

	if (items.length === 0) {
		return (
			<div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8 md:py-20">
				<div className="mx-auto grid max-w-3xl items-center gap-8 md:grid-cols-[220px_1fr] md:gap-12">
					<FanDeck className="mx-auto w-full max-w-[200px] md:max-w-none" spread={7} />
					<div className="grid justify-items-start gap-3 text-start">
						<h1 className="m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-nl-cacao">
							{t("emptyTitle")}
						</h1>
						<p className="m-0 max-w-[48ch] text-[15px] leading-relaxed text-nl-russet">{t("emptyBody")}</p>
						<div className="mt-3 flex flex-wrap gap-2">
							<Button asChild variant="primary">
								<Link href={`/${locale}`}>
									{t("browseCta")}
									<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
								</Link>
							</Button>
							<Button asChild variant="outline">
								<Link href={`/${locale}/search`}>
									<Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
									{t("searchCta")}
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const groups = groupBySupplier(items);
	const subtotalFils = cartSubtotalFils(items);
	const hasUnavailable = items.some(isLineUnavailable);

	return (
		<div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 md:py-10">
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
				<div className="flex items-baseline gap-3">
					<h1 className="m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-nl-cacao md:text-[32px]">
						{t("pageTitle")}
					</h1>
					<span className="text-[13px] tabular-nums text-nl-russet">
						{t("itemsCount", { count: cartPieceCount(items) })}
					</span>
				</div>
				<Link
					href={`/${locale}`}
					className="text-sm font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
				>
					{t("continueShopping")}
				</Link>
			</div>

			<div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
				<div className="grid gap-4">
					{groups.map((group) => (
						<section
							key={group.key}
							aria-labelledby={`supplier-${group.key}`}
							className="rounded-md bg-nl-pearl shadow-card"
						>
							<header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-nl-cacao/10 px-4 py-3.5 sm:px-6">
								<h2 id={`supplier-${group.key}`} className="m-0 text-[14px] font-normal text-nl-russet">
									{t.rich("soldBy", {
										vendor: group.vendorName,
										b: (chunks) => (
											<span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-nl-cacao">
												{chunks}
											</span>
										),
									})}
								</h2>
								<span className="flex items-baseline gap-2 text-[13px] text-nl-russet">
									<span className="tabular-nums">
										{t("linesCount", { count: group.items.length })}
									</span>
									<span aria-hidden="true">·</span>
									<PriceTag amount={group.subtotalFils} locale={locale} size="sm" />
								</span>
							</header>
							<DeliveryPromise variant="inline" vendorId={group.items[0]?.vendor_id} productIds={group.items.map((i) => i.product_id)} className="border-b border-nl-cacao/10 px-4 py-2.5 sm:px-6" />
							<ul className="m-0 list-none divide-y divide-nl-cacao/10 px-4 sm:px-6">
								{group.items.map((item) => (
									<li key={item.variant_id}>
										<CartItem item={item} />
									</li>
								))}
							</ul>
						</section>
					))}
				</div>

				<div className="lg:sticky lg:top-24">
					<CartSummary subtotalFils={subtotalFils} hasUnavailable={hasUnavailable} />
				</div>
			</div>
		</div>
	);
}
