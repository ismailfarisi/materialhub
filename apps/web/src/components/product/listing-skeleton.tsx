import { cn } from "@/lib/utils";

/**
 * Placeholder swatch card: the tab, the 4:3 image well and the text lines of a
 * real `ProductCard`, so the grid does not jump when results land. Static
 * (no shimmer) under reduced motion.
 */
export function SwatchCardSkeleton() {
	return (
		<div className="flex flex-col overflow-hidden rounded-md bg-nl-pearl shadow-card" aria-hidden="true">
			<div className="h-7 bg-nl-cacao/[0.07]" />
			<div className="aspect-[4/3] bg-nl-linen" />
			<div className="grid gap-2.5 p-3.5 md:p-4">
				<div className="h-3 w-1/2 rounded-sm bg-nl-cacao/[0.07]" />
				<div className="h-4 w-4/5 rounded-sm bg-nl-cacao/[0.09]" />
				<div className="flex gap-1.5">
					<div className="h-6 w-14 rounded-sm bg-nl-linen" />
					<div className="h-6 w-12 rounded-sm bg-nl-linen" />
				</div>
				<div className="mt-1 flex items-end justify-between border-t border-dashed border-nl-cacao/15 pt-3">
					<div className="h-5 w-24 rounded-sm bg-nl-cacao/[0.09]" />
					<div className="h-9 w-9 rounded-md bg-nl-cacao/[0.07]" />
				</div>
			</div>
		</div>
	);
}

export function ProductGridSkeleton({
	count = 12,
	wide = false,
}: {
	count?: number;
	wide?: boolean;
}) {
	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 animate-pulse motion-reduce:animate-none",
				wide && "2xl:grid-cols-5",
			)}
		>
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<SwatchCardSkeleton key={i} />
			))}
		</div>
	);
}

/** The filter rail's shape: group titles over a few option rows. */
export function FilterRailSkeleton() {
	return (
		<div className="hidden w-[264px] shrink-0 lg:block" aria-hidden="true">
			<div className="mb-2 h-10 w-24 rounded-sm bg-nl-cacao/[0.08]" />
			{Array.from({ length: 4 }, (_, g) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<div key={g} className="grid gap-3 border-t border-nl-cacao/12 py-4">
					<div className="h-4 w-28 rounded-sm bg-nl-cacao/[0.08]" />
					{Array.from({ length: 3 }, (_, r) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						<div key={r} className="flex items-center gap-3">
							<div className="h-4 w-4 rounded-sm bg-nl-cacao/[0.08]" />
							<div className="h-3.5 w-32 rounded-sm bg-nl-cacao/[0.06]" />
						</div>
					))}
				</div>
			))}
		</div>
	);
}

/**
 * Whole listing body while a route segment loads: rail, toolbar, grid. Used by
 * the category, brand and search `loading.tsx` files and by search while its
 * client query is in flight.
 */
export function ListingBodySkeleton({ wide = false }: { wide?: boolean }) {
	return (
		<div className="flex gap-8 animate-pulse motion-reduce:animate-none">
			<FilterRailSkeleton />
			<div className="min-w-0 flex-1">
				<div className="flex min-h-14 items-center justify-between pb-3">
					<div className="h-4 w-28 rounded-sm bg-nl-cacao/[0.08]" />
					<div className="hidden h-10 w-48 rounded-md bg-nl-cacao/[0.06] lg:block" />
				</div>
				<ProductGridSkeleton wide={wide} />
			</div>
		</div>
	);
}
