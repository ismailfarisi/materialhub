"use client";

import { ProductCard } from "@/components/product/product-card";
import { SectionHead } from "@/components/swatch";
import { useRecentlyViewed } from "@/lib/queries/account";
import { useAuthStore } from "@/stores/auth";
import { useTranslations } from "next-intl";

// biome-ignore lint/suspicious/noExplicitAny: recently-viewed payload is untyped
function normalizeProduct(raw: any) {
	return {
		id: raw.id,
		name: raw.name,
		slug: raw.slug,
		price_min: raw.price_min ?? raw.price,
		price_max: raw.price_max ?? raw.price,
		images: raw.images
			? typeof raw.images[0] === "string"
				? raw.images
				: // biome-ignore lint/suspicious/noExplicitAny: untyped image entries
					raw.images.map((img: any) => img.url)
			: [],
		rating_avg:
			typeof raw.rating_avg === "string"
				? Number.parseFloat(raw.rating_avg) || 0
				: raw.rating_avg || 0,
		vendor_name: raw.vendor_name || raw.vendor?.name || null,
		vendor_id: raw.vendor_id,
		category_name: raw.category_name || null,
		in_stock: raw.in_stock,
		tags: raw.tags || [],
	};
}

/** Signed-in buyers' last eight products. Renders nothing for guests or an empty history. */
export function RecentlyViewed() {
	const t = useTranslations("home");
	const { isAuthenticated } = useAuthStore();
	const { data: items } = useRecentlyViewed(8);

	if (!isAuthenticated || !items || items.length === 0) return null;

	return (
		<section data-section="recently-viewed" className="grid gap-5 md:gap-6">
			<SectionHead title={t("recentlyViewed")} />
			<ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 list-none m-0 p-0">
				{/* biome-ignore lint/suspicious/noExplicitAny: untyped history entry */}
				{items.map((item: any) => (
					<li key={item.id}>
						<ProductCard product={normalizeProduct(item.product || item)} />
					</li>
				))}
			</ul>
		</section>
	);
}
