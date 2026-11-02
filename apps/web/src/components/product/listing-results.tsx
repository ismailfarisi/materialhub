import { ActiveFiltersStrip } from "./active-filters-strip";
import { FilterSidebar } from "./filter-sidebar";
import type { FacetConfig } from "./filter-state";
import { ListingBodySkeleton } from "./listing-skeleton";
import { ListingEmpty, ListingError } from "./listing-states";
import { MobileFilterControls } from "./mobile-filter-controls";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-grid";
import { SortToolbar } from "./sort-toolbar";

/**
 * Shared results region for every product-listing surface — the category,
 * search and brand pages all render the same filter rail (264px from `lg`, a
 * bottom sheet below), result count and sort, active-filter chips, grid and
 * pagination. A change to the listing layout lands on all three pages at once.
 *
 * Presentational and hook-free so it drops into either a server tree (category,
 * brand) or a client tree (search). The page owns data fetching and passes the
 * resolved products/facets/total in; `activeCount` is computed by the page from
 * its own params (server) or the live search params (client). Search also sets
 * `isLoading`, `isError` and `onRetry` from its client query.
 */
export function ListingResults({
	config,
	products,
	total,
	activeCount,
	isLoading = false,
	isError = false,
	onRetry,
	wide = false,
}: {
	config: FacetConfig;
	// biome-ignore lint/suspicious/noExplicitAny: Product type not yet exported from product-card
	products: any[];
	total: number;
	/** @deprecated The list view was removed; kept so callers compile. */
	view?: string;
	activeCount: number;
	isLoading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
	/** @deprecated Loading now renders skeleton cards rather than a label. */
	loadingLabel?: string;
	/** Search only: a fifth column at `2xl`. */
	wide?: boolean;
}) {
	if (isLoading) return <ListingBodySkeleton wide={wide} />;

	return (
		<>
			<div className="flex gap-8">
				<FilterSidebar config={config} />
				<div className="min-w-0 flex-1">
					{isError ? (
						<ListingError onRetry={onRetry} />
					) : (
						<>
							<SortToolbar totalResults={total} />
							<ActiveFiltersStrip config={config} />
							{products.length === 0 ? (
								<ListingEmpty hasFilters={activeCount > 0} />
							) : (
								<>
									<ProductGrid products={products} wide={wide} />
									<Pagination totalItems={total} />
								</>
							)}
						</>
					)}
				</div>
			</div>

			<MobileFilterControls config={config} activeCount={activeCount} />
		</>
	);
}
