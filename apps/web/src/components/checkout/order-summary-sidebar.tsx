"use client";

import { type CartLineItem, lineSpecs, lineTotalFils } from "@/components/cart/cart-lines";
import { LineThumb } from "@/components/cart/line-thumb";
import { Button, MillLabel, PriceTag, formatFils } from "@/components/swatch";
import type { CheckoutQuote } from "@/lib/queries/checkout-quote";
import { cn } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { Loader2, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Money, Notice, TotalsRow } from "./checkout-ui";

export interface OrderSummaryProps {
	items: CartLineItem[];
	quote: CheckoutQuote | null;
	canOrder: boolean;
	onPlaceOrder: () => void;
}

/** Grand total as displayed: quote total plus the selected method's surcharge. */
export function useDisplayTotals(quote: CheckoutQuote | null) {
	const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
	const surchargeFils = quote?.payment_methods.find((m) => m.id === paymentMethod)?.surcharge_fils ?? 0;
	return {
		paymentMethod,
		surchargeFils,
		grandTotalFils: (quote?.totals.grand_total_fils ?? 0) + surchargeFils,
	};
}

/** Items in the order, compact: thumb with quantity, title, supplier, specs, line total. */
export function OrderLines({ items, quote }: { items: CartLineItem[]; quote: CheckoutQuote | null }) {
	const t = useTranslations("checkout");
	const tCart = useTranslations("cart");
	const locale = useLocale();
	const affected = new Set(quote?.blocking_error?.affected_item_ids ?? []);

	return (
		<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
			{items.map((item) => {
				const notDeliverable = !!item.id && affected.has(item.id);
				return (
					<li key={item.variant_id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-start gap-3 py-3.5">
						<span className="relative">
							<LineThumb src={item.image_url} size={56} className="w-14" />
							<span className="absolute -top-1.5 -end-1.5 inline-grid h-5 min-w-5 place-items-center rounded-sm bg-nl-cacao px-1 font-mono text-[11px] tabular-nums text-white">
								<span className="sr-only">{tCart("qtyLabel")} </span>
								{item.quantity}
							</span>
						</span>
						<div className="grid min-w-0 gap-1">
							<p className="m-0 line-clamp-2 break-words text-[14px] font-medium leading-snug text-nl-cacao">
								{item.product_title}
							</p>
							<p className="m-0 truncate text-[12.5px] text-nl-russet">
								{tCart("vendorGroup", { vendor: item.vendor_name || "MaterialHub" })}
							</p>
							<MillLabel specs={lineSpecs(item).slice(0, 2)} variant="inline" className="[&_li]:[direction:ltr] [&_li]:[unicode-bidi:isolate]" />
							<p className="m-0 font-mono text-[12px] tabular-nums text-nl-russet">
								<bdi dir="ltr">
									{item.quantity} × <Money fils={item.current_price} locale={locale} />
								</bdi>
							</p>
							{notDeliverable && (
								<p className="m-0 text-[12.5px] text-destructive">{t("lineNotDeliverable")}</p>
							)}
						</div>
						<Money fils={lineTotalFils(item)} locale={locale} className="text-[14px] font-medium text-nl-cacao" />
					</li>
				);
			})}
		</ul>
	);
}

/** Subtotal, delivery, discount, payment fee, VAT and the total. */
export function OrderTotals({ quote }: { quote: CheckoutQuote | null }) {
	const t = useTranslations("checkout");
	const tCart = useTranslations("cart");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const { surchargeFils, grandTotalFils } = useDisplayTotals(quote);

	if (quote === null) {
		return (
			<output className="grid gap-2.5 animate-pulse motion-reduce:animate-none" aria-label={t("loadingTotals")}>
				{[0, 1, 2].map((i) => (
					<div key={i} className="flex justify-between">
						<span className="h-4 w-24 rounded-sm bg-nl-cacao/[0.07]" />
						<span className="h-4 w-16 rounded-sm bg-nl-cacao/[0.07]" />
					</div>
				))}
				<div className="mt-2 flex justify-between border-t-2 border-nl-cacao/20 pt-4">
					<span className="h-5 w-16 rounded-sm bg-nl-cacao/[0.07]" />
					<span className="h-7 w-28 rounded-sm bg-nl-cacao/[0.07]" />
				</div>
			</output>
		);
	}

	const needsAddress = quote.requires_address || quote.shipping === null;
	const { totals } = quote;

	return (
		<div className="grid gap-4">
			<dl className="m-0 grid gap-2.5 text-[14px]">
				<TotalsRow label={tCart("subtotal")}>
					<Money fils={totals.subtotal_fils} locale={locale} />
				</TotalsRow>
				<TotalsRow label={t("deliveryRow")} muted={needsAddress}>
					{needsAddress ? (
						t("deliveryAfterAddress")
					) : totals.shipping_fils === 0 ? (
						t("free")
					) : (
						<Money fils={totals.shipping_fils} locale={locale} />
					)}
				</TotalsRow>
				{totals.discount_fils > 0 && (
					<TotalsRow label={totals.coupon_code ? `${tCommon("discount")} · ${totals.coupon_code}` : tCommon("discount")}>
						<Money fils={totals.discount_fils} locale={locale} negative />
					</TotalsRow>
				)}
				{surchargeFils > 0 && (
					<TotalsRow label={t("paymentFee")}>
						<Money fils={surchargeFils} locale={locale} />
					</TotalsRow>
				)}
				<TotalsRow label={t("vatIncluded")} muted>
					{t("included")}
				</TotalsRow>
			</dl>
			<div className="flex items-baseline justify-between gap-4 border-t-2 border-nl-cacao pt-4">
				<span className="font-medium text-nl-cacao">{t("totalDue")}</span>
				<PriceTag amount={grandTotalFils} locale={locale} size="lg" />
			</div>
		</div>
	);
}

/** The one cutter-orange action on checkout. Label follows the payment method. */
export function PlaceOrderButton({
	canOrder,
	onPlaceOrder,
	grandTotalFils,
	className,
	compact = false,
}: {
	canOrder: boolean;
	onPlaceOrder: () => void;
	grandTotalFils: number;
	className?: string;
	compact?: boolean;
}) {
	const t = useTranslations("checkout");
	const { isPlacing, paymentMethod } = useCheckoutStore();
	const locale = useLocale();

	let label = t("placeOrderCta");
	if (paymentMethod === "card" && grandTotalFils > 0 && !compact) {
		label = t("payAmount", { amount: `AED ${formatFils(grandTotalFils, locale)}` });
	} else if (paymentMethod === "card") {
		label = t("payNow");
	} else if (paymentMethod === "tamara") {
		label = t("continueToTamara");
	}

	return (
		<Button
			type="button"
			variant="signal"
			size="lg"
			onClick={onPlaceOrder}
			disabled={!canOrder || isPlacing}
			aria-busy={isPlacing || undefined}
			className={cn("tabular-nums", className)}
		>
			{isPlacing ? (
				<>
					<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={2} aria-hidden="true" />
					{t("processing")}
				</>
			) : (
				<>
					{paymentMethod === "card" && <Lock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
					{label}
				</>
			)}
		</Button>
	);
}

/** Desktop order summary column. Mobile uses MobileOrderBar. */
export function OrderSummarySidebar({ items, quote, canOrder, onPlaceOrder }: OrderSummaryProps) {
	const t = useTranslations("checkout");
	const tCart = useTranslations("cart");
	const locale = useLocale();
	const error = useCheckoutStore((s) => s.error);
	const { grandTotalFils } = useDisplayTotals(quote);
	const count = items.reduce((n, i) => n + i.quantity, 0);

	return (
		<aside aria-labelledby="order-summary-title" className="hidden lg:block">
			<div className="sticky top-24 grid gap-5 rounded-md bg-nl-pearl p-6 shadow-card">
				<div className="flex items-baseline justify-between gap-3">
					<h2 id="order-summary-title" className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao">
						{t("orderSummary")}
					</h2>
					<Link
						href={`/${locale}/cart`}
						className="text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
					>
						{t("editCart")}
					</Link>
				</div>
				<p className="m-0 -mt-3 text-[12.5px] tabular-nums text-nl-russet">
					{tCart("itemsCount", { count })}
				</p>
				<div className="-my-1 max-h-[38vh] overflow-y-auto overscroll-contain pe-1">
					<OrderLines items={items} quote={quote} />
				</div>
				<div className="border-t border-nl-cacao/10 pt-4">
					<OrderTotals quote={quote} />
				</div>
				{error && (
					<Notice tone="error" title={t("paymentErrorTitle")} live>
						{error}
					</Notice>
				)}
				<PlaceOrderButton
					canOrder={canOrder}
					onPlaceOrder={onPlaceOrder}
					grandTotalFils={quote ? grandTotalFils : 0}
					className="w-full"
				/>
				<p className="m-0 flex items-start gap-2 text-[12.5px] leading-relaxed text-nl-russet">
					<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
					{t("secureNote")}
				</p>
			</div>
		</aside>
	);
}
