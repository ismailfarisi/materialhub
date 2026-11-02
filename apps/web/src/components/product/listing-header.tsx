import { Breadcrumb } from "@/components/product/breadcrumb";
import type { Spec, Stock } from "@/components/swatch";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

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
 * Header for product listing surfaces — the category page and the search page
 * both render it. Presentational and hook-free so it drops into either a server
 * (category) or client (search) tree.
 *
 * With a `stock`, it is the category landing band: the category's stock colour
 * as a whole field, the name in expanded display type, live facts in mono and
 * the subcategories as chips. The punched hole on the trailing edge is the
 * swatch-tab hole, the one circle used as ornament. Without a `stock` it is a
 * plain Operate header on the board (search).
 */
export function ListingHeader({
	breadcrumbItems,
	title,
	intro,
	pills,
	pillsLabel = "Subcategories",
	stock,
	facts,
}: {
	breadcrumbItems: BreadcrumbItem[];
	title: ReactNode;
	intro?: ReactNode;
	pills?: HeaderPill[];
	/** Accessible name of the subcategory nav. */
	pillsLabel?: string;
	stock?: Stock;
	/** Real, live facts about the listing (count, price floor). Never invented. */
	facts?: Spec[];
}) {
	if (!stock) {
		return (
			<header className="pt-2 pb-6 md:pb-8">
				<Breadcrumb items={breadcrumbItems} />
				<h1 className="m-0 mt-1 font-display text-[clamp(1.625rem,3vw,2.5rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao [overflow-wrap:anywhere]">
					{title}
				</h1>
				{intro && (
					<div className="mt-2.5 max-w-[65ch] text-[15px] text-nl-russet">{intro}</div>
				)}
			</header>
		);
	}

	return (
		<header className="pt-2 pb-6 md:pb-8">
			<Breadcrumb items={breadcrumbItems} />
			<div
				data-stock={stock.key}
				style={{ "--stock": stock.color } as CSSProperties}
				className="relative mt-1 overflow-hidden rounded-md bg-[var(--stock)] text-white shadow-card"
			>
				<span
					aria-hidden="true"
					className="absolute end-4 top-4 h-3.5 w-3.5 rounded-full bg-nl-linen shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)] md:end-6 md:top-6"
				/>
				<div className="grid gap-6 px-5 pt-8 pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-10 md:px-10 md:pt-14 md:pb-10">
					<div className="min-w-0">
						<h1 className="m-0 font-display text-[clamp(2.25rem,5vw,4.75rem)] font-bold leading-none tracking-[-0.03em] text-balance font-expanded [overflow-wrap:anywhere]">
							{title}
						</h1>
						{intro && (
							<p className="m-0 mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-white/90 line-clamp-4 md:line-clamp-none">
								{intro}
							</p>
						)}
					</div>
					{facts && facts.length > 0 && (
						<dl className="m-0 flex flex-wrap gap-x-8 gap-y-3 md:justify-end">
							{facts.map((f) => (
								<div key={f.label} className="grid gap-1.5">
									<dt className="mill-label text-white/90">{f.label}</dt>
									<dd className="m-0 font-mono text-[18px] leading-none tabular-nums md:text-[22px]">
										{f.value}
									</dd>
								</div>
							))}
						</dl>
					)}
				</div>

				{pills && pills.length > 0 && (
					<nav aria-label={pillsLabel} className="border-t border-white/20">
						<ul className="scrollbar-hide m-0 flex list-none gap-2 overflow-x-auto px-5 py-4 md:flex-wrap md:overflow-visible md:px-10">
							{pills.map((pill) => (
								<li key={pill.href} className="shrink-0">
									<Link
										href={pill.href}
										aria-current={pill.active ? "page" : undefined}
										className={cn(
											"inline-flex h-9 items-center rounded-sm border px-3 text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
											pill.active
												? "border-white bg-white text-nl-cacao"
												: "border-white/30 bg-white/10 text-white hover:border-white/70 hover:bg-white/20",
										)}
									>
										{pill.name}
									</Link>
								</li>
							))}
						</ul>
					</nav>
				)}
			</div>
		</header>
	);
}
