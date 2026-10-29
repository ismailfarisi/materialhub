"use client";

import { AttributeValueQuickAdd } from "@/components/products/attribute-value-quick-add";
import {
	EntityCombobox,
	type LookupItem,
} from "@/components/ui/entity-combobox";
import { api } from "@/lib/api";
import { useCreateAdminProduct } from "@/lib/queries/products";
import { useVendors } from "@/lib/queries/vendors";
import { useVendorWarehouses } from "@/lib/queries/warehouses";
import { s3UploadClient } from "@/lib/s3-upload-client";
import {
	Button,
	EMPTY_VARIANT_MATRIX,
	EditorialEditor,
	ImageUploader,
	Input,
	MAX_VARIANT_COMBINATIONS,
	type ProductAttributeDraft,
	ProductAttributesEditor,
	type ProductEditorial,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Textarea,
	VariantMatrixEditor,
	type VariantMatrixValue,
	buildVariantRowsPayload,
	minVariantPriceFils,
	missingRequiredAttributes,
	rowsMissingPrice,
	serializeProductAttributes,
	splitCategoryAttributes,
	toast,
	useS3Upload,
	variantCombinations,
} from "@materialhub/ui";
import {
	ArrowLeft,
	ArrowRight,
	Layers,
	Loader2,
	Package,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function NewProductPage() {
	const router = useRouter();
	const { mutate: createProduct, isPending } = useCreateAdminProduct();
	const [step, setStep] = useState(0);
	const [error, setError] = useState("");

	// Product type — variable products price per variant, simple products price here
	const [hasVariants, setHasVariants] = useState(false);
	const [typeChosen, setTypeChosen] = useState(false);

	const STEPS = useMemo(() => {
		const steps = ["Basic Info"];
		if (hasVariants) steps.push("Variants");
		steps.push("Pricing & Inventory", "Media", "Editorial", "SEO & Settings");
		return steps;
	}, [hasVariants]);
	const stepKey = STEPS[step];

	// Data loaders
	const { data: vendorsData } = useVendors({ limit: 200 });
	const [categories, setCategories] = useState<any[]>([]);
	const [brands, setBrands] = useState<any[]>([]);
	const [categoryAttributes, setCategoryAttributes] = useState<any[]>([]);
	const [productAttributes, setProductAttributes] =
		useState<ProductAttributeDraft>({});

	const { descriptive: descriptiveAttributes, variantAxes } = useMemo(
		() => splitCategoryAttributes(categoryAttributes),
		[categoryAttributes],
	);

	useEffect(() => {
		api.get("/categories/tree").then((r) => setCategories(r.data.data ?? []));
		api
			.get("/brands")
			.then((r) => setBrands(r.data.data?.data ?? r.data.data ?? []));
	}, []);

	const vendorOptions = useMemo(() => {
		const vendors = vendorsData?.items ?? vendorsData?.data ?? [];
		return vendors.map((v: any) => ({ label: v.name, value: v.id }));
	}, [vendorsData]);

	function flattenCategoriesAsBreadcrumb(
		cats: any[],
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

	const categoryItems = useMemo<LookupItem[]>(
		() => flattenCategoriesAsBreadcrumb(categories),
		[categories],
	);
	const brandItems = useMemo<LookupItem[]>(
		() => brands.map((b: any) => ({ id: b.id, label: b.name })),
		[brands],
	);

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

	// ─── Step 1: Basic Info ──────────────────────────────────────────
	const [vendorId, setVendorId] = useState("");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [richDescription, setRichDescription] = useState("");
	const [ingredients, setIngredients] = useState("");
	const [usageInstructions, setUsageInstructions] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [additionalCategoryIds, setAdditionalCategoryIds] = useState<string[]>(
		[],
	);
	const [brandId, setBrandId] = useState("");
	const [tags, setTags] = useState("");

	useEffect(() => {
		if (!categoryId) {
			setCategoryAttributes([]);
			return;
		}
		api
			.get(`/categories/by-id/${categoryId}/attributes`)
			.then((r) => setCategoryAttributes(r.data.data ?? []))
			.catch(() => setCategoryAttributes([]));
	}, [categoryId]);

	// ─── Step 2: Media ───────────────────────────────────────────────
	const [stagedImages, setStagedImages] = useState<
		Array<{ file: File; alt_text: string; is_primary: boolean }>
	>([]);
	const { upload, isUploading } = useS3Upload({
		assetType: "product_image",
		client: s3UploadClient,
	});

	// ─── Step 3: Pricing & Inventory ─────────────────────────────────
	const [price, setPrice] = useState("");
	const [compareAtPrice, setCompareAtPrice] = useState("");
	const [costPrice, setCostPrice] = useState("");
	const [sku, setSku] = useState("");
	const [barcode, setBarcode] = useState("");
	const [quantity, setQuantity] = useState("");
	const [warehouseId, setWarehouseId] = useState("");
	const { data: newProductWarehouses } = useVendorWarehouses(vendorId, false);
	const defaultNewWarehouseId =
		newProductWarehouses?.find((w) => w.is_default)?.id ?? "";
	const [weightGrams, setWeightGrams] = useState("");
	const [dimensionL, setDimensionL] = useState("");
	const [dimensionW, setDimensionW] = useState("");
	const [dimensionH, setDimensionH] = useState("");
	const [countryOfOrigin, setCountryOfOrigin] = useState("");
	const [requiresShipping, setRequiresShipping] = useState(true);

	// ─── Step: Variants ──────────────────────────────────────────────
	const [variantMatrix, setVariantMatrix] =
		useState<VariantMatrixValue>(EMPTY_VARIANT_MATRIX);
	const [creatingValueForAttrId, setCreatingValueForAttrId] = useState<
		string | null
	>(null);

	async function handleQuickAddValue(
		attrId: string,
		body: { value: string; display_value?: string; color_hex?: string | null },
	) {
		setCreatingValueForAttrId(attrId);
		try {
			await api.post(`/admin/attributes/${attrId}/values`, body);
			// Axis values come from the category attributes — refetch to pick it up
			const r = await api.get(`/categories/by-id/${categoryId}/attributes`);
			setCategoryAttributes(r.data.data ?? []);
		} catch (err: any) {
			const message =
				err?.response?.data?.error?.message ??
				err?.response?.data?.message ??
				"Failed to add value";
			toast({
				title: "Could not add value",
				description: message,
				variant: "destructive",
			});
			throw err;
		} finally {
			setCreatingValueForAttrId(null);
		}
	}

	// ─── Step 5: Editorial ───────────────────────────────────────────
	const [editorial, setEditorial] = useState<ProductEditorial | null>(null);

	// ─── Step 6: SEO & Settings ──────────────────────────────────────
	const [metaTitle, setMetaTitle] = useState("");
	const [metaDescription, setMetaDescription] = useState("");
	const [metaKeywords, setMetaKeywords] = useState("");
	const [isFeatured, setIsFeatured] = useState(false);
	const [isDigital, setIsDigital] = useState(false);
	const [isCustomizable, setIsCustomizable] = useState(false);
	const [saveStatus, setSaveStatus] = useState<
		"draft" | "pending_review" | "published"
	>("draft");

	function validateStep(s: number): string | null {
		const key = STEPS[s];
		if (key === "Basic Info") {
			if (!vendorId) return "Vendor is required";
			if (!name.trim()) return "Product name is required";
			if (!categoryId) return "Category is required";
		}
		if (key === "Variants") {
			const combos = variantCombinations(variantMatrix.axes);
			if (combos.length === 0)
				return "Add at least one variant option value (e.g. Size: 30ml, 50ml)";
			if (combos.length > MAX_VARIANT_COMBINATIONS)
				return `Variant combinations exceed the limit of ${MAX_VARIANT_COMBINATIONS}`;
			const unpriced = rowsMissingPrice(variantMatrix);
			if (unpriced.length > 0)
				return `Set a price for every variant — missing: ${unpriced.slice(0, 5).join(", ")}${unpriced.length > 5 ? "…" : ""}`;
			if (buildVariantRowsPayload(variantMatrix).length === 0)
				return "At least one variant must be included";
		}
		if (key === "Pricing & Inventory" && !hasVariants) {
			if (!price || Number(price) <= 0)
				return "Price is required and must be greater than 0";
		}
		return null;
	}

	function handleNext() {
		const err = validateStep(step);
		if (err) {
			setError(err);
			return;
		}
		setError("");
		setStep((s) => s + 1);
	}

	function handleSubmit() {
		setError("");
		for (let s = 0; s < STEPS.length; s++) {
			const err = validateStep(s);
			if (err) {
				setError(err);
				setStep(s);
				return;
			}
		}
		const variantRows = hasVariants ? buildVariantRowsPayload(variantMatrix) : [];
		const missingAttrs = missingRequiredAttributes(
			productAttributes,
			descriptiveAttributes,
		);
		if (missingAttrs.length > 0) {
			toast({
				title: "Missing required attributes",
				description: `Saving anyway — please set: ${missingAttrs.join(", ")}`,
				variant: "destructive",
			});
		}
		const payload: Record<string, any> = {
			vendor_id: vendorId,
			name: name.trim(),
			description: description || undefined,
			rich_description: richDescription || undefined,
			ingredients: ingredients || undefined,
			usage_instructions: usageInstructions || undefined,
			category_id: categoryId,
			additional_category_ids:
				additionalCategoryIds.length > 0 ? additionalCategoryIds : undefined,
			brand_id: brandId || undefined,
			// Variable products derive the product price from variant prices ("from" price)
			price: hasVariants
				? (minVariantPriceFils(variantRows) ?? 0)
				: Math.round(Number(price) * 100),
			compare_at_price:
				!hasVariants && compareAtPrice
					? Math.round(Number(compareAtPrice) * 100)
					: undefined,
			cost_price: costPrice ? Math.round(Number(costPrice) * 100) : undefined,
			sku: sku || undefined,
			barcode: barcode || undefined,
			quantity_on_hand: !hasVariants && quantity ? Number(quantity) : undefined,
			warehouse_id: hasVariants
				? undefined
				: warehouseId || defaultNewWarehouseId || undefined,
			weight_grams: weightGrams ? Number(weightGrams) : undefined,
			country_of_origin: countryOfOrigin || undefined,
			requires_shipping: requiresShipping,
			tags: tags
				? tags
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean)
				: undefined,
			meta_title: metaTitle || undefined,
			meta_description: metaDescription || undefined,
			meta_keywords: metaKeywords
				? metaKeywords
						.split(",")
						.map((k) => k.trim())
						.filter(Boolean)
				: undefined,
			is_featured: isFeatured,
			is_digital: isDigital,
			is_customizable: isCustomizable,
			status:
				saveStatus === "published"
					? "published"
					: saveStatus === "pending_review"
						? "pending_review"
						: "draft",
			editorial: editorial,
			attributes: serializeProductAttributes(productAttributes),
		};

		if (dimensionL && dimensionW && dimensionH) {
			payload.dimensions_cm = {
				length: Number(dimensionL),
				width: Number(dimensionW),
				height: Number(dimensionH),
			};
		}

		createProduct(payload, {
			onSuccess: async (data) => {
				const productId = data?.id ?? data?.product?.id;

				// Upload images collected in step 2
				for (const img of stagedImages) {
					try {
						const result = await upload(img.file);
						if (!("key" in result)) throw new Error("Expected key from upload");
						await api.post("/media/process", {
							key: result.key,
							product_id: productId,
							alt_text: img.alt_text || undefined,
							is_primary: img.is_primary,
						});
					} catch {
						// Image upload failure is non-fatal
					}
				}

				// Create the variant rows configured in the Variants step
				if (variantRows.length > 0) {
					try {
						await api.post(`/admin/products/${productId}/variants`, {
							variants: variantRows,
						});
					} catch {
						// Variant creation failure is non-fatal — can be done from detail page
						toast({
							title: "Warning",
							description:
								"Product created but variant creation failed. You can add variants from the product detail page.",
							variant: "destructive",
						});
					}
				}

				toast({
					title: "Product created",
					description: "The product has been created successfully.",
				});
				router.push(`/catalog/products/${productId}`);
			},
			onError: (err: any) => {
				const msg = err?.response?.data?.message ?? "Failed to create product.";
				setError(msg);
				toast({ title: "Error", description: msg, variant: "destructive" });
			},
		});
	}

	if (!typeChosen) {
		return (
			<div className="space-y-6 max-w-3xl">
				<div className="flex items-center gap-3">
					<button
						onClick={() => router.back()}
						className="p-2 rounded-lg hover:bg-pearl/100 text-taupe"
					>
						<ArrowLeft size={18} />
					</button>
					<div>
						<h1 className="text-2xl font-bold text-cacao">Add Product</h1>
						<p className="text-taupe text-sm">
							What kind of product is this?
						</p>
					</div>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<button
						type="button"
						onClick={() => {
							setHasVariants(false);
							setTypeChosen(true);
						}}
						className="text-left p-6 rounded-xl border border-gray-200 bg-linen hover:border-primary transition-colors space-y-3"
					>
						<Package size={22} className="text-primary" />
						<div>
							<h3 className="font-semibold text-cacao">Simple Product</h3>
							<p className="text-sm text-taupe mt-1">
								A single item with one price and one stock count.
							</p>
						</div>
					</button>
					<button
						type="button"
						onClick={() => {
							setHasVariants(true);
							setTypeChosen(true);
						}}
						className="text-left p-6 rounded-xl border border-gray-200 bg-linen hover:border-primary transition-colors space-y-3"
					>
						<Layers size={22} className="text-primary" />
						<div>
							<h3 className="font-semibold text-cacao">Variable Product</h3>
							<p className="text-sm text-taupe mt-1">
								Comes in options like size or shade — each variant has its own
								price, SKU, and stock.
							</p>
						</div>
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6 max-w-3xl">
			{/* Header */}
			<div className="flex items-center gap-3">
				<button
					onClick={() => router.back()}
					className="p-2 rounded-lg hover:bg-pearl/100 text-taupe"
				>
					<ArrowLeft size={18} />
				</button>
				<div className="flex-1">
					<h1 className="text-2xl font-bold text-cacao">Add Product</h1>
					<p className="text-taupe text-sm">
						Create a new {hasVariants ? "variable" : "simple"} product on behalf
						of a vendor.{" "}
						<button
							type="button"
							onClick={() => {
								setTypeChosen(false);
								setStep(0);
							}}
							className="underline underline-offset-2 hover:text-cacao"
						>
							Change type
						</button>
					</p>
				</div>
			</div>

			{/* Step indicator */}
			<div className="flex items-center gap-2">
				{STEPS.map((label, i) => (
					<div key={label} className="flex items-center gap-2">
						<div
							className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
								i < step
									? "bg-green-100 text-green-700"
									: i === step
										? "bg-primary text-white"
										: "bg-pearl/100 text-taupe"
							}`}
						>
							{i + 1}
						</div>
						<span
							className={`text-sm hidden sm:inline ${i === step ? "font-medium text-cacao" : "text-taupe"}`}
						>
							{label}
						</span>
						{i < STEPS.length - 1 && <Separator className="w-8" />}
					</div>
				))}
			</div>

			{error && (
				<div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
					{error}
				</div>
			)}

			{/* Step content */}
			<div className="rounded-xl border border-gray-200 bg-linen p-6 space-y-5">
				{stepKey === "Basic Info" && (
					<>
						<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
							Basic Info
						</h2>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Vendor *
							</label>
							<Select
								value={vendorId}
								onValueChange={(v) => {
									setVendorId(v);
									setWarehouseId("");
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select vendor..." />
								</SelectTrigger>
								<SelectContent>
									{vendorOptions.map((opt: any) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Product Name *
							</label>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Product name"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Description
							</label>
							<Textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Short description..."
								rows={3}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Rich Description
							</label>
							<Textarea
								value={richDescription}
								onChange={(e) => setRichDescription(e.target.value)}
								placeholder="Detailed description..."
								rows={4}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Ingredients
							</label>
							<Textarea
								value={ingredients}
								onChange={(e) => setIngredients(e.target.value)}
								placeholder="Aqua, Glycerin, Niacinamide..."
								rows={3}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Usage Instructions
							</label>
							<Textarea
								value={usageInstructions}
								onChange={(e) => setUsageInstructions(e.target.value)}
								placeholder="Apply a small amount to clean skin..."
								rows={3}
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Category *
								</label>
								<EntityCombobox
									value={categoryId || null}
									onChange={(id) => setCategoryId(id ?? "")}
									search={searchCategories}
									getById={getCategoryById}
									placeholder="Search categories…"
									emptyMessage="No matching categories"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Brand
								</label>
								<EntityCombobox
									value={brandId || null}
									onChange={(id) => setBrandId(id ?? "")}
									search={searchBrands}
									getById={getBrandById}
									placeholder="Search brands…"
									emptyMessage="No matching brands"
								/>
							</div>
						</div>
						{descriptiveAttributes.length > 0 && (
							<ProductAttributesEditor
								categoryAttributes={descriptiveAttributes}
								value={productAttributes}
								onChange={setProductAttributes}
								editing
							/>
						)}
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Tags
							</label>
							<Input
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="tag1, tag2, tag3"
							/>
							<p className="mt-1 text-xs text-taupe">Comma-separated tags.</p>
						</div>
					</>
				)}

				{stepKey === "Media" && (
					<>
						<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
							Media
						</h2>
						<p className="text-sm text-taupe">
							Upload product images. The first image will be set as primary. You
							can manage images in full from the product detail page after
							creation.
						</p>
						<ImageUploader
							images={[]}
							isUploading={isUploading}
							maxImages={20}
							onUpload={(files) => {
								const remaining = 20 - stagedImages.length;
								if (remaining <= 0) {
									toast({
										title: "Image cap reached",
										description: "Maximum 20 images per product.",
										variant: "destructive",
									});
									return;
								}
								const truncated = files.slice(0, remaining);
								if (truncated.length < files.length) {
									toast({
										title: "Some images skipped",
										description: `Only ${truncated.length} of ${files.length} added — 20-image cap reached.`,
									});
								}
								const newImages = truncated.map((file, i) => ({
									file,
									alt_text: "",
									is_primary: stagedImages.length === 0 && i === 0,
								}));
								setStagedImages((prev) => [...prev, ...newImages]);
							}}
							onRemove={() => {}}
							onReorder={() => {}}
						/>
						{stagedImages.length > 0 && (
							<div className="space-y-2">
								<p className="text-xs text-taupe font-medium">
									{stagedImages.length} / 20 images staged for upload
								</p>
								{stagedImages.map((img, idx) => (
									<div
										key={idx}
										className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 bg-white"
									>
										<span className="text-xs text-taupe truncate flex-1">
											{img.file.name}
										</span>
										<label className="flex items-center gap-1.5 text-xs">
											<input
												type="radio"
												name="primary_image"
												checked={img.is_primary}
												onChange={() =>
													setStagedImages(
														stagedImages.map((im, i) => ({
															...im,
															is_primary: i === idx,
														})),
													)
												}
											/>
											Primary
										</label>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="text-red-500 h-6 w-6 p-0"
											onClick={() =>
												setStagedImages(
													stagedImages.filter((_, i) => i !== idx),
												)
											}
										>
											<Trash2 size={12} />
										</Button>
									</div>
								))}
							</div>
						)}
					</>
				)}

				{stepKey === "Pricing & Inventory" && (
					<>
						<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
							{hasVariants ? "Cost & Inventory" : "Pricing & Inventory"}
						</h2>
						{hasVariants && (
							<p className="text-sm text-taupe">
								Selling price and stock are set per variant in the Variants
								step. The product's listed "from" price is derived from the
								cheapest variant.
							</p>
						)}
						<div className="grid grid-cols-3 gap-4">
							{!hasVariants && (
								<>
									<div>
										<label className="block text-sm font-medium text-cacao mb-1">
											Price (AED) *
										</label>
										<Input
											type="number"
											step="0.01"
											value={price}
											onChange={(e) => setPrice(e.target.value)}
											placeholder="0.00"
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-cacao mb-1">
											Compare-at Price
										</label>
										<Input
											type="number"
											step="0.01"
											value={compareAtPrice}
											onChange={(e) => setCompareAtPrice(e.target.value)}
											placeholder="0.00"
										/>
									</div>
								</>
							)}
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Cost Price
								</label>
								<Input
									type="number"
									step="0.01"
									value={costPrice}
									onChange={(e) => setCostPrice(e.target.value)}
									placeholder="0.00"
								/>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-4">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									SKU
								</label>
								<Input
									value={sku}
									onChange={(e) => setSku(e.target.value)}
									placeholder="SKU-001"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Barcode
								</label>
								<Input
									value={barcode}
									onChange={(e) => setBarcode(e.target.value)}
									placeholder="EAN/UPC"
								/>
							</div>
							{!hasVariants && (
								<div>
									<label className="block text-sm font-medium text-cacao mb-1">
										Quantity on Hand
									</label>
									<Input
										type="number"
										value={quantity}
										onChange={(e) => setQuantity(e.target.value)}
										placeholder="0"
									/>
								</div>
							)}
							{!hasVariants && (newProductWarehouses ?? []).length > 0 && (
								<div>
									<label className="block text-sm font-medium text-cacao mb-1">
										Warehouse
									</label>
									<Select
										value={warehouseId || defaultNewWarehouseId}
										onValueChange={setWarehouseId}
									>
										<SelectTrigger>
											<SelectValue placeholder="Default warehouse" />
										</SelectTrigger>
										<SelectContent>
											{(newProductWarehouses ?? []).map((w) => (
												<SelectItem key={w.id} value={w.id}>
													{w.name}
													{w.is_default ? " (default)" : ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</div>
						<Separator />
						<h3 className="text-sm font-semibold text-cacao">
							Shipping & Physical
						</h3>
						<div className="grid grid-cols-3 gap-4">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Weight (grams)
								</label>
								<Input
									type="number"
									value={weightGrams}
									onChange={(e) => setWeightGrams(e.target.value)}
									placeholder="0"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Country of Origin
								</label>
								<Input
									value={countryOfOrigin}
									onChange={(e) => setCountryOfOrigin(e.target.value)}
									placeholder="AE"
								/>
							</div>
							<div className="flex items-end pb-2">
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={requiresShipping}
										onChange={(e) => setRequiresShipping(e.target.checked)}
										className="rounded"
									/>
									Requires Shipping
								</label>
							</div>
						</div>
						<div className="grid grid-cols-3 gap-4">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Length (cm)
								</label>
								<Input
									type="number"
									value={dimensionL}
									onChange={(e) => setDimensionL(e.target.value)}
									placeholder="0"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Width (cm)
								</label>
								<Input
									type="number"
									value={dimensionW}
									onChange={(e) => setDimensionW(e.target.value)}
									placeholder="0"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Height (cm)
								</label>
								<Input
									type="number"
									value={dimensionH}
									onChange={(e) => setDimensionH(e.target.value)}
									placeholder="0"
								/>
							</div>
						</div>
					</>
				)}

				{stepKey === "Variants" && (
					<>
						<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
							Variants
						</h2>
						<p className="text-sm text-taupe">
							Pick the values this product comes in, then set a price (and
							optionally SKU / stock) for each generated variant.
						</p>
						<VariantMatrixEditor
							variantAttributes={variantAxes}
							value={variantMatrix}
							onChange={setVariantMatrix}
							renderAxisExtras={(attribute) => (
								<AttributeValueQuickAdd
									attributeType={attribute.type}
									busy={creatingValueForAttrId === attribute.id}
									onSubmit={(body) => handleQuickAddValue(attribute.id, body)}
								/>
							)}
						/>
					</>
				)}

				{stepKey === "Editorial" && (
					<>
						<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
							Editorial
						</h2>
						<p className="text-sm text-taupe">
							Optional. Add rich editorial content — story sections, how-to
							guides, hero imagery, and short film embeds.
						</p>
						<EditorialEditor
							value={editorial}
							onChange={setEditorial}
							uploadClient={s3UploadClient}
						/>
					</>
				)}

				{stepKey === "SEO & Settings" && (
					<>
						<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
							SEO & Settings
						</h2>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Meta Title
							</label>
							<Input
								value={metaTitle || name}
								onChange={(e) => setMetaTitle(e.target.value)}
								placeholder="SEO title"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Meta Description
							</label>
							<Textarea
								value={metaDescription}
								onChange={(e) => setMetaDescription(e.target.value)}
								placeholder="SEO description..."
								rows={2}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Meta Keywords
							</label>
							<Input
								value={metaKeywords}
								onChange={(e) => setMetaKeywords(e.target.value)}
								placeholder="keyword1, keyword2"
							/>
						</div>
						<Separator />
						<h3 className="text-sm font-semibold text-cacao">Flags</h3>
						<div className="flex flex-wrap gap-4">
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={isFeatured}
									onChange={(e) => setIsFeatured(e.target.checked)}
									className="rounded"
								/>
								Featured
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={isDigital}
									onChange={(e) => setIsDigital(e.target.checked)}
									className="rounded"
								/>
								Digital Product
							</label>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={isCustomizable}
									onChange={(e) => setIsCustomizable(e.target.checked)}
									className="rounded"
								/>
								Customizable
							</label>
						</div>
						<Separator />
						<h3 className="text-sm font-semibold text-cacao">Save As</h3>
						<div className="flex gap-3">
							{[
								{ label: "Draft", value: "draft" as const },
								{
									label: "Submit for Review",
									value: "pending_review" as const,
								},
								{ label: "Approve & Publish", value: "published" as const },
							].map((opt) => (
								<label
									key={opt.value}
									className="flex items-center gap-2 text-sm"
								>
									<input
										type="radio"
										name="save_status"
										checked={saveStatus === opt.value}
										onChange={() => setSaveStatus(opt.value)}
									/>
									{opt.label}
								</label>
							))}
						</div>
					</>
				)}
			</div>

			{/* Navigation */}
			<div className="flex items-center justify-between">
				<Button
					variant="outline"
					onClick={() => (step > 0 ? setStep((s) => s - 1) : router.back())}
					disabled={isPending}
				>
					<ArrowLeft size={16} className="mr-1.5" />
					{step > 0 ? "Back" : "Cancel"}
				</Button>

				{step < STEPS.length - 1 ? (
					<Button onClick={handleNext}>
						Next
						<ArrowRight size={16} className="ml-1.5" />
					</Button>
				) : (
					<Button onClick={handleSubmit} disabled={isPending}>
						{isPending && <Loader2 size={16} className="mr-1.5 animate-spin" />}
						{isPending ? "Creating..." : "Create Product"}
					</Button>
				)}
			</div>
		</div>
	);
}
