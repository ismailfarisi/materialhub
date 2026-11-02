import { ListingBodySkeleton } from "@/components/product/listing-skeleton";

/**
 * Category landing while it loads: the breadcrumb line, the band's footprint in
 * a neutral tone (the stock colour is not known until the category resolves —
 * showing the wrong one would misfile the page), then the rail and grid.
 */
export default function CategoryLoading() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 pb-4 md:px-8"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="animate-pulse motion-reduce:animate-none">
				<div className="flex h-11 items-center gap-2.5 pt-2">
					<div className="h-3 w-12 rounded-sm bg-nl-cacao/[0.08]" />
					<div className="h-3 w-24 rounded-sm bg-nl-cacao/[0.08]" />
				</div>
				<div className="mt-1 mb-6 h-[220px] rounded-md bg-nl-cacao/[0.08] md:mb-8 md:h-[300px]" />
			</div>
			<ListingBodySkeleton />
		</div>
	);
}
