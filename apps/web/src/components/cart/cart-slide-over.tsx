"use client";

import { Button, PriceTag } from "@/components/swatch";
import { useCart } from "@/lib/queries/cart";
import { cn } from "@/lib/utils";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { ArrowRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CartItem } from "./cart-item";
import { type CartLineItem, cartPieceCount, cartSubtotalFils, groupBySupplier, isLineUnavailable } from "./cart-lines";
import { FreeShippingMeter } from "./free-shipping-meter";
import { useDialogFocus } from "./use-dialog-focus";

export function CartSlideOver() {
	const t = useTranslations("cart");
	const locale = useLocale();
	const { isSlideOverOpen, closeSlideOver } = useCartStore();
	const { data: cart, isLoading } = useCart();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const openAuthModal = useAuthModalStore((s) => s.open);
	const panelRef = useRef<HTMLElement>(null);
	const [entered, setEntered] = useState(false);

	useDialogFocus(isSlideOverOpen, panelRef, closeSlideOver);

	useEffect(() => {
		if (!isSlideOverOpen) {
			setEntered(false);
			return;
		}
		const id = requestAnimationFrame(() => setEntered(true));
		return () => cancelAnimationFrame(id);
	}, [isSlideOverOpen]);

	if (!isSlideOverOpen) return null;

	const items: CartLineItem[] = cart?.items ?? [];
	const groups = groupBySupplier(items);
	const subtotalFils = cartSubtotalFils(items);
	const pieces = cartPieceCount(items);
	const hasUnavailable = items.some(isLineUnavailable);

	function signInToCheckout() {
		openAuthModal("login", `/${locale}/checkout`);
		closeSlideOver();
	}

	return (
		<>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only backdrop; Escape closes via useDialogFocus */}
			<div
				aria-hidden="true"
				onClick={closeSlideOver}
				className={cn(
					"fixed inset-0 z-40 bg-nl-espresso/50 transition-opacity duration-200 motion-reduce:transition-none",
					entered ? "opacity-100" : "opacity-0",
				)}
			/>
			{/* biome-ignore lint/a11y/useSemanticElements: native <dialog> top-layer/backdrop semantics conflict with this slide-over */}
			<aside
				role="dialog"
				ref={panelRef}
				aria-modal="true"
				aria-labelledby="cart-slide-over-title"
				className={cn(
					"fixed inset-y-0 end-0 z-50 flex w-full max-w-[440px] flex-col bg-nl-pearl text-nl-cacao shadow-lift",
					"transition-transform duration-200 ease-out motion-reduce:transition-none",
					entered ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
				)}
			>
				<header className="grid gap-4 border-b border-nl-cacao/10 px-5 pb-4 pt-4 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2.5">
							<h2 id="cart-slide-over-title" className="m-0 font-display text-xl font-semibold tracking-[-0.02em]">
								{t("pageTitle")}
							</h2>
							{items.length > 0 && (
								<span className="text-[12.5px] tabular-nums text-nl-russet">
									{t("itemsCount", { count: pieces })}
								</span>
							)}
						</div>
						<Button variant="ghost" size="icon" onClick={closeSlideOver} aria-label={t("close")} data-autofocus>
							<X className="h-5 w-5" strokeWidth={1.75} />
						</Button>
					</div>
					{items.length > 0 && <FreeShippingMeter subtotalFils={subtotalFils} />}
				</header>

				<div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
					{isLoading ? (
						<div className="grid gap-4 py-5" aria-hidden="true">
							{[0, 1].map((i) => (
								<div key={i} className="grid grid-cols-[64px_1fr] gap-3 animate-pulse motion-reduce:animate-none">
									<div className="aspect-square rounded-md bg-nl-cacao/[0.07]" />
									<div className="grid content-start gap-2 pt-1">
										<div className="h-4 w-3/4 rounded-sm bg-nl-cacao/[0.07]" />
										<div className="h-3 w-1/3 rounded-sm bg-nl-cacao/[0.07]" />
										<div className="h-8 w-28 rounded-md bg-nl-cacao/[0.07]" />
									</div>
								</div>
							))}
						</div>
					) : items.length === 0 ? (
						<div className="flex h-full flex-col items-start justify-center gap-3 py-16">
							<h3 className="m-0 font-display text-lg font-semibold tracking-[-0.01em]">{t("emptyTitle")}</h3>
							<p className="m-0 max-w-[34ch] text-[14px] leading-relaxed text-nl-russet">{t("emptyBody")}</p>
							<Button asChild variant="outline" className="mt-2">
								<Link href={`/${locale}`} onClick={closeSlideOver}>
									{t("browseCta")}
									<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
								</Link>
							</Button>
						</div>
					) : (
						groups.map((group) => (
							<section key={group.key} aria-label={t("vendorGroup", { vendor: group.vendorName })} className="border-b border-nl-cacao/10 last:border-b-0">
								<p className="m-0 pt-4 text-[12.5px] text-nl-russet">
									{t.rich("soldBy", {
										vendor: group.vendorName,
										b: (chunks) => <span className="font-medium text-nl-cacao">{chunks}</span>,
									})}
								</p>
								<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
									{group.items.map((item) => (
										<li key={item.variant_id}>
											<CartItem item={item} compact onNavigate={closeSlideOver} />
										</li>
									))}
								</ul>
							</section>
						))
					)}
				</div>

				{items.length > 0 && (
					<footer className="grid gap-3 border-t border-nl-cacao/10 bg-nl-pearl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-[14px] font-medium">{t("subtotal")}</span>
							<PriceTag amount={subtotalFils} locale={locale} size="md" />
						</div>
						<p className="m-0 -mt-1 text-[12.5px] text-nl-russet">{t("subtotalNote")}</p>
						{hasUnavailable && (
							<p role="alert" className="m-0 text-[13px] text-destructive">
								{t("removeUnavailable")}
							</p>
						)}
						{isAuthenticated ? (
							<Button asChild variant="signal" size="lg" className="w-full">
								<Link href={`/${locale}/checkout`} onClick={closeSlideOver}>
									{t("checkoutCta")}
									<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
								</Link>
							</Button>
						) : (
							<Button variant="signal" size="lg" className="w-full" onClick={signInToCheckout}>
								{t("checkoutCta")}
								<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
							</Button>
						)}
						<Button asChild variant="ghost" size="sm" className="w-full">
							<Link href={`/${locale}/cart`} onClick={closeSlideOver}>
								{t("viewCart")}
							</Link>
						</Button>
					</footer>
				)}
			</aside>
		</>
	);
}
