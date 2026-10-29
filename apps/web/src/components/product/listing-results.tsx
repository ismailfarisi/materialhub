import { ActiveFiltersStrip } from "./active-filters-strip";
import { FilterSidebar } from "./filter-sidebar";
import type { FacetConfig } from "./filter-state";
import { MobileFilterControls } from "./mobile-filter-controls";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-grid";
import { SortToolbar } from "./sort-toolbar";

/**
 * Shared results region for every product-listing surface — the category,
 * search and brand pages all render the same active-filters strip, filter
 * sidebar, sort toolbar, product grid and pagination. Keeping it here means a
 * change to the listing layout lands on all three pages at once.
 *
 * Presentational and hook-free so it drops into either a server tree (category,
 * brand) or a client tree (search). The page owns data fetching and passes the
 * resolved products/facets/total in; `activeCount` is computed by the page from
 * its own params (server) or the live search params (client). Set `isLoading`
 * (search only) to swap the grid for a centered loading line.
 */
export function ListingResults({
	config,
	// biome-ignore lint/suspicious/noExplicitAny: Product type not yet exported from product-card
	products,
	total,
	view,
	activeCount,
	isLoading = false,
	loadingLabel,
}: {
	config: FacetConfig;
	// biome-ignore lint/suspicious/noExplicitAny: Product type not yet exported from product-card
	products: any[];
	total: number;
	view?: string;
	activeCount: number;
	isLoading?: boolean;
	loadingLabel?: string;
}) {
	return (
		<>
			<div className="px-2 md:px-8">
				<ActiveFiltersStrip config={config} />
			</div>

			<div className="flex flex-col lg:flex-row gap-6 mt-2 px-2 md:px-8">
				<FilterSidebar config={config} />
				<div className="flex-1">
					{isLoading ? (
						<div className="py-20 text-center text-muted-foreground">
							{loadingLabel}
						</div>
					) : (
						<>
							<SortToolbar totalResults={total} />
							<ProductGrid products={products} view={view} />
							<Pagination totalItems={total} />
						</>
					)}
				</div>
			</div>

			<MobileFilterControls config={config} activeCount={activeCount} />
		</>
	);
}
