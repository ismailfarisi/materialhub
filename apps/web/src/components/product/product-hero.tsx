"use client";

import {
	type Format,
	FormatSelector,
} from "@/components/product/format-selector";
import {
	type ColorGroupMember,
	GroupSwatches,
} from "@/components/product/group-swatches";
import { MediaGallery } from "@/components/product/media-gallery";
import { BnplStrip } from "@/components/product/bnpl-strip";
import {
	NotesRitualCraftTabs,
	type ProductTab,
} from "@/components/product/notes-ritual-craft-tabs";
import {
	SellerBlock,
	type SellerBlockData,
} from "@/components/product/seller-block";
import {
	type ToneSwatch,
	ToneSwatches,
} from "@/components/product/tone-swatches";
import { useToggleWishlist, useWishlist } from "@/lib/queries/account";
import { useAddToCart } from "@/lib/queries/cart";
import { cn, formatPrice } from "@/lib/utils";
import { useCartStore } from "@/stores/cart";
import { usePreferencesStore } from "@/stores/preferences";
import { Heart, Package, Recycle, Truck } from "lucide-react";
import { useLocale } from "next-intl";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import Link from "next/link";
import { useMemo, useState } from "react";

interface ProductHeroProps {
	product: any;
	/** Pre-extracted vendor card data; null when the product has no vendor (shouldn't happen on marketplace). */
	vendor: SellerBlockData | null;
	/** Free-shipping threshold in fils. Falls back to a marketplace default. */
	freeShippingFils?: number;
	/** "Returns within N days" — from marketplace return-window setting. */
	returnsWindowDays?: number;
	/** Sibling color-family group from the product groups API. Null when the product is not grouped. */
	colorGroup?: {
		grouping_attribute: { id: string; name: string } | null;
		members: ColorGroupMember[];
	} | null;
}

type HeroImageInput = {
	id?: string;
	url?: string | null;
	alt_text?: string | null;
};

function hasImageUrl(
	image: unknown,
): image is HeroImageInput & { url: string } {
	return (
		typeof image === "object" &&
		image !== null &&
		typeof (image as HeroImageInput).url === "string" &&
		Boolean((image as HeroImageInput).url)
	);
}

export function ProductHero({
	product,
	vendor,
	freeShippingFils = 15000,
	returnsWindowDays = 7,
	colorGroup,
}: ProductHeroProps) {
	const locale = useLocale();
	const { currency } = usePreferencesStore();
	const { openSlideOver } = useCartStore();
	const addToCart = useAddToCart();
	const toggleWishlist = useToggleWishlist();
	const { data: wishlistItems } = useWishlist();

	// ---- Tones (visual variants) ------------------------------------------
	// Read from product.tones if the API exposes them; otherwise hide the row.
	// We treat tone variants as a separate visual axis, not as size variants.
	const tones: ToneSwatch[] = useMemo(() => {
		const raw = product.tones ?? product.attributes?.tones;
		if (!Array.isArray(raw) || raw.length === 0) return [];
		return raw.map((t: any) => ({
			id: t.id ?? t.value,
			background:
				t.gradient || t.color_hex || "linear-gradient(160deg,#C2865C,#7C4C35)",
			label: t.label ?? t.value,
		}));
	}, [product]);
	const [selectedTone, setSelectedTone] = useState<string | undefined>(
		tones[0]?.id,
	);

	// ---- Per-variant stock -----------------------------------------------
	// The PDP API returns inventoryRecords (one per variant × warehouse) with a
	// generated quantity_available column. Sum them per variant so we can gate the
	// buy button on the *selected* variant, not just the product total.
	const variantAvailability: Record<string, number> = useMemo(() => {
		const map: Record<string, number> = {};
		if (!Array.isArray(product.inventoryRecords)) return map;
		for (const inv of product.inventoryRecords) {
			if (!inv?.variant_id) continue;
			const qty = Number(inv.quantity_available) || 0;
			map[inv.variant_id] = (map[inv.variant_id] ?? 0) + Math.max(0, qty);
		}
		return map;
	}, [product.inventoryRecords]);

	// ---- Formats (size variants) ------------------------------------------
	const formats: (Format & {
		compare_at_price_fils?: number | null;
		available?: number;
	})[] = useMemo(() => {
		if (!Array.isArray(product.variants)) return [];
		return product.variants
			.filter((v: any) => v?.id && v?.price != null)
			.map((v: any) => ({
				id: v.id,
				label:
					v.option_values?.format ?? v.option_values?.size ?? v.name ?? "—",
				price_fils:
					typeof v.price === "string" ? Number.parseInt(v.price, 10) : v.price,
				compare_at_price_fils:
					v.compare_at_price != null
						? (typeof v.compare_at_price === "string" ? Number.parseInt(v.compare_at_price, 10) : v.compare_at_price)
						: null,
				available: variantAvailability[v.id] ?? 0,
			}));
	}, [product, variantAvailability]);
	const [selectedFormatId, setSelectedFormatId] = useState<string | undefined>(
		formats[0]?.id,
	);
	const selectedFormat = formats.find((f) => f.id === selectedFormatId);

	// Variants with no available stock — surfaced in the FormatSelector and used
	// to disable the buy button when such a variant is the current selection.
	const outOfStockFormatIds = useMemo(
		() => new Set(formats.filter((f) => (f.available ?? 0) <= 0).map((f) => f.id)),
		[formats],
	);

	// Effective out-of-stock: whole product sold out, OR the chosen variant is.
	const productOutOfStock =
		product.in_stock === false || (product.quantity_available ?? 1) <= 0;
	const outOfStock =
		productOutOfStock ||
		(selectedFormat != null && (selectedFormat.available ?? 0) <= 0);

	// Flash deal / compare price logic
	const dealPrice = product.flash_deal?.deal_price ?? null;
	const dealOriginalPrice = product.flash_deal?.original_price ?? null;

	const variantPrice = selectedFormat?.price_fils ?? product.price;
	const displayPriceFils = dealPrice ?? variantPrice;
	const strikePriceFils = dealPrice
		? dealOriginalPrice
		: selectedFormat
			? selectedFormat.compare_at_price_fils && selectedFormat.compare_at_price_fils > variantPrice
				? selectedFormat.compare_at_price_fils
				: null
			: product.compare_at_price && product.compare_at_price > variantPrice
				? product.compare_at_price
				: null;

	const discountPercent =
		strikePriceFils && strikePriceFils > displayPriceFils
			? Math.round(((strikePriceFils - displayPriceFils) / strikePriceFils) * 100)
			: 0;

	const isWishlisted = (wishlistItems || []).some(
		(item: any) => item.product_id === product.id,
	);

	const handleAdd = () => {
		addToCart.mutate(
			{
				productId: product.id,
				variantId: selectedFormatId ?? null,
				quantity: 1,
			},
			{ onSuccess: () => openSlideOver() },
		);
	};

	// ---- Tabbed details ---------------------------------------------------
	// Pull from product.attributes JSONB. Section is hidden when both notes and ritual+craft are empty.
	const tabs: ProductTab[] = useMemo(() => {
		const a = product.attributes ?? {};
		const out: ProductTab[] = [];
		if (Array.isArray(a.notes) && a.notes.length) {
			out.push({
				id: "notes",
				label: "The notes",
				body: (
					<div className="grid grid-cols-3 gap-4 text-sm">
						{a.notes.map((n: any) => (
							<div key={n.role ?? n.label}>
								<div className="text-[9px] tracking-[0.22em] uppercase text-nl-amber mb-1.5">
									{n.role ?? n.label}
								</div>
								<div className="font-serif text-base leading-tight">
									{n.value}
								</div>
							</div>
						))}
					</div>
				),
			});
		}
		if (a.ritual) {
			out.push({
				id: "ritual",
				label: "The ritual",
				body: (
					<p className="text-sm leading-relaxed text-nl-russet">{a.ritual}</p>
				),
			});
		}
		if (a.craft) {
			out.push({
				id: "craft",
				label: "The craft",
				body: (
					<p className="text-sm leading-relaxed text-nl-russet">{a.craft}</p>
				),
			});
		}
		return out;
	}, [product]);

	// ---- Image + batch badge ---------------------------------------------
	const heroImages = useMemo(() => {
		if (!Array.isArray(product.images)) return [];
		return product.images
			.filter(hasImageUrl)
			.map((image: HeroImageInput & { url: string }, index: number) => ({
				id: image.id ?? `${image.url}-${index}`,
				url: image.url,
				alt_text: image.alt_text ?? product.title,
			}));
	}, [product.images, product.title]);
	const batchLabel = product.attributes?.batch_number
		? `Batch №${product.attributes.batch_number}`
		: null;

	// Build the breadcrumb chain: Home → category path → product title.
	// Brand is shown adjacent (after the path, before the title) when known.
	const categoryPath: Array<{ name: string; slug?: string }> = Array.isArray(
		product.category?.path,
	)
		? product.category.path.filter((p: { name?: string }) => p?.name)
		: [];

	const breadcrumbJsonLd = buildBreadcrumbJsonLd(locale, [
		...categoryPath.map((c) => ({
			name: c.name,
			...(c.slug ? { path: `/c/${c.slug}` } : {}),
		})),
		// Current page: no path, so no self-referencing `item`.
		{ name: product.title },
	]);

	return (
		<div className="text-nl-cacao">
			<div className="mx-auto max-w-[1340px] px-6 lg:px-12 py-10 lg:pb-20">
				{/* breadcrumb + meta */}
				<nav
					aria-label="Breadcrumb"
					className="flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center mb-8"
				>
					<ol className="text-[10px] tracking-[0.22em] uppercase text-nl-russet/55 flex flex-wrap items-center">
						<li>
							<Link
								href={`/${locale}`}
								className="hover:text-nl-cacao transition-colors"
							>
								Home
							</Link>
						</li>
						{categoryPath.map((c) => (
							<li key={c.slug ?? c.name} className="flex items-center">
								<span className="mx-2" aria-hidden="true">
									·
								</span>
								{c.slug ? (
									<Link
										href={`/${locale}/c/${c.slug}`}
										className="hover:text-nl-cacao transition-colors"
									>
										{c.name}
									</Link>
								) : (
									<span>{c.name}</span>
								)}
							</li>
						))}
						{product.brand_name && (
							<li className="flex items-center">
								<span className="mx-2" aria-hidden="true">
									·
								</span>
								{product.brand_slug ? (
									<Link
										href={`/${locale}/brand/${encodeURIComponent(product.brand_slug)}`}
										className="text-nl-russet hover:text-nl-cacao transition-colors"
									>
										{product.brand_name}
									</Link>
								) : (
									<span className="text-nl-russet">{product.brand_name}</span>
								)}
							</li>
						)}
						<li className="flex items-center" aria-current="page">
							<span className="mx-2" aria-hidden="true">
								·
							</span>
							<span className="text-nl-cacao">{product.title}</span>
						</li>
					</ol>
					<div className="text-[10px] tracking-[0.18em] uppercase text-nl-russet flex gap-4 items-center">
						{product.rating_avg > 0 && (
							<span>
								★ {product.rating_avg.toFixed(1)} · {product.review_count ?? 0}{" "}
								reviews
							</span>
						)}
						{productOutOfStock ? (
							<span className="text-nl-russet">● Sold out</span>
						) : (
							product.in_stock && (
								<span className="text-nl-amber">● In stock</span>
							)
						)}
					</div>
				</nav>

				<script
					type="application/ld+json"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD payload
					dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
				/>

				<div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-12 lg:gap-20">
					{/* Imagery */}
					<div className="flex flex-col gap-3.5 min-w-0">
						<div className="relative">
							{heroImages.length > 0 ? (
								<MediaGallery images={heroImages} />
							) : (
								<div className="aspect-[4/5] bg-nl-russet/30" />
							)}
							{batchLabel && (
								<div className="absolute top-4 left-4 px-3 py-1.5 bg-nl-linen text-nl-cacao text-[9px] tracking-[0.22em] uppercase">
									{batchLabel}
								</div>
							)}
						</div>

						{tones.length > 0 && (
							<ToneSwatches
								tones={tones}
								selectedId={selectedTone}
								onSelect={setSelectedTone}
							/>
						)}
					</div>

					{/* Buy box */}
					<div className="lg:sticky lg:top-32 lg:self-start min-w-0">
						{(product.brand_name || product.subtitle) && (
							<div className="text-[10px] tracking-[0.22em] uppercase text-nl-russet">
								{product.brand_name &&
									(product.brand_slug ? (
										<Link
											href={`/${locale}/brand/${encodeURIComponent(product.brand_slug)}`}
											className="text-nl-amber hover:underline"
										>
											{product.brand_name}
										</Link>
									) : (
										<span className="text-nl-amber">{product.brand_name}</span>
									))}
								{product.brand_name && product.subtitle && <span> · </span>}
								{product.subtitle}
							</div>
						)}

						<h1 className="font-serif text-5xl lg:text-6xl leading-[0.98] tracking-tight my-4">
							{product.title}
						</h1>
						<div className="w-10 h-px bg-nl-amber mb-5" />

						{/* Price block */}
						<div className="flex items-baseline gap-3 mb-6">
							<span className="text-3xl font-serif font-semibold text-nl-cacao">
								{formatPrice(displayPriceFils, currency)}
							</span>
							{strikePriceFils && discountPercent > 0 && (
								<>
									<span className="text-sm text-nl-russet line-through opacity-70">
										{formatPrice(strikePriceFils, currency)}
									</span>
									<span className="px-2 py-0.5 text-[10px] tracking-wider uppercase font-semibold rounded bg-nl-amber/15 text-nl-amber">
										-{discountPercent}%
									</span>
								</>
							)}
						</div>

						{product.short_description && (
							<p className="font-serif italic text-lg lg:text-xl leading-relaxed text-nl-russet mb-7">
								{product.short_description}
							</p>
						)}
						{product.description && (
							<p className="text-sm leading-relaxed mb-8 max-w-[460px]">
								{product.description.length > 320
									? `${product.description.slice(0, 320)}…`
									: product.description}
							</p>
						)}

						{/* Format */}
						{formats.length > 0 && (
							<div className="mb-6">
								<FormatSelector
									formats={formats}
									selectedId={selectedFormatId}
									onSelect={setSelectedFormatId}
									currency={currency}
									eyebrowNote={product.attributes?.format_note}
									outOfStockIds={outOfStockFormatIds}
								/>
							</div>
						)}

						{/* Color-family siblings */}
						{(colorGroup?.members?.length ?? 0) > 1 && (
							<GroupSwatches
								label={colorGroup?.grouping_attribute?.name ?? "Color"}
								members={colorGroup?.members ?? []}
								locale={locale}
							/>
						)}

						{/* Add */}
						<div className="flex gap-2.5 mb-6">
							<button
								type="button"
								onClick={handleAdd}
								disabled={addToCart.isPending || outOfStock}
								aria-disabled={outOfStock}
								className={cn(
									"flex-1 px-8 py-4 text-xs tracking-[0.18em] uppercase transition-opacity",
									outOfStock
										? "bg-nl-cacao/40 text-nl-linen/60 cursor-not-allowed"
										: "bg-nl-cacao text-nl-linen hover:opacity-95 disabled:opacity-60",
								)}
							>
								{outOfStock
									? "Out of stock"
									: addToCart.isPending
										? "Adding…"
										: `Add to bag · ${formatPrice(displayPriceFils, currency)}`}
							</button>
							<button
								type="button"
								onClick={() => toggleWishlist.mutate(product.id)}
								disabled={toggleWishlist.isPending}
								aria-label={
									isWishlisted ? "Remove from wishlist" : "Add to wishlist"
								}
								className="w-14 h-14 border border-nl-cacao/25 hover:border-nl-cacao/60 disabled:opacity-60 transition-colors flex items-center justify-center"
							>
								<Heart
									className={cn(
										"w-4 h-4",
										isWishlisted
											? "fill-nl-amber text-nl-amber"
											: "text-nl-cacao",
									)}
								/>
							</button>
						</div>

						<BnplStrip total_fils={displayPriceFils} currency={currency} className="mb-7" />

						{/* Seller block */}
						{vendor && (
							<div className="mb-7">
								<SellerBlock vendor={vendor} />
							</div>
						)}

						{/* Tabs */}
						{tabs.length > 0 && <NotesRitualCraftTabs tabs={tabs} />}

						{/* Micro trust */}
						<div className="flex flex-wrap gap-6 mt-7 pt-6 border-t border-nl-cacao/15 text-[10.5px] tracking-[0.1em] text-nl-russet">
							<span className="inline-flex items-center gap-1.5">
								<Truck className="w-4 h-4" />
								Free shipping over {formatPrice(freeShippingFils, currency)}
							</span>
							{product.attributes?.is_refillable && (
								<span className="inline-flex items-center gap-1.5">
									<Recycle className="w-4 h-4" />
									Refillable
								</span>
							)}
							<span className="inline-flex items-center gap-1.5">
								<Package className="w-4 h-4" />
								Returns within {returnsWindowDays} days
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
