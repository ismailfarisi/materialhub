"use client";

import { getFeed } from "@/lib/api/reels";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReelProductCard } from "./reel-product-card";
import { ScrollRail } from "@/components/layout/scroll-rail";

interface Props {
	title: string;
	subtitle: string;
	/** Reels pre-loaded from the layout API; if empty, fetches client-side. */
	serverReels: any[];
}

export function TrendingReelsSection({ title, subtitle, serverReels }: Props) {
	const [reels, setReels] = useState<any[]>(serverReels);

	useEffect(() => {
		if (serverReels.length > 0) return;
		let cancelled = false;
		getFeed({ context: "home", tab: "for_you", limit: 6 })
			.then((d) => {
				if (!cancelled) setReels(d.reels);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [serverReels]);

	if (reels.length === 0) return null;

	return (
		<section
			data-section="trending-reels"
			className="relative left-[calc(50%-50vw)] w-screen rtl:left-auto rtl:right-[calc(50%-50vw)] bg-nl-cacao text-nl-linen py-12 md:py-[72px]"
		>
			<div className="max-w-[1400px] mx-auto px-4 md:px-12">
				<div className="flex items-end justify-between mb-8 md:mb-10">
					<div>
						<p className="text-[11px] uppercase tracking-[0.22em] text-nl-amber">
							{subtitle}
						</p>
						<h2 className="font-serif text-3xl md:text-5xl leading-[1.05] tracking-tight mt-2 md:mt-3">
							{title}
						</h2>
					</div>
					<Link
						href="/reels"
						className="hidden md:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-amber hover:text-nl-pearl transition-colors"
					>
						View all reels
						<ArrowRight className="h-3 w-3 rtl:rotate-180" />
					</Link>
				</div>
			</div>

			<ScrollRail className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-4 md:px-12 scroll-ps-4 md:scroll-ps-12 max-w-[1400px] mx-auto">
				{reels.map((reel: any) => (
					<ReelProductCard key={reel.id} reel={reel} locale="en" />
				))}
			</ScrollRail>

			<div className="max-w-[1400px] mx-auto px-4 md:px-12">
				<Link
					href="/reels"
					className="md:hidden mt-6 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-nl-amber hover:text-nl-pearl transition-colors"
				>
					View all reels
					<ArrowRight className="h-3 w-3 rtl:rotate-180" />
				</Link>
			</div>
		</section>
	);
}
