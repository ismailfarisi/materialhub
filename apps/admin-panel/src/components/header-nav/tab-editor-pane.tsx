"use client";

import { BrandListEditor } from "./brand-list-editor";
import { PromoTileEditor } from "./promo-tile-editor";
import type { HeaderNavTab } from "./types";

interface Props {
	tab: HeaderNavTab;
	onChange: (next: HeaderNavTab) => void;
}

const LOCALES = ["en", "ar", "hi", "ml", "ur"] as const;

export function TabEditorPane({ tab, onChange }: Props) {
	return (
		<div className="space-y-6 p-4">
			<section>
				<h3 className="text-sm font-semibold text-nl-cacao mb-2">Label</h3>
				<div className="grid grid-cols-2 gap-2">
					{LOCALES.map((loc) => (
						<label key={loc} className="block">
							<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
								{loc}
							</span>
							<input
								type="text"
								value={tab.label[loc] ?? ""}
								onChange={(e) =>
									onChange({
										...tab,
										label: { ...tab.label, [loc]: e.target.value },
									})
								}
								className="mt-1 w-full border border-nl-cacao/20 px-2 py-1.5 text-sm bg-transparent"
							/>
						</label>
					))}
				</div>
			</section>

			<section>
				<h3 className="text-sm font-semibold text-nl-cacao mb-2">Behavior</h3>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={tab.show_subcategories}
						onChange={(e) =>
							onChange({ ...tab, show_subcategories: e.target.checked })
						}
					/>
					Show sub-categories panel column
				</label>
			</section>

			<section>
				<h3 className="text-sm font-semibold text-nl-cacao mb-2">Brand list</h3>
				<BrandListEditor
					value={tab.brand_list}
					onChange={(brand_list) => onChange({ ...tab, brand_list })}
				/>
			</section>

			<section>
				<h3 className="text-sm font-semibold text-nl-cacao mb-2">
					Promo tiles ({tab.promo_tiles.length}/3)
				</h3>
				<PromoTileEditor
					tiles={tab.promo_tiles}
					onChange={(promo_tiles) => onChange({ ...tab, promo_tiles })}
				/>
			</section>
		</div>
	);
}
