"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";

export interface AttributeValueOption {
	id: string;
	value?: string | null;
	slug?: string | null;
	display_value?: string | null;
	label?: string | null;
	color_hex?: string | null;
}

export interface CategoryAttributeLink {
	is_required?: boolean;
	attribute: {
		id: string;
		name: string;
		type: string;
		is_variant?: boolean;
		values?: AttributeValueOption[] | null;
	} | null;
}

export type ValidCategoryAttributeLink = CategoryAttributeLink & {
	attribute: NonNullable<CategoryAttributeLink["attribute"]>;
};

export function hasCategoryAttribute(
	link: CategoryAttributeLink,
): link is ValidCategoryAttributeLink {
	return Boolean(link.attribute);
}

/** Variant-defining attributes (Size, Color…) belong in the variants step, not
 * the descriptive attribute editor — split a category's attributes accordingly. */
export function splitCategoryAttributes(links: CategoryAttributeLink[]): {
	descriptive: ValidCategoryAttributeLink[];
	variantAxes: ValidCategoryAttributeLink[];
} {
	const descriptive: ValidCategoryAttributeLink[] = [];
	const variantAxes: ValidCategoryAttributeLink[] = [];
	for (const link of links) {
		if (!hasCategoryAttribute(link)) continue;
		if (link.attribute.is_variant) variantAxes.push(link);
		else descriptive.push(link);
	}
	return { descriptive, variantAxes };
}

export type ProductAttributeDraft = Record<
	string,
	{ value_id?: string; value_ids?: string[]; text_value?: string }
>;

export interface ProductAttributesEditorProps {
	categoryAttributes: CategoryAttributeLink[];
	value: ProductAttributeDraft;
	onChange: (next: ProductAttributeDraft) => void;
	editing: boolean;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

type SerializedAttribute = {
	attribute_id: string;
	value_id?: string;
	text_value?: string;
};

/** Flatten the draft map into the backend `attributes[]` shape. Multi-select
 * values become one entry per selected id (no backend change needed). */
export function serializeProductAttributes(
	draft: ProductAttributeDraft,
): SerializedAttribute[] {
	const out: SerializedAttribute[] = [];
	for (const [attribute_id, v] of Object.entries(draft)) {
		if (v.value_ids && v.value_ids.length > 0) {
			for (const value_id of v.value_ids) out.push({ attribute_id, value_id });
		} else if (v.value_id) {
			out.push({ attribute_id, value_id: v.value_id });
		} else if (v.text_value?.trim()) {
			out.push({ attribute_id, text_value: v.text_value.trim() });
		}
	}
	return out;
}

function hasValue(v: ProductAttributeDraft[string] | undefined): boolean {
	if (!v) return false;
	return Boolean(
		v.value_id ||
			(v.value_ids && v.value_ids.length > 0) ||
			v.text_value?.trim(),
	);
}

/** Names of required category attributes that have no value set (for a save-time warning). */
export function missingRequiredAttributes(
	draft: ProductAttributeDraft,
	categoryAttributes: CategoryAttributeLink[],
): string[] {
	const missing: string[] = [];
	for (const link of categoryAttributes) {
		if (!link.attribute) continue;
		if (!link.is_required) continue;
		if (!hasValue(draft[link.attribute.id])) missing.push(link.attribute.name);
	}
	return missing;
}

interface ProductAttributeRow {
	attribute_id: string;
	attribute_value_id?: string | null;
	text_value?: string | null;
	variant_id?: string | null;
}

/** Build the draft map from a product's stored attribute-value rows. Multi-select
 * attributes (or any attribute with >1 row) collapse into `value_ids[]`. */
export function hydrateProductAttributes(
	rows: ProductAttributeRow[],
	categoryAttributes: CategoryAttributeLink[],
): ProductAttributeDraft {
	const typeById = new Map<string, string>();
	for (const link of categoryAttributes) {
		if (!link.attribute) continue;
		typeById.set(link.attribute.id, link.attribute.type);
	}

	const groups = new Map<string, ProductAttributeRow[]>();
	for (const row of rows) {
		if (row.variant_id) continue;
		const list = groups.get(row.attribute_id) ?? [];
		list.push(row);
		groups.set(row.attribute_id, list);
	}

	const draft: ProductAttributeDraft = {};
	for (const [attribute_id, list] of groups) {
		const valueIds = list
			.map((r) => r.attribute_value_id)
			.filter((id): id is string => Boolean(id));
		const isMulti =
			typeById.get(attribute_id) === "multi_select" || list.length > 1;
		if (valueIds.length > 0) {
			draft[attribute_id] = isMulti
				? { value_ids: valueIds }
				: { value_id: valueIds[0] };
		} else {
			const textRow = list.find(
				(r) => r.text_value != null && r.text_value !== "",
			);
			if (textRow)
				draft[attribute_id] = { text_value: textRow.text_value ?? undefined };
		}
	}
	return draft;
}

function optionLabel(opt: AttributeValueOption): string {
	return opt.display_value || opt.label || opt.value || "—";
}

// ─── Component ───────────────────────────────────────────────────────────────

const NONE = "__none__";

export function ProductAttributesEditor({
	categoryAttributes,
	value,
	onChange,
	editing,
}: ProductAttributesEditorProps) {
	const validCategoryAttributes = (categoryAttributes ?? []).filter(
		(link): link is ValidCategoryAttributeLink => Boolean(link.attribute),
	);

	if (validCategoryAttributes.length === 0) {
		return (
			<Card>
				<CardContent className="p-6">
					<p className="text-sm text-taupe">
						No attributes are configured for this product's category.
					</p>
				</CardContent>
			</Card>
		);
	}

	const set = (attrId: string, next: ProductAttributeDraft[string]) => {
		onChange({ ...value, [attrId]: next });
	};

	const readLabel = (link: ValidCategoryAttributeLink): string => {
		const attr = link.attribute;
		const current = value[attr.id] ?? {};
		const values = attr.values ?? [];
		const labelFor = (id: string) => {
			const v = values.find((x) => x.id === id);
			return v ? optionLabel(v) : "—";
		};
		if (current.value_ids && current.value_ids.length > 0) {
			return current.value_ids.map(labelFor).join(", ");
		}
		if (current.value_id) return labelFor(current.value_id);
		if (attr.type === "boolean") {
			if (current.text_value === "true") return "Yes";
			if (current.text_value === "false") return "No";
			return "—";
		}
		return current.text_value || "—";
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Product Attributes</CardTitle>
			</CardHeader>
			<CardContent className="p-6 pt-0">
				<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
					{validCategoryAttributes.map((link) => {
						const attr = link.attribute;
						const current = value[attr.id] ?? {};
						const values = attr.values ?? [];
						const isChoice = attr.type === "select" || attr.type === "color";
						const isMulti = attr.type === "multi_select";
						const isBoolean = attr.type === "boolean";
						const required = Boolean(link.is_required);
						const empty = !hasValue(current);

						return (
							<div key={attr.id}>
								<div className="mb-1 block text-sm font-medium text-cacao">
									{attr.name}
									{required && <span className="ml-0.5 text-red-500">*</span>}
								</div>

								{!editing ? (
									<p className="text-sm text-taupe">{readLabel(link)}</p>
								) : isChoice ? (
									<Select
										value={current.value_id ?? NONE}
										onValueChange={(v) =>
											set(attr.id, v === NONE ? {} : { value_id: v })
										}
									>
										<SelectTrigger>
											<SelectValue placeholder={`Select ${attr.name}`} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NONE}>Not set</SelectItem>
											{values.map((v) => (
												<SelectItem key={v.id} value={v.id}>
													{attr.type === "color" ? (
														<span className="flex items-center gap-2">
															<span
																className="h-3.5 w-3.5 rounded-full border border-pearl shrink-0"
																style={{
																	backgroundColor:
																		v.color_hex || "transparent",
																}}
															/>
															{optionLabel(v)}
														</span>
													) : (
														optionLabel(v)
													)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : isMulti ? (
									<div className="space-y-1.5 rounded-xs border border-pearl/28 p-2">
										{values.length === 0 && (
											<p className="text-xs text-taupe">No values defined.</p>
										)}
										{values.map((v) => {
											const selected = current.value_ids ?? [];
											const checked = selected.includes(v.id);
											return (
												<div
													key={v.id}
													className="flex items-center gap-2 text-sm text-cacao"
												>
													<Checkbox
														id={`${attr.id}-${v.id}`}
														aria-label={optionLabel(v)}
														checked={checked}
														onCheckedChange={(c) => {
															const nextIds = c
																? [...selected, v.id]
																: selected.filter((id) => id !== v.id);
															set(attr.id, { value_ids: nextIds });
														}}
													/>
													<label htmlFor={`${attr.id}-${v.id}`}>
														{optionLabel(v)}
													</label>
												</div>
											);
										})}
									</div>
								) : isBoolean ? (
									<div className="flex items-center gap-2">
										<Switch
											aria-label={attr.name}
											checked={current.text_value === "true"}
											onCheckedChange={(c) =>
												set(attr.id, { text_value: c ? "true" : "false" })
											}
										/>
										<span className="text-sm text-taupe">
											{current.text_value === "true" ? "Yes" : "No"}
										</span>
									</div>
								) : (
									<Input
										type={attr.type === "number" ? "number" : "text"}
										value={current.text_value ?? ""}
										onChange={(e) =>
											set(attr.id, { text_value: e.target.value })
										}
										placeholder={attr.name}
									/>
								)}

								{editing && required && empty && (
									<p className="mt-1 text-xs text-amber">
										This attribute is required.
									</p>
								)}
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
