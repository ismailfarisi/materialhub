import { StockChip, stockFor } from "@/components/swatch";
import type { NavTab } from "@/lib/api/navigation";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface Props {
	tab: NavTab;
}

/** A category tab's stock: from its URL slug first, its label as a fallback. */
export function stockForTab(tab: Pick<NavTab, "href" | "label">) {
	return stockFor(tab.href.split("/").filter(Boolean).pop() ?? tab.label);
}

const link =
	"rounded-sm text-[14px] text-nl-cacao underline decoration-transparent underline-offset-4 transition-colors hover:decoration-nl-cacao/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber";

/**
 * The open mega menu for one header tab: the category (with its stock chip)
 * and its subcategories, the tab's brands, then any CMS promo tiles. Only the
 * columns with content render, so a sparse tab does not leave empty gutters.
 */
export function MegaMenuPanel({ tab }: Props) {
	const hasSubs = tab.subcategories.length > 0;
	const hasBrands = tab.brand_list.brands.length > 0;
	const hasPromos = tab.promo_tiles.length > 0;
	const isCategory = tab.kind === "category";
	const stock = stockForTab(tab);

	return (
		<div className="grid grid-cols-[minmax(220px,1fr)_minmax(180px,0.9fr)_minmax(0,2.2fr)] gap-10 py-8">
			<div className="min-w-0">
				<Link
					href={tab.href}
					className="group mb-4 inline-flex items-center gap-2.5 rounded-sm font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
				>
					{isCategory && <StockChip stock={stock} />}
					{tab.label}
					<ArrowRight
						aria-hidden="true"
						className="h-4 w-4 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
						strokeWidth={1.75}
					/>
				</Link>
				{hasSubs && (
					<ul className="m-0 grid list-none gap-1 border-t border-nl-cacao/12 p-0 pt-3">
						{tab.subcategories.map((sub) => (
							<li key={sub.href}>
								<Link
									href={sub.href}
									className={`${link} inline-flex min-h-8 items-center ${sub.highlight ? "font-semibold" : ""}`}
								>
									{sub.label}
								</Link>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="min-w-0">
				{hasBrands && (
					<>
						<Link
							href={tab.brand_list.see_all_href}
							className="group mb-4 inline-flex items-center gap-2 rounded-sm font-display text-[15px] font-semibold text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
						>
							{tab.brand_list.title}
							<ArrowRight
								aria-hidden="true"
								className="h-4 w-4 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
								strokeWidth={1.75}
							/>
						</Link>
						<ul className="m-0 grid list-none gap-1 border-t border-nl-cacao/12 p-0 pt-3">
							{tab.brand_list.brands.map((b) => (
								<li key={b.id}>
									<Link href={b.href} className={`${link} inline-flex min-h-8 items-center text-nl-russet hover:text-nl-cacao`}>
										{b.name}
									</Link>
								</li>
							))}
						</ul>
					</>
				)}
			</div>

			{hasPromos && (
				<ul className="m-0 grid list-none grid-cols-3 gap-4 p-0">
					{tab.promo_tiles.slice(0, 3).map((p) => (
						<li key={p.href}>
							<Link
								href={p.href}
								className="group block overflow-hidden rounded-md bg-nl-pearl shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber motion-reduce:transition-none motion-reduce:hover:translate-y-0"
							>
								<div className="relative aspect-[4/3] bg-nl-linen">
									<Image
										src={p.image_url}
										alt=""
										fill
										sizes="(min-width: 1024px) 240px, 100vw"
										className="object-cover"
									/>
								</div>
								<div className="grid gap-1 p-3">
									<span className="font-display text-[14.5px] font-semibold leading-tight text-nl-cacao">
										{p.title}
									</span>
									{p.cta_text && (
										<span className="text-[13px] text-nl-russet underline decoration-nl-cacao/25 underline-offset-4 group-hover:decoration-nl-cacao">
											{p.cta_text}
										</span>
									)}
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
