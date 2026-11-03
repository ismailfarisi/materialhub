import { STOCKS, STOCK_ORDER, StockChip } from "@/components/swatch";
import { buttonVariants } from "@/components/swatch/button";
import { cn } from "@/lib/utils";
import { PackageOpen } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Empty and error panel for collection pages. White stock card on the board,
 * a plain icon, the problem in one line, the way out, then the seven category
 * stocks as links so the buyer is never at a dead end.
 */
export function CollectionNotice({
	locale,
	title,
	body,
	icon,
	action,
	categoryLabel,
}: {
	locale: string;
	title: string;
	body: string;
	icon?: ReactNode;
	action?: ReactNode;
	/** Localised category names keyed by stock, for the link list. */
	categoryLabel: (key: (typeof STOCK_ORDER)[number]) => string;
}) {
	return (
		<section className="grid gap-6 rounded-md bg-nl-pearl shadow-card px-5 py-8 md:px-10 md:py-12">
			<div className="grid gap-3 max-w-[60ch]">
				<span
					aria-hidden="true"
					className="grid h-11 w-11 place-items-center rounded-md bg-nl-linen text-nl-cacao"
				>
					{icon ?? <PackageOpen className="h-5 w-5" strokeWidth={1.75} />}
				</span>
				<h2 className="m-0 font-display font-semibold text-[clamp(20px,2.2vw,26px)] leading-[1.1] tracking-[-0.02em] text-nl-cacao">
					{title}
				</h2>
				<p className="m-0 text-[15px] leading-[1.6] text-nl-russet">{body}</p>
				{action && <div className="pt-1">{action}</div>}
			</div>
			<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 list-none m-0 p-0 pt-5 border-t border-nl-cacao/12">
				{STOCK_ORDER.map((k) => (
					<li key={k}>
						<a
							href={`/${locale}/c/${STOCKS[k].slug}`}
							className={cn(
								buttonVariants({ variant: "ghost", size: "md" }),
								"w-full justify-start",
							)}
						>
							<StockChip stock={STOCKS[k]} />
							{categoryLabel(k)}
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
