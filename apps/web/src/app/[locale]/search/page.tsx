"use client";

import { CategoryIndex } from "@/components/category/category-index";
import { computeActiveFilters } from "@/components/product/filter-state";
import { ListingHeader } from "@/components/product/listing-header";
import { buildSearchListingParams } from "@/components/product/listing-params";
import { ListingResults } from "@/components/product/listing-results";
import { useProducts } from "@/lib/queries/products";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

function SearchContent() {
	const t = useTranslations("browse");
	const locale = useLocale();
	const searchParams = useSearchParams();
	const query = (searchParams.get("q") || "").trim();

	const filters = Object.fromEntries(searchParams.entries());
	// Translate the storefront URL params (?page, ?sort) into the backend's
	// cursor/sortBy contract; same as the category listing. Passing them raw
	// made the API silently ignore pagination and sorting on search results.
	const { data, isLoading, isError, refetch } = useProducts(
		buildSearchListingParams(query, filters, 24, locale),
	);

	const facetConfig = useMemo(
		() => ({
			brands: data?.facets?.brands || [],
			vendors: data?.facets?.vendors || [],
			attributes: data?.facets?.attributes || [],
			priceRange: data?.facets?.priceRange || { min: 0, max: 100000 },
		}),
		[data?.facets],
	);

	const { count: activeCount } = useMemo(
		() => computeActiveFilters(facetConfig, searchParams),
		[facetConfig, searchParams],
	);

	const crumbs = [{ name: t("searchCrumb") }];
	const container = "mx-auto max-w-[1400px] px-4 pb-4 md:px-8";

	// Nothing typed yet: offer the catalogue's seven ways in.
	if (!query && activeCount === 0) {
		return (
			<div className={container}>
				<ListingHeader breadcrumbItems={crumbs} title={t("searchEmptyTitle")} />
				<CategoryIndex title={t("searchStartTitle")}>
					<p className="m-0 max-w-[56ch] text-[15px] text-nl-russet">
						{t("searchStartHint")}
					</p>
				</CategoryIndex>
			</div>
		);
	}

	const total = data?.total ?? 0;
	const noResults = !isLoading && !isError && total === 0 && activeCount === 0;
	const suggestion = data?.did_you_mean;

	if (noResults) {
		return (
			<div className={container}>
				<ListingHeader
					breadcrumbItems={crumbs}
					title={t("resultsFor", { query })}
				/>
				<CategoryIndex title={t("noResultsTitle", { query })}>
					{suggestion && (
						<p className="m-0 text-[15px] text-nl-cacao">
							{t.rich("didYouMean", {
								suggestion,
								link: (chunks) => (
									<Link
										href={`/${locale}/search?q=${encodeURIComponent(suggestion)}`}
										className="font-medium underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-amber"
									>
										{chunks}
									</Link>
								),
							})}
						</p>
					)}
					<p className="m-0 max-w-[56ch] text-[15px] text-nl-russet">
						{t("noResultsHint")}
					</p>
				</CategoryIndex>
			</div>
		);
	}

	return (
		<div className={container}>
			<ListingHeader
				breadcrumbItems={crumbs}
				title={query ? t("resultsFor", { query }) : t("searchEmptyTitle")}
			/>

			<ListingResults
				config={facetConfig}
				products={data?.data || []}
				total={total}
				activeCount={activeCount}
				isLoading={isLoading}
				isError={isError}
				onRetry={() => void refetch()}
				wide
			/>
		</div>
	);
}

export default function SearchPage() {
	return (
		<Suspense>
			<SearchContent />
		</Suspense>
	);
}
