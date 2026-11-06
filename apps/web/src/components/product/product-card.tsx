"use client";

import { useToggleWishlist, useWishlist } from "@/lib/queries/account";
import { useAddToCart } from "@/lib/queries/cart";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart";
import { usePreferencesStore } from "@/stores/preferences";
import { EcoCardBadge } from "@/components/eco";
import { PriceTag, SwatchCard, stockFor } from "@/components/swatch";
import { type Unit, UNITS, cardFromPrice } from "@/components/trade/trade-terms";
import { useTradeLabels } from "@/components/trade/use-trade-labels";
import { Heart, Plus, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Product {
	id: string;
	name: string;
	slug: string;
	price_min: number;
	price_max: number;
	compare_at_price?: number | null;
	images: string[];
	rating_avg?: number;
	review_count?: number;
	vendor_name?: string;
	vendor_id?: string;
	brand_name?: string;
	category_name?: string;
	in_stock?: boolean;
	tags?: string[];
	status?: string;
	group_swatches?: string[];
	group_from_price?: number;
	group_listing_mode?: string;
	/** Eco catalogue: true only for an admin-approved plastic-ban declaration. */
	plastic_ban_ready?: boolean;
	/** Trade pricing from the search index. */
	tier_price_min?: number;
	unit_of_measure?: string;
	min_order_quantity?: number;
	has_trade_rules?: boolean;
	has_sample?: boolean;
}

interface ProductCardProps {
	product: Product;
	/** Show a rank marker ("#1") — pass the 1-based index. */
	rank?: number;
	/** Show a "NEW" chip top-left and (optionally) an age label top-right. */
	isNew?: boolean;
	age?: string;
	/** Show wishlist heart icon (hidden when an age label is present). */
	showWishlist?: boolean;
	/** Show quick-add hover overlay on the image. */
	showQuickAdd?: boolean;
}

export function ProductCard({
	product,
	rank,
	isNew,
	age,
	showWishlist = true,
	showQuickAdd = true,
}: ProductCardProps) {
	const t = useTranslations("common");
	const tTrade = useTranslations("trade");
	const locale = useLocale();
	const router = useRouter();
	const { currency } = usePreferencesStore();
	const { openSlideOver } = useCartStore();
	const addToCart = useAddToCart();
	const toggleWishlist = useToggleWishlist();
	const { data: wishlistItems } = useWishlist();

	const isWishlisted = (wishlistItems || []).some(
		(item: { product_id?: string; id?: string }) =>
			item.product_id === product.id || item.id === product.id,
	);

	const href = `/${locale}/product/${product.slug}`;
	const hasPriceRange = product.price_min !== product.price_max;
	const compareAt =
		typeof product.compare_at_price === "number"
			? product.compare_at_price
			: null;
	const hasStrike =
		!hasPriceRange && compareAt !== null && compareAt > product.price_min;
	const eyebrowLabel =
		product.brand_name || product.vendor_name || product.category_name || null;
	const image = product.images?.[0] ?? null;
	const outOfStock = product.in_stock === false;
	const showAgeChip = isNew && age;
	const hasGroupFrom =
		typeof product.group_from_price === "number" &&
		product.group_from_price > 0;
	const displayBasePrice = hasGroupFrom
		? (product.group_from_price as number)
		: product.price_min;
	// Trade pricing: "from" the lowest tier, priced per unit, with the minimum.
	const { unitName, count } = useTradeLabels();
	const tradeUnit: Unit | null = (UNITS as readonly string[]).includes(product.unit_of_measure ?? "")
		? (product.unit_of_measure as Unit)
		: null;
	const tierFrom = hasGroupFrom ? null : cardFromPrice(product);
	const fromTier = tierFrom?.fromTier ?? false;
	const priceAmount = fromTier && tierFrom ? tierFrom.amount : displayBasePrice;
	const minOrder = (product.min_order_quantity ?? 1) > 1 ? (product.min_order_quantity as number) : null;
	const needsPage = hasPriceRange || product.has_trade_rules === true;

	function handleAdd(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (needsPage) {
			router.push(href);
			return;
		}
		addToCart.mutate(
			{ productId: product.id, variantId: null, quantity: 1 },
			{ onSuccess: () => openSlideOver() },
		);
	}

	function handleWishlist(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		toggleWishlist.mutate(product.id);
	}

	const stock = stockFor(product.category_name);
	const supplier = product.vendor_name;
	const maker = product.brand_name && product.brand_name !== supplier ? product.brand_name : null;

	return (
		<SwatchCard stock={stock} tabLabel={product.category_name} as="article" className="group h-full">
			<div className="relative aspect-[4/3] overflow-hidden bg-nl-linen">
				{image ? (
					<Image
						src={image}
						alt={product.name}
						fill
						sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 360px"
						quality={92}
						loading="lazy"
						className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
					/>
				) : (
					<div className="absolute inset-0 grid place-items-center">
						<span className="mill-label text-nl-russet/70">{t("noImage")}</span>
					</div>
				)}

				{rank != null && (
					<span className="absolute top-2.5 start-2.5 z-[1] h-6 px-2 inline-flex items-center rounded-sm bg-nl-cacao text-white font-mono text-[11.5px] tabular-nums">
						#{rank}
					</span>
				)}
				{rank == null && isNew && (
					<span className="absolute top-2.5 start-2.5 z-[1] h-6 px-2 inline-flex items-center rounded-sm bg-nl-amber text-white mill-label">
						New
					</span>
				)}

				{showAgeChip ? (
					<span className="absolute top-2.5 end-2.5 z-[1] h-6 px-2 inline-flex items-center rounded-sm bg-white/90 text-nl-cacao font-mono text-[11px]">
						{age}
					</span>
				) : (
					showWishlist && (
						<button
							type="button"
							onClick={handleWishlist}
							disabled={toggleWishlist.isPending}
							aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
							aria-pressed={isWishlisted}
							className="absolute top-1.5 end-1.5 z-[2] w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors"
						>
							<Heart
								className={cn("h-[18px] w-[18px] transition-colors", isWishlisted ? "fill-nl-amber text-nl-amber" : "text-nl-cacao")}
								strokeWidth={1.75}
							/>
						</button>
					)
				)}

				{outOfStock && (
					<div className="absolute inset-x-0 bottom-0 z-[1] bg-nl-cacao/85 text-white py-1.5 text-center mill-label">
						{t("outOfStock")}
					</div>
				)}
			</div>

			<div className="flex flex-1 flex-col gap-2 p-3.5 md:p-4">
				{(maker || supplier) && (
					<p className="m-0 text-[12.5px] leading-snug text-nl-russet truncate">
						{maker ?? supplier}
						{maker && supplier && <span className="text-nl-russet/70"> · {supplier}</span>}
					</p>
				)}
				<h3 className="m-0 font-display font-semibold text-[15.5px] leading-[1.25] tracking-[-0.01em] text-nl-cacao line-clamp-2">
					<Link href={href} className="outline-none after:absolute after:inset-0 after:z-[1] after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-nl-amber focus-visible:after:rounded-md">
						{product.name}
					</Link>
				</h3>

				{/* Eco catalogue insertion point: renders only for plastic-ban ready products. */}
				<EcoCardBadge product={product} />

				{product.group_swatches && product.group_swatches.length > 0 && (
					<div className="flex items-center gap-1">
						{product.group_swatches.slice(0, 8).map((hex, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: decorative colour chips — hex values can repeat
								key={`${hex}-${i}`}
								className="h-3.5 w-3.5 rounded-[2px] ring-1 ring-inset ring-black/10"
								style={{ backgroundColor: hex }}
								aria-hidden
							/>
						))}
						{product.group_swatches.length > 8 && (
							<span className="font-mono text-[11px] text-nl-russet">+{product.group_swatches.length - 8}</span>
						)}
					</div>
				)}

				{product.rating_avg != null && product.rating_avg > 0 && (
					<div className="flex items-center gap-1 text-[12px] text-nl-russet tabular-nums">
						<Star className="h-3 w-3 fill-nl-cacao text-nl-cacao" strokeWidth={0} />
						<span className="text-nl-cacao font-medium">{product.rating_avg.toFixed(1)}</span>
						{product.review_count != null && <span>({product.review_count.toLocaleString()})</span>}
					</div>
				)}

				{minOrder && (
					<p className="m-0 text-[12px] tabular-nums text-nl-russet">
						{tTrade("minQty", { quantity: count(tradeUnit, minOrder) })}
					</p>
				)}

				<div className="mt-auto pt-2 flex items-end justify-between gap-2 border-t border-dashed border-nl-cacao/15">
					<PriceTag
						amount={priceAmount}
						locale={locale}
						currency={currency}
						from={hasGroupFrom || fromTier}
						fromLabel={t("from")}
						unit={tradeUnit ? unitName(tradeUnit) : null}
						max={!hasGroupFrom && !fromTier && hasPriceRange ? product.price_max : null}
						compareAt={!hasGroupFrom && !fromTier && hasStrike ? compareAt : null}
						className="pt-1 min-w-0"
					/>
					{showQuickAdd && (
						<button
							type="button"
							onClick={handleAdd}
							disabled={addToCart.isPending || outOfStock}
							aria-label={hasPriceRange ? "Select options" : needsPage ? tTrade("chooseQuantity") : t("addToCart")}
							className="relative z-[2] shrink-0 h-9 w-9 rounded-md bg-nl-cacao text-white inline-flex items-center justify-center hover:bg-nl-amber transition-colors disabled:opacity-40"
						>
							<Plus className="h-4 w-4" strokeWidth={2} />
						</button>
					)}
				</div>
			</div>
		</SwatchCard>
	);
}
