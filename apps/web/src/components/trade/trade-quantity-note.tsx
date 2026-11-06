"use client";

import { formatFils } from "@/components/swatch";
import { useLocale } from "next-intl";
import { type TradeTerms, nextTier, unitPriceFor } from "./trade-terms";
import { useTradeLabels } from "./use-trade-labels";

/**
 * The ordering rules under the quantity stepper ("Minimum order 50 sheets, then
 * in steps of 25 · 500 sheets per carton") and, when a cheaper tier is close,
 * a one-step way to reach it.
 */
export function TradeQuantityNote({
	terms,
	quantity,
	max,
	onSelect,
}: {
	terms: TradeTerms;
	quantity: number;
	max?: number;
	onSelect: (quantity: number) => void;
}) {
	const locale = useLocale();
	const { t, count, unitName } = useTradeLabels();
	const moq = terms.minOrderQuantity;
	const inc = terms.orderIncrement;

	const rule =
		moq > 1 && inc > 1
			? t("minOrderSteps", { quantity: count(terms.unit, moq), step: inc })
			: moq > 1
				? t("minOrder", { quantity: count(terms.unit, moq) })
				: inc > 1
					? t("stepsOnly", { quantity: count(terms.unit, inc) })
					: null;
	const pack =
		terms.unitsPerPack != null && terms.unit
			? t("perPack", {
					contents: count(terms.packContentsUnit, terms.unitsPerPack),
					unit: unitName(terms.unit),
				})
			: null;
	const next = nextTier(terms, quantity);
	const nextReachable =
		next && (max == null || next.min_quantity <= max) && next.unitsToGo > 0;
	const now = unitPriceFor(terms, quantity);
	const saving = terms.basePrice - now;

	if (!rule && !pack && !nextReachable && saving <= 0) return null;

	return (
		<div className="grid gap-1 text-[13px] leading-snug text-nl-russet">
			{(rule || pack) && (
				<p className="m-0">
					{rule}
					{rule && pack && <span aria-hidden="true"> · </span>}
					{pack}
				</p>
			)}
			{saving > 0 && (
				<p className="m-0 text-nl-cacao">
					{t("savingsAtQty", {
						amount: `AED ${formatFils(saving * quantity, locale)}`,
					})}
				</p>
			)}
			{nextReachable && next && (
				<p className="m-0 flex flex-wrap items-baseline gap-x-2">
					<span>
						{t("nextTier", {
							more: count(terms.unit, next.unitsToGo),
							price: `AED ${formatFils(next.unit_price, locale)}`,
						})}
					</span>
					<button
						type="button"
						onClick={() => onSelect(next.min_quantity)}
						className="rounded-sm font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
					>
						{t("useNextTier", { more: next.unitsToGo })}
					</button>
				</p>
			)}
		</div>
	);
}
