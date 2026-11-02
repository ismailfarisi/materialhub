import { STOCKS, STOCK_ORDER } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * The seven top-level categories as a list of stock blades: each row is its
 * category's stock colour as a filled tab, the category name and an arrow,
 * linking to the category page. Stocks always mean their category here.
 */
export async function CategoryStocks({
	locale,
	className,
	columns = "auto",
}: {
	locale: string;
	className?: string;
	/** `auto`: 1 column, 2 at sm, 4 at lg. `two`: 1 column, 2 at sm. */
	columns?: "auto" | "two";
}) {
	const t = await getTranslations("content.categories");
	return (
		<ul
			className={cn(
				"not-prose list-none m-0 p-0 grid gap-2 sm:grid-cols-2",
				columns === "auto" && "lg:grid-cols-4",
				className,
			)}
		>
			{STOCK_ORDER.map((k) => {
				const s = STOCKS[k];
				return (
					<li key={k}>
						<Link
							href={`/${locale}/c/${s.slug}`}
							className="group flex items-stretch h-14 rounded-md bg-nl-pearl shadow-card overflow-hidden transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
						>
							<span
								aria-hidden="true"
								className="relative w-7 shrink-0"
								style={{ background: s.color }}
							>
								<span className="absolute start-1/2 top-2.5 -translate-x-1/2 rtl:translate-x-1/2 h-2 w-2 rounded-full bg-nl-linen shadow-[inset_0_1px_1px_rgb(0_0_0/0.35)]" />
							</span>
							<span className="flex flex-1 items-center justify-between gap-3 px-4 min-w-0">
								<span className="text-[15px] font-medium text-nl-cacao truncate">{t(s.slug)}</span>
								<ArrowRight
									className="h-4 w-4 shrink-0 text-nl-russet transition-transform group-hover:translate-x-0.5 group-hover:text-nl-cacao rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
									strokeWidth={1.75}
									aria-hidden="true"
								/>
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}
