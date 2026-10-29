"use client";

import { BrandsYouFollowRail } from "@/components/product/brands-you-follow-rail";
import { FromTheBrand } from "@/components/product/from-the-brand";
import { ProductDetailsBlock } from "@/components/product/product-details-block";
import { ProductHero } from "@/components/product/product-hero";
import { ProductStory } from "@/components/product/product-story";
import { QAAccordion } from "@/components/product/qa-accordion";
import { Rail } from "@/components/product/rail";
import { ReelsSection } from "@/components/product/reels-section";
import type { SellerBlockData } from "@/components/product/seller-block";
import { StickyBottomBar } from "@/components/product/sticky-bottom-bar";
import { useScrollPast } from "@/hooks/use-scroll-past";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useAddToCart } from "@/lib/queries/cart";
import { useRecommendations } from "@/lib/queries/recommendations";
import { useCartStore } from "@/stores/cart";
import { useEffect } from "react";

interface ProductDetailClientProps {
	product: any;
	questions: any[];
	siteSettings?: Record<string, string>;
	shippingZoneRates?: any[];
	vendorPolicies?: {
		return_policy?: string | null;
		shipping_policy?: string | null;
	};
	colorGroup?: {
		grouping_attribute: { id: string; name: string } | null;
		members: Array<{
			slug: string;
			name: string;
			swatch: { hex: string | null; image: string | null };
			image: string | null;
			price: number;
			is_current: boolean;
		}>;
	} | null;
}

export function ProductDetailClient({
	product,
	questions,
	siteSettings,
	shippingZoneRates,
	vendorPolicies,
	colorGroup,
}: ProductDetailClientProps) {
	const { ref: ctaRef, isPast: showStickyBar } =
		useScrollPast<HTMLDivElement>();
	const { openSlideOver } = useCartStore();
	const addToCart = useAddToCart();
	const { fire } = useChannelEvents();

	// Fire ViewContent once per distinct product. The hook is consent-gated so
	// a non-consented session is a no-op; re-fires only when the product id
	// changes so SPA-navigating between PDPs emits one event per product.
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

	const moreFromBrand = useRecommendations(product.id, "more-from-brand", 6);
	const pairsWith = useRecommendations(product.id, "pairs-with", 4);
	const crossBrand = useRecommendations(product.id, "cross-brand", 5);
	const bestsellers = useRecommendations(product.id, "bestsellers", 8);

	function handleQuickAddToCart() {
		addToCart.mutate(
			{ productId: product.id, variantId: null, quantity: 1 },
			{ onSuccess: () => openSlideOver() },
		);
	}

	return (
		<>
			{/* === Hero === */}
			<div ref={ctaRef}>
				<ProductHero
					product={product}
					colorGroup={colorGroup ?? null}
					vendor={
						product.vendor_id
							? ({
									id: product.vendor_id,
									name: product.vendor_name ?? "Unknown",
									slug: product.vendor?.slug ?? product.vendor_id,
									monogram: product.vendor?.monogram,
									logo_url: product.vendor_logo_url,
									verified:
										product.vendor_verification_type === "verified_vendor",
									rating_avg:
										product.vendor?.rating_avg != null
											? Number.parseFloat(product.vendor.rating_avg)
											: null,
									follower_count: product.vendor?.follower_count ?? null,
									response_time_hours:
										product.vendor?.response_time_hours ?? null,
								} satisfies SellerBlockData)
							: null
					}
				/>
			</div>

			{/* === Product details block (BNPL, bullets, what's in the box, accordions) === */}
			<ProductDetailsBlock
				product={product}
				siteSettings={siteSettings}
				shippingZoneRates={shippingZoneRates}
				vendorPolicies={vendorPolicies}
			/>

			{/* === Full-width immersive sections === */}

			{/* Product Story (adaptive by category) */}
			<ProductStory product={product} />

			<ReelsSection
				productId={product.id}
				productTitle={product.title}
				vendorId={product.vendor_id}
				houseLabel={product.vendor_name ?? product.brand_name}
				canSubmit={false}
			/>

			{/* === Recommendation rails === */}
			<Rail
				eyebrow={`More from ${product.vendor_name ?? product.brand_name ?? "this brand"}`}
				heading={
					<>
						Other items from{" "}
						<span className="italic text-nl-amber">
							{product.vendor_name ?? product.brand_name ?? "this maker"}
						</span>
					</>
				}
				sub="Free combined shipping when you order two or more from this brand."
				items={moreFromBrand.data}
				isLoading={moreFromBrand.isPending}
			/>

			<Rail
				eyebrow="Featured · Complete the look"
				heading={
					<>
						Pairs with{" "}
						<span className="italic text-nl-amber">{product.title}</span>
					</>
				}
				sub="Hand-picked by our editors across brands — these soften, deepen, or extend the wear."
				items={pairsWith.data}
				isLoading={pairsWith.isPending}
			/>

			<Rail
				eyebrow="You may also love"
				heading="Across the marketplace"
				sub="Sold and shipped by each brand directly."
				items={crossBrand.data}
				isLoading={crossBrand.isPending}
			/>

			{/* === Editorial: dark-mode From-the-brand block === */}
			<FromTheBrand
				editorial={product.editorial}
				productTitle={product.title}
			/>

			{/* === Brands you follow rail (pearl bg) === */}
			<BrandsYouFollowRail />

			<Rail
				eyebrow="Most loved on MaterialHub UAE"
				heading={
					<>
						Bestsellers in{" "}
						<span className="italic text-nl-amber">
							{product.category?.name ?? "this category"}
						</span>
					</>
				}
				sub="What buyers across the marketplace ordered most this month."
				items={bestsellers.data}
				isLoading={bestsellers.isPending}
				highlightProductId={product.id}
				dark
			/>

			{/* Q&A */}
			<QAAccordion questions={questions} productId={product.id} />

			{/* Mobile Sticky Bottom Bar */}
			<StickyBottomBar
				visible={showStickyBar}
				product={product}
				onAddToCart={handleQuickAddToCart}
				isPending={addToCart.isPending}
				outOfStock={
					product.in_stock === false || (product.quantity_available ?? 1) <= 0
				}
			/>
		</>
	);
}
