"use client";

import { useDialogFocus } from "@/components/cart/use-dialog-focus";
import { Button } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { ChevronUp, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { Money, Notice } from "./checkout-ui";
import { type OrderSummaryProps, OrderLines, OrderTotals, PlaceOrderButton, useDisplayTotals } from "./order-summary-sidebar";

/**
 * Mobile checkout footer: total (tap to open the summary sheet) and the one
 * Pay / Place order button. Hidden at `lg`, where the sidebar takes over.
 */
export function MobileOrderBar({ items, quote, canOrder, onPlaceOrder }: OrderSummaryProps) {
	const t = useTranslations("checkout");
	const tCart = useTranslations("cart");
	const locale = useLocale();
	const { isMobileSummaryOpen, setMobileSummaryOpen, error } = useCheckoutStore();
	const { grandTotalFils } = useDisplayTotals(quote);
	const sheetRef = useRef<HTMLDivElement>(null);
	const close = useCallback(() => setMobileSummaryOpen(false), [setMobileSummaryOpen]);

	useDialogFocus(isMobileSummaryOpen, sheetRef, close);

	return (
		<>
			{isMobileSummaryOpen && (
				<>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only backdrop; Escape closes via useDialogFocus */}
					<div aria-hidden="true" onClick={close} className="fixed inset-0 z-40 bg-nl-espresso/50 lg:hidden" />
					{/* biome-ignore lint/a11y/useSemanticElements: native <dialog> top-layer/backdrop semantics conflict with this bottom sheet */}
					<div
						role="dialog"
						ref={sheetRef}
						aria-modal="true"
						aria-labelledby="mobile-summary-title"
						className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[10px] bg-nl-pearl text-nl-cacao shadow-lift lg:hidden"
					>
						<div className="flex items-center justify-between gap-3 border-b border-nl-cacao/10 px-4 py-3">
							<h2 id="mobile-summary-title" className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em]">
								{t("orderSummary")}
								<span className="ms-2 text-[12.5px] font-normal tabular-nums text-nl-russet">
									{tCart("itemsCount", { count: items.reduce((n, i) => n + i.quantity, 0) })}
								</span>
							</h2>
							<Button variant="ghost" size="icon" onClick={close} aria-label={tCart("close")} data-autofocus>
								<X className="h-5 w-5" strokeWidth={1.75} />
							</Button>
						</div>
						<div className="overflow-y-auto overscroll-contain px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
							<OrderLines items={items} quote={quote} />
							<div className="border-t border-nl-cacao/10 pt-4">
								<OrderTotals quote={quote} />
							</div>
						</div>
					</div>
				</>
			)}

			<div
				data-testid="mobile-order-bar"
				className="fixed inset-x-0 bottom-0 z-50 w-full max-w-full border-t border-nl-cacao/12 bg-nl-pearl shadow-[0_-8px_24px_-12px_rgb(17_20_27/0.25)] lg:hidden"
			>
				{error && !isMobileSummaryOpen && (
					<div className="px-4 pt-3">
						<Notice tone="error" title={t("paymentErrorTitle")} live>
							{error}
						</Notice>
					</div>
				)}
				<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
					<button
						type="button"
						onClick={() => setMobileSummaryOpen(!isMobileSummaryOpen)}
						aria-expanded={isMobileSummaryOpen}
						aria-label={isMobileSummaryOpen ? t("hideOrderSummary") : t("showOrderSummary")}
						className="flex min-w-0 items-center gap-2 rounded-md py-1 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
					>
						<span className="grid min-w-0">
							<span className="text-[12.5px] text-nl-russet underline decoration-nl-cacao/25 underline-offset-[3px]">
								{t("totalDue")}
							</span>
							{quote === null ? (
								<span className="mt-1 h-6 w-24 animate-pulse rounded-sm bg-nl-cacao/[0.07] motion-reduce:animate-none" />
							) : (
								<Money
									fils={grandTotalFils}
									locale={locale}
									className="truncate font-display text-[19px] font-semibold tracking-[-0.01em] text-nl-cacao"
								/>
							)}
						</span>
						<ChevronUp
							className={cn(
								"h-4 w-4 shrink-0 text-nl-russet transition-transform motion-reduce:transition-none",
								isMobileSummaryOpen && "rotate-180",
							)}
							strokeWidth={2}
							aria-hidden="true"
						/>
					</button>
					<PlaceOrderButton
						compact
						canOrder={canOrder}
						onPlaceOrder={onPlaceOrder}
						grandTotalFils={grandTotalFils}
						className="max-w-[56vw] px-4"
					/>
				</div>
			</div>
		</>
	);
}
