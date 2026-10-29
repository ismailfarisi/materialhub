"use client";

import { useToggleWishlist, useWishlist } from "@/lib/queries/account";
import { useAddToCart } from "@/lib/queries/cart";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart";
import { usePreferencesStore } from "@/stores/preferences";
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
}

interface ProductCardProps {
	product: Product;
	/** Show a "No. 01" rank pill — pass the 1-based index. */
	rank?: number;
	/** Show a "NEW" chip top-left and (optionally) an age label top-right. */
	isNew?: boolean;
	age?: string;
	/** Show wishlist heart icon (hidden when an age label is present). */
	showWishlist?: boolean;
	/** Show quick-add hover overlay on the image. */
	showQuickAdd?: boolean;
}

function formatAmount(amountInFils: number, locale: string): string {
	return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
		maximumFractionDigits: 0,
	}).format(amountInFils / 100);
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

	function handleAdd(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (hasPriceRange) {
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

	return (
		<Link href={href} className="group block" aria-label={product.name}>
			<div className="relative aspect-[4/5] overflow-hidden bg-nl-russet/15 mb-4">
				{image ? (
					<Image
						src={image}
						alt={product.name}
						fill
						sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 360px"
						quality={92}
						loading="lazy"
						className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
					/>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-nl-russet/50 text-[10px] tracking-[0.22em] uppercase">
						{t("noImage")}
					</div>
				)}

				{rank != null && (
					<div className="absolute top-3 left-3 px-2 py-1 bg-nl-linen/90 text-nl-cacao text-[9px] tracking-[0.22em] uppercase">
						No. {String(rank).padStart(2, "0")}
					</div>
				)}
				{rank == null && isNew && (
					<div className="absolute top-3 left-3 px-2.5 py-1 bg-nl-amber text-nl-espresso text-[9px] tracking-[0.22em] uppercase">
						New
					</div>
				)}

				{showAgeChip ? (
					<div className="absolute top-3 right-3 text-[9px] tracking-[0.2em] uppercase text-nl-linen drop-shadow-[0_1px_2px_rgba(26,18,8,0.4)]">
						{age}
					</div>
				) : (
					showWishlist && (
						<button
							type="button"
							onClick={handleWishlist}
							disabled={toggleWishlist.isPending}
							aria-label={
								isWishlisted ? "Remove from wishlist" : "Add to wishlist"
							}
							aria-pressed={isWishlisted}
							className="absolute top-2 right-2 w-11 h-11 rounded-full bg-nl-linen/85 hover:bg-nl-linen flex items-center justify-center transition-colors"
						>
							<Heart
								className={cn(
									"h-4 w-4 transition-colors",
									isWishlisted
										? "fill-nl-amber text-nl-amber"
										: "text-nl-cacao",
								)}
								strokeWidth={1.5}
							/>
						</button>
					)
				)}

				{outOfStock && (
					<div className="absolute inset-0 bg-nl-cacao/40 flex items-center justify-center">
						<span className="text-nl-linen text-[10px] tracking-[0.22em] uppercase bg-nl-cacao/70 px-3 py-1.5">
							{t("outOfStock")}
						</span>
					</div>
				)}

				{showQuickAdd && !outOfStock && (
					<button
						type="button"
						onClick={handleAdd}
						disabled={addToCart.isPending}
						aria-label={hasPriceRange ? "Select options" : "Quick add to cart"}
						className="absolute left-3 right-3 bottom-3 bg-nl-espresso/85 backdrop-blur-sm text-nl-linen px-3.5 py-2.5 flex items-center justify-between text-[10px] tracking-[0.22em] uppercase opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 disabled:opacity-50"
					>
						{hasPriceRange ? "Select options" : "Quick add"}
						<Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				)}
			</div>

			{eyebrowLabel && (
				<p className="text-[9.5px] tracking-[0.22em] uppercase text-nl-russet mb-1.5 truncate">
					{eyebrowLabel}
				</p>
			)}
			<h3 className="font-serif text-lg leading-tight text-nl-cacao line-clamp-2 mb-2.5 min-h-[44px]">
				{product.name}
			</h3>

			{product.group_swatches && product.group_swatches.length > 0 && (
				<div className="mt-1 flex items-center gap-1 mb-2">
					{product.group_swatches.slice(0, 6).map((hex, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: decorative color dots — hex values can repeat
							key={`${hex}-${i}`}
							className="h-3 w-3 rounded-full border border-black/10"
							style={{ backgroundColor: hex }}
							aria-hidden
						/>
					))}
					{product.group_swatches.length > 6 && (
						<span className="text-[10px] text-nl-russet/70">
							+{product.group_swatches.length - 6}
						</span>
					)}
				</div>
			)}

			<div className="h-px w-7 bg-nl-amber mb-2.5" />

			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 flex items-baseline gap-1.5 flex-wrap">
					{hasGroupFrom && (
						<span className="text-[9.5px] tracking-[0.2em] uppercase text-nl-russet/70">
							from
						</span>
					)}
					<span className="text-[9.5px] tracking-[0.2em] uppercase text-nl-russet">
						{currency}
					</span>
					<span className="font-serif text-xl text-nl-cacao leading-none">
						{formatAmount(displayBasePrice, locale)}
					</span>
					{!hasGroupFrom && hasPriceRange && (
						<span className="text-[11px] text-nl-russet">
							– {formatAmount(product.price_max, locale)}
						</span>
					)}
					{!hasGroupFrom && hasStrike && compareAt != null && (
						<span className="text-[10px] text-nl-russet/70 line-through">
							{formatAmount(compareAt, locale)}
						</span>
					)}
				</div>
				<button
					type="button"
					onClick={handleAdd}
					disabled={addToCart.isPending || outOfStock}
					aria-label={hasPriceRange ? "Select options" : t("addToCart")}
					className="inline-flex items-center min-h-[44px] px-4 border border-nl-cacao/80 text-nl-cacao text-[9.5px] tracking-[0.22em] uppercase hover:bg-nl-cacao hover:text-nl-linen transition-colors disabled:opacity-50 shrink-0"
				>
					{hasPriceRange ? "Select" : t("add")}
				</button>
			</div>

			{product.rating_avg != null && product.rating_avg > 0 && (
				<div className="flex items-center gap-1.5 mt-2 text-[10.5px] text-nl-russet">
					<Star
						className="h-2.5 w-2.5 fill-nl-amber text-nl-amber"
						strokeWidth={0}
					/>
					<span>{product.rating_avg.toFixed(1)}</span>
					{product.review_count != null && (
						<span className="opacity-60">
							({product.review_count.toLocaleString()})
						</span>
					)}
				</div>
			)}
		</Link>
	);
}
