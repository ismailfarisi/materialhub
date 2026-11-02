import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import type { Stock } from "./stock";

/**
 * Swatch card — the system's signature surface. A white stock card with its
 * category's colour as a tab along the top edge and a punched hole, like a
 * page torn from a swatch book. Hover lifts the card off the board.
 */
export function SwatchCard({
	stock,
	children,
	className,
	tabLabel,
	interactive = true,
	as: Tag = "div",
}: {
	stock: Stock;
	children: ReactNode;
	className?: string;
	/** Text on the tab (condensed caps). Defaults to none — just the colour. */
	tabLabel?: string;
	interactive?: boolean;
	as?: "div" | "article" | "li";
}) {
	return (
		<Tag
			style={{ "--stock": stock.color } as CSSProperties}
			className={cn(
				"relative flex flex-col bg-nl-pearl rounded-md shadow-card overflow-hidden",
				interactive &&
					"transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0",
				className,
			)}
		>
			<div className="relative h-7 shrink-0 bg-[var(--stock)] text-white flex items-center px-3">
				{tabLabel && <span className="mill-label truncate pe-6">{tabLabel}</span>}
				<span
					aria-hidden="true"
					className="absolute end-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-nl-linen shadow-[inset_0_1px_1px_rgb(0_0_0/0.35)]"
				/>
			</div>
			{children}
		</Tag>
	);
}

/** Small filled square in a stock colour, with an optional label. */
export function StockChip({
	stock,
	label,
	className,
}: {
	stock: Stock;
	label?: string;
	className?: string;
}) {
	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			<span
				aria-hidden="true"
				className="h-2.5 w-2.5 rounded-[2px] shrink-0"
				style={{ background: stock.color }}
			/>
			{label && <span className="mill-label text-nl-russet">{label}</span>}
		</span>
	);
}
