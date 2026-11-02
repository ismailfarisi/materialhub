/* Hallmark · redesign · genre: editorial · scope: legacy-adapter migration
 * Voice: the nl-* maison system already established by the ProductCarousel /
 * VendorShowcase / BrandSpotlightCards / CategoryGrid adapters below —
 * Playfair display, square corners, hairline rules, amber accent under 5%,
 * lucide at 1.25 stroke. Adopted deliberately; diversification is suspended
 * because this file's job is one voice, not variety.
 * Not inherited from the reference sections: per-section eyebrows and the
 * italic-accent-word heading. Both are named tells and anti-patterns.md
 * forbids propagating them for structural parity.
 *
 * pre-emit critique: P4 H4 E4 S5 R5 V5 (variety intentionally suspended)
 * contrast: pass (40-41) · tokens: pass (48) · honest: pass (46) · icons: pass (30)
 * mobile: pass (34, 49, 50-54) · motion: pass (18, 27) — the root overflow-x
 * clip and the reduced-motion tiers live in app/globals.css; the hero carousel
 * pause control lives in components/home/hero-banner.tsx.
 */
import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, ArrowRight, ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { HeroBanner } from "@/components/home/hero-banner";
import { ProductCard } from "@/components/product/product-card";
import { ScrollRail } from "@/components/layout/scroll-rail";
import { NewsletterForm } from "@/components/layout/newsletter-form";
import { viewAllHref as resolveViewAllHref } from "@/components/layout/view-all-href";
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

/* ─── Section Header Component ───────────────────────────────────────────── */

/**
 * Shared section head for the adapters that don't hand-roll their own.
 * Matches the maison head used by ProductCarousel / VendorShowcase / CategoryGrid:
 * serif title left, uppercase micro-link right, single column on mobile.
 * No eyebrow slot and no icon slot — both were the old generic voice, and the
 * icons in particular pulled three unrelated accent colours onto one page.
 */
function SectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = "View all",
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6 md:mb-9 px-2 md:px-0">
      <div className="min-w-0">
        <h2 className="font-serif text-3xl md:text-[44px] leading-[1.05] tracking-tight text-nl-cacao [overflow-wrap:anywhere]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm leading-[1.6] text-nl-russet max-w-[46ch] mt-3">
            {subtitle}
          </p>
        )}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="hidden md:inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-amber transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-nl-cacao"
        >
          {viewAllLabel}
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

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
  trending_looks: TrendingLooksAdapter,
};

/* ─── Layout Renderer ────────────────────────────────────────────────────── */

export function LayoutRenderer({ sections }: { sections: SectionData[] }) {
  return (
    <div className="space-y-10 md:space-y-20">
      {sections.map((section, index) => {
        const Component = SECTION_REGISTRY[section.type];
        if (!Component) return null;
        return (
          <div
            key={section.id}
            className="animate-fade-in-up md:max-w-[1400px] md:mx-auto md:px-8"
            style={{ animationDelay: `${index * 80}ms`, animationFillMode: "both" }}
          >
            <Component
              settings={section.settings}
              collectionSlug={section.collection_slug}
              data={section.data}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ─── Hero Carousel Adapter ──────────────────────────────────────────────── */

/**
 * Exported for the block-JSONB wiring test: `data.video.url` reaching a real
 * rendered <video> is otherwise unverified at every level.
 */
export async function HeroBannerAdapter({ settings, data }: SectionProps) {
  const locale = await getLocale();
  const banners = (data.blocks || []).map((b: any, i: number) => ({
    id: b.id || `slide-${i}`,
    title: b.data?.title?.[locale] || b.data?.title?.en || "",
    subtitle: b.data?.cta_text?.[locale] || b.data?.cta_text?.en || undefined,
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

/* ─── Product Carousel Adapter ───────────────────────────────────────────── */

async function ProductCarouselAdapter({ settings, collectionSlug, data }: SectionProps) {
  const products = (data.items || []) as any[];
  if (!products.length) return null;
  const locale = await getLocale();
  const title =
    (settings.title as any)?.[locale] ||
    (settings.title as any)?.en ||
    "Products";
  const eyebrow =
    (settings.eyebrow as any)?.[locale] ||
    (settings.eyebrow as any)?.en ||
    undefined;
  // "View all" lands on the same set the rail was drawn from — see view-all-href.ts.
  const viewAllTarget = resolveViewAllHref(settings, collectionSlug, locale);

  // Italicize the last word in amber as the design's signature accent.
  const words = title.split(/\s+/);
  const head = words.length > 1 ? words.slice(0, -1).join(" ") : "";
  const accent = words.length > 1 ? words[words.length - 1] : title;

  return (
    <section className="px-2 md:px-0">
      <div className="flex items-end justify-between mb-6 md:mb-9 px-2 md:px-0">
        <div>
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.22em] text-nl-russet">
              {eyebrow}
            </p>
          )}
          <h2 className="font-serif text-3xl md:text-[44px] leading-[1.05] tracking-tight text-nl-cacao mt-2 md:mt-3">
            {head && <>{head} </>}
            <span className="italic text-nl-amber">{accent}</span>
          </h2>
        </div>
        <Link
          href={viewAllTarget}
          className="hidden md:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-amber transition-colors"
        >
          View all
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      </div>

      <ScrollRail className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory px-2 md:px-0 scroll-ps-2 md:scroll-ps-0">
        {products.map((product: any) => (
          <div key={product.id} className="flex-none w-[220px] md:w-[260px] snap-start">
            <ProductCard product={product} />
          </div>
        ))}
      </ScrollRail>
    </section>
  );
}

/* ─── Vendor Showcase Adapter ────────────────────────────────────────────── */

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
}

const VENDOR_CREST_GRADIENTS = [
  "linear-gradient(135deg,#F26B2E,#B33F0E)",
  "linear-gradient(135deg,#2A3140,#0F1218)",
  "linear-gradient(135deg,#C9A27A,#7A5A3A)",
  "linear-gradient(135deg,#5B6578,#262C38)",
];

function vendorMonogram(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function vendorCrestGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return VENDOR_CREST_GRADIENTS[Math.abs(hash) % VENDOR_CREST_GRADIENTS.length];
}

function formatCompact(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

async function VendorShowcaseAdapter({ settings, data }: SectionProps) {
  const vendors = (data.items || []) as VendorShowcaseItem[];
  if (!vendors.length) return null;
  const locale = await getLocale();
  const title =
    (settings.title as any)?.[locale] ||
    (settings.title as any)?.en ||
    "Featured suppliers";
  const eyebrow =
    (settings.eyebrow as any)?.[locale] ||
    (settings.eyebrow as any)?.en ||
    "Verified suppliers";

  return (
    <section className="px-2 md:px-0" data-section="vendor-showcase">
      <div className="flex items-end justify-between mb-6 md:mb-9 px-2 md:px-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-nl-russet">
            {eyebrow}
          </p>
          <h2 className="font-serif text-3xl md:text-[44px] leading-[1.05] tracking-tight mt-2 md:mt-3 text-nl-cacao">
            {title}
          </h2>
        </div>
        <Link
          href={`/${locale}/search`}
          className="hidden md:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-amber transition-colors"
        >
          All shops
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {vendors.map((vendor) => {
          const name = vendor.name || "Vendor";
          const monogram = vendor.monogram || vendorMonogram(name);
          const accent = vendorCrestGradient(name);
          const ratingText =
            vendor.rating_avg != null ? Number(vendor.rating_avg).toFixed(1) : null;
          const followersText = formatCompact(vendor.follower_count);
          const ordersText = formatCompact(vendor.total_orders);

          return (
            <Link
              key={vendor.id}
              href={`/${locale}/vendor/${vendor.slug || vendor.id}`}
              className="group relative block bg-nl-linen border border-nl-cacao/10 px-6 pt-7 pb-6 transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-1 hover:border-nl-amber"
            >
              {vendor.sponsored && (
                <span
                  aria-hidden="true"
                  className="absolute top-4 right-4 text-[8.5px] uppercase tracking-[0.3em] text-nl-amber"
                >
                  · Sponsored
                </span>
              )}

              <div
                className="w-16 h-16 flex items-center justify-center overflow-hidden text-nl-linen font-serif text-[24px] tracking-[0.05em] mb-[18px]"
                style={{ background: accent }}
                aria-hidden="true"
              >
                {vendor.logo_url ? (
                  <Image
                    src={vendor.logo_url}
                    alt=""
                    width={64}
                    height={64}
                    sizes="64px"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  monogram
                )}
              </div>

              <h3 className="font-serif text-[22px] leading-[1.1] text-nl-cacao truncate group-hover:text-nl-cacao transition-colors">
                {name}
              </h3>
              {vendor.city && (
                <p className="text-[10px] uppercase tracking-[0.22em] text-nl-russet mt-1">
                  {vendor.city}
                </p>
              )}
              {vendor.tagline && (
                <p className="font-serif italic text-[13.5px] leading-[1.5] text-nl-cacao/70 mt-3.5 min-h-[44px] line-clamp-2">
                  &ldquo;{vendor.tagline}&rdquo;
                </p>
              )}

              <div className="h-px bg-nl-cacao/10 mt-[18px] mb-3.5" />

              <div className="flex items-center justify-between text-[11px] text-nl-russet">
                {ratingText ? (
                  <span className="flex items-center gap-1">
                    <Star className="h-2.5 w-2.5 fill-nl-amber text-nl-amber" />
                    {ratingText}
                  </span>
                ) : (
                  <span />
                )}
                {followersText ? (
                  <span>{followersText} followers</span>
                ) : (
                  <span />
                )}
                {ordersText ? <span>{ordersText} orders</span> : <span />}
              </div>
            </Link>
          );
        })}
      </div>

      <Link
        href={`/${locale}/search`}
        className="md:hidden mt-4 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-amber transition-colors"
      >
        All shops
        <ArrowRight className="h-3 w-3 rtl:rotate-180" />
      </Link>
    </section>
  );
}

/* ─── Brand Spotlight Adapter ────────────────────────────────────────────── */

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
  const blocks = (data.blocks || []) as any[];

  // New path: query-mode section returned hydrated brand+products items.
  if (items.length > 0) {
    return <BrandSpotlightCards items={items} settings={settings} />;
  }
  // Legacy path: section is still in manual mode (live layouts not yet republished).
  if (blocks.length > 0) {
    const locale = await getLocale();
    return <BrandSpotlightLegacy blocks={blocks} settings={settings} locale={locale} />;
  }
  return null;
}

function BrandSpotlightLegacy({ blocks, settings, locale }: { blocks: any[]; settings: SectionProps["settings"]; locale: string }) {
  const title = (settings.title as any)?.[locale] || (settings.title as any)?.en || "Top brands";
  return (
    <section className="px-2 md:px-0" data-section="brand-spotlight-legacy">
      <SectionHeader
        title={title}
        viewAllHref={`/${locale}/brands`}
        viewAllLabel="All brands"
      />
      <div className="scroll-fade-r">
        <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-3 md:gap-[14px] overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2 md:px-0 pb-2 scroll-ps-2 md:scroll-ps-0">
          {blocks.map((brand: any) => {
            const brandName = brand.data?.name?.[locale] || brand.data?.name?.en || brand.data?.name || brand.name || "";
            const logoUrl = brand.data?.logo_url || brand.logo_url;
            return (
              <Link
                key={brand.id}
                href={brand.data?.link || brand.link || "#"}
                className="group flex flex-col items-center justify-center gap-3.5 p-5 bg-nl-linen border border-nl-cacao/10 hover:border-nl-amber transition-colors duration-300 aspect-square snap-start shrink-0 w-[110px] md:w-[160px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-cacao"
              >
                {logoUrl && (
                  <Image
                    src={logoUrl}
                    alt=""
                    width={72}
                    height={72}
                    className="object-contain grayscale group-hover:grayscale-0 transition-[filter] duration-500 motion-reduce:transition-none"
                  />
                )}
                <p className="text-[10px] uppercase tracking-[0.22em] text-center text-nl-russet line-clamp-2">
                  {brandName}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

async function BrandSpotlightCards({
  items,
  settings,
}: {
  items: BrandSpotlightItem[];
  settings: SectionProps["settings"];
}) {
  const locale = await getLocale();
  const title =
    (settings.title as any)?.[locale] || (settings.title as any)?.en || "Top brands";
  const eyebrow =
    (settings.eyebrow as any)?.[locale] ||
    (settings.eyebrow as any)?.en ||
    "Curated edits from labels we love";
  const aedFormat = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  });

  return (
    <section
      data-section="brand-spotlight"
      className="relative left-[calc(50%-50vw)] w-screen bg-nl-cacao py-12 text-nl-linen rtl:left-auto rtl:right-[calc(50%-50vw)] md:py-[72px]"
    >
      <div className="max-w-[1400px] mx-auto px-4 md:px-12">
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-nl-amber">
              {eyebrow}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl leading-[1.05] tracking-tight mt-2 md:mt-3">
              {title}
            </h2>
          </div>
          <Link
            href={`/${locale}/search`}
            className="hidden md:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-amber hover:text-nl-pearl transition-colors"
          >
            View all brands
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      <ScrollRail className="flex gap-4 md:gap-[18px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-4 md:px-12 scroll-ps-4 md:scroll-ps-12 max-w-[1400px] mx-auto">
        {items.map((brand) => {
          const monogram = vendorMonogram(brand.name);
          const minPriceFils = brand.top_products.length
            ? Math.min(...brand.top_products.map((p) => p.price))
            : null;
          const subtitle =
            brand.description && brand.description.length <= 32
              ? `${brand.product_count} ${brand.product_count === 1 ? "product" : "products"} · ${brand.description}`
              : `${brand.product_count} ${brand.product_count === 1 ? "product" : "products"}`;

          return (
            <div
              key={brand.id}
              className="group relative flex-none snap-start w-[300px] md:w-[360px] bg-nl-espresso border border-nl-pearl/10 hover:border-nl-amber transition-colors duration-300 px-7 pt-8 pb-6"
            >
              <Link
                href={`/${locale}/brand/${brand.slug}`}
                aria-label={`Shop all ${brand.name} products (${brand.product_count} items)`}
                className="absolute inset-0 z-0"
              />

              <div className="relative z-10 pointer-events-none flex items-center justify-between mb-6">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-[52px] h-[52px] flex items-center justify-center border border-nl-amber text-nl-amber font-serif text-[22px] shrink-0 overflow-hidden">
                    {brand.logo_url ? (
                      <Image
                        src={brand.logo_url}
                        alt=""
                        width={52}
                        height={52}
                        sizes="52px"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      monogram
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-serif text-2xl leading-[1.05] truncate">
                      {brand.name}
                    </p>
                    <p className="text-[9.5px] uppercase tracking-[0.22em] text-nl-pearl/70 mt-1 truncate">
                      {subtitle}
                    </p>
                  </div>
                </div>
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-[18px] w-[18px] text-nl-amber shrink-0 rtl:-scale-x-100"
                  strokeWidth={1.25}
                />
              </div>

              <div className="relative z-10 grid grid-cols-3 gap-2.5 mb-[18px]">
                {[0, 1, 2].map((i) => {
                  const p = brand.top_products[i];
                  if (!p) {
                    return (
                      <div
                        key={`empty-${i}`}
                        aria-hidden="true"
                        className="aspect-[4/5] bg-nl-pearl/5"
                      />
                    );
                  }
                  return (
                    <Link
                      key={p.id}
                      href={`/${locale}/product/${p.slug}`}
                      aria-label={p.name}
                      className="block relative aspect-[4/5] overflow-hidden bg-nl-pearl/5 pointer-events-auto group/thumb"
                    >
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt={p.name}
                          fill
                          className="object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                          sizes="(max-width: 768px) 33vw, 120px"
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </div>

              <div className="relative z-10 pointer-events-none flex items-center justify-between pt-3.5 border-t border-nl-pearl/10">
                <div className="min-w-0">
                  {minPriceFils !== null ? (
                    <>
                      <span className="text-[9px] uppercase tracking-[0.22em] text-nl-pearl/70">
                        From
                      </span>
                      <span className="ml-2 font-serif text-[22px] text-nl-linen">
                        {aedFormat.format(minPriceFils / 100)}
                      </span>
                    </>
                  ) : (
                    <span className="text-[9px] uppercase tracking-[0.22em] text-nl-pearl/70">
                      New arrivals
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.22em] text-nl-pearl border border-nl-pearl px-4 py-2.5 group-hover:border-nl-amber group-hover:text-nl-amber transition-colors">
                  Shop all
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                </span>
              </div>
            </div>
          );
        })}
      </ScrollRail>

      <div className="max-w-[1400px] mx-auto px-4 md:px-12">
        <Link
          href={`/${locale}/search`}
          className="md:hidden mt-6 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-amber hover:text-nl-pearl transition-colors"
        >
          View all brands
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </Link>
      </div>
    </section>
  );
}

/* ─── Category Grid Adapter ──────────────────────────────────────────────── */

async function CategoryGridAdapter({ settings, data }: SectionProps) {
  const items = (data.blocks || data.items || []) as any[];
  if (!items.length) return null;
  const locale = await getLocale();
  const t = await getTranslations("common");
  const title =
    (settings.title as any)?.[locale] ||
    (settings.title as any)?.en ||
    "Shop by category";
  const eyebrow =
    (settings.eyebrow as any)?.[locale] ||
    t("categoriesCount", { count: items.length });

  return (
    <section className="px-2 md:px-0" data-section="category-grid">
      <div className="flex items-end justify-between mb-6 md:mb-9 px-2 md:px-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-nl-russet">
            {eyebrow}
          </p>
          <h2 className="font-serif text-3xl md:text-[44px] leading-[1.05] tracking-tight mt-2 md:mt-3 text-nl-cacao">
            {title}
          </h2>
        </div>
        <Link
          href={`/${locale}/search`}
          className="hidden md:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-amber transition-colors"
        >
          {t("allCategories")}
          <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" strokeWidth={1.25} />
        </Link>
      </div>

      <div className="flex items-center justify-end mb-2 px-2 md:px-0">
        <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.22em] uppercase text-nl-russet/60">
          {t("dragToExplore")}
          <ArrowRight className="h-3 w-3 rtl:rotate-180 animate-[nudge_2.4s_ease-in-out_infinite]" />
        </span>
      </div>

      <ScrollRail className="flex gap-3 md:gap-[14px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-2 md:mx-0 px-2 md:px-0 scroll-ps-2 md:scroll-ps-0">
        {items.map((cat: any, i: number) => {
          const imgUrl = cat.data?.image_url || cat.image_url;
          const name = cat.data?.name?.[locale] || cat.data?.name?.en || cat.data?.name || cat.name;
          const link = cat.data?.link || cat.link || `/${locale}/c/${cat.slug || cat.id}`;
          const count =
            cat.data?.product_count ?? cat.product_count ?? cat.data?.count ?? cat.count ?? null;
          return (
            <Link
              key={cat.id}
              href={link}
              className="group relative block flex-none snap-start w-[200px] md:w-[260px] aspect-[3/4] overflow-hidden bg-nl-russet/15 transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-0.5"
            >
              {imgUrl && (
                <Image
                  src={imgUrl}
                  alt={name || ""}
                  fill
                  className="object-cover group-hover:scale-[1.04] transition-transform duration-700"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-nl-espresso/10 via-nl-espresso/10 to-nl-espresso/65" />

              <div className="absolute top-4 left-5 text-[9.5px] tracking-[0.24em] uppercase text-nl-linen/75">
                {String(i + 1).padStart(2, "0")}
              </div>

              <div className="absolute left-5 right-5 bottom-5 text-nl-linen">
                <p className="font-serif text-2xl md:text-[28px] leading-[1.05] tracking-tight">
                  {name}
                </p>
                <div className="flex items-center justify-between mt-2.5">
                  {count != null && (
                    <span className="text-[10px] tracking-[0.2em] uppercase opacity-75">
                      {typeof count === "number"
                        ? `${count.toLocaleString()} products`
                        : `${count} products`}
                    </span>
                  )}
                  <span className="ms-auto flex items-center gap-1.5 text-[10px] tracking-[0.22em] uppercase">
                    Shop
                    <ArrowRight className="h-3 w-3 rtl:rotate-180 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </ScrollRail>

      <Link
        href={`/${locale}/search`}
        className="md:hidden mt-4 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-amber transition-colors"
      >
        {t("allCategories")}
        <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" strokeWidth={1.25} />
      </Link>
    </section>
  );
}

/* ─── Promotional Banner Adapter ─────────────────────────────────────────── */

/** Exported for the block-JSONB wiring test — see HeroBannerAdapter. */
export async function PromotionalBannerAdapter({ data }: SectionProps) {
  const block = (data.blocks || [])[0] as any;
  if (!block) return null;
  const imgUrl = block.data?.image?.desktop?.url;
  const mobileImgUrl = block.data?.image?.mobile?.url;
  const videoUrl = block.data?.video?.url as string | undefined;

  const locale = await getLocale();
  const title = block.data?.title?.[locale] || block.data?.title?.en || "";
  const ctaLink = block.data?.cta_link || "#";
  const ctaText = block.data?.cta_text?.[locale] || block.data?.cta_text?.en || "Shop Now";

  const focalPoint = block.data?.image?.focal_point;
  const objectPosition =
    focalPoint && typeof focalPoint.x === "number" && typeof focalPoint.y === "number"
      ? `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
      : "center";

  return (
    <section>
      <Link
        href={ctaLink}
        className="group block relative w-full aspect-[16/10] sm:aspect-[2.4/1] md:aspect-[4/1] overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
      >
        {imgUrl && (
          <>
            <Image
              src={imgUrl}
              alt={title}
              fill
              className="object-cover hidden md:block"
              style={{ objectPosition }}
              sizes="100vw"
            />
            <Image
              src={mobileImgUrl || imgUrl}
              alt={title}
              fill
              className="object-cover md:hidden"
              style={{ objectPosition }}
              sizes="100vw"
            />
            {videoUrl && (
              <BackgroundVideo src={videoUrl} poster={imgUrl} objectPosition={objectPosition} />
            )}
          </>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-nl-espresso/80 via-nl-espresso/35 to-transparent"
        />
        <div className="absolute inset-0 flex flex-col justify-end md:justify-center p-5 sm:p-7 md:p-12">
          <h3 className="font-serif text-xl sm:text-2xl md:text-[40px] leading-[1.05] tracking-tight text-nl-linen mb-3 md:mb-5 max-w-[560px] line-clamp-2">
            {title}
          </h3>
          <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap border border-nl-linen/70 text-nl-linen px-4 py-2.5 text-[9.5px] md:text-[10px] uppercase tracking-[0.22em] group-hover:border-nl-amber group-hover:text-nl-amber transition-colors">
            {ctaText}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </span>
        </div>
      </Link>
    </section>
  );
}

/* ─── Newsletter Signup Adapter ──────────────────────────────────────────── */

async function NewsletterSignupAdapter({ settings }: SectionProps) {
  const locale = await getLocale();
  const title =
    (settings.title as any)?.[locale] ||
    (settings.title as any)?.en ||
    "Stay in the loop";
  const eyebrow =
    (settings.eyebrow as any)?.[locale] ||
    (settings.eyebrow as any)?.en ||
    "Letters from the house";
  const subtitle =
    (settings.subtitle as any)?.[locale] ||
    (settings.subtitle as any)?.en ||
    "New materials, supplier launches and trade offers — delivered to your inbox once a month. Never more.";

  return (
    <section className="px-2 md:px-0" data-section="newsletter-signup">
      <div className="relative bg-nl-pearl px-6 py-10 md:px-12 md:py-16 grid grid-cols-1 md:grid-cols-[1fr_1.2fr] items-center gap-8 md:gap-12">
        <span
          aria-hidden="true"
          className="absolute top-5 right-5 font-serif text-2xl text-nl-amber tracking-[0.4em] select-none"
        >
          ✻
        </span>

        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-nl-russet">
            {eyebrow}
          </p>
          <h2 className="font-serif text-3xl md:text-[clamp(36px,4vw,52px)] leading-[1.05] tracking-tight mt-3 md:mt-3.5 text-nl-cacao">
            {title.split(" ").length > 1 ? (
              <>
                {title.split(" ").slice(0, -1).join(" ")}{" "}
                <span className="italic text-nl-amber">
                  {title.split(" ").slice(-1)}
                </span>
              </>
            ) : (
              title
            )}
          </h2>
          <p className="font-serif italic text-base md:text-[17px] leading-[1.5] text-nl-cacao/75 max-w-[420px] mt-4">
            {subtitle}
          </p>
        </div>

        <NewsletterForm />
      </div>
    </section>
  );
}

/* ─── Testimonials Adapter (NEW) ─────────────────────────────────────────── */

async function TestimonialsAdapter({ settings, data }: SectionProps) {
  const reviews = (data.blocks || data.items || []) as any[];
  if (!reviews.length) return null;
  const locale = await getLocale();
  const title =
    (settings.title as any)?.[locale] || (settings.title as any)?.en || "In their words";

  return (
    <section className="px-2 md:px-0" data-section="testimonials">
      <SectionHeader title={title} />
      <ScrollRail className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-2 md:px-0 scroll-ps-2 md:scroll-ps-0">
        {reviews.map((review: any) => {
          const name = review.data?.customer_name || review.customer_name || "";
          const text = review.data?.text?.[locale] || review.data?.text?.en || review.data?.text || review.text || "";
          // No default rating — a fabricated five stars is worse than no stars.
          const rating = Number(review.data?.rating ?? review.rating ?? 0);
          const avatar = review.data?.avatar_url || review.avatar_url;
          const product = review.data?.product_name || review.product_name || "";

          return (
            <figure
              key={review.id}
              className="flex-none snap-start w-[280px] md:w-[360px] flex flex-col bg-nl-linen border border-nl-cacao/10 px-6 pt-7 pb-6"
            >
              {rating > 0 && (
                <div
                  className="flex items-center gap-1 mb-4"
                  role="img"
                  aria-label={`${rating} out of 5`}
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      aria-hidden="true"
                      className={
                        i < rating
                          ? "h-3 w-3 fill-nl-amber text-nl-amber"
                          : "h-3 w-3 text-nl-cacao/20"
                      }
                    />
                  ))}
                </div>
              )}

              <blockquote className="flex-1 font-serif text-[19px] md:text-[21px] leading-[1.45] text-nl-cacao line-clamp-5">
                &ldquo;{text}&rdquo;
              </blockquote>

              {(name || product) && (
                <figcaption className="mt-5 pt-3.5 border-t border-nl-cacao/10 flex items-center gap-3">
                  {avatar ? (
                    <Image
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      className="w-9 h-9 shrink-0 object-cover"
                    />
                  ) : name ? (
                    <span
                      aria-hidden="true"
                      className="w-9 h-9 shrink-0 flex items-center justify-center bg-nl-cacao/10 font-serif text-sm text-nl-cacao"
                    >
                      {name[0]}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    {name && (
                      <span className="block text-[11px] uppercase tracking-[0.22em] text-nl-cacao truncate">
                        {name}
                      </span>
                    )}
                    {product && (
                      <span className="block text-[11px] text-nl-russet truncate mt-1">
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

/* ─── Trending Looks Adapter (NEW) ───────────────────────────────────────── */

async function TrendingLooksAdapter({ settings, data }: SectionProps) {
  const looks = (data.blocks || data.items || []) as any[];
  if (!looks.length) return null;
  const locale = await getLocale();
  const title = (settings.title as any)?.[locale] || (settings.title as any)?.en || "Trending looks";
  return (
    <section className="px-2 md:px-0" data-section="trending-looks">
      <SectionHeader title={title} subtitle="Curated picks from our community" />
      {/* Fixed row tracks + a 2x2 lead tile: a deterministic mosaic. The old
          version mixed row-span with aspect-ratio, which misaligned the rows. */}
      <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[136px] md:auto-rows-[192px] gap-3 md:gap-[14px] px-2 md:px-0">
        {looks.slice(0, 8).map((look: any, i: number) => {
          const imgUrl = look.data?.image_url || look.image_url;
          const lookTitle = look.data?.title?.[locale] || look.data?.title?.en || look.data?.title || look.title || "";
          const link = look.data?.link || look.link || "#";
          const isLead = i === 0;
          return (
            <Link
              key={look.id}
              href={link}
              className={`group relative block h-full overflow-hidden bg-nl-russet/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber ${
                isLead ? "col-span-2 row-span-2" : ""
              }`}
            >
              {imgUrl && (
                <Image
                  src={imgUrl}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  sizes={isLead ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
                />
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-nl-espresso/70 via-nl-espresso/10 to-transparent"
              />
              {/* Caption is always visible — the old build revealed it on hover
                  only, so touch users never saw which look they were tapping. */}
              <div className="absolute inset-x-0 bottom-0 p-3 md:p-4 text-nl-linen">
                <p
                  className={`font-serif leading-[1.15] line-clamp-2 ${
                    isLead ? "text-xl md:text-[28px] tracking-tight" : "text-[15px] md:text-lg"
                  }`}
                >
                  {lookTitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

