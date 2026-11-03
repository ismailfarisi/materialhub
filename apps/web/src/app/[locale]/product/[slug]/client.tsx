"use client";

import type { ColorGroupMember } from "@/components/product/group-swatches";
import type { CategoryCrumb } from "@/components/product/pdp-data";
import { ProductDetailsBlock } from "@/components/product/product-details-block";
import { ProductHero } from "@/components/product/product-hero";
import { QAAccordion } from "@/components/product/qa-accordion";
import { RelatedMaterials } from "@/components/product/related-materials";
import { ReviewsSection } from "@/components/product/reviews-section";
import type { SellerBlockData } from "@/components/product/seller-block";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

interface ProductDetailClientProps {
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	product: any;
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	questions: any[];
	siteSettings?: Record<string, string>;
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	shippingZoneRates?: any[];
	vendorPolicies?: {
		return_policy?: string | null;
		shipping_policy?: string | null;
	};
	categoryPath?: CategoryCrumb[];
	/** Category id → top-level category name, for colouring related cards. */
	categoryIndex?: Record<string, string>;
	colorGroup?: {
		grouping_attribute: { id: string; name: string } | null;
		members: ColorGroupMember[];
	} | null;
}

export function ProductDetailClient({
	product,
	questions,
	siteSettings,
	shippingZoneRates,
	vendorPolicies,
	categoryPath = [],
	categoryIndex = {},
	colorGroup,
}: ProductDetailClientProps) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const { fire } = useChannelEvents();

	// Fire ViewContent once per distinct product. The hook is consent-gated so
	// a non-consented session is a no-op; re-fires only when the product id
	// changes so SPA-navigating between PDPs emits one event per product.
	// biome-ignore lint/correctness/useExhaustiveDependencies: one event per product id
	useEffect(() => {
		fire("ViewContent", {
			product_id: product.id,
			product_name: product.title,
			category_id: product.category?.id ?? product.category?.name,
			brand: product.brand_name,
			currency: "AED",
			value_fils: product.price,
		});
	}, [product.id, fire]);

	const vendor: SellerBlockData | null = product.vendor_id
		? {
				id: product.vendor_id,
				name: product.vendor_name ?? product.vendor?.slug ?? "",
				slug: product.vendor?.slug ?? product.vendor_id,
				monogram: product.vendor?.monogram,
				logo_url: product.vendor_logo_url,
				verified: product.vendor_verification_type === "verified_vendor",
				rating_avg: product.vendor?.rating_avg != null ? Number.parseFloat(product.vendor.rating_avg) : null,
				follower_count: product.vendor?.follower_count ?? null,
				response_time_hours: product.vendor?.response_time_hours ?? null,
				processing_days: product.vendor?.processing_time_days ?? null,
			}
		: null;

	const returnsWindowDays = Number.parseInt(siteSettings?.marketplace_return_window_days ?? "", 10);

	return (
		<>
			<ProductHero
				product={product}
				vendor={vendor}
				categoryPath={categoryPath}
				colorGroup={colorGroup ?? null}
				returnsWindowDays={Number.isFinite(returnsWindowDays) && returnsWindowDays > 0 ? returnsWindowDays : undefined}
			/>

			<ProductDetailsBlock
				product={product}
				siteSettings={siteSettings}
				shippingZoneRates={shippingZoneRates}
				vendorPolicies={vendorPolicies}
			/>

			<RelatedMaterials
				productId={product.id}
				type="pairs-with"
				title={t("pairsTitle")}
				categoryIndex={categoryIndex}
			/>

			<ReviewsSection
				productId={product.id}
				ratingAvg={Number(product.rating_avg) || 0}
				reviewCount={Number(product.review_count) || 0}
			/>

			<QAAccordion questions={questions} productId={product.id} />

			{vendor && (
				<RelatedMaterials
					productId={product.id}
					type="more-from-brand"
					title={t("moreFrom", { supplier: vendor.name })}
					categoryIndex={categoryIndex}
					action={{ href: `/${locale}/vendor/${vendor.slug}`, label: t("viewSupplier") }}
					vendorName={vendor.name}
				/>
			)}
		</>
	);
}
