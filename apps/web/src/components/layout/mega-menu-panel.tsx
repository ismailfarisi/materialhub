import type { NavTab } from "@/lib/api/navigation";
import Image from "next/image";
import Link from "next/link";

interface Props {
	tab: NavTab;
}

export function MegaMenuPanel({ tab }: Props) {
	const hasSubs = tab.subcategories.length > 0;
	const hasBrands = tab.brand_list.brands.length > 0;
	const hasPromos = tab.promo_tiles.length > 0;

	return (
		<div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(420px,2.4fr)] gap-10 p-8">
			{hasSubs && (
				<ul className="list-none m-0 p-0 space-y-2.5">
					{tab.subcategories.map((sub) => (
						<li key={sub.href}>
							<Link
								href={sub.href}
								className={`text-[13px] text-nl-cacao hover:text-nl-amber ${
									sub.highlight ? "font-semibold" : ""
								}`}
							>
								{sub.label}
							</Link>
						</li>
					))}
				</ul>
			)}

			{hasBrands && (
				<div>
					<Link
						href={tab.brand_list.see_all_href}
						className="flex items-baseline justify-between mb-3 text-[13px] font-semibold text-nl-cacao hover:text-nl-amber"
					>
						<span>{tab.brand_list.title}</span>
						<span aria-hidden>›</span>
					</Link>
					<ul className="list-none m-0 p-0 space-y-2">
						{tab.brand_list.brands.map((b) => (
							<li key={b.id}>
								<Link
									href={b.href}
									className="text-[13px] text-nl-russet hover:text-nl-amber"
								>
									{b.name}
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}

			{hasPromos && (
				<div className="grid grid-cols-3 gap-4">
					{tab.promo_tiles.map((p) => (
						<Link key={p.href} href={p.href} className="group block">
							<div className="relative aspect-square overflow-hidden bg-nl-pearl">
								<Image
									src={p.image_url}
									alt={p.title}
									fill
									sizes="(min-width: 1024px) 200px, 100vw"
									className="object-cover group-hover:scale-105 transition-transform duration-500"
								/>
							</div>
							<div className="mt-2 text-[11px] tracking-[0.18em] uppercase text-nl-cacao">
								{p.title}
							</div>
							<div className="text-[10px] tracking-[0.18em] uppercase text-nl-amber underline mt-0.5">
								{p.cta_text}
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
