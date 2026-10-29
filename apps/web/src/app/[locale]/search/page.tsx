"use client";

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
	const t = useTranslations("common");
	const locale = useLocale();
	const searchParams = useSearchParams();
	const query = searchParams.get("q") || "";

	const filters = Object.fromEntries(searchParams.entries());
	// Translate the storefront URL params (?page, ?sort) into the backend's
	// cursor/sortBy contract; same as the category listing. Passing them raw
	// made the API silently ignore pagination and sorting on search results.
	const { data, isLoading } = useProducts(
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

	const headerIntro =
		!isLoading && data?.did_you_mean && data?.total === 0 ? (
			<Link
				href={`/${locale}/search?q=${encodeURIComponent(data.did_you_mean)}`}
				className="not-italic text-nl-amber underline underline-offset-2 transition-colors hover:text-nl-cacao"
			>
				did you mean &ldquo;{data.did_you_mean}&rdquo;
			</Link>
		) : undefined;

	return (
		<div className="mx-auto max-w-[1400px] py-4">
			<ListingHeader
				breadcrumbItems={[{ name: "Search" }]}
				title={query || "Search"}
				intro={headerIntro}
			/>

			<ListingResults
				config={facetConfig}
				products={data?.data || []}
				total={data?.total || 0}
				view={searchParams.get("view") || "grid"}
				activeCount={activeCount}
				isLoading={isLoading}
				loadingLabel={t("loading")}
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
