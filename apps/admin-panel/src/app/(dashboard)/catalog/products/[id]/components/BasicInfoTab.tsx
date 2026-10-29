import {
	EntityCombobox,
	type LookupItem,
} from "@/components/ui/entity-combobox";
import { Card, CardContent, Input, Textarea } from "@materialhub/ui";
import type { ProductTranslationDraft } from "./ProductAiEnhanceDialog";

interface BasicInfoTabProps {
	product: any;
	editing: boolean;
	editName: string;
	setEditName: (v: string) => void;
	editDescription: string;
	setEditDescription: (v: string) => void;
	editIngredients: string;
	setEditIngredients: (v: string) => void;
	editUsageInstructions: string;
	setEditUsageInstructions: (v: string) => void;
	editCategoryId: string;
	setEditCategoryId: (v: string) => void;
	editBrandId: string;
	setEditBrandId: (v: string) => void;
	editTags: string;
	setEditTags: (v: string) => void;
	categoryItems: LookupItem[];
	brandItems: LookupItem[];
	searchCategories: (q: string) => Promise<LookupItem[]>;
	getCategoryById: (id: string) => Promise<LookupItem | null>;
	searchBrands: (q: string) => Promise<LookupItem[]>;
	getBrandById: (id: string) => Promise<LookupItem | null>;
	editTranslations: ProductTranslationDraft;
	setEditTranslations: React.Dispatch<
		React.SetStateAction<ProductTranslationDraft>
	>;
}

export function BasicInfoTab({
	product,
	editing,
	editName,
	setEditName,
	editDescription,
	setEditDescription,
	editIngredients,
	setEditIngredients,
	editUsageInstructions,
	setEditUsageInstructions,
	editCategoryId,
	setEditCategoryId,
	editBrandId,
	setEditBrandId,
	editTags,
	setEditTags,
	categoryItems,
	brandItems,
	searchCategories,
	getCategoryById,
	searchBrands,
	getBrandById,
	editTranslations,
	setEditTranslations,
}: BasicInfoTabProps) {
	return (
		<Card>
			<CardContent className="p-6 space-y-4">
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Product Name
					</label>
					{editing ? (
						<Input
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
						/>
					) : (
						<p className="text-sm">{product.name}</p>
					)}
				</div>
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Description
					</label>
					{editing ? (
						<Textarea
							value={editDescription}
							onChange={(e) => setEditDescription(e.target.value)}
							rows={3}
						/>
					) : (
						<p className="text-sm text-taupe">{product.description || "—"}</p>
					)}
				</div>
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Ingredients
					</label>
					{editing ? (
						<Textarea
							value={editIngredients}
							onChange={(e) => setEditIngredients(e.target.value)}
							rows={3}
							placeholder="Aqua, Glycerin, Niacinamide..."
						/>
					) : (
						<p className="text-sm text-taupe whitespace-pre-wrap">
							{product.ingredients || "—"}
						</p>
					)}
				</div>
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Usage Instructions
					</label>
					{editing ? (
						<Textarea
							value={editUsageInstructions}
							onChange={(e) => setEditUsageInstructions(e.target.value)}
							rows={3}
							placeholder="Apply a small amount to clean skin..."
						/>
					) : (
						<p className="text-sm text-taupe whitespace-pre-wrap">
							{product.usage_instructions || "—"}
						</p>
					)}
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium text-cacao mb-1">
							Category
						</label>
						{editing ? (
							<EntityCombobox
								value={editCategoryId || null}
								onChange={(id) => setEditCategoryId(id ?? "")}
								search={searchCategories}
								getById={getCategoryById}
								placeholder="Search categories…"
								emptyMessage="No matching categories"
							/>
						) : (
							<p className="text-sm">
								{categoryItems.find((c) => c.id === product.category_id)
									?.label ||
									product.category_id ||
									"—"}
							</p>
						)}
					</div>
					<div>
						<label className="block text-sm font-medium text-cacao mb-1">
							Brand
						</label>
						{editing ? (
							<EntityCombobox
								value={editBrandId || null}
								onChange={(id) => setEditBrandId(id ?? "")}
								search={searchBrands}
								getById={getBrandById}
								placeholder="Search brands…"
								emptyMessage="No matching brands"
							/>
						) : (
							<p className="text-sm">
								{product.brand?.name ||
									brandItems.find((b) => b.id === product.brand_id)?.label ||
									"—"}
							</p>
						)}
					</div>
				</div>
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Tags
					</label>
					{editing ? (
						<Input
							value={editTags}
							onChange={(e) => setEditTags(e.target.value)}
							placeholder="tag1, tag2"
						/>
					) : (
						<div className="flex flex-wrap gap-1">
							{product.tags?.length ? (
								product.tags.map((t: string) => (
									<span
										key={t}
										className="px-2 py-0.5 bg-pearl/100 text-taupe rounded-full text-xs"
									>
										{t}
									</span>
								))
							) : (
								<span className="text-sm text-taupe">—</span>
							)}
						</div>
					)}
				</div>

				{/* Arabic Translation Sub-Card */}
				<div className="border border-pearl rounded-lg p-4 bg-pearl/10 space-y-4">
					<h3 className="text-sm font-semibold text-cacao flex items-center gap-1.5">
						<span className="w-1.5 h-1.5 rounded-full bg-amber" />
						Arabic Translation (ar)
					</h3>
					<div>
						<label className="block text-xs font-medium text-taupe mb-1">
							Product Name (Arabic)
						</label>
						{editing ? (
							<Input
								value={editTranslations.ar.name}
								onChange={(e) =>
									setEditTranslations((prev) => ({
										...prev,
										ar: { ...prev.ar, name: e.target.value },
									}))
								}
								dir="rtl"
								placeholder="اسم المنتج باللغة العربية"
							/>
						) : (
							<p className="text-sm" dir="rtl">
								{editTranslations.ar.name || "—"}
							</p>
						)}
					</div>
					<div>
						<label className="block text-xs font-medium text-taupe mb-1">
							Description (Arabic)
						</label>
						{editing ? (
							<Textarea
								value={editTranslations.ar.description}
								onChange={(e) =>
									setEditTranslations((prev) => ({
										...prev,
										ar: { ...prev.ar, description: e.target.value },
									}))
								}
								rows={3}
								dir="rtl"
								placeholder="الوصف باللغة العربية"
							/>
						) : (
							<p className="text-sm text-taupe" dir="rtl">
								{editTranslations.ar.description || "—"}
							</p>
						)}
					</div>
					<div>
						<label className="block text-xs font-medium text-taupe mb-1">
							Ingredients (Arabic)
						</label>
						{editing ? (
							<Textarea
								value={editTranslations.ar.ingredients}
								onChange={(e) =>
									setEditTranslations((prev) => ({
										...prev,
										ar: { ...prev.ar, ingredients: e.target.value },
									}))
								}
								rows={3}
								dir="rtl"
								placeholder="المكونات باللغة العربية"
							/>
						) : (
							<p className="text-sm text-taupe whitespace-pre-wrap" dir="rtl">
								{editTranslations.ar.ingredients || "—"}
							</p>
						)}
					</div>
					<div>
						<label className="block text-xs font-medium text-taupe mb-1">
							Usage Instructions (Arabic)
						</label>
						{editing ? (
							<Textarea
								value={editTranslations.ar.usage_instructions}
								onChange={(e) =>
									setEditTranslations((prev) => ({
										...prev,
										ar: { ...prev.ar, usage_instructions: e.target.value },
									}))
								}
								rows={3}
								dir="rtl"
								placeholder="طريقة الاستخدام باللغة العربية"
							/>
						) : (
							<p className="text-sm text-taupe whitespace-pre-wrap" dir="rtl">
								{editTranslations.ar.usage_instructions || "—"}
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
