"use client";

import type { CartLineItem } from "@/components/cart/cart-lines";
import type { CheckoutQuote } from "@/lib/queries/checkout-quote";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { OrderLines } from "./order-summary-sidebar";

/** The order's lines above the steps on mobile; the sidebar shows them on desktop. */
export function OrderItemsSection({ items, quote }: { items: CartLineItem[]; quote: CheckoutQuote | null }) {
	const t = useTranslations("checkout");
	const tCart = useTranslations("cart");
	const locale = useLocale();

	if (items.length === 0) return null;
	const count = items.reduce((n, i) => n + i.quantity, 0);

	return (
		<section aria-labelledby="checkout-items-title" className="rounded-md bg-nl-pearl px-4 pt-4 shadow-card lg:hidden">
			<div className="flex items-baseline justify-between gap-3">
				<h2 id="checkout-items-title" className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao">
					{t("yourOrder")}
					<span className="ms-2 text-[12.5px] font-normal tabular-nums text-nl-russet">
						{tCart("itemsCount", { count })}
					</span>
				</h2>
				<Link
					href={`/${locale}/cart`}
					className="text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4"
				>
					{t("editCart")}
				</Link>
			</div>
			<OrderLines items={items} quote={quote} />
		</section>
	);
}
