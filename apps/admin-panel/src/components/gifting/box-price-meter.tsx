"use client";

import { formatAed } from "@/lib/money";
import type { GiftBoxPrice } from "@/lib/queries/gifting";
import type { PickerItem } from "./box-item-picker";

/**
 * Shows the box price breakdown. Two sources:
 *  - `serverPrice`: authoritative breakdown returned by the box GET / save
 *    response. Preferred when present.
 *  - a best-effort client estimate computed from the current picker items'
 *    known unit prices + the selected style's packaging base price. Used while
 *    editing before a save round-trip. Items without a known unit price are
 *    excluded from the estimate and flagged.
 *
 * Both paths use the SAME arithmetic as the backend:
 *   total = itemsSubtotal - round(itemsSubtotal * discount% / 100) + packaging
 */
export function BoxPriceMeter({
	items,
	discountPercentage,
	packagingFils,
	serverPrice,
}: {
	items: PickerItem[];
	/** Whole-number percentage. */
	discountPercentage: number;
	/** Selected style's base_price in fils. */
	packagingFils: number;
	/** Authoritative price from the server (box GET / save response). */
	serverPrice?: GiftBoxPrice | null;
}) {
	// Client estimate
	const itemsWithPrice = items.filter((it) => it.unit_price != null);
	const missingPrices = items.length - itemsWithPrice.length;
	const estSubtotal = itemsWithPrice.reduce(
		(sum, it) => sum + (it.unit_price ?? 0) * it.quantity,
		0,
	);
	const estDiscount = Math.round((estSubtotal * discountPercentage) / 100);
	const estTotal = estSubtotal - estDiscount + packagingFils;

	const subtotal = serverPrice ? serverPrice.itemsSubtotal : estSubtotal;
	const discount = serverPrice ? serverPrice.discount : estDiscount;
	const packaging = serverPrice ? serverPrice.packaging : packagingFils;
	const total = serverPrice ? serverPrice.total : estTotal;

	return (
		<div className="space-y-2 rounded-md border bg-pearl/30 p-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold uppercase tracking-wide text-cacao">
					Price preview
				</h3>
				<span className="text-xs text-muted-foreground">
					{serverPrice ? "saved" : "estimate"}
				</span>
			</div>

			<Row label="Items subtotal" value={subtotal} />
			<Row
				label={`Discount (${discountPercentage}%)`}
				value={-discount}
				muted
			/>
			<Row label="Packaging" value={packaging} muted />
			<div className="border-t pt-2">
				<Row label="Total" value={total} bold />
			</div>

			{!serverPrice && missingPrices > 0 && (
				<p className="pt-1 text-xs text-amber-600">
					{missingPrices} item(s) have no known price; the estimate excludes
					them. Save to see the authoritative total.
				</p>
			)}
			{serverPrice && serverPrice.perVendor.length > 1 && (
				<p className="pt-1 text-xs text-muted-foreground">
					Spans {serverPrice.perVendor.length} vendors.
				</p>
			)}
		</div>
	);
}

function Row({
	label,
	value,
	muted,
	bold,
}: {
	label: string;
	value: number;
	muted?: boolean;
	bold?: boolean;
}) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span
				className={
					muted
						? "text-taupe"
						: bold
							? "font-semibold text-cacao"
							: "text-cacao"
				}
			>
				{label}
			</span>
			<span
				className={
					bold
						? "font-semibold text-cacao"
						: muted
							? "text-taupe"
							: "text-cacao"
				}
			>
				{value < 0 ? `−${formatAed(Math.abs(value))}` : formatAed(value)}
			</span>
		</div>
	);
}
