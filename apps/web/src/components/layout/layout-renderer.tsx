/**
 * Renders CMS layout sections (home, vendor storefront, category footer) in
 * the Swatch Book system. See /DESIGN.md.
 *
 * - Every section opens with `SectionHead` (Archivo headline, optional "View
 *   all" on the trailing edge). No kickers: a CMS `eyebrow` is shown as a
 *   plain supporting line under the headline instead.
 * - Vendors, brands and categories are swatch cards. A card's tab is its
 *   category stock when the data names one; otherwise it is binder ink, so a
 *   stock colour never appears without a category behind it.
 * - The only dark band is the brand spotlight; the only scrims sit over
 *   photography for legibility.
 */
import { HeroBanner } from "@/components/home/hero-banner";
import { SectionBoundary } from "@/components/home/section-boundary";
import {
	NEUTRAL_STOCK,
	NEUTRAL_STOCK_ON_DARK,
	matchStock,
} from "@/components/home/stock-match";
import { ScrollRail } from "@/components/layout/scroll-rail";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { viewAllHref as resolveViewAllHref } from "@/components/layout/view-all-href";
import { ProductCard } from "@/components/product/product-card";
import {
	PriceTag,
	SectionHead,
	type Stock,
	SwatchCard,
} from "@/components/swatch";
import { buttonVariants } from "@/components/swatch/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Star } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { type ComponentType, Fragment, type ReactNode } from "react";
import { BackgroundVideo } from "./background-video";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SectionData {
	id: string;
	type: string;
	position: number;
	settings: Record<string, unknown>;
	source_mode: string;
	/** Present when the section is backed by a curated collection. */
	collection_slug?: string;
	data: { blocks?: unknown[]; items?: unknown[] };
}

interface SectionProps {
	settings: Record<string, unknown>;
	collectionSlug?: string;
	data: { blocks?: unknown[]; items?: unknown[] };
}

// biome-ignore lint/suspicious/noExplicitAny: CMS block JSONB is untyped
type AnyBlock = any;

/** Read a localised CMS field: `{ en, ar }`, a plain string, or nothing. */
function localized(value: unknown, locale: string): string | undefined {
	if (typeof value === "string") return value || undefined;
	if (value && typeof value === "object") {
		const v = value as Record<string, unknown>;
		const hit = v[locale] ?? v.en;
		return typeof hit === "string" && hit ? hit : undefined;
	}
	return undefined;
}

/** Rail that bleeds to the screen edge on mobile and keeps hover lift unclipped. */
const RAIL =
	"flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 pt-1 pb-4 scroll-ps-4 md:scroll-ps-0";

/* ─── Registry ───────────────────────────────────────────────────────────── */

const SECTION_REGISTRY: Record<string, ComponentType<SectionProps>> = {
	hero_carousel: HeroBannerAdapter,
	product_carousel: ProductCarouselAdapter,
	vendor_showcase: VendorShowcaseAdapter,
	brand_spotlight: BrandSpotlightAdapter,
	category_grid: CategoryGridAdapter,
	promotional_banner: PromotionalBannerAdapter,
	newsletter_signup: NewsletterSignupAdapter,
	testimonials: TestimonialsAdapter,
	trending_looks: InspirationAdapter,
};

/* ─── Layout Renderer ────────────────────────────────────────────────────── */

export function LayoutRenderer({
	sections,
	afterHero,
}: {
	sections: SectionData[];
	/**
	 * Rendered straight after the first hero carousel, or first if the layout
	 * has none. The home page puts the category-stock row here.
	 */
	afterHero?: ReactNode;
}) {
	const known = sections.filter((s) => SECTION_REGISTRY[s.type]);
	const heroIndex = known.findIndex((s) => s.type === "hero_carousel");

	return (
		<div className="space-y-10 md:space-y-16">
			{afterHero && heroIndex === -1 && afterHero}
			{known.map((section, index) => {
				const Component = SECTION_REGISTRY[section.type];
				return (
					<Fragment key={section.id}>
						<div
							className="max-w-[1400px] mx-auto px-4 md:px-8"
							data-section-type={section.type}
						>
							<SectionBoundary>
								<Component
									settings={section.settings}
									collectionSlug={section.collection_slug}
									data={section.data}
								/>
							</SectionBoundary>
						</div>
						{afterHero && index === heroIndex && afterHero}
					</Fragment>
				);
			})}
		</div>
	);
}

/* ─── Hero Carousel ──────────────────────────────────────────────────────── */

/**
 * Exported for the block-JSONB wiring test: `data.video.url` reaching a real
 * rendered <video> is otherwise unverified at every level.
 */
export async function HeroBannerAdapter({ settings, data }: SectionProps) {
	const locale = await getLocale();
	const t = await getTranslations("home");
	const banners = (data.blocks || []).map((b: AnyBlock, i: number) => ({
		id: b.id || `slide-${i}`,
		title: localized(b.data?.title, locale) ?? "",
		subtitle: localized(b.data?.subtitle, locale),
		cta_label: localized(b.data?.cta_text, locale) ?? t("shopNow"),
		image_url: b.data?.image?.desktop?.url || "",
		mobile_image_url: b.data?.image?.mobile?.url,
		cta_url: b.data?.cta_link,
		focal_point: b.data?.image?.focal_point,
		video_url: b.data?.video?.url,
	}));
	return (
		<HeroBanner
			banners={banners}
			autoplay={(settings.autoplay as boolean) ?? true}
			interval={(settings.interval_ms as number) ?? 6000}
		/>
	);
}

/* ─── Product Carousel ───────────────────────────────────────────────────── */

async function ProductCarouselAdapter({
	settings,
	collectionSlug,
	data,
}: SectionProps) {
	const products = (data.items || []) as AnyBlock[];
	if (!products.length) return null;
	const locale = await getLocale();
	const t = await getTranslations("home");
	const title = localized(settings.title, locale) ?? t("recentProducts");
	const note = localized(settings.eyebrow, locale);

	return (
		<section data-section="product-carousel" className="grid gap-5 md:gap-6">
			<SectionHead
				title={title}
				action={{
					// "View all" lands on the same set the rail was drawn from — see view-all-href.ts.
					href: resolveViewAllHref(settings, collectionSlug, locale),
					label: t("viewAll"),
				}}
			/>
			{note && <SectionNote>{note}</SectionNote>}
			<ScrollRail className={RAIL}>
				{products.map((product) => (
					<div
						key={product.id}
						className="flex-none w-[200px] md:w-[264px] snap-start"
					>
						<ProductCard product={product} />
					</div>
				))}
			</ScrollRail>
		</section>
	);
}

function SectionNote({
	children,
	tone = "ink",
}: { children: ReactNode; tone?: "ink" | "inverse" }) {
	return (
		<p
			className={cn(
				"-mt-2 md:-mt-3 m-0 max-w-[65ch] text-[15px] leading-[1.6]",
				tone === "ink" ? "text-nl-russet" : "text-white/75",
			)}
		>
			{children}
		</p>
	);
}

/* ─── Shared card bits ───────────────────────────────────────────────────── */

function monogram(name: string): string {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? "")
			.join("") || "?"
	);
}

function compact(n: number | null | undefined, locale: string): string | null {
	if (n == null || !Number.isFinite(Number(n))) return null;
	return new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(Number(n));
}

/** Logo well: board ground, cut corners. Monogram in ink when there's no logo. */
function LogoWell({
	src,
	name,
	size = 56,
}: { src?: string | null; name: string; size?: number }) {
	return (
		<span
			aria-hidden="true"
			style={{ width: size, height: size }}
			className="shrink-0 grid place-items-center overflow-hidden rounded-md bg-nl-linen text-nl-cacao font-display font-semibold text-lg [font-stretch:112%]"
		>
			{src ? (
				<Image
					src={src}
					alt=""
					width={size}
					height={size}
					sizes={`${size}px`}
					className="h-full w-full object-contain p-1.5"
				/>
			) : (
				monogram(name)
			)}
		</span>
	);
}

/** Localised top-level category name for a stock, used as a card's tab label. */
function stockLabeller(t: (key: string) => string) {
	return (stock: Stock | null) =>
		stock ? t(`stocks.${stock.key}.name`) : undefined;
}

/* ─── Vendor Showcase ────────────────────────────────────────────────────── */

interface VendorShowcaseItem {
	id: string;
	slug?: string;
	name: string;
	logo_url?: string | null;
	city?: string | null;
	tagline?: string | null;
	monogram?: string | null;
	rating_avg?: number | null;
	follower_count?: number | null;
	total_orders?: number | null;
	sponsored?: boolean;
	/** Optional: main category, when the resolver provides it. */
	category_slug?: string | null;
	category_name?: string | null;
}

async function VendorShowcaseAdapter({ settings, data }: SectionProps) {
	const vendors = (data.items || []) as VendorShowcaseItem[];
	if (!vendors.length) return null;
	const locale = await getLocale();
	const t = await getTranslations("home");
	const stockLabel = stockLabeller(t);
	const title = localized(settings.title, locale) ?? t("featuredVendors");
	const note = localized(settings.eyebrow, locale);

	return (
		<section data-section="vendor-showcase" className="grid gap-5 md:gap-6">
			<SectionHead
				title={title}
				action={{ href: `/${locale}/search`, label: t("allSuppliers") }}
			/>
			{note && <SectionNote>{note}</SectionNote>}
			<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 list-none m-0 p-0">
				{vendors.map((vendor) => {
					const name = vendor.name || t("supplier");
					const matched = matchStock(
						vendor.category_slug,
						vendor.category_name,
						vendor.tagline,
					);
					const rating =
						vendor.rating_avg != null && Number(vendor.rating_avg) > 0
							? Number(vendor.rating_avg).toFixed(1)
							: null;
					const followers = compact(vendor.follower_count, locale);
					const orders = compact(vendor.total_orders, locale);
					const tab = vendor.sponsored
						? t("sponsored")
						: (stockLabel(matched) ?? t("supplier"));
					return (
						<SwatchCard
							key={vendor.id}
							as="li"
							stock={matched ?? NEUTRAL_STOCK}
							tabLabel={tab}
							className="group"
						>
							<Link
								href={`/${locale}/vendor/${vendor.slug || vendor.id}`}
								className="flex flex-1 flex-col gap-4 p-4 md:p-5 rounded-b-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber"
							>
								<span className="flex items-center gap-3.5 min-w-0">
									<LogoWell
										src={vendor.logo_url}
										name={vendor.monogram || name}
									/>
									<span className="grid gap-1 min-w-0">
										<span className="font-display font-semibold text-[15.5px] leading-tight tracking-[-0.01em] text-nl-cacao truncate">
											{name}
										</span>
										{vendor.city && (
											<span className="text-[13px] text-nl-russet truncate">
												{vendor.city}
											</span>
										)}
									</span>
								</span>
								{vendor.tagline && (
									<span className="text-[14px] leading-[1.5] text-nl-cacao/80 line-clamp-2">
										{vendor.tagline}
									</span>
								)}
								{(rating || followers || orders) && (
									<span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 border-t border-dashed border-nl-cacao/15 font-mono text-[12.5px] tabular-nums text-nl-russet">
										{rating && (
											<span className="inline-flex items-center gap-1 text-nl-cacao">
												<Star
													aria-hidden="true"
													className="h-3.5 w-3.5 fill-nl-cacao text-nl-cacao"
													strokeWidth={1.5}
												/>
												<span className="sr-only">
													{t("rating", { rating })}
												</span>
												<span aria-hidden="true">{rating}</span>
											</span>
										)}
										{followers && (
											<span>{t("followers", { count: followers })}</span>
										)}
										{orders && <span>{t("orders", { count: orders })}</span>}
									</span>
								)}
							</Link>
						</SwatchCard>
					);
				})}
			</ul>
		</section>
	);
}

/* ─── Brand Spotlight ────────────────────────────────────────────────────── */

interface BrandSpotlightProductPeek {
	id: string;
	name: string;
	slug: string;
	price: number;
	image_url: string | null;
}
interface BrandSpotlightItem {
	id: string;
	name: string;
	slug: string;
	logo_url: string | null;
	description: string | null;
	product_count: number;
	is_featured: boolean;
	top_products: BrandSpotlightProductPeek[];
}

async function BrandSpotlightAdapter({ settings, data }: SectionProps) {
	const items = (data.items || []) as BrandSpotlightItem[];
	const blocks = (data.blocks || []) as AnyBlock[];

	// Query-mode section: hydrated brand + top products.
	if (items.length > 0)
		return <BrandSpotlightCards items={items} settings={settings} />;
	// Legacy manual-mode section (layouts not yet republished).
	if (blocks.length > 0)
		return <BrandSpotlightLegacy blocks={blocks} settings={settings} />;
	return null;
}

async function BrandSpotlightLegacy({
	blocks,
	settings,
}: { blocks: AnyBlock[]; settings: SectionProps["settings"] }) {
	const locale = await getLocale();
	const t = await getTranslations("home");
	const title = localized(settings.title, locale) ?? t("brands");
	return (
		<section
			data-section="brand-spotlight-legacy"
			className="grid gap-5 md:gap-6"
		>
			<SectionHead
				title={title}
				action={{ href: `/${locale}/brands`, label: t("allBrands") }}
			/>
			<ScrollRail className={RAIL}>
				{blocks.map((brand) => {
					const brandName =
						localized(brand.data?.name, locale) ?? brand.name ?? "";
					const logoUrl = brand.data?.logo_url || brand.logo_url;
					return (
						<SwatchCard
							key={brand.id}
							stock={
								matchStock(brand.data?.category, brandName) ?? NEUTRAL_STOCK
							}
							className="flex-none snap-start w-[148px] md:w-[184px]"
						>
							<Link
								href={brand.data?.link || brand.link || `/${locale}/brands`}
								className="flex flex-1 flex-col items-center gap-3 p-4 text-center rounded-b-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber"
							>
								<LogoWell src={logoUrl} name={brandName} size={72} />
								<span className="font-display font-semibold text-[14px] leading-tight text-nl-cacao line-clamp-2">
									{brandName}
								</span>
							</Link>
						</SwatchCard>
					);
				})}
			</ScrollRail>
		</section>
	);
}

async function BrandSpotlightCards({
	items,
	settings,
}: { items: BrandSpotlightItem[]; settings: SectionProps["settings"] }) {
	const locale = await getLocale();
	const t = await getTranslations("home");
	const stockLabel = stockLabeller(t);
	const title = localized(settings.title, locale) ?? t("brands");
	const note = localized(settings.eyebrow, locale);

	return (
		<section
			data-section="brand-spotlight"
			className="relative left-[calc(50%-50vw)] w-screen bg-nl-espresso py-10 md:py-16 rtl:left-auto rtl:right-[calc(50%-50vw)]"
		>
			<div className="max-w-[1400px] mx-auto px-4 md:px-8 grid gap-5 md:gap-6">
				{/* SectionHead in its inverse tone (the shared one is ink-only). */}
				<div className="flex items-end justify-between gap-4">
					<h2 className="m-0 font-display font-semibold text-[clamp(22px,2.6vw,32px)] leading-[1.08] tracking-[-0.02em] text-white">
						{title}
					</h2>
					<Link
						href={`/${locale}/brands`}
						className="group inline-flex items-center gap-1.5 shrink-0 text-sm font-medium text-white underline decoration-white/30 hover:decoration-nl-amber"
					>
						{t("allBrands")}
						<ArrowRight
							className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
							strokeWidth={1.75}
						/>
					</Link>
				</div>
				{note && <SectionNote tone="inverse">{note}</SectionNote>}

				<ScrollRail className={RAIL}>
					{items.map((brand) => {
						const matched = matchStock(
							brand.description,
							...brand.top_products.map((p) => p.name),
						);
						const minPrice = brand.top_products.length
							? Math.min(...brand.top_products.map((p) => p.price))
							: null;
						return (
							<SwatchCard
								key={brand.id}
								stock={matched ?? NEUTRAL_STOCK_ON_DARK}
								tabLabel={stockLabel(matched)}
								className="group flex-none snap-start w-[292px] md:w-[340px]"
							>
								<div className="relative flex flex-1 flex-col gap-4 p-4 md:p-5">
									{/* Whole-card link sits under the thumbnails, which link to their products. */}
									<Link
										href={`/${locale}/brand/${brand.slug}`}
										aria-label={`${brand.name}: ${t("productCount", { count: brand.product_count })}`}
										className="absolute inset-0 z-0 rounded-b-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber"
									/>
									<div className="relative z-10 pointer-events-none flex items-center gap-3.5 min-w-0">
										<LogoWell
											src={brand.logo_url}
											name={brand.name}
											size={48}
										/>
										<div className="grid gap-1 min-w-0">
											<span className="font-display font-semibold text-[15.5px] leading-tight tracking-[-0.01em] text-nl-cacao truncate">
												{brand.name}
											</span>
											<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">
												{t("productCount", { count: brand.product_count })}
											</span>
										</div>
									</div>

									<div className="relative z-10 grid grid-cols-3 gap-2">
										{[0, 1, 2].map((i) => {
											const p = brand.top_products[i];
											if (!p)
												return (
													<span
														key={`empty-${i}`}
														aria-hidden="true"
														className="aspect-square rounded-sm bg-nl-linen"
													/>
												);
											return (
												<Link
													key={p.id}
													href={`/${locale}/product/${p.slug}`}
													aria-label={p.name}
													className="relative block aspect-square overflow-hidden rounded-sm bg-nl-linen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
												>
													{p.image_url && (
														<Image
															src={p.image_url}
															alt=""
															fill
															className="object-cover"
															sizes="(max-width: 768px) 30vw, 110px"
														/>
													)}
												</Link>
											);
										})}
									</div>

									<div className="relative z-10 pointer-events-none mt-auto flex items-center justify-between gap-3 pt-3 border-t border-dashed border-nl-cacao/15">
										{minPrice !== null ? (
											<PriceTag
												amount={minPrice}
												locale={locale}
												from
												size="sm"
											/>
										) : (
											<span className="text-[13px] text-nl-russet">
												{t("newArrivals")}
											</span>
										)}
										<span className="inline-flex items-center gap-1 text-[13px] font-medium text-nl-cacao">
											{t("shopAll")}
											<ArrowRight
												className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
												strokeWidth={1.75}
											/>
										</span>
									</div>
								</div>
							</SwatchCard>
						);
					})}
				</ScrollRail>
			</div>
		</section>
	);
}

/* ─── Category Grid ──────────────────────────────────────────────────────── */

async function CategoryGridAdapter({ settings, data }: SectionProps) {
	const items = (data.blocks || data.items || []) as AnyBlock[];
	if (!items.length) return null;
	const locale = await getLocale();
	const t = await getTranslations("home");
	const tc = await getTranslations("common");
	const stockLabel = stockLabeller(t);
	const title = localized(settings.title, locale) ?? t("shopByMaterial");
	const note = localized(settings.eyebrow, locale);

	return (
		<section data-section="category-grid" className="grid gap-5 md:gap-6">
			<SectionHead
				title={title}
				action={{ href: `/${locale}/search`, label: tc("allCategories") }}
			/>
			{note && <SectionNote>{note}</SectionNote>}
			<ScrollRail className={RAIL}>
				{items.map((cat) => {
					const imgUrl = cat.data?.image_url || cat.image_url;
					const name = localized(cat.data?.name, locale) ?? cat.name ?? "";
					const slug = cat.data?.slug || cat.slug;
					const link =
						cat.data?.link || cat.link || `/${locale}/c/${slug || cat.id}`;
					const count =
						cat.data?.product_count ??
						cat.product_count ??
						cat.data?.count ??
						cat.count ??
						null;
					const matched = matchStock(
						slug,
						cat.data?.parent_slug ?? cat.parent_slug,
						name,
					);
					return (
						<SwatchCard
							key={cat.id}
							stock={matched ?? NEUTRAL_STOCK}
							tabLabel={stockLabel(matched)}
							className="group flex-none snap-start w-[200px] md:w-[248px]"
						>
							<Link
								href={link}
								className="flex flex-1 flex-col rounded-b-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber"
							>
								<span className="relative block aspect-[4/3] bg-nl-linen overflow-hidden">
									{imgUrl && (
										<Image
											src={imgUrl}
											alt=""
											fill
											className="object-cover"
											sizes="(max-width: 768px) 200px, 248px"
										/>
									)}
								</span>
								<span className="flex items-end justify-between gap-3 p-3.5 md:p-4">
									<span className="grid gap-1 min-w-0">
										<span className="font-display font-semibold text-[15.5px] leading-tight tracking-[-0.01em] text-nl-cacao line-clamp-2">
											{name}
										</span>
										{count != null && (
											<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">
												{t("productCount", { count: Number(count) })}
											</span>
										)}
									</span>
									<ArrowRight
										aria-hidden="true"
										className="h-4 w-4 shrink-0 text-nl-cacao transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
										strokeWidth={1.75}
									/>
								</span>
							</Link>
						</SwatchCard>
					);
				})}
			</ScrollRail>
		</section>
	);
}

/* ─── Promotional Banner ─────────────────────────────────────────────────── */

/** Exported for the block-JSONB wiring test — see HeroBannerAdapter. */
export async function PromotionalBannerAdapter({ data }: SectionProps) {
	const block = (data.blocks || [])[0] as AnyBlock;
	if (!block) return null;
	const imgUrl = block.data?.image?.desktop?.url;
	const mobileImgUrl = block.data?.image?.mobile?.url;
	const videoUrl = block.data?.video?.url as string | undefined;

	const locale = await getLocale();
	const t = await getTranslations("home");
	const title = localized(block.data?.title, locale) ?? "";
	const subtitle = localized(block.data?.subtitle, locale);
	const ctaLink = block.data?.cta_link || `/${locale}/search`;
	const ctaText = localized(block.data?.cta_text, locale) ?? t("shopNow");

	const focalPoint = block.data?.image?.focal_point;
	const objectPosition =
		focalPoint &&
		typeof focalPoint.x === "number" &&
		typeof focalPoint.y === "number"
			? `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
			: "center";

	return (
		<section data-section="promotional-banner">
			<Link
				href={ctaLink}
				className="group relative block w-full overflow-hidden rounded-md bg-nl-espresso shadow-card aspect-[5/4] sm:aspect-[2.4/1] md:aspect-[3.6/1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
			>
				{imgUrl && (
					<>
						<Image
							src={imgUrl}
							alt=""
							fill
							className="object-cover hidden md:block"
							style={{ objectPosition }}
							sizes="(max-width: 1400px) 100vw, 1336px"
						/>
						<Image
							src={mobileImgUrl || imgUrl}
							alt=""
							fill
							className="object-cover md:hidden"
							style={{ objectPosition }}
							sizes="100vw"
						/>
						{videoUrl && (
							<BackgroundVideo
								src={videoUrl}
								poster={imgUrl}
								objectPosition={objectPosition}
							/>
						)}
					</>
				)}
				{/* Scrim for legibility over photography — the one allowed gradient. */}
				<span
					aria-hidden="true"
					className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r rtl:md:bg-gradient-to-l from-nl-espresso/85 via-nl-espresso/40 to-transparent"
				/>
				<span className="absolute inset-0 flex flex-col justify-end md:justify-center gap-3 md:gap-4 p-5 sm:p-7 md:p-12">
					<span className="max-w-[560px] font-display font-bold [font-stretch:112%] text-[clamp(24px,3.4vw,44px)] leading-[1.02] tracking-[-0.03em] text-white line-clamp-3">
						{title}
					</span>
					{subtitle && (
						<span className="max-w-[46ch] text-[15px] leading-[1.55] text-white/80 line-clamp-2">
							{subtitle}
						</span>
					)}
					<span
						className={cn(
							buttonVariants({ variant: "inverse", size: "md" }),
							"w-fit mt-1 md:mt-2",
						)}
					>
						{ctaText}
						<ArrowRight
							className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
							strokeWidth={1.75}
						/>
					</span>
				</span>
			</Link>
		</section>
	);
}

/* ─── Newsletter Signup ──────────────────────────────────────────────────── */

async function NewsletterSignupAdapter({ settings }: SectionProps) {
	const locale = await getLocale();
	const title =
		localized(settings.title, locale) ?? "New materials, once a month";
	const subtitle =
		localized(settings.subtitle, locale) ??
		"Supplier launches, restocks and trade offers from MaterialHub. One email a month; unsubscribe any time.";

	return (
		<section data-section="newsletter-signup">
			<div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] items-center gap-6 md:gap-12 rounded-md bg-nl-pearl shadow-card px-5 py-8 md:px-12 md:py-12">
				<div className="grid gap-3">
					<h2 className="m-0 font-display font-semibold text-[clamp(22px,2.6vw,32px)] leading-[1.08] tracking-[-0.02em] text-nl-cacao">
						{title}
					</h2>
					<p className="m-0 max-w-[52ch] text-[15px] leading-[1.6] text-nl-russet">
						{subtitle}
					</p>
				</div>
				<NewsletterForm />
			</div>
		</section>
	);
}

/* ─── Testimonials ───────────────────────────────────────────────────────── */

async function TestimonialsAdapter({ settings, data }: SectionProps) {
	const reviews = (data.blocks || data.items || []) as AnyBlock[];
	if (!reviews.length) return null;
	const locale = await getLocale();
	const t = await getTranslations("home");
	const title = localized(settings.title, locale) ?? "From buyers";

	return (
		<section data-section="testimonials" className="grid gap-5 md:gap-6">
			<SectionHead title={title} />
			<ScrollRail className={RAIL}>
				{reviews.map((review) => {
					const name = review.data?.customer_name || review.customer_name || "";
					const text =
						localized(review.data?.text, locale) ?? review.text ?? "";
					// No default rating — a fabricated five stars is worse than no stars.
					const rating = Math.max(
						0,
						Math.min(
							5,
							Math.round(Number(review.data?.rating ?? review.rating ?? 0)),
						),
					);
					const avatar = review.data?.avatar_url || review.avatar_url;
					const product =
						review.data?.product_name || review.product_name || "";
					return (
						<figure
							key={review.id}
							className="m-0 flex-none snap-start w-[280px] md:w-[360px] flex flex-col gap-4 rounded-md bg-nl-pearl shadow-card p-5 md:p-6"
						>
							{rating > 0 && (
								<span
									className="flex items-center gap-0.5"
									role="img"
									aria-label={t("rating", { rating })}
								>
									{Array.from({ length: 5 }, (_, i) => (
										<Star
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed five-star row
											key={i}
											aria-hidden="true"
											strokeWidth={1.5}
											className={
												i < rating
													? "h-3.5 w-3.5 fill-nl-cacao text-nl-cacao"
													: "h-3.5 w-3.5 text-nl-cacao/25"
											}
										/>
									))}
								</span>
							)}
							<blockquote className="m-0 flex-1 text-[16px] md:text-[17px] leading-[1.55] text-nl-cacao line-clamp-6">
								{text}
							</blockquote>
							{(name || product) && (
								<figcaption className="flex items-center gap-3 pt-3 border-t border-dashed border-nl-cacao/15">
									{avatar ? (
										<Image
											src={avatar}
											alt=""
											width={36}
											height={36}
											className="h-9 w-9 shrink-0 rounded-full object-cover"
										/>
									) : name ? (
										<span
											aria-hidden="true"
											className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-nl-linen font-display text-sm font-semibold text-nl-cacao"
										>
											{name[0]}
										</span>
									) : null}
									<span className="grid gap-0.5 min-w-0">
										{name && (
											<span className="text-[14px] font-medium text-nl-cacao truncate">
												{name}
											</span>
										)}
										{product && (
											<span className="text-[13px] text-nl-russet truncate">
												{product}
											</span>
										)}
									</span>
								</figcaption>
							)}
						</figure>
					);
				})}
			</ScrollRail>
		</section>
	);
}

/* ─── Inspiration mosaic (CMS type `trending_looks`) ─────────────────────── */

/**
 * The CMS type keeps its legacy name; the storefront shows it as finished work
 * made from the catalogue's materials (boxes, bindings, event decor).
 */
async function InspirationAdapter({ settings, data }: SectionProps) {
	const tiles = (data.blocks || data.items || []) as AnyBlock[];
	if (!tiles.length) return null;
	const locale = await getLocale();
	const title =
		localized(settings.title, locale) ?? "Made with these materials";
	const note = localized(settings.subtitle, locale);
	return (
		<section data-section="trending-looks" className="grid gap-5 md:gap-6">
			<SectionHead title={title} />
			{note && <SectionNote>{note}</SectionNote>}
			{/* Fixed row tracks + a 2×2 lead tile: a deterministic mosaic. */}
			<div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[148px] md:auto-rows-[200px] gap-3 md:gap-4">
				{tiles.slice(0, 7).map((tile, i) => {
					const imgUrl = tile.data?.image_url || tile.image_url;
					const tileTitle =
						localized(tile.data?.title, locale) ?? tile.title ?? "";
					const link = tile.data?.link || tile.link || `/${locale}/search`;
					const isLead = i === 0;
					return (
						<Link
							key={tile.id}
							href={link}
							className={cn(
								"group relative block h-full overflow-hidden rounded-md bg-nl-cacao/10 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber",
								isLead && "col-span-2 row-span-2",
							)}
						>
							{imgUrl && (
								<Image
									src={imgUrl}
									alt=""
									fill
									className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
									sizes={
										isLead
											? "(max-width: 768px) 100vw, 50vw"
											: "(max-width: 768px) 50vw, 25vw"
									}
								/>
							)}
							<span
								aria-hidden="true"
								className="absolute inset-0 bg-gradient-to-t from-nl-espresso/75 via-nl-espresso/10 to-transparent"
							/>
							{/* Caption always visible: touch users must see what they're tapping. */}
							<span
								className={cn(
									"absolute inset-x-0 bottom-0 p-3 md:p-4 font-display font-semibold leading-[1.15] tracking-[-0.01em] text-white line-clamp-2",
									isLead
										? "text-xl md:text-[26px]"
										: "text-[15px] md:text-base",
								)}
							>
								{tileTitle}
							</span>
						</Link>
					);
				})}
			</div>
		</section>
	);
}
