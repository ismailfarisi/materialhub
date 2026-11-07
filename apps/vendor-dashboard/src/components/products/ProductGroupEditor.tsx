"use client";

import {
	EntityCombobox,
	type LookupItem,
} from "@/components/ui/entity-combobox";
import { api } from "@/lib/api";
import {
	type CreateProductGroupPayload,
	useCreateProductGroup,
} from "@/lib/queries/product-groups";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Textarea,
	toast,
} from "@materialhub/ui";
import {
	ArrowLeft,
	Check,
	Link as LinkIcon,
	List,
	Plus,
	Spinner,
	Swatches,
	Trash,
	WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────── */

interface Category {
	id: string;
	name: string;
	children?: Category[];
}

interface Brand {
	id: string;
	name: string;
}

interface AttributeValue {
	id: string;
	value: string;
	color_hex?: string | null;
	swatch_image_url?: string | null;
}

interface Attribute {
	id: string;
	name: string;
	type: string;
	is_variant?: boolean;
	is_groupable?: boolean;
	values?: AttributeValue[];
}

interface CategoryAttributeLink {
	attribute: Attribute;
	is_required?: boolean;
}

interface MemberRow {
	/** client-side key */
	_key: string;
	attribute_value_id: string;
	name: string;
	price: string; // AED, human-readable
	sku: string;
	is_primary: boolean;
}

/* ──────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────── */

function flattenCategoriesAsBreadcrumb(
	cats: Category[],
	parentPath = "",
): LookupItem[] {
	const result: LookupItem[] = [];
	for (const cat of cats) {
		const label = parentPath ? `${parentPath} › ${cat.name}` : cat.name;
		result.push({ id: cat.id, label });
		if (cat.children?.length)
			result.push(...flattenCategoriesAsBreadcrumb(cat.children, label));
	}
	return result;
}

function uid() {
	return Math.random().toString(36).slice(2);
}

/* ══════════════════════════════════════════════════════════════════════
   ProductGroupEditor
   ══════════════════════════════════════════════════════════════════════ */

export function ProductGroupEditor() {
	const router = useRouter();

	// ─── Reference data ─────────────────────────────────────────────────
	const [categories, setCategories] = useState<Category[]>([]);
	const [brands, setBrands] = useState<Brand[]>([]);
	const [loadingRefs, setLoadingRefs] = useState(true);
	const [categoryAttributes, setCategoryAttributes] = useState<
		CategoryAttributeLink[]
	>([]);
	const [loadingAttrs, setLoadingAttrs] = useState(false);

	// ─── Form state ─────────────────────────────────────────────────────
	const [name, setName] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [brandId, setBrandId] = useState("");
	const [shortDescription, setShortDescription] = useState("");
	const [description, setDescription] = useState("");
	const [listingMode, setListingMode] = useState<"collapsed" | "individual">(
		"collapsed",
	);
	const [groupingAttrId, setGroupingAttrId] = useState("");
	const [members, setMembers] = useState<MemberRow[]>([]);
	const [errors, setErrors] = useState<Record<string, string>>({});

	// ─── Mutation ───────────────────────────────────────────────────────
	const { mutateAsync: createGroup, isPending } = useCreateProductGroup();

	// ─── Derived ────────────────────────────────────────────────────────
	const categoryItems = useMemo<LookupItem[]>(
		() => flattenCategoriesAsBreadcrumb(categories),
		[categories],
	);
	const brandItems = useMemo<LookupItem[]>(
		() => brands.map((b) => ({ id: b.id, label: b.name })),
		[brands],
	);

	const groupableAttributes = useMemo(
		() =>
			categoryAttributes
				.filter((link) => link.attribute.is_groupable === true)
				.map((link) => link.attribute),
		[categoryAttributes],
	);

	const selectedGroupingAttr = useMemo(
		() => groupableAttributes.find((a) => a.id === groupingAttrId) ?? null,
		[groupableAttributes, groupingAttrId],
	);

	const usedValueIds = useMemo(
		() => new Set(members.map((m) => m.attribute_value_id)),
		[members],
	);

	const availableValues = useMemo(
		() =>
			(selectedGroupingAttr?.values ?? []).filter(
				(v) => !usedValueIds.has(v.id),
			),
		[selectedGroupingAttr, usedValueIds],
	);

	// ─── Load reference data ────────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;
		setLoadingRefs(true);
		Promise.all([
			api.get("/categories/tree").catch(() => ({ data: { data: [] } })),
			api.get("/brands").catch(() => ({ data: { data: [] } })),
		]).then(([catRes, brandRes]) => {
			if (cancelled) return;
			setCategories(catRes.data.data ?? []);
			const bd = brandRes.data.data;
			setBrands(Array.isArray(bd) ? bd : (bd?.data ?? []));
			setLoadingRefs(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// ─── Load category attributes on category change ─────────────────────
	useEffect(() => {
		if (!categoryId) {
			setCategoryAttributes([]);
			setGroupingAttrId("");
			setMembers([]);
			return;
		}
		let cancelled = false;
		setLoadingAttrs(true);
		api
			.get(`/categories/by-id/${categoryId}/attributes`)
			.then((r) => {
				if (cancelled) return;
				setCategoryAttributes(r.data.data ?? []);
				setGroupingAttrId("");
				setMembers([]);
				setLoadingAttrs(false);
			})
			.catch(() => {
				if (!cancelled) {
					setCategoryAttributes([]);
					setLoadingAttrs(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [categoryId]);

	// ─── Reset members when grouping attr changes ────────────────────────
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets on groupingAttrId change; setMembers is stable
	useEffect(() => {
		setMembers([]);
	}, [groupingAttrId]);

	// ─── Combobox helpers ────────────────────────────────────────────────
	const searchCategories = useCallback(
		async (q: string) => {
			if (!q) return categoryItems.slice(0, 50);
			const ql = q.toLowerCase();
			return categoryItems
				.filter((c) => c.label.toLowerCase().includes(ql))
				.slice(0, 50);
		},
		[categoryItems],
	);
	const getCategoryById = useCallback(
		async (id: string) => categoryItems.find((c) => c.id === id) ?? null,
		[categoryItems],
	);
	const searchBrands = useCallback(
		async (q: string) => {
			if (!q) return brandItems.slice(0, 50);
			const ql = q.toLowerCase();
			return brandItems
				.filter((b) => b.label.toLowerCase().includes(ql))
				.slice(0, 50);
		},
		[brandItems],
	);
	const getBrandById = useCallback(
		async (id: string) => brandItems.find((b) => b.id === id) ?? null,
		[brandItems],
	);

	// ─── Member helpers ──────────────────────────────────────────────────
	function addMember(valueId: string) {
		const attrValue = selectedGroupingAttr?.values?.find(
			(v) => v.id === valueId,
		);
		if (!attrValue) return;
		const suggestion = name.trim()
			? `${name.trim()} — ${attrValue.value}`
			: attrValue.value;
		const newMember: MemberRow = {
			_key: uid(),
			attribute_value_id: valueId,
			name: suggestion,
			price: "",
			sku: "",
			is_primary: members.length === 0,
		};
		setMembers((prev) => [...prev, newMember]);
	}

	function addAllValues() {
		const vals = selectedGroupingAttr?.values ?? [];
		const newMembers: MemberRow[] = [];
		for (const v of vals) {
			if (usedValueIds.has(v.id)) continue;
			const suggestion = name.trim() ? `${name.trim()} — ${v.value}` : v.value;
			newMembers.push({
				_key: uid(),
				attribute_value_id: v.id,
				name: suggestion,
				price: "",
				sku: "",
				is_primary: false,
			});
		}
		setMembers((prev) => {
			const next = [...prev, ...newMembers];
			// ensure one primary
			if (next.length > 0 && !next.some((m) => m.is_primary)) {
				next[0] = { ...next[0], is_primary: true };
			}
			return next;
		});
	}

	function removeMember(key: string) {
		setMembers((prev) => {
			const next = prev.filter((m) => m._key !== key);
			// if primary was removed, promote first
			if (next.length > 0 && !next.some((m) => m.is_primary)) {
				next[0] = { ...next[0], is_primary: true };
			}
			return next;
		});
	}

	function setPrimary(key: string) {
		setMembers((prev) =>
			prev.map((m) => ({ ...m, is_primary: m._key === key })),
		);
	}

	function updateMember(key: string, patch: Partial<Omit<MemberRow, "_key">>) {
		setMembers((prev) =>
			prev.map((m) => (m._key === key ? { ...m, ...patch } : m)),
		);
	}

	// ─── Validation ──────────────────────────────────────────────────────
	function validate(): Record<string, string> {
		const errs: Record<string, string> = {};
		if (!name.trim()) errs.name = "Family name is required";
		if (!categoryId) errs.category_id = "Category is required";
		if (!groupingAttrId)
			errs.grouping_attribute_id = "Select a grouping attribute";
		if (members.length === 0) errs.members = "Add at least one member";
		for (const [i, m] of members.entries()) {
			if (!m.attribute_value_id)
				errs[`member_${i}_value`] = `Row ${i + 1}: pick a value`;
			const p = Number(m.price);
			if (!m.price || Number.isNaN(p) || p <= 0) {
				errs[`member_${i}_price`] = `Row ${i + 1}: price must be > 0`;
			}
		}
		// duplicate values
		const valueIds = members.map((m) => m.attribute_value_id);
		const dupes = valueIds.filter((v, i) => valueIds.indexOf(v) !== i);
		if (dupes.length > 0)
			errs.members_dup = "Each attribute value may only be used once";
		return errs;
	}

	// ─── Submit ──────────────────────────────────────────────────────────
	async function handleSubmit() {
		const errs = validate();
		if (Object.keys(errs).length > 0) {
			setErrors(errs);
			return;
		}
		setErrors({});

		const payload: CreateProductGroupPayload = {
			name: name.trim(),
			grouping_attribute_id: groupingAttrId,
			listing_mode: listingMode,
			shared: {
				category_id: categoryId,
				...(brandId ? { brand_id: brandId } : {}),
				...(shortDescription.trim()
					? { short_description: shortDescription.trim() }
					: {}),
				...(description.trim() ? { description: description.trim() } : {}),
			},
			members: members.map((m) => ({
				attribute_value_id: m.attribute_value_id,
				name: m.name.trim(),
				price: Math.round(Number(m.price) * 100),
				...(m.sku.trim() ? { sku: m.sku.trim() } : {}),
				is_primary: m.is_primary,
			})),
		};

		try {
			await createGroup(payload);
			toast({ title: "Color family created" });
			router.push("/products");
		} catch (err: unknown) {
			const msg =
				(err as { response?: { data?: { message?: string } } })?.response?.data
					?.message ?? "Something went wrong. Try again.";
			toast({ title: "Error", description: msg, variant: "destructive" });
		}
	}

	/* ══════════════════════════════════════════════════════════════════════
	   Render
	   ══════════════════════════════════════════════════════════════════════ */

	const hasErrors = Object.keys(errors).length > 0;

	return (
		<div className="max-w-3xl space-y-6 pb-10">
			{/* Error banner */}
			{hasErrors && (
				<div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
					<WarningCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
					<div className="text-sm text-red-700 space-y-0.5">
						{Object.values(errors).map((e, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static order
							<p key={i}>{e}</p>
						))}
					</div>
				</div>
			)}

			{/* ── Basic info ──────────────────────────────────────────────────── */}
			<Card className="border-gray-200 shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Family Details</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<Label className="text-sm font-medium text-gray-700">
							Family Name <span className="text-red-500">*</span>
						</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Linen Book Cloth Collection"
							className={`mt-1 ${errors.name ? "border-red-300 focus-visible:ring-red-200" : ""}`}
						/>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<Label className="text-sm font-medium text-gray-700">
								Category <span className="text-red-500">*</span>
							</Label>
							<div
								className={`mt-1 ${errors.category_id ? "[&>div>button]:border-red-300" : ""}`}
							>
								<EntityCombobox
									value={categoryId || null}
									onChange={(id) => setCategoryId(id ?? "")}
									search={searchCategories}
									getById={getCategoryById}
									placeholder="Search categories…"
									emptyMessage="No matching categories"
									disabled={loadingRefs}
								/>
							</div>
						</div>
						<div>
							<Label className="text-sm font-medium text-gray-700">Brand</Label>
							<div className="mt-1">
								<EntityCombobox
									value={brandId || null}
									onChange={(id) => setBrandId(id ?? "")}
									search={searchBrands}
									getById={getBrandById}
									placeholder="Search brands…"
									emptyMessage="No matching brands"
									disabled={loadingRefs}
								/>
							</div>
						</div>
					</div>

					<div>
						<Label className="text-sm font-medium text-gray-700">
							Short Description
						</Label>
						<Input
							value={shortDescription}
							onChange={(e) => setShortDescription(e.target.value)}
							placeholder="One-line tagline shown in listing"
							className="mt-1"
						/>
					</div>

					<div>
						<Label className="text-sm font-medium text-gray-700">
							Description
						</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Describe the collection — shared across all colours"
							rows={3}
							className="mt-1"
						/>
					</div>
				</CardContent>
			</Card>

			{/* ── Grouping attribute ───────────────────────────────────────────── */}
			<Card className="border-gray-200 shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<Swatches size={16} />
						Grouping Attribute
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{!categoryId ? (
						<p className="text-sm text-gray-400">Select a category first.</p>
					) : loadingAttrs ? (
						<p className="text-sm text-gray-400 flex items-center gap-2">
							<Spinner size={14} className="animate-spin" />
							Loading attributes…
						</p>
					) : groupableAttributes.length === 0 ? (
						<p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
							No groupable attributes on this category — mark one as groupable
							in admin.
						</p>
					) : (
						<div>
							<Label className="text-sm font-medium text-gray-700">
								Group by <span className="text-red-500">*</span>
							</Label>
							<select
								value={groupingAttrId}
								onChange={(e) => setGroupingAttrId(e.target.value)}
								className={`mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${
									errors.grouping_attribute_id
										? "border-red-300"
										: "border-input"
								}`}
							>
								<option value="">— select attribute —</option>
								{groupableAttributes.map((a) => (
									<option key={a.id} value={a.id}>
										{a.name}
									</option>
								))}
							</select>
						</div>
					)}
				</CardContent>
			</Card>

			{/* ── Listing mode ────────────────────────────────────────────────── */}
			<Card className="border-gray-200 shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<List size={16} />
						Listing Mode
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<button
							type="button"
							onClick={() => setListingMode("collapsed")}
							className={`text-left p-4 rounded-xl border-2 transition-all ${
								listingMode === "collapsed"
									? "border-amber-400 bg-amber-50/40"
									: "border-gray-200 hover:border-gray-300 bg-white"
							}`}
						>
							<div className="flex items-center gap-2 mb-1">
								<LinkIcon
									size={16}
									className={
										listingMode === "collapsed"
											? "text-amber-700"
											: "text-gray-500"
									}
								/>
								<span
									className={`text-sm font-semibold ${listingMode === "collapsed" ? "text-amber-800" : "text-gray-700"}`}
								>
									Collapsed
								</span>
								{listingMode === "collapsed" && (
									<Check size={14} className="text-amber-700 ml-auto" />
								)}
							</div>
							<p className="text-xs text-gray-500">
								Show as one listing with a color swatch picker — shoppers stay
								on one page.
							</p>
						</button>

						<button
							type="button"
							onClick={() => setListingMode("individual")}
							className={`text-left p-4 rounded-xl border-2 transition-all ${
								listingMode === "individual"
									? "border-amber-400 bg-amber-50/40"
									: "border-gray-200 hover:border-gray-300 bg-white"
							}`}
						>
							<div className="flex items-center gap-2 mb-1">
								<List
									size={16}
									className={
										listingMode === "individual"
											? "text-amber-700"
											: "text-gray-500"
									}
								/>
								<span
									className={`text-sm font-semibold ${listingMode === "individual" ? "text-amber-800" : "text-gray-700"}`}
								>
									Individual
								</span>
								{listingMode === "individual" && (
									<Check size={14} className="text-amber-700 ml-auto" />
								)}
							</div>
							<p className="text-xs text-gray-500">
								Each colour appears as its own listing — linked via "also
								available in" swatches.
							</p>
						</button>
					</div>
				</CardContent>
			</Card>

			{/* ── Members ─────────────────────────────────────────────────────── */}
			{selectedGroupingAttr && (
				<Card className="border-gray-200 shadow-sm">
					<CardHeader className="pb-3">
						<CardTitle className="text-base flex items-center gap-2">
							<Swatches size={16} />
							Colours / Members
						</CardTitle>
						<p className="text-xs text-gray-400 mt-1">
							Each row becomes an individual product in this family. Set a price
							per colour.
						</p>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Error messages */}
						{(errors.members || errors.members_dup) && (
							<p className="text-sm text-red-600 flex items-center gap-1.5">
								<WarningCircle size={14} />
								{errors.members ?? errors.members_dup}
							</p>
						)}

						{/* Existing member rows */}
						{members.length > 0 && (
							<div className="space-y-3">
								{members.map((m, i) => {
									const attrVal = selectedGroupingAttr.values?.find(
										(v) => v.id === m.attribute_value_id,
									);
									const hasPriceErr = !!errors[`member_${i}_price`];
									return (
										<div
											key={m._key}
											className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-3"
										>
											{/* Row header */}
											<div className="flex items-center gap-3">
												{/* Color swatch */}
												{attrVal?.color_hex ? (
													<div
														className="w-6 h-6 rounded-full border border-gray-200 shrink-0"
														style={{ backgroundColor: attrVal.color_hex }}
														title={attrVal.value}
													/>
												) : attrVal?.swatch_image_url ? (
													<img
														src={attrVal.swatch_image_url}
														alt={attrVal?.value ?? ""}
														className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0"
													/>
												) : (
													<div className="w-6 h-6 rounded-full bg-gray-200 shrink-0" />
												)}

												<span className="text-sm font-medium text-gray-800 flex-1">
													{attrVal?.value ?? m.attribute_value_id}
												</span>

												{/* Primary radio */}
												<label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer shrink-0">
													<input
														type="radio"
														name="primary_member"
														checked={m.is_primary}
														onChange={() => setPrimary(m._key)}
														className="accent-amber-500"
													/>
													Primary
												</label>

												<button
													type="button"
													onClick={() => removeMember(m._key)}
													className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
													aria-label="Remove member"
												>
													<Trash size={16} />
												</button>
											</div>

											{/* Row fields */}
											<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
												<div className="sm:col-span-1">
													<Label className="text-xs font-medium text-gray-600">
														Product Name
													</Label>
													<Input
														value={m.name}
														onChange={(e) =>
															updateMember(m._key, { name: e.target.value })
														}
														placeholder="Name for this colour"
														className="mt-1 text-sm"
													/>
												</div>
												<div>
													<Label className="text-xs font-medium text-gray-600">
														Price (AED) <span className="text-red-500">*</span>
													</Label>
													<Input
														type="number"
														min={0.01}
														step={0.01}
														value={m.price}
														onChange={(e) =>
															updateMember(m._key, { price: e.target.value })
														}
														placeholder="0.00"
														className={`mt-1 text-sm ${hasPriceErr ? "border-red-300" : ""}`}
													/>
												</div>
												<div>
													<Label className="text-xs font-medium text-gray-600">
														SKU
													</Label>
													<Input
														value={m.sku}
														onChange={(e) =>
															updateMember(m._key, { sku: e.target.value })
														}
														placeholder="Optional"
														className="mt-1 text-sm"
													/>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}

						{/* Add controls */}
						<div className="flex flex-wrap gap-2">
							{availableValues.length > 0 && (
								<>
									<select
										className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
										defaultValue=""
										onChange={(e) => {
											if (e.target.value) {
												addMember(e.target.value);
												e.target.value = "";
											}
										}}
									>
										<option value="">Add a colour…</option>
										{availableValues.map((v) => (
											<option key={v.id} value={v.id}>
												{v.value}
											</option>
										))}
									</select>

									{availableValues.length > 1 && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addAllValues}
										>
											<Plus size={14} className="mr-1" />
											Add all remaining ({availableValues.length})
										</Button>
									)}
								</>
							)}

							{availableValues.length === 0 && members.length > 0 && (
								<p className="text-xs text-gray-400">
									All available values have been added.
								</p>
							)}

							{availableValues.length === 0 &&
								members.length === 0 &&
								(selectedGroupingAttr.values?.length ?? 0) === 0 && (
									<p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
										This attribute has no values defined — add values in admin
										first.
									</p>
								)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* ── Actions ──────────────────────────────────────────────────────── */}
			<div className="flex items-center justify-between pt-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => router.push("/products")}
				>
					<ArrowLeft size={16} className="mr-1.5" />
					Back to Products
				</Button>

				<Button
					type="button"
					disabled={isPending}
					onClick={handleSubmit}
					className="bg-amber-600 hover:bg-amber-700 text-white"
				>
					{isPending ? (
						<Spinner size={16} className="mr-1.5 animate-spin" />
					) : (
						<Check size={16} className="mr-1.5" />
					)}
					Create Color Family
				</Button>
			</div>
		</div>
	);
}
