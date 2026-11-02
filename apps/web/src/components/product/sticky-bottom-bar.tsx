"use client";

import { Button, PriceTag } from "@/components/swatch";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

interface StickyBottomBarProps {
	visible: boolean;
	title: string;
	imageUrl?: string | null;
	price: number;
	unit?: string | null;
	onAddToCart: () => void;
	isPending: boolean;
	outOfStock?: boolean;
}

/**
 * Phone-only buy bar. It appears while the main add-to-cart row is out of
 * view and adds the same variant and quantity the panel has selected. It sits
 * above the mobile tab bar.
 */
export function StickyBottomBar({
	visible,
	title,
	imageUrl,
	price,
	unit,
	onAddToCart,
	isPending,
	outOfStock = false,
}: StickyBottomBarProps) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	if (!visible) return null;

	return (
		<div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 animate-slide-up motion-reduce:animate-none md:hidden">
			<div className="flex items-center gap-3 border-t border-nl-cacao/12 bg-nl-pearl px-4 py-2.5 shadow-lift">
				{imageUrl && (
					<div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-sm bg-nl-linen">
						<Image src={imageUrl} alt="" fill sizes="44px" className="object-cover" />
					</div>
				)}
				<div className="grid min-w-0 flex-1 gap-0.5">
					<p className="m-0 truncate text-[13px] font-medium text-nl-cacao">{title}</p>
					<PriceTag amount={price} locale={locale} unit={unit} size="sm" />
				</div>
				{outOfStock ? (
					<Button variant="outline" size="md" disabled className="shrink-0">
						{t("outOfStock")}
					</Button>
				) : (
					<Button variant="signal" size="md" onClick={onAddToCart} disabled={isPending} className="shrink-0">
						{isPending ? t("adding") : t("addToCart")}
					</Button>
				)}
			</div>
		</div>
	);
}
