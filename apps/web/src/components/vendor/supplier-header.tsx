import { MillLabel, type Spec, type Stock, SwatchCard } from "@/components/swatch";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Header for a supplier (vendor) or brand page, treated as a swatch card: the
 * card's tab is the stock of the supplier's main category, and its facts are a
 * mill label. Without a known category it drops the tab rather than borrowing a
 * stock that would misfile it, and keeps the mill label's ink rule instead.
 *
 * Only real data goes in `facts` — never an invented count or rating.
 */
export function SupplierHeader({
	name,
	logoUrl,
	description,
	stock,
	tabLabel,
	facts = [],
	badge,
	className,
}: {
	name: string;
	logoUrl?: string | null;
	description?: string | null;
	stock?: Stock | null;
	tabLabel?: string;
	facts?: Spec[];
	/** Verification or similar status, rendered beside the name. */
	badge?: ReactNode;
	className?: string;
}) {
	const body = (
		<div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] md:gap-10 md:p-8">
			<div className="flex min-w-0 gap-4 md:gap-6">
				<div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-nl-linen ring-1 ring-inset ring-nl-cacao/10 md:h-24 md:w-24">
					{logoUrl ? (
						<Image
							src={logoUrl}
							alt=""
							fill
							sizes="96px"
							className="object-contain p-1.5"
						/>
					) : (
						<span
							aria-hidden="true"
							className="grid h-full w-full place-items-center font-display text-[26px] font-bold text-nl-cacao/70 md:text-[34px]"
						>
							{name.trim().charAt(0).toUpperCase()}
						</span>
					)}
				</div>
				<div className="grid min-w-0 content-start gap-2.5">
					<h1 className="m-0 font-display text-[clamp(1.75rem,3.6vw,3rem)] font-bold leading-[1.02] tracking-[-0.03em] text-nl-cacao [overflow-wrap:anywhere]">
						{name}
					</h1>
					{badge}
					{description && (
						<p className="m-0 mt-1 max-w-[65ch] text-[15px] leading-relaxed text-nl-russet line-clamp-5">
							{description}
						</p>
					)}
				</div>
			</div>
			{facts.length > 0 && <MillLabel specs={facts} className="self-start" />}
		</div>
	);

	if (stock) {
		return (
			<SwatchCard
				stock={stock}
				tabLabel={tabLabel}
				interactive={false}
				className={className}
			>
				{body}
			</SwatchCard>
		);
	}
	return (
		<div className={cn("overflow-hidden rounded-md bg-nl-pearl shadow-card", className)}>
			{body}
		</div>
	);
}
