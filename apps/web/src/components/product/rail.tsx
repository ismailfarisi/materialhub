"use client";

import { RailCard } from "@/components/product/rail-card";
import { SwatchCardSkeleton } from "@/components/product/listing-skeleton";
import type { RailProduct } from "@/lib/queries/recommendations";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

interface RailProps {
	eyebrow: string;
	heading: React.ReactNode;
	sub?: string;
	items: RailProduct[] | undefined;
	isLoading?: boolean;
	/** Set on the bestsellers rail to put it on a binder-black band. */
	dark?: boolean;
	/** When set, the card matching this product id gets the "You're viewing" badge. */
	highlightProductId?: string;
	/** Locale prefix passed to card links. */
	localePrefix?: string;
}

/**
 * A horizontal row of product cards with a section head and scroll buttons.
 * Native horizontal scroll with snap; the buttons are a convenience for mouse
 * users and step by roughly one viewport of cards (mirrored in RTL).
 */
export function Rail({
	eyebrow,
	heading,
	sub,
	items,
	isLoading,
	dark = false,
	highlightProductId,
	localePrefix,
}: RailProps) {
	const t = useTranslations("browse");
	const scrollerRef = useRef<HTMLUListElement>(null);
	const scrollBy = (dir: 1 | -1) => {
		const el = scrollerRef.current;
		if (!el) return;
		const rtl = getComputedStyle(el).direction === "rtl";
		el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: "smooth" });
	};

	if (!isLoading && (!items || items.length === 0)) return null;

	const fg = dark ? "text-white" : "text-nl-cacao";
	const muted = dark ? "text-white/75" : "text-nl-russet";
	const arrow = cn(
		"inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber",
		dark
			? "border-white/25 text-white hover:border-white/70"
			: "border-nl-cacao/20 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/60",
	);

	return (
		<section className={cn("py-10 md:py-16", dark && "bg-nl-espresso")}>
			<div className="mx-auto max-w-[1400px] px-4 md:px-8">
				<div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
					<div className="grid min-w-0 max-w-[640px] gap-2">
						<span className={cn("mill-label", muted)}>{eyebrow}</span>
						<h2
							className={cn(
								"m-0 font-display text-[clamp(1.375rem,2.6vw,2rem)] font-semibold leading-[1.08] tracking-[-0.02em] [&_.italic]:not-italic [&_.text-nl-amber]:text-inherit",
								fg,
							)}
						>
							{heading}
						</h2>
						{sub && <p className={cn("m-0 text-[14.5px]", muted)}>{sub}</p>}
					</div>
					<div className="hidden shrink-0 gap-2 md:flex">
						<button type="button" onClick={() => scrollBy(-1)} aria-label={t("scrollBack")} className={arrow}>
							<ChevronLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} />
						</button>
						<button type="button" onClick={() => scrollBy(1)} aria-label={t("scrollForward")} className={arrow}>
							<ChevronRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} />
						</button>
					</div>
				</div>
				<ul
					ref={scrollerRef}
					className="scrollbar-hide -mx-4 m-0 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pt-1 pb-4 md:-mx-8 md:gap-4 md:scroll-px-8 md:px-8"
				>
					{isLoading
						? ["s1", "s2", "s3", "s4", "s5"].map((k) => (
								<li key={k} className="w-[200px] shrink-0 snap-start md:w-[252px]">
									<SwatchCardSkeleton />
								</li>
							))
						: items?.map((item) => (
								<li key={item.id} className="w-[200px] shrink-0 snap-start md:w-[252px]">
									<RailCard
										item={item}
										isViewing={highlightProductId === item.id}
										localePrefix={localePrefix}
									/>
								</li>
							))}
				</ul>
			</div>
		</section>
	);
}
