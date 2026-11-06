"use client";

import { formatFils } from "@/components/swatch";
import { AlertCircle } from "lucide-react";
import { useLocale } from "next-intl";
import {
	type TradeTerms,
	type TradeViolationCode,
	UNITS,
	type Unit,
	stepQuantity,
} from "./trade-terms";
import { useTradeLabels } from "./use-trade-labels";

/** The `trade` block GET /cart adds to each line (order-service line-trade-view.ts). */
export interface CartLineTrade {
	unit: string | null;
	units_per_pack: number | null;
	pack_contents_unit: string | null;
	min_order_quantity: number;
	order_increment: number;
	is_sample: boolean;
	max_quantity: number | null;
	base_unit_price: number;
	live_unit_price: number;
	price_source: "base" | "tier" | "quote";
	tier: { min_quantity: number; unit_price: number } | null;
	savings_fils: number;
	next_tier: {
		min_quantity: number;
		unit_price: number;
		units_to_go: number;
	} | null;
	tiers: { min_quantity: number; unit_price: number }[];
	violation: {
		code: TradeViolationCode;
		message: string;
		suggested_quantity: number;
	} | null;
}

const asUnit = (u: string | null | undefined): Unit | null =>
	u && (UNITS as readonly string[]).includes(u) ? (u as Unit) : null;

export function lineTerms(trade: CartLineTrade): TradeTerms {
	return {
		unit: asUnit(trade.unit),
		unitsPerPack: trade.units_per_pack,
		packContentsUnit: asUnit(trade.pack_contents_unit),
		minOrderQuantity: trade.min_order_quantity,
		orderIncrement: trade.order_increment,
		basePrice: trade.base_unit_price,
		tiers: trade.tiers ?? [],
	};
}

/**
 * Map the cart stepper's ±1 to the line's next valid quantity: increments for
 * trade lines, the cap for samples. Lines without trade data pass through.
 */
export function cartStepQuantity(
	trade: CartLineTrade | null | undefined,
	current: number,
	requested: number,
): number {
	if (!trade || requested === current) return requested;
	const terms = lineTerms(trade);
	const max =
		trade.is_sample && trade.max_quantity != null
			? trade.max_quantity
			: Number.POSITIVE_INFINITY;
	return stepQuantity(terms, current, requested > current ? 1 : -1, max);
}

/** Lowest quantity the cart stepper may reach for a line, and the highest. */
export function cartStepBounds(trade: CartLineTrade | null | undefined): {
	min: number;
	max?: number;
} {
	if (!trade) return { min: 1 };
	return {
		min: trade.min_order_quantity,
		max:
			trade.is_sample && trade.max_quantity != null
				? trade.max_quantity
				: undefined,
	};
}

/**
 * Trade details under a cart line: sample badge, the tier in force and what it
 * saves, a nudge to the next tier, and any rule the quantity breaks, with a
 * one-click fix.
 */
export function CartLineTradeNotes({
	trade,
	quantity,
	pending,
	onSetQuantity,
}: {
	trade: CartLineTrade;
	quantity: number;
	pending?: boolean;
	onSetQuantity: (quantity: number) => void;
}) {
	const locale = useLocale();
	const { t, count, violation } = useTradeLabels();
	const unit = asUnit(trade.unit);
	const v = trade.violation;
	const fix = v ? v.suggested_quantity : null;
	const link =
		"rounded-sm font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber";

	return (
		<div className="grid gap-1 text-[13px] leading-snug">
			{trade.is_sample && (
				<p className="m-0">
					<span className="mill-label inline-flex h-6 items-center rounded-sm bg-nl-cacao px-1.5 text-white">
						{t("sampleBadge")}
					</span>
				</p>
			)}
			{!v &&
				trade.price_source === "tier" &&
				trade.tier &&
				trade.savings_fils > 0 && (
					<p className="m-0 text-nl-cacao">
						{t("tierApplied", {
							quantity: count(unit, trade.tier.min_quantity),
						})}
						<span aria-hidden="true"> · </span>
						{t("youSave", {
							amount: `AED ${formatFils(trade.savings_fils, locale)}`,
						})}
					</p>
				)}
			{!v && trade.next_tier && trade.next_tier.units_to_go > 0 && (
				<p className="m-0 flex flex-wrap items-baseline gap-x-2 text-nl-russet">
					<span>
						{t("nextTier", {
							more: count(unit, trade.next_tier.units_to_go),
							price: `AED ${formatFils(trade.next_tier.unit_price, locale)}`,
						})}
					</span>
					<button
						type="button"
						className={link}
						disabled={pending}
						onClick={() =>
							trade.next_tier && onSetQuantity(trade.next_tier.min_quantity)
						}
					>
						{t("useNextTier", { more: trade.next_tier.units_to_go })}
					</button>
				</p>
			)}
			{v && fix != null && (
				<p
					role="alert"
					className="m-0 flex flex-wrap items-start gap-x-2 gap-y-1 text-destructive"
				>
					<span className="inline-flex items-start gap-1.5">
						<AlertCircle
							className="mt-0.5 h-3.5 w-3.5 shrink-0"
							strokeWidth={2}
							aria-hidden="true"
						/>
						{violation(v.code, {
							unit,
							suggested: fix,
							minOrderQuantity: trade.min_order_quantity,
							orderIncrement: trade.order_increment,
							maxQuantity: trade.max_quantity,
						})}
					</span>
					{fix !== quantity && (
						<button
							type="button"
							className={link}
							disabled={pending}
							onClick={() => onSetQuantity(fix)}
						>
							{t("fixQuantity", { quantity: count(unit, fix) })}
						</button>
					)}
				</p>
			)}
		</div>
	);
}
