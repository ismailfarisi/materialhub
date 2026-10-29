"use client";

import type { SuggestResponse } from "@/lib/queries/search";
import { formatPrice } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { useLocale } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface Props {
	data: SuggestResponse;
	query: string;
	activeIndex: number;
	onSelect: () => void;
}

export function SearchAutocompleteResults({
	data,
	query,
	activeIndex,
	onSelect,
}: Props) {
	const router = useRouter();
	const locale = useLocale();

	return (
		<div className="bg-background border border-border/60 rounded-2xl shadow-xl shadow-black/5 overflow-hidden">
			{data.categories.length > 0 && (
				<div className="p-3 border-b border-border/40">
					<p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
						Categories
					</p>
					<div className="flex flex-wrap gap-2">
						{data.categories.map((c, i) => (
							<button
								key={c.id}
								type="button"
								className={`text-xs px-3 py-1 rounded-full border transition-colors ${
									activeIndex === i
										? "border-primary bg-primary/5"
										: "border-border/60 hover:bg-muted/60"
								}`}
								onMouseDown={() => {
									router.push(`/${locale}/c/${c.slug}`);
									onSelect();
								}}
							>
								{c.name}
							</button>
						))}
					</div>
				</div>
			)}
			{data.brands.length > 0 && (
				<div className="p-3 border-b border-border/40">
					<p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
						Brands
					</p>
					<div className="flex flex-wrap gap-2">
						{data.brands.map((b, i) => {
							const idx = data.categories.length + i;
							return (
								<button
									key={b.id}
									type="button"
									className={`text-xs px-3 py-1 rounded-full border transition-colors ${
										activeIndex === idx
											? "border-primary bg-primary/5"
											: "border-border/60 hover:bg-muted/60"
									}`}
									onMouseDown={() => {
										router.push(`/${locale}/brand/${b.slug}`);
										onSelect();
									}}
								>
									{b.name}
								</button>
							);
						})}
					</div>
				</div>
			)}
			{data.products.length > 0 && (
				<div className="p-2">
					{data.products.map((p, i) => {
						const idx = data.categories.length + data.brands.length + i;
						return (
							<button
								key={p.id}
								type="button"
								className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl text-start transition-colors ${
									idx === activeIndex ? "bg-primary/5" : "hover:bg-muted/60"
								}`}
								onMouseDown={() => {
									router.push(`/${locale}/product/${p.slug}`);
									onSelect();
								}}
							>
								{p.image_url ? (
									<div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
										<Image
											src={p.image_url}
											alt={p.name}
											width={40}
											height={40}
											className="w-full h-full object-cover"
										/>
									</div>
								) : (
									<div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
								)}
								<div className="flex-1 min-w-0">
									<p className="truncate font-medium text-sm">{p.name}</p>
									<p className="text-xs text-muted-foreground">
										{p.price_min === p.price_max
											? formatPrice(p.price_min)
											: `${formatPrice(p.price_min)} – ${formatPrice(p.price_max)}`}
									</p>
								</div>
								<ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
							</button>
						);
					})}
				</div>
			)}
			<div className="border-t border-border/40 px-4 py-2.5">
				<button
					type="button"
					className="text-xs text-primary font-medium hover:text-primary/80 transition-colors flex items-center gap-1"
					onMouseDown={() => {
						router.push(
							`/${locale}/search?q=${encodeURIComponent(query.trim())}`,
						);
						onSelect();
					}}
				>
					View all results for &ldquo;{query}&rdquo;
					<ArrowRight className="h-3 w-3" />
				</button>
			</div>
		</div>
	);
}
