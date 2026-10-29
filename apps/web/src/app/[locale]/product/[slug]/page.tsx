import { RecordView } from "@/components/product/record-view";
import { TTL, publicGet } from "@/lib/api-public";
import { absoluteUrl, buildAlternates } from "@/lib/seo/alternates";
import { API_URL } from "@/lib/seo/config";
import axios from "axios";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "./client";

/**
 * Statically rendered, revalidated on a 10-minute cycle (the product-detail
 * budget in CLAUDE.md).
 *
 * This page used to export `dynamic = "force-dynamic"`, which made
 * `generateStaticParams` below dead code and marked every fetch in the segment
 * as no-store: each product page, for every visitor and every crawl, was
 * rendered from scratch off five cold API calls. Nothing on the server side of
 * this page is per-user — cart, wishlist, review and Q&A actions all live in the
 * client components — so all of it goes through the cookie-free `publicGet`
 * client and the page becomes cacheable.
 */
export const revalidate = 600;

export async function generateStaticParams() {
	try {
		const { data } = await axios.get(
			`${API_URL}/products?sort=newest&limit=100`,
		);
		const items = data.data?.data ?? data.data ?? [];
		return Array.isArray(items)
			? items.map((p: any) => ({ slug: p.slug }))
			: [];
	} catch {
		return [];
	}
}

interface Props {
	params: Promise<{ locale: string; slug: string }>;
}

/**
 * Shared by `generateMetadata` and the page body, which therefore resolve from
 * one cached upstream call rather than fetching the same product twice.
 *
 * No locale is forwarded, matching the previous `apiServer()` call that sent no
 * `Accept-Language` header — so one cache entry serves every locale instead of
 * five entries holding identical payloads.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
function fetchProduct(slug: string): Promise<any | null> {
	return publicGet(`/products/by-slug/${slug}`, {
		revalidate: TTL.productDetail,
		tags: [`product:${slug}`],
	});
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, slug } = await params;

	const product = await fetchProduct(slug);
	if (!product) return { title: "Product" };

	return {
		title: product.name,
		description: product.description?.slice(0, 160),
		alternates: buildAlternates(locale, `/product/${slug}`),
		openGraph: {
			title: product.name,
			images: product.images?.[0]?.url ? [product.images[0].url] : [],
		},
	};
}

export default async function ProductDetailPage({ params }: Props) {
	const { locale, slug } = await params;
	setRequestLocale(locale);

	const raw = await fetchProduct(slug);

	if (!raw) notFound();

	// Normalize API response to the shape our components expect
	const vendor = raw.vendor;
	const product = {
		...raw,
		// Field name mapping
		title: raw.name,
		brand_name: raw.brand?.name || null,
		brand_slug: raw.brand?.slug || null,
		rating_avg: Number.parseFloat(raw.rating_avg) || 0,
		review_count: raw.rating_count || 0,
		// Flatten vendor fields for components
		vendor_name: vendor?.business_name || vendor?.name || null,
		vendor_logo_url: vendor?.logo_url || null,
		vendor_tagline: vendor?.description || null,
		vendor_rating_pct: vendor?.rating_avg
			? Math.round(Number.parseFloat(vendor.rating_avg) * 20)
			: null,
		vendor_response_time: vendor?.processing_time_days
			? `${vendor.processing_time_days} days`
			: null,
		vendor_shipping_speed: vendor?.processing_time_days
			? `${vendor.processing_time_days} days`
			: null,
		vendor_product_count: null,
		vendor_verification_type: vendor?.verified_at
			? ("verified_vendor" as const)
			: undefined,
		// Category path (not available in current API, use empty)
		category: raw.productCategories?.[0] ? { path: [] } : null,
	};

	const [questions, siteSettings, shippingZoneRates, colorGroup] =
		await Promise.all([
			publicGet<unknown[]>(`/products/${product.id}/questions`, {
				revalidate: TTL.productDetail,
				tags: [`product:${slug}`, `product-questions:${product.id}`],
			}).then((data) => data ?? []),
			publicGet<Record<string, string>>("/site-settings", {
				params: {
					keys: "marketplace_authenticity_guarantee,marketplace_return_window_days",
				},
				revalidate: TTL.categoryTree,
				tags: ["site-settings"],
			}).then((data) => data ?? {}),
			product.vendor_id
				? publicGet<unknown[]>("/shipping/zone-rates", {
						params: { vendor_id: product.vendor_id },
						revalidate: TTL.vendorProfile,
						tags: [`vendor:${product.vendor_id}`],
					}).then((data) => data ?? [])
				: Promise.resolve([]),
			// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
			publicGet<any>(`/products/by-slug/${slug}/group`, {
				revalidate: TTL.productDetail,
				tags: [`product:${slug}`],
			}),
		]);

	return (
		<div className="bg-background min-h-screen">
			<RecordView productId={product.id} />

			<ProductDetailClient
				product={product}
				questions={questions}
				siteSettings={siteSettings || {}}
				shippingZoneRates={
					Array.isArray(shippingZoneRates) ? shippingZoneRates : []
				}
				vendorPolicies={{
					return_policy: vendor?.return_policy ?? null,
					shipping_policy: vendor?.shipping_policy ?? null,
				}}
				colorGroup={colorGroup ?? null}
			/>

			{/* JSON-LD Product */}
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD payload
				dangerouslySetInnerHTML={{
					__html: JSON.stringify({
						"@context": "https://schema.org",
						"@type": "Product",
						name: product.title,
						image: product.images?.map((img: any) => img.url),
						description: product.description,
						sku: product.sku ?? product.id,
						url: absoluteUrl(locale, `/product/${slug}`),
						brand: product.brand_name
							? { "@type": "Brand", name: product.brand_name }
							: undefined,
						offers: {
							"@type": "Offer",
							url: absoluteUrl(locale, `/product/${slug}`),
							price: product.price / 100,
							priceCurrency: "AED",
							itemCondition: "https://schema.org/NewCondition",
							// Google warns on offers with no priceValidUntil.
							priceValidUntil: new Date(Date.now() + 31536000000)
								.toISOString()
								.slice(0, 10),
							availability:
								product.quantity_available > 0
									? "https://schema.org/InStock"
									: "https://schema.org/OutOfStock",
							seller: product.vendor_name
								? { "@type": "Organization", name: product.vendor_name }
								: undefined,
						},
						// Only emit a rating when there is at least one review.
						// aggregateRating with reviewCount 0 is a validation error.
						aggregateRating:
							product.rating_avg > 0 && product.review_count > 0
								? {
										"@type": "AggregateRating",
										ratingValue: product.rating_avg,
										reviewCount: product.review_count,
									}
								: undefined,
					}),
				}}
			/>
		</div>
	);
}
