import { Card, CardContent, Input, Separator, Textarea } from "@materialhub/ui";
import type { ProductTranslationDraft } from "./ProductAiEnhanceDialog";

interface SeoTabProps {
	product: any;
	editing: boolean;
	editMetaTitle: string;
	setEditMetaTitle: (v: string) => void;
	editMetaDescription: string;
	setEditMetaDescription: (v: string) => void;
	editIsFeatured: boolean;
	setEditIsFeatured: (v: boolean) => void;
	editIsDigital: boolean;
	setEditIsDigital: (v: boolean) => void;
	editTranslations: ProductTranslationDraft;
	setEditTranslations: React.Dispatch<
		React.SetStateAction<ProductTranslationDraft>
	>;
}

export function SeoTab({
	product,
	editing,
	editMetaTitle,
	setEditMetaTitle,
	editMetaDescription,
	setEditMetaDescription,
	editIsFeatured,
	setEditIsFeatured,
	editIsDigital,
	setEditIsDigital,
	editTranslations,
	setEditTranslations,
}: SeoTabProps) {
	return (
		<Card>
			<CardContent className="p-6 space-y-4">
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Meta Title
					</label>
					{editing ? (
						<Input
							value={editMetaTitle}
							onChange={(e) => setEditMetaTitle(e.target.value)}
						/>
					) : (
						<p className="text-sm">{product.meta_title || "—"}</p>
					)}
				</div>
				<div>
					<label className="block text-sm font-medium text-cacao mb-1">
						Meta Description
					</label>
					{editing ? (
						<Textarea
							value={editMetaDescription}
							onChange={(e) => setEditMetaDescription(e.target.value)}
							rows={2}
						/>
					) : (
						<p className="text-sm text-taupe">
							{product.meta_description || "—"}
						</p>
					)}
				</div>
				<Separator />
				<h3 className="text-sm font-semibold text-cacao">Flags</h3>
				<div className="flex flex-wrap gap-4">
					<label className="flex items-center gap-2 text-sm">
						{editing ? (
							<input
								type="checkbox"
								checked={editIsFeatured}
								onChange={(e) => setEditIsFeatured(e.target.checked)}
								className="rounded"
							/>
						) : (
							<span
								className={
									product.is_featured ? "text-green-600" : "text-taupe"
								}
							>
								{product.is_featured ? "Yes" : "No"}
							</span>
						)}
						Featured
					</label>
					<label className="flex items-center gap-2 text-sm">
						{editing ? (
							<input
								type="checkbox"
								checked={editIsDigital}
								onChange={(e) => setEditIsDigital(e.target.checked)}
								className="rounded"
							/>
						) : (
							<span
								className={product.is_digital ? "text-green-600" : "text-taupe"}
							>
								{product.is_digital ? "Yes" : "No"}
							</span>
						)}
						Digital
					</label>
				</div>

				{/* Arabic SEO Translation Sub-Card */}
				<div className="border border-pearl rounded-lg p-4 bg-pearl/10 space-y-4 mt-4">
					<h3 className="text-sm font-semibold text-cacao flex items-center gap-1.5">
						<span className="w-1.5 h-1.5 rounded-full bg-amber" />
						Arabic SEO Translation
					</h3>
					<div>
						<label className="block text-xs font-medium text-taupe mb-1">
							Meta Title (Arabic)
						</label>
						{editing ? (
							<Input
								value={editTranslations.ar.meta_title}
								onChange={(e) =>
									setEditTranslations((prev) => ({
										...prev,
										ar: { ...prev.ar, meta_title: e.target.value },
									}))
								}
								dir="rtl"
								placeholder="عنوان الميتا باللغة العربية"
							/>
						) : (
							<p className="text-sm" dir="rtl">
								{editTranslations.ar.meta_title || "—"}
							</p>
						)}
					</div>
					<div>
						<label className="block text-xs font-medium text-taupe mb-1">
							Meta Description (Arabic)
						</label>
						{editing ? (
							<Textarea
								value={editTranslations.ar.meta_description}
								onChange={(e) =>
									setEditTranslations((prev) => ({
										...prev,
										ar: { ...prev.ar, meta_description: e.target.value },
									}))
								}
								rows={2}
								dir="rtl"
								placeholder="وصف الميتا باللغة العربية"
							/>
						) : (
							<p className="text-sm text-taupe" dir="rtl">
								{editTranslations.ar.meta_description || "—"}
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
