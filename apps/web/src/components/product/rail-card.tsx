"use client";

import { PriceTag } from "@/components/swatch";
import type { RailProduct } from "@/lib/queries/recommendations";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

interface RailCardProps {
	item: RailProduct;
	/** Set to true on the bestsellers rail for the currently-viewed product. */
	isViewing?: boolean;
	/** Override the supplier line — defaults to brand, then vendor name. */
	eyebrow?: string;
	/** Kept for API compatibility; cards are white stock on any band. */
	dark?: boolean;
	/** Optional locale prefix for the product link (defaults to the current locale). */
	localePrefix?: string;
}

/**
 * Compact product card for rails. Recommendation payloads carry no category
 * name, so the card has no stock tab (a guessed stock would misfile it); it is
 * otherwise a swatch card: image well, supplier, name, price.
 */
export function RailCard({ item, isViewing, eyebrow, localePrefix }: RailCardProps) {
	const locale = useLocale();
	const t = useTranslations("common");
	const tb = useTranslations("browse");
	const image = item.images?.[0];
	const supplier =
		eyebrow ?? item.brand?.name ?? item.vendor?.business_name ?? item.vendor?.name ?? null;
	const href = `${localePrefix ?? `/${locale}`}/product/${item.slug}`;
	const compareAt =
		typeof item.compare_at_price === "number" && item.compare_at_price > item.price
			? item.compare_at_price
			: null;

	return (
		<Link
			href={href}
			className="group flex h-full flex-col overflow-hidden rounded-md bg-nl-pearl shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber motion-reduce:transition-none motion-reduce:hover:translate-y-0"
		>
			<div className="relative aspect-[4/3] overflow-hidden bg-nl-linen">
				{image?.url ? (
					<Image
						src={image.url}
						alt={image.alt_text ?? item.name}
						fill
						sizes="252px"
						className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
					/>
				) : (
					<span className="mill-label absolute inset-0 grid place-items-center text-nl-russet/70">
						{t("noImage")}
					</span>
				)}
				{isViewing && (
					<span className="mill-label absolute top-2.5 start-2.5 inline-flex h-6 items-center rounded-sm bg-nl-cacao px-2 text-white">
						{tb("viewing")}
					</span>
				)}
				{item.in_stock === false && (
					<span className="mill-label absolute inset-x-0 bottom-0 bg-nl-cacao/85 py-1.5 text-center text-white">
						{t("outOfStock")}
					</span>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-1.5 p-3.5">
				{supplier && (
					<span className="truncate text-[12.5px] text-nl-russet">{supplier}</span>
				)}
				<span className="font-display text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-nl-cacao line-clamp-2">
					{item.name}
				</span>
				<div className="mt-auto border-t border-dashed border-nl-cacao/15 pt-2">
					<PriceTag amount={item.price} locale={locale} compareAt={compareAt} size="sm" />
				</div>
			</div>
		</Link>
	);
}
