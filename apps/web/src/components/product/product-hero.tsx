"use client";

import { Breadcrumb } from "@/components/product/breadcrumb";
import { BnplStrip } from "@/components/product/bnpl-strip";
import { type ColorGroupMember, GroupSwatches } from "@/components/product/group-swatches";
import { MediaGallery } from "@/components/product/media-gallery";
import { SellerBlock, type SellerBlockData } from "@/components/product/seller-block";
import { StickyBottomBar } from "@/components/product/sticky-bottom-bar";
import { VariantSelector } from "@/components/product/variant-selector";
import { Button, MillLabel, PriceTag, StockChip, formatFils, stockFor } from "@/components/swatch";
import { useScrollPast } from "@/hooks/use-scroll-past";
import { useToggleWishlist, useWishlist } from "@/lib/queries/account";
import { useAddToCart } from "@/lib/queries/cart";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart";
import { Heart, Minus, Plus, RotateCcw, Star, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	type CategoryCrumb,
	type PdpVariant,
	buildOptionAxes,
	buildSpecs,
	normaliseVariants,
	resolveUnit,
} from "./pdp-data";

interface ProductHeroProps {
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	product: any;
	/** Pre-extracted vendor card data; null when the product has no vendor. */
	vendor: SellerBlockData | null;
	/** Root-to-leaf category path from the category tree. */
	categoryPath?: CategoryCrumb[];
	/** Free-shipping threshold in fils. */
	freeShippingFils?: number;
	/** "Returns within N days" — from the marketplace return-window setting. */
	returnsWindowDays?: number;
	/** Sibling colour-family listings from the product groups API. */
	colorGroup?: {
		grouping_attribute: { id: string; name: string } | null;
		members: ColorGroupMember[];
	} | null;
}

type HeroImageInput = { id?: string; url?: string | null; alt_text?: string | null };

function hasImageUrl(image: unknown): image is HeroImageInput & { url: string } {
	return (
		typeof image === "object" &&
		image !== null &&
		typeof (image as HeroImageInput).url === "string" &&
		Boolean((image as HeroImageInput).url)
	);
}

const LOW_STOCK = 10;

/** Wrap a value with no Arabic letters in a left-to-right isolate. */
function isolateLtr(v: string): string {
	return /[\u0600-\u06FF]/.test(v) ? v : `\u2066${v}\u2069`;
}

/**
 * Product detail, first screen: photos beside the purchase panel at `lg`.
 * The panel reads title → price per unit → mill label (full spec table) →
 * options → quantity and the one orange button → supplier.
 */
export function ProductHero({
	product,
	vendor,
	categoryPath = [],
	freeShippingFils = 15000,
	returnsWindowDays = 7,
	colorGroup,
}: ProductHeroProps) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const { openSlideOver } = useCartStore();
	const addToCart = useAddToCart();
	const toggleWishlist = useToggleWishlist();
	const { data: wishlistItems } = useWishlist();
	const { ref: ctaRef, isPast: ctaOutOfView } = useScrollPast<HTMLDivElement>();

	// ---- Variants ---------------------------------------------------------
	const variants = useMemo(() => normaliseVariants(product), [product]);
	const axes = useMemo(() => buildOptionAxes(product, variants, t("option")), [product, variants, t]);
	const [variantId, setVariantId] = useState<string | undefined>(
		() => (variants.find((v) => v.available > 0) ?? variants[0])?.id,
	);
	const selected: PdpVariant | undefined = variants.find((v) => v.id === variantId);

	// ---- Stock -------------------------------------------------------------
	const productOutOfStock = product.in_stock === false || (product.quantity_available ?? 1) <= 0;
	const outOfStock = productOutOfStock || (selected != null && selected.available <= 0);
	const available: number = selected ? selected.available : Number(product.quantity_available ?? Number.POSITIVE_INFINITY);
	const maxQty = Number.isFinite(available) && available > 0 ? available : 999;

	const [quantity, setQuantity] = useState(1);
	useEffect(() => {
		setQuantity((q) => Math.min(Math.max(1, q), maxQty));
	}, [maxQty]);

	// ---- Price -------------------------------------------------------------
	const price: number = selected?.price ?? (Number(product.price) || 0);
	const compareAtRaw = selected ? selected.compareAt : product.compare_at_price;
	const compareAt = compareAtRaw != null && Number(compareAtRaw) > price ? Number(compareAtRaw) : null;
	const unit = resolveUnit(product, selected);

	// ---- Spec table --------------------------------------------------------
	const specs = useMemo(() => {
		const rows = buildSpecs(product, selected, {
			dimensions: t("dimensions"),
			weight: t("weight"),
			origin: t("origin"),
			sku: t("sku"),
		});
		// Keep Latin measurements ("1250 gsm", "70 × 100 cm") in reading order under RTL.
		return locale === "ar" ? rows.map((r) => ({ ...r, value: isolateLtr(r.value) })) : rows;
	}, [product, selected, t, locale]);

	// ---- Category / stock --------------------------------------------------
	const root = categoryPath[0];
	const stock = root ? stockFor(root.slug ?? root.name) : null;

	const isWishlisted = (wishlistItems || []).some(
		(item: { product_id?: string }) => item.product_id === product.id,
	);

	const handleAdd = () => {
		if (outOfStock) return;
		addToCart.mutate(
			{ productId: product.id, variantId: selected?.id ?? null, quantity },
			{ onSuccess: () => openSlideOver() },
		);
	};

	const heroImages = useMemo(() => {
		if (!Array.isArray(product.images)) return [];
		return product.images
			.filter(hasImageUrl)
			.sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
			.map((image: HeroImageInput & { url: string }, index: number) => ({
				id: image.id ?? `${image.url}-${index}`,
				url: image.url,
				alt_text: image.alt_text ?? product.title,
			}));
	}, [product.images, product.title]);

	const crumbs = [
		...categoryPath.map((c) => ({ name: c.name, slug: c.slug })),
		{ name: product.title as string },
	];

	const stockNote = productOutOfStock
		? t("productOutOfStock")
		: outOfStock
			? t("optionOutOfStock")
			: null;

	return (
		<div className="text-nl-cacao">
			<div className="mx-auto max-w-[1400px] px-4 pb-10 md:px-8 lg:pb-16">
				<Breadcrumb items={crumbs} stock={stock} />

				<div className="mt-1 grid gap-6 lg:mt-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12 xl:gap-16">
					{/* Photos */}
					<div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
						<MediaGallery images={heroImages} />
					</div>

					{/* Purchase panel */}
					<div className="grid min-w-0 content-start gap-6">
						<header className="grid gap-3">
							<h1 className="m-0 text-balance font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[32px]">
								{product.title}
							</h1>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-nl-russet">
								{root && stock && <StockChip stock={stock} label={categoryPath[categoryPath.length - 1]?.name ?? root.name} />}
								{product.brand_name && (
									<span>
										{product.brand_slug ? (
											<Link
												href={`/${locale}/brand/${encodeURIComponent(product.brand_slug)}`}
												className="underline decoration-nl-cacao/20 underline-offset-4 hover:text-nl-cacao hover:decoration-nl-cacao/50"
											>
												{product.brand_name}
											</Link>
										) : (
											product.brand_name
										)}
									</span>
								)}
								{vendor && (
									<span>
										{t("soldBy")}{" "}
										<Link
											href={`/${locale}/vendor/${vendor.slug}`}
											className="font-medium text-nl-cacao underline decoration-nl-cacao/20 underline-offset-4 hover:decoration-nl-cacao/50"
										>
											{vendor.name}
										</Link>
									</span>
								)}
							</div>
							{product.short_description && (
								<p className="m-0 max-w-[60ch] text-[15px] leading-relaxed text-nl-russet">{product.short_description}</p>
							)}
						</header>

						{/* Price, rating, stock */}
						<div className="grid gap-2.5">
							<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<PriceTag amount={price} locale={locale} unit={unit} compareAt={compareAt} size="lg" />
								{product.is_vat_inclusive !== false && (
									<span className="text-[12.5px] text-nl-russet">{t("inclVat")}</span>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
								<StockStatus outOfStock={outOfStock} available={available} />
								{product.review_count > 0 && product.rating_avg > 0 && (
									<a
										href="#reviews"
										className="inline-flex items-center gap-1.5 text-nl-cacao underline decoration-nl-cacao/20 underline-offset-4 hover:decoration-nl-cacao/50"
									>
										<Star className="h-3.5 w-3.5 fill-nl-cacao" strokeWidth={0} aria-hidden="true" />
										<span className="font-mono tabular-nums">{Number(product.rating_avg).toFixed(1)}</span>
										<span className="sr-only">{t("ratingOutOf", { rating: Number(product.rating_avg).toFixed(1) })}</span>
										<span className="text-nl-russet">· {t("reviewCount", { count: product.review_count })}</span>
									</a>
								)}
							</div>
						</div>

						{/* Mill label: the full spec, never collapsed */}
						{specs.length > 0 && (
							<section aria-labelledby="pdp-spec" className="grid gap-2">
								<h2 id="pdp-spec" className="mill-label m-0 text-nl-cacao">
									{t("specification")}
								</h2>
								<MillLabel specs={specs} />
							</section>
						)}

						{axes.length > 0 && (
							<VariantSelector axes={axes} variants={variants} selected={selected} onSelect={(v) => setVariantId(v.id)} />
						)}

						{(colorGroup?.members?.length ?? 0) > 1 && (
							<GroupSwatches
								label={colorGroup?.grouping_attribute?.name ?? t("option")}
								members={colorGroup?.members ?? []}
								locale={locale}
							/>
						)}

						{/* Quantity + add */}
						<div ref={ctaRef} className="grid gap-3">
							<div className="flex items-stretch gap-2">
								<QuantityStepper value={quantity} max={maxQty} onChange={setQuantity} disabled={outOfStock} />
								{outOfStock ? (
									<Button variant="outline" size="lg" disabled aria-disabled className="flex-1">
										{t("outOfStock")}
									</Button>
								) : (
									<Button
										variant="signal"
										size="lg"
										className="flex-1"
										onClick={handleAdd}
										disabled={addToCart.isPending}
									>
										{addToCart.isPending ? t("adding") : t("addToCart")}
										{!addToCart.isPending && quantity > 1 && (
											<span className="font-mono text-[13px] tabular-nums text-white/85">
												· AED {formatFils(price * quantity, locale)}
											</span>
										)}
									</Button>
								)}
								<Button
									variant="outline"
									size="icon"
									className="h-12 w-12 shrink-0"
									onClick={() => toggleWishlist.mutate(product.id)}
									disabled={toggleWishlist.isPending}
									aria-pressed={isWishlisted}
									aria-label={isWishlisted ? t("removeFromWishlist") : t("addToWishlist")}
								>
									<Heart className={cn("h-[18px] w-[18px]", isWishlisted && "fill-nl-cacao")} strokeWidth={1.75} aria-hidden="true" />
								</Button>
							</div>
							{stockNote && <p className="m-0 text-[13px] text-nl-russet">{stockNote}</p>}
							{addToCart.isError && (
								<p role="alert" className="m-0 text-[13px] text-destructive">
									{t("addFailed")}
								</p>
							)}
						</div>

						{!outOfStock && <BnplStrip total_fils={price * quantity} />}

						<ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[13px] text-nl-russet">
							<li className="inline-flex items-center gap-2">
								<Truck className="h-4 w-4 text-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
								{t("freeShipping", { amount: `AED ${formatFils(freeShippingFils, locale)}` })}
							</li>
							<li className="inline-flex items-center gap-2">
								<RotateCcw className="h-4 w-4 text-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
								{t("returns", { days: returnsWindowDays })}
							</li>
						</ul>

						{vendor && <SellerBlock vendor={vendor} stock={stock} stockLabel={root?.name} />}
					</div>
				</div>
			</div>

			<StickyBottomBar
				visible={ctaOutOfView}
				title={product.title}
				imageUrl={heroImages[0]?.url}
				price={price}
				unit={unit}
				onAddToCart={handleAdd}
				isPending={addToCart.isPending}
				outOfStock={outOfStock}
			/>
		</div>
	);
}

function StockStatus({ outOfStock, available }: { outOfStock: boolean; available: number }) {
	const t = useTranslations("pdp");
	if (outOfStock) {
		return (
			<span className="inline-flex items-center gap-1.5 text-nl-russet">
				<span aria-hidden="true" className="h-2 w-2 rounded-[2px] border border-nl-russet" />
				{t("outOfStock")}
			</span>
		);
	}
	const low = Number.isFinite(available) && available > 0 && available <= LOW_STOCK;
	return (
		<span className="inline-flex items-center gap-1.5 text-nl-cacao">
			<span aria-hidden="true" className="h-2 w-2 rounded-[2px] bg-[hsl(var(--status-success,142_64%_32%))]" />
			{low ? t("lowStock", { count: available }) : t("inStock")}
		</span>
	);
}

function QuantityStepper({
	value,
	max,
	onChange,
	disabled,
}: {
	value: number;
	max: number;
	onChange: (n: number) => void;
	disabled?: boolean;
}) {
	const t = useTranslations("pdp");
	const step = "flex h-full w-10 items-center justify-center text-nl-cacao transition-colors hover:bg-nl-cacao/[0.06] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber";
	return (
		<div
			className={cn(
				"flex h-12 shrink-0 items-center overflow-hidden rounded-md border border-nl-cacao/25 bg-nl-pearl",
				disabled && "opacity-45",
			)}
		>
			<button type="button" className={step} onClick={() => onChange(Math.max(1, value - 1))} disabled={disabled || value <= 1} aria-label={t("decrease")}>
				<Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
			</button>
			<input
				type="number"
				inputMode="numeric"
				min={1}
				max={max}
				value={value}
				disabled={disabled}
				aria-label={t("quantity")}
				onChange={(e) => {
					const n = Number.parseInt(e.target.value, 10);
					if (Number.isFinite(n)) onChange(Math.min(Math.max(1, n), max));
				}}
				className="h-full w-11 border-0 bg-transparent p-0 text-center font-mono text-[14px] tabular-nums text-nl-cacao [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
			/>
			<button type="button" className={step} onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label={t("increase")}>
				<Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
			</button>
		</div>
	);
}
