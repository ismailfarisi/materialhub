import { cn } from "@/lib/utils";
import { STOCKS, STOCK_ORDER, type StockKey } from "./stock";

/**
 * Fan deck — the system's signature motion. The seven category stocks fanned
 * from a pivot like a swatch book opened on a desk; hovering or focusing the
 * deck spreads it. Pure CSS, decorative (aria-hidden). Use once per page, in
 * a hero or a category header — never as a repeating ornament.
 */
export function FanDeck({
	keys = STOCK_ORDER,
	className,
	spread = 9,
}: {
	keys?: StockKey[];
	className?: string;
	/** Degrees between blades at rest. */
	spread?: number;
}) {
	const mid = (keys.length - 1) / 2;
	return (
		<div
			aria-hidden="true"
			className={cn("group/fan relative aspect-[4/3] w-full select-none", className)}
		>
			{keys.map((k, i) => {
				const angle = (i - mid) * spread;
				return (
					<div
						key={k}
						className="absolute left-1/2 bottom-[6%] h-[82%] w-[26%] -ml-[13%] origin-[50%_92%] rounded-md shadow-lift transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none [transform:rotate(var(--a))] group-hover/fan:[transform:rotate(calc(var(--a)*1.45))]"
						style={{ "--a": `${angle}deg`, background: STOCKS[k].color } as React.CSSProperties}
					>
						<div className="absolute inset-x-0 bottom-0 h-[30%] rounded-b-md bg-white flex flex-col justify-start p-[8%] gap-1">
							<span className="mill-label text-[clamp(7px,0.8vw,11px)] text-nl-cacao truncate">
								{STOCKS[k].material}
							</span>
						</div>
						<span className="absolute left-1/2 bottom-[5%] -ml-[5%] h-[5%] aspect-square rounded-full bg-nl-linen shadow-[inset_0_1px_1px_rgb(0_0_0/0.35)]" />
					</div>
				);
			})}
		</div>
	);
}
