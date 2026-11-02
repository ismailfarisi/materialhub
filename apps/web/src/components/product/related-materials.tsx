"use client";

import { ProductCard } from "@/components/product/product-card";
import { SectionHead } from "@/components/swatch";
import { type RailProduct, type RailType, useRecommendations } from "@/lib/queries/recommendations";

type CardProduct = Parameters<typeof ProductCard>[0]["product"];

/** Recommendation payload → the shape the shared product card takes. */
export function toCardProduct(
	p: RailProduct,
	categoryIndex: Record<string, string>,
	vendorName?: string,
): CardProduct {
	const rating = p.rating_avg == null ? undefined : Number(p.rating_avg);
	return {
		id: p.id,
		name: p.name,
		slug: p.slug,
		price_min: p.price,
		price_max: p.price,
		compare_at_price: p.compare_at_price ?? null,
		images: (p.images ?? []).map((i) => i.url).filter(Boolean),
		rating_avg: Number.isFinite(rating) ? rating : undefined,
		review_count: p.rating_count ?? undefined,
		vendor_name: p.vendor?.business_name ?? p.vendor?.name ?? vendorName,
		vendor_id: p.vendor_id ?? p.vendor?.id ?? undefined,
		brand_name: p.brand?.name ?? undefined,
		category_name: p.category_id ? categoryIndex[p.category_id] : undefined,
		in_stock: p.in_stock,
	};
}

/**
 * A row of related materials as swatch cards (2 / 3 / 4 columns). Hidden when
 * the recommendation API returns nothing; skeleton cards while loading.
 */
export function RelatedMaterials({
	productId,
	type,
	title,
	limit = 4,
	categoryIndex,
	action,
	vendorName,
}: {
	productId: string;
	type: RailType;
	title: string;
	limit?: number;
	categoryIndex: Record<string, string>;
	action?: { href: string; label: string };
	/** Supplier name for rows that are all from one supplier ("More from…"). */
	vendorName?: string;
}) {
	const { data, isPending, isError } = useRecommendations(productId, type, limit);
	const items = (data ?? []).filter((p) => p.id !== productId).slice(0, limit);
	if (isError || (!isPending && items.length === 0)) return null;

	return (
		<section className="border-t border-nl-cacao/10">
			<div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-10 md:px-8 md:py-16">
				<SectionHead title={title} action={action} />
				<ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 md:gap-4 lg:grid-cols-4" aria-busy={isPending}>
					{isPending
						? Array.from({ length: limit }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
								<li key={i} className="overflow-hidden rounded-md bg-nl-pearl shadow-card">
									<div className="h-7 bg-nl-cacao/10" />
									<div className="aspect-[4/3] animate-pulse bg-nl-linen motion-reduce:animate-none" />
									<div className="grid gap-2 p-4">
										<span className="h-3 w-1/2 rounded-sm bg-nl-linen" />
										<span className="h-4 w-3/4 rounded-sm bg-nl-linen" />
										<span className="h-4 w-1/3 rounded-sm bg-nl-linen" />
									</div>
								</li>
							))
						: items.map((p, i) => (
								<li key={p.id} className={i === 3 ? "md:max-lg:hidden" : undefined}>
									<ProductCard product={toCardProduct(p, categoryIndex, vendorName)} />
								</li>
							))}
				</ul>
			</div>
		</section>
	);
}
