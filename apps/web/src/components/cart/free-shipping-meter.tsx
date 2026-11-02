"use client";

import { formatFils } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getFreeShippingProgress } from "./cart-shipping-threshold";

/** "Add AED 32 more for free shipping" with a thin ink meter. */
export function FreeShippingMeter({ subtotalFils, className }: { subtotalFils: number; className?: string }) {
	const t = useTranslations("cart");
	const locale = useLocale();
	const { progress, unlocked, remainingFils } = getFreeShippingProgress(subtotalFils);
	const label = unlocked
		? t("freeShippingUnlocked")
		: t("freeShippingRemaining", { amount: `AED ${formatFils(remainingFils, locale)}` });

	return (
		<div className={cn("grid gap-2", className)}>
			<p className="m-0 flex items-center gap-1.5 text-[13px] text-nl-cacao">
				{unlocked && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
				<span className="tabular-nums">{label}</span>
			</p>
			{/* biome-ignore lint/a11y/useFocusableInteractive: read-only meter, nothing to interact with */}
			<div
				role="progressbar"
				aria-label={label}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(progress)}
				className="h-1 overflow-hidden rounded-sm bg-nl-cacao/10"
			>
				<div
					className="h-full rounded-sm bg-nl-cacao transition-[width] duration-300 ease-out motion-reduce:transition-none"
					style={{ width: `${progress}%` }}
				/>
			</div>
		</div>
	);
}
