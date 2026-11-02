import type { NavTab } from "@/lib/api/navigation";
import { MegaMenuRoot } from "./mega-menu-root";

interface Props {
	tabs: NavTab[];
}

export function NavBar({ tabs }: Props) {
	if (tabs.length === 0) return null;
	return (
		<div className="hidden lg:block">
			<div className="max-w-[1400px] mx-auto px-4 md:px-8">
				<ul className="flex items-center gap-1 h-12 -mx-3 list-none m-0 p-0">
					{tabs.map((tab) => (
						<li key={tab.id}>
							<a
								href={tab.href}
								className="inline-flex items-center h-9 px-3 rounded-full text-[14px] font-medium text-nl-russet hover:text-nl-cacao hover:bg-nl-linen transition-colors"
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
