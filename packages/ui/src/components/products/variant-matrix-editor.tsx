"use client";

import { Check, Plus, Trash, X } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import type { ValidCategoryAttributeLink } from "./product-attributes-editor";

export interface VariantAxisValue {
	id?: string;
	value: string;
	label: string;
	color_hex?: string | null;
}

export interface VariantAxisDraft {
	/** option_values key: the attribute id for catalog axes, a slug for custom axes */
	key: string;
	attribute_id?: string;
	name: string;
	type?: string;
	custom?: boolean;
	values: VariantAxisValue[];
}

export interface VariantRowDraft {
	price: string;
	sku: string;
	quantity: string;
	excluded?: boolean;
}

export interface VariantMatrixValue {
	axes: VariantAxisDraft[];
	rows: Record<string, VariantRowDraft>;
}

export interface VariantCombination {
	key: string;
	option_values: Record<string, string>;
	label: string;
}

export interface ExplicitVariantRow {
	option_values: Record<string, string>;
	name?: string;
	price: number;
	sku?: string;
	quantity_on_hand?: number;
}

export const EMPTY_VARIANT_MATRIX: VariantMatrixValue = { axes: [], rows: {} };

export const MAX_VARIANT_COMBINATIONS = 100;

// ─── Pure helpers ────────────────────────────────────────────────────────────

function sortOptionValues(obj: Record<string, string>): Record<string, string> {
	const sorted: Record<string, string> = {};
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = obj[key] ?? "";
	}
	return sorted;
}

export function comboKeyOf(optionValues: Record<string, string>): string {
	return JSON.stringify(sortOptionValues(optionValues));
}

export function slugifyAxisName(name: string): string {
	return (
		name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || "option"
	);
}

/** Cartesian product of all axes that have at least one selected value. */
export function variantCombinations(
	axes: VariantAxisDraft[],
): VariantCombination[] {
	const active = axes.filter((a) => a.values.length > 0);
	if (active.length === 0) return [];
	let combos: Array<Array<{ key: string; value: VariantAxisValue }>> = [[]];
	for (const axis of active) {
		combos = combos.flatMap((combo) =>
			axis.values.map((value) => [...combo, { key: axis.key, value }]),
		);
	}
	return combos.map((combo) => {
		const optionValues = sortOptionValues(
			Object.fromEntries(combo.map((c) => [c.key, c.value.value])),
		);
		return {
			key: JSON.stringify(optionValues),
			option_values: optionValues,
			label: combo.map((c) => c.value.label).join(" / "),
		};
	});
}

/** Convert the matrix draft into the backend's explicit `variants[]` payload.
 * AED prices become fils; excluded rows and already-existing combos are dropped. */
export function buildVariantRowsPayload(
	value: VariantMatrixValue,
	existingKeys?: Set<string>,
): ExplicitVariantRow[] {
	const out: ExplicitVariantRow[] = [];
	for (const combo of variantCombinations(value.axes)) {
		if (existingKeys?.has(combo.key)) continue;
		const row = value.rows[combo.key];
		if (row?.excluded) continue;
		const price = Number(row?.price);
		out.push({
			option_values: combo.option_values,
			name: combo.label,
			price: Number.isFinite(price) ? Math.round(price * 100) : 0,
			sku: row?.sku?.trim() || undefined,
			quantity_on_hand:
				row?.quantity && Number(row.quantity) > 0
					? Math.floor(Number(row.quantity))
					: undefined,
		});
	}
	return out;
}

export function minVariantPriceFils(rows: ExplicitVariantRow[]): number | null {
	if (rows.length === 0) return null;
	return Math.min(...rows.map((r) => r.price));
}

/** Labels of included rows that still have no valid price (for save-time validation). */
export function rowsMissingPrice(
	value: VariantMatrixValue,
	existingKeys?: Set<string>,
): string[] {
	const missing: string[] = [];
	for (const combo of variantCombinations(value.axes)) {
		if (existingKeys?.has(combo.key)) continue;
		const row = value.rows[combo.key];
		if (row?.excluded) continue;
		if (!row?.price || Number(row.price) <= 0) missing.push(combo.label);
	}
	return missing;
}

export function existingVariantKeys(
	variants: Array<{ option_values?: Record<string, string> | null }>,
): Set<string> {
	return new Set(
		variants
			.filter((v) => v.option_values && Object.keys(v.option_values).length > 0)
			.map((v) => comboKeyOf(v.option_values as Record<string, string>)),
	);
}

function axisValueFromOption(opt: {
	id: string;
	value?: string | null;
	slug?: string | null;
	display_value?: string | null;
	label?: string | null;
	color_hex?: string | null;
}): VariantAxisValue {
	return {
		id: opt.id,
		value: opt.slug || opt.value || opt.id,
		label: opt.display_value || opt.label || opt.value || "—",
		color_hex: opt.color_hex ?? null,
	};
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface VariantMatrixEditorProps {
	/** The category's variant-defining attributes (is_variant=true), with values. */
	variantAttributes: ValidCategoryAttributeLink[];
	value: VariantMatrixValue;
	onChange: (next: VariantMatrixValue) => void;
	/** Variants that already exist on the product (edit mode) — matching combos
	 * are shown as existing and excluded from the payload. */
	existingVariants?: Array<{
		id?: string;
		name?: string;
		sku?: string | null;
		price?: number | null;
		option_values?: Record<string, string> | null;
	}>;
	currency?: string;
	/** Extra content per catalog axis (e.g. an admin quick-add for new values). */
	renderAxisExtras?: (attribute: { id: string; type: string }) => ReactNode;
}

export function VariantMatrixEditor({
	variantAttributes,
	value,
	onChange,
	existingVariants = [],
	currency = "AED",
	renderAxisExtras,
}: VariantMatrixEditorProps) {
	const [customName, setCustomName] = useState("");
	const [customValueInputs, setCustomValueInputs] = useState<
		Record<string, string>
	>({});
	const [bulkPrice, setBulkPrice] = useState("");

	const existingKeys = existingVariantKeys(existingVariants);
	const combos = variantCombinations(value.axes);
	const overLimit = combos.length > MAX_VARIANT_COMBINATIONS;

	const axisByKey = new Map(value.axes.map((a) => [a.key, a]));

	const setAxes = (axes: VariantAxisDraft[]) => {
		// Drop row drafts whose combo no longer exists, keep the rest
		const keys = new Set(variantCombinations(axes).map((c) => c.key));
		const rows: Record<string, VariantRowDraft> = {};
		for (const [k, row] of Object.entries(value.rows)) {
			if (keys.has(k)) rows[k] = row;
		}
		onChange({ axes, rows });
	};

	const toggleCatalogValue = (
		link: ValidCategoryAttributeLink,
		opt: VariantAxisValue,
	) => {
		const key = link.attribute.id;
		const axis = axisByKey.get(key);
		if (!axis) {
			setAxes([
				...value.axes,
				{
					key,
					attribute_id: link.attribute.id,
					name: link.attribute.name,
					type: link.attribute.type,
					values: [opt],
				},
			]);
			return;
		}
		const selected = axis.values.some((v) => v.value === opt.value);
		const nextValues = selected
			? axis.values.filter((v) => v.value !== opt.value)
			: [...axis.values, opt];
		const nextAxes =
			nextValues.length === 0
				? value.axes.filter((a) => a.key !== key)
				: value.axes.map((a) =>
						a.key === key ? { ...a, values: nextValues } : a,
					);
		setAxes(nextAxes);
	};

	const addCustomAxis = () => {
		const name = customName.trim();
		if (!name) return;
		let key = slugifyAxisName(name);
		// Avoid colliding with catalog axes (keyed by attribute id) or other customs
		while (axisByKey.has(key)) key = `${key}_2`;
		setAxes([...value.axes, { key, name, custom: true, values: [] }]);
		setCustomName("");
	};

	const addCustomValue = (axisKey: string) => {
		const input = (customValueInputs[axisKey] ?? "").trim();
		if (!input) return;
		const axis = axisByKey.get(axisKey);
		if (!axis) return;
		if (axis.values.some((v) => v.value === input)) {
			setCustomValueInputs((prev) => ({ ...prev, [axisKey]: "" }));
			return;
		}
		setAxes(
			value.axes.map((a) =>
				a.key === axisKey
					? { ...a, values: [...a.values, { value: input, label: input }] }
					: a,
			),
		);
		setCustomValueInputs((prev) => ({ ...prev, [axisKey]: "" }));
	};

	const removeCustomAxis = (axisKey: string) => {
		setAxes(value.axes.filter((a) => a.key !== axisKey));
	};

	const setRow = (key: string, patch: Partial<VariantRowDraft>) => {
		const current = value.rows[key] ?? { price: "", sku: "", quantity: "" };
		onChange({
			...value,
			rows: { ...value.rows, [key]: { ...current, ...patch } },
		});
	};

	const applyBulkPrice = () => {
		if (!bulkPrice || Number(bulkPrice) <= 0) return;
		const rows = { ...value.rows };
		for (const combo of combos) {
			if (existingKeys.has(combo.key)) continue;
			const current = rows[combo.key] ?? { price: "", sku: "", quantity: "" };
			if (current.excluded) continue;
			rows[combo.key] = { ...current, price: bulkPrice };
		}
		onChange({ ...value, rows });
	};

	const newComboCount = combos.filter(
		(c) => !existingKeys.has(c.key) && !value.rows[c.key]?.excluded,
	).length;

	return (
		<div className="space-y-5">
			{/* ── Axes ──────────────────────────────────────────────────────── */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Variant Options</CardTitle>
					<p className="text-xs text-taupe mt-1">
						{variantAttributes.length > 0
							? "Pick the values this product comes in. Variants are generated from every combination."
							: "This category has no variant attributes — add a custom option below (e.g. Size: 30ml, 50ml)."}
					</p>
				</CardHeader>
				<CardContent className="space-y-4 p-6 pt-0">
					{variantAttributes.map((link) => {
						const axis = axisByKey.get(link.attribute.id);
						const options = (link.attribute.values ?? []).map(
							axisValueFromOption,
						);
						return (
							<div
								key={link.attribute.id}
								className="rounded-lg border border-gray-200 p-3 space-y-2"
							>
								<div className="text-sm font-medium text-cacao">
									{link.attribute.name}
								</div>
								{options.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{options.map((opt) => {
											const selected = Boolean(
												axis?.values.some((v) => v.value === opt.value),
											);
											return (
												<button
													key={opt.value}
													type="button"
													onClick={() => toggleCatalogValue(link, opt)}
													className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
														selected
															? "border-primary bg-primary/10 text-primary font-medium"
															: "border-gray-200 text-taupe hover:border-gray-300"
													}`}
												>
													{link.attribute.type === "color" && (
														<span
															className="w-3 h-3 rounded-full border border-gray-300"
															style={{
																backgroundColor: opt.color_hex || opt.value,
															}}
														/>
													)}
													{opt.label}
													{selected && <Check size={12} />}
												</button>
											);
										})}
									</div>
								) : (
									<p className="text-xs text-taupe">No values defined yet.</p>
								)}
								{renderAxisExtras?.({
									id: link.attribute.id,
									type: link.attribute.type,
								})}
							</div>
						);
					})}

					{/* Custom axes */}
					{value.axes
						.filter((a) => a.custom)
						.map((axis) => (
							<div
								key={axis.key}
								className="rounded-lg border border-dashed border-gray-300 p-3 space-y-2"
							>
								<div className="flex items-center justify-between">
									<div className="text-sm font-medium text-cacao">
										{axis.name}
										<span className="ml-2 text-xs font-normal text-taupe">
											custom option
										</span>
									</div>
									<button
										type="button"
										onClick={() => removeCustomAxis(axis.key)}
										className="p-1 rounded text-taupe hover:text-red-500"
										aria-label={`Remove ${axis.name}`}
									>
										<Trash size={14} />
									</button>
								</div>
								{axis.values.length > 0 && (
									<div className="flex flex-wrap gap-1.5">
										{axis.values.map((v) => (
											<span
												key={v.value}
												className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
											>
												{v.label}
												<button
													type="button"
													onClick={() =>
														setAxes(
															value.axes.map((a) =>
																a.key === axis.key
																	? {
																			...a,
																			values: a.values.filter(
																				(x) => x.value !== v.value,
																			),
																		}
																	: a,
															),
														)
													}
													className="hover:text-red-500"
													aria-label={`Remove ${v.label}`}
												>
													<X size={10} />
												</button>
											</span>
										))}
									</div>
								)}
								<div className="flex gap-2">
									<Input
										value={customValueInputs[axis.key] ?? ""}
										onChange={(e) =>
											setCustomValueInputs((prev) => ({
												...prev,
												[axis.key]: e.target.value,
											}))
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === ",") {
												e.preventDefault();
												addCustomValue(axis.key);
											}
										}}
										placeholder="Type a value and press Enter (e.g. 30ml)"
										className="h-8 text-sm"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => addCustomValue(axis.key)}
									>
										<Plus size={14} />
									</Button>
								</div>
							</div>
						))}

					<div className="flex gap-2">
						<Input
							value={customName}
							onChange={(e) => setCustomName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addCustomAxis();
								}
							}}
							placeholder="Custom option name (e.g. Bundle)"
							className="h-8 text-sm max-w-xs"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addCustomAxis}
							disabled={!customName.trim()}
						>
							<Plus size={14} className="mr-1" /> Add custom option
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* ── Matrix ────────────────────────────────────────────────────── */}
			{combos.length > 0 && (
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between gap-3">
							<CardTitle className="text-base">
								Variants
								<Badge variant="secondary" className="ml-2 text-xs">
									{newComboCount} new
								</Badge>
							</CardTitle>
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0}
									step={0.01}
									value={bulkPrice}
									onChange={(e) => setBulkPrice(e.target.value)}
									placeholder={`Price (${currency})`}
									className="h-8 w-28 text-sm"
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={applyBulkPrice}
									disabled={!bulkPrice || Number(bulkPrice) <= 0}
								>
									Apply to all
								</Button>
							</div>
						</div>
						{overLimit && (
							<p className="text-xs text-red-600 mt-1">
								{combos.length} combinations exceed the limit of{" "}
								{MAX_VARIANT_COMBINATIONS} — deselect some values.
							</p>
						)}
					</CardHeader>
					<CardContent className="p-6 pt-0">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="text-left text-xs text-taupe border-b border-gray-200">
										<th className="py-2 pr-3 font-medium">Variant</th>
										<th className="py-2 pr-3 font-medium">
											Price ({currency}) *
										</th>
										<th className="py-2 pr-3 font-medium">SKU</th>
										<th className="py-2 pr-3 font-medium">Qty</th>
										<th className="py-2 w-10" />
									</tr>
								</thead>
								<tbody>
									{combos.map((combo) => {
										const exists = existingKeys.has(combo.key);
										const row = value.rows[combo.key];
										const excluded = Boolean(row?.excluded);
										if (exists) {
											const existing = existingVariants.find(
												(v) =>
													v.option_values &&
													comboKeyOf(v.option_values) === combo.key,
											);
											return (
												<tr
													key={combo.key}
													className="border-b border-gray-100 text-taupe"
												>
													<td className="py-2 pr-3">{combo.label}</td>
													<td className="py-2 pr-3">
														{existing?.price != null
															? `${currency} ${(existing.price / 100).toFixed(2)}`
															: "—"}
													</td>
													<td className="py-2 pr-3 font-mono text-xs">
														{existing?.sku ?? "—"}
													</td>
													<td className="py-2 pr-3">—</td>
													<td className="py-2">
														<Badge variant="secondary" className="text-xs">
															exists
														</Badge>
													</td>
												</tr>
											);
										}
										return (
											<tr
												key={combo.key}
												className={`border-b border-gray-100 ${excluded ? "opacity-40" : ""}`}
											>
												<td className="py-2 pr-3 font-medium text-cacao">
													{combo.label}
												</td>
												<td className="py-2 pr-3">
													<Input
														type="number"
														min={0}
														step={0.01}
														value={row?.price ?? ""}
														onChange={(e) =>
															setRow(combo.key, { price: e.target.value })
														}
														disabled={excluded}
														placeholder="0.00"
														className="h-8 w-28 text-sm"
														aria-label={`Price for ${combo.label}`}
													/>
												</td>
												<td className="py-2 pr-3">
													<Input
														value={row?.sku ?? ""}
														onChange={(e) =>
															setRow(combo.key, { sku: e.target.value })
														}
														disabled={excluded}
														placeholder="auto"
														className="h-8 w-36 text-sm font-mono"
														aria-label={`SKU for ${combo.label}`}
													/>
												</td>
												<td className="py-2 pr-3">
													<Input
														type="number"
														min={0}
														value={row?.quantity ?? ""}
														onChange={(e) =>
															setRow(combo.key, { quantity: e.target.value })
														}
														disabled={excluded}
														placeholder="0"
														className="h-8 w-20 text-sm"
														aria-label={`Quantity for ${combo.label}`}
													/>
												</td>
												<td className="py-2">
													<button
														type="button"
														onClick={() =>
															setRow(combo.key, { excluded: !excluded })
														}
														className="p-1 rounded text-taupe hover:text-red-500"
														title={
															excluded ? "Include variant" : "Exclude variant"
														}
														aria-label={
															excluded
																? `Include ${combo.label}`
																: `Exclude ${combo.label}`
														}
													>
														{excluded ? <Plus size={14} /> : <X size={14} />}
													</button>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
