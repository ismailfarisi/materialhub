import { Breadcrumb } from "@/components/product/breadcrumb";
import Link from "next/link";
import type { ReactNode } from "react";

interface BreadcrumbItem {
	name: string;
	slug?: string;
	href?: string;
}

interface HeaderPill {
	name: string;
	href: string;
	active?: boolean;
}

/**
 * Shared editorial header for product listing surfaces — the category page and
 * the search page both render it. Presentational and hook-free so it drops into
 * either a server (category) or client (search) tree.
 *
 * The page composes the props so this component stays category-agnostic:
 * `title` is the category name or the search query, `intro` is the category
 * description or a result-count line, and `pills` are subcategories (omitted on
 * search). Mirrors the prototype's minimal CategoryHero (breadcrumb → oversized
 * serif title with the amber-period motif → italic intro → tracked pill row).
 */
export function ListingHeader({
	breadcrumbItems,
	title,
	intro,
	pills,
	pillsLabel = "Browse",
}: {
	breadcrumbItems: BreadcrumbItem[];
	title: string;
	intro?: ReactNode;
	pills?: HeaderPill[];
	pillsLabel?: string;
}) {
	return (
		<header className="px-2 pt-6 pb-8 md:px-8 md:pt-10 md:pb-10">
			<Breadcrumb items={breadcrumbItems} />

			<h1 className="font-serif text-[clamp(2.5rem,6vw,5.25rem)] leading-none tracking-normal text-nl-cacao">
				{title}
				<span className="text-nl-amber">.</span>
			</h1>

			{intro && (
				<p className="mt-4 max-w-xl font-serif text-[18px] italic leading-relaxed text-nl-cacao/70">
					{intro}
				</p>
			)}

			{pills && pills.length > 0 && (
				<div className="mt-7">
					<span className="block text-[10px] uppercase tracking-[0.3em] text-nl-russet">
						{pillsLabel}
					</span>
					<div className="scrollbar-nl mt-3 grid grid-flow-col grid-rows-2 gap-2.5 overflow-x-auto pb-3 scroll-ps-0">
						{pills.map((pill) => (
							<Link
								key={pill.href}
								href={pill.href}
								className={`w-[150px] truncate px-4 py-2.5 text-center text-[11px] uppercase tracking-[0.18em] transition-colors md:w-[180px] ${
									pill.active
										? "border border-nl-amber bg-nl-amber text-nl-espresso"
										: "border border-nl-cacao/20 text-nl-cacao hover:border-nl-cacao/40"
								}`}
							>
								{pill.name}
							</Link>
						))}
					</div>
				</div>
			)}
		</header>
	);
}
