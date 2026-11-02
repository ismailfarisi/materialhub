import type { NavTab } from "@/lib/api/navigation";
import { stockFor } from "@/components/swatch/stock";
import { MegaMenuRoot } from "./mega-menu-root";

interface Props {
	tabs: NavTab[];
}

export function NavBar({ tabs }: Props) {
	if (tabs.length === 0) return null;
	return (
		<div className="hidden lg:block">
			<div className="max-w-[1400px] mx-auto px-4 md:px-8">
				<ul className="flex items-center gap-1 h-12 -mx-3 list-none m-0 p-0 overflow-x-auto scrollbar-hide">
					{tabs.map((tab) => (
						<li key={tab.id}>
							<a
								href={tab.href}
								className="group inline-flex items-center gap-2 h-12 px-3 text-[14px] font-medium text-nl-russet hover:text-nl-cacao border-b-2 border-transparent hover:border-[var(--stock)] transition-colors"
								style={{ "--stock": stockFor(tab.href.split("/").filter(Boolean).pop() ?? tab.label).color } as React.CSSProperties}
								data-mega-tab-trigger
								data-tab-id={tab.id}
								aria-haspopup={
									tab.subcategories.length ||
									tab.brand_list.brands.length ||
									tab.promo_tiles.length
										? "menu"
										: undefined
								}
							>
								{tab.kind === "category" && (
									<span
										aria-hidden="true"
										className="h-2.5 w-2.5 rounded-[2px] bg-[var(--stock)]"
									/>
								)}
								{tab.label}
							</a>
						</li>
					))}
				</ul>
				<MegaMenuRoot tabs={tabs} />
			</div>
		</div>
	);
}
