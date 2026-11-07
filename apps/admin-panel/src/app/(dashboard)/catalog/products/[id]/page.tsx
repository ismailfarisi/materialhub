"use client";

import type { LookupItem } from "@/components/ui/entity-combobox";
import { api } from "@/lib/api";
import { useProductContentAiSettings } from "@/lib/queries/ai-settings";
import {
	type AdminProductPayload,
	useAdjustInventory,
	useAdminProduct,
	useApproveProduct,
	useDeleteAdminProduct,
	useDeleteProductImage,
	useDeleteVariant,
	useGenerateProductAiDraft,
	useGenerateVariants,
	useProcessProductImage,
	usePublishProduct,
	useRejectProduct,
	useRestockInventory,
	useToggleFeatureProduct,
	useUnpublishProduct,
	useUpdateAdminProduct,
	useUpdateVariant,
} from "@/lib/queries/products";
import {
	type CategoryAttributeLink,
	type ProductAttributeDraft,
	ProductAttributesEditor,
	type ProductEditorial,
	Skeleton,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	hydrateProductAttributes,
	missingRequiredAttributes,
	serializeProductAttributes,
	splitCategoryAttributes,
} from "@materialhub/ui";
import { toast } from "@materialhub/ui";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BasicInfoTab } from "./components/BasicInfoTab";
import { EditorialTab } from "./components/EditorialTab";
import { MediaTab } from "./components/MediaTab";
import { OverviewTab } from "./components/OverviewTab";
import { PricingTab } from "./components/PricingTab";
import {
	ProductAiEnhanceDialog,
	type ProductTranslationDraft,
	applyProductAiDraftToState,
} from "./components/ProductAiEnhanceDialog";
import { ProductHeader } from "./components/ProductHeader";
import { RejectDialog } from "./components/RejectDialog";
import { SeoTab } from "./components/SeoTab";
import { VariantsTab } from "./components/VariantsTab";

function formatPrice(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

type CategoryRow = {
	id: string;
	name: string;
	children?: CategoryRow[];
};

type BrandRow = {
	id: string;
	name: string;
};

type AttributeRow = {
	id: string;
	name: string;
};

type ProductTranslationRow = ProductTranslationDraft["ar"] & {
	locale: "ar";
};

type ApiError = {
	response?: {
		data?: {
			message?: string;
		};
	};
};

function getApiErrorMessage(error: unknown, fallback = "Failed") {
	return (error as ApiError)?.response?.data?.message ?? fallback;
}

export default function ProductDetailPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();

	const { data: product, isLoading } = useAdminProduct(id);
	const { mutate: updateProduct, isPending: updating } =
		useUpdateAdminProduct();
	const { mutate: deleteProduct } = useDeleteAdminProduct();
	const { mutate: approveProduct, isPending: approving } = useApproveProduct();
	const { mutate: rejectProduct, isPending: rejecting } = useRejectProduct();
	const { mutate: publishProduct, isPending: publishing } = usePublishProduct();
	const { mutate: unpublishProduct } = useUnpublishProduct();
	const { mutate: toggleFeature } = useToggleFeatureProduct();
	const { mutate: processImage } = useProcessProductImage();
	const { mutate: deleteImage } = useDeleteProductImage();
	const { mutate: generateVariants } = useGenerateVariants();
	const { mutate: updateVariant } = useUpdateVariant();
	const { mutate: deleteVariant } = useDeleteVariant();
	const { mutate: restockInventory } = useRestockInventory();
	const { mutate: adjustInventory } = useAdjustInventory();

	const [editing, setEditing] = useState(false);
	const [rejectOpen, setRejectOpen] = useState(false);
	const [rejectReason, setRejectReason] = useState("");

	// Edit form state
	const [editName, setEditName] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [editIngredients, setEditIngredients] = useState("");
	const [editUsageInstructions, setEditUsageInstructions] = useState("");
	const [editPrice, setEditPrice] = useState("");
	const [editCompareAtPrice, setEditCompareAtPrice] = useState("");
	const [editCostPrice, setEditCostPrice] = useState("");
	const [editSku, setEditSku] = useState("");
	const [editBarcode, setEditBarcode] = useState("");
	const [editMetaTitle, setEditMetaTitle] = useState("");
	const [editMetaDescription, setEditMetaDescription] = useState("");
	const [editIsFeatured, setEditIsFeatured] = useState(false);
	const [editIsDigital, setEditIsDigital] = useState(false);
	const [editTags, setEditTags] = useState("");
	const [aiDialogOpen, setAiDialogOpen] = useState(false);
	const productAiSettings = useProductContentAiSettings();
	const generateAiDraft = useGenerateProductAiDraft();
	const [editTranslations, setEditTranslations] =
		useState<ProductTranslationDraft>({
			ar: {
				name: "",
				description: "",
				ingredients: "",
				usage_instructions: "",
				meta_title: "",
				meta_description: "",
			},
		});

	// Category/brand/attribute loaders
	const [categories, setCategories] = useState<CategoryRow[]>([]);
	const [brands, setBrands] = useState<BrandRow[]>([]);
	const [attributes, setAttributes] = useState<AttributeRow[]>([]);
	const [categoryAttributes, setCategoryAttributes] = useState<
		CategoryAttributeLink[]
	>([]);
	// Variant-defining attributes (Size, Color…) live in the Variants tab, not here
	const descriptiveAttributes = useMemo(
		() => splitCategoryAttributes(categoryAttributes).descriptive,
		[categoryAttributes],
	);
	const [productAttributes, setProductAttributes] =
		useState<ProductAttributeDraft>({});
	const [editCategoryId, setEditCategoryId] = useState("");
	const [editBrandId, setEditBrandId] = useState("");

	useEffect(() => {
		api.get("/categories/tree").then((r) => setCategories(r.data.data ?? []));
		api
			.get("/brands")
			.then((r) => setBrands(r.data.data?.items ?? r.data.data ?? []));
		api
			.get("/admin/attributes")
			.then((r) => setAttributes(r.data.data?.data ?? r.data.data ?? []));
	}, []);

	const flattenCategoriesAsBreadcrumb = useCallback(
		(cats: CategoryRow[], parentPath = ""): LookupItem[] => {
			const result: LookupItem[] = [];
			for (const cat of cats) {
				const label = parentPath ? `${parentPath} › ${cat.name}` : cat.name;
				result.push({ id: cat.id, label });
				if (cat.children?.length)
					result.push(...flattenCategoriesAsBreadcrumb(cat.children, label));
			}
			return result;
		},
		[],
	);

	const categoryItems = useMemo<LookupItem[]>(
		() => flattenCategoriesAsBreadcrumb(categories),
		[categories, flattenCategoriesAsBreadcrumb],
	);
	const brandItems = useMemo<LookupItem[]>(
		() => brands.map((b) => ({ id: b.id, label: b.name })),
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

	// Attribute values loader
	type AttrValueRow = {
		id: string;
		value: string;
		display_value?: string | null;
		color_hex?: string | null;
	};
	const [attrValuesMap, setAttrValuesMap] = useState<
		Record<string, AttrValueRow[]>
	>({});

	async function fetchAttrValues(attrId: string): Promise<AttrValueRow[]> {
		const r = await api.get(`/admin/attributes/${attrId}/values`);
		return (r.data.data ?? []) as AttrValueRow[];
	}

	function loadAttrValues(attrId: string) {
		if (!attrId || attrValuesMap[attrId]) return;
		fetchAttrValues(attrId).then((values) => {
			setAttrValuesMap((prev) => ({ ...prev, [attrId]: values }));
		});
	}

	async function reloadAttrValues(attrId: string) {
		if (!attrId) return;
		const values = await fetchAttrValues(attrId);
		setAttrValuesMap((prev) => ({ ...prev, [attrId]: values }));
	}

	async function createAttrValue(
		attrId: string,
		body: { value: string; display_value?: string; color_hex?: string | null },
	): Promise<AttrValueRow> {
		const r = await api.post(`/admin/attributes/${attrId}/values`, body);
		return r.data.data as AttrValueRow;
	}

	// Attribute search (for variant picker)
	const attributeItems = useMemo<LookupItem[]>(
		() => attributes.map((a) => ({ id: a.id, label: a.name })),
		[attributes],
	);
	const searchAttributes = useCallback(
		async (q: string) => {
			if (!q) return attributeItems.slice(0, 50);
			const ql = q.toLowerCase();
			return attributeItems
				.filter((a) => a.label.toLowerCase().includes(ql))
				.slice(0, 50);
		},
		[attributeItems],
	);
	const getAttributeById = useCallback(
		async (id: string) => attributeItems.find((a) => a.id === id) ?? null,
		[attributeItems],
	);

	useEffect(() => {
		if (product) {
			setEditName(product.name ?? "");
			setEditDescription(product.description ?? "");
			setEditIngredients(product.ingredients ?? "");
			setEditUsageInstructions(product.usage_instructions ?? "");
			setEditPrice(product.price ? (product.price / 100).toString() : "");
			setEditCompareAtPrice(
				product.compare_at_price
					? (product.compare_at_price / 100).toString()
					: "",
			);
			setEditCostPrice(
				product.cost_price ? (product.cost_price / 100).toString() : "",
			);
			setEditSku(product.sku ?? "");
			setEditBarcode(product.barcode ?? "");
			setEditMetaTitle(product.meta_title ?? "");
			setEditMetaDescription(product.meta_description ?? "");
			setEditIsFeatured(product.is_featured ?? false);
			setEditIsDigital(product.is_digital ?? false);
			setEditTags(product.tags?.join(", ") ?? "");
			setEditCategoryId(product.category_id ?? "");
			setEditBrandId(product.brand_id ?? "");

			const arTranslation = product.translations?.find(
				(t: ProductTranslationRow) => t.locale === "ar",
			);
			setEditTranslations({
				ar: {
					name: arTranslation?.name ?? "",
					description: arTranslation?.description ?? "",
					ingredients: arTranslation?.ingredients ?? "",
					usage_instructions: arTranslation?.usage_instructions ?? "",
					meta_title: arTranslation?.meta_title ?? "",
					meta_description: arTranslation?.meta_description ?? "",
				},
			});
		}
	}, [product]);

	// Hydrate the attribute draft from the product. Skipped while editing so an
	// in-progress edit isn't clobbered when the category attributes finish loading.
	useEffect(() => {
		if (!product || editing) return;
		const rows = product.attributeValues ?? product.attribute_values ?? [];
		setProductAttributes(hydrateProductAttributes(rows, categoryAttributes));
	}, [product, editing, categoryAttributes]);

	useEffect(() => {
		if (!editCategoryId) {
			setCategoryAttributes([]);
			return;
		}
		api
			.get(`/categories/by-id/${editCategoryId}/attributes`)
			.then((r) => setCategoryAttributes(r.data.data ?? []))
			.catch(() => setCategoryAttributes([]));
	}, [editCategoryId]);

	function handleSave() {
		const missing = missingRequiredAttributes(
			productAttributes,
			descriptiveAttributes,
		);
		if (missing.length > 0) {
			toast({
				title: "Missing required attributes",
				description: `Saving anyway — please set: ${missing.join(", ")}`,
				variant: "destructive",
			});
		}
		const payload: { id: string } & AdminProductPayload = {
			id,
			name: editName,
			description: editDescription || undefined,
			ingredients: editIngredients || undefined,
			usage_instructions: editUsageInstructions || undefined,
			category_id: editCategoryId || undefined,
			brand_id: editBrandId || null,
			price: Math.round(Number(editPrice) * 100),
			compare_at_price: editCompareAtPrice
				? Math.round(Number(editCompareAtPrice) * 100)
				: null,
			cost_price: editCostPrice
				? Math.round(Number(editCostPrice) * 100)
				: null,
			sku: editSku || undefined,
			barcode: editBarcode || undefined,
			meta_title: editMetaTitle || undefined,
			meta_description: editMetaDescription || undefined,
			is_featured: editIsFeatured,
			is_digital: editIsDigital,
			tags: editTags
				? editTags
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean)
				: [],
			attributes: serializeProductAttributes(productAttributes),
			translations: [
				{
					locale: "ar",
					name: editTranslations.ar.name,
					description: editTranslations.ar.description || null,
					ingredients: editTranslations.ar.ingredients || null,
					usage_instructions: editTranslations.ar.usage_instructions || null,
					meta_title: editTranslations.ar.meta_title || null,
					meta_description: editTranslations.ar.meta_description || null,
				},
			],
		};

		updateProduct(payload, {
			onSuccess: () => {
				toast({ title: "Product updated" });
				setEditing(false);
			},
			onError: (err: unknown) =>
				toast({
					title: "Error",
					description: getApiErrorMessage(err),
					variant: "destructive",
				}),
		});
	}

	/** Status actions report both outcomes; failures show the API's reason (e.g. missing images). */
	function statusActionCallbacks(successTitle: string, errorTitle: string) {
		return {
			onSuccess: () => toast({ title: successTitle }),
			onError: (err: unknown) =>
				toast({
					title: errorTitle,
					description: getApiErrorMessage(err),
					variant: "destructive" as const,
				}),
		};
	}

	function handleRejectSubmit() {
		if (!rejectReason.trim()) return;
		rejectProduct(
			{ id, reason: rejectReason },
			{
				onSuccess: () => {
					toast({ title: "Product rejected" });
					setRejectOpen(false);
					setRejectReason("");
				},
				onError: (err: unknown) =>
					toast({
						title: "Error",
						description: getApiErrorMessage(err),
						variant: "destructive",
					}),
			},
		);
	}

	async function applyAiDraft() {
		try {
			const draft = await generateAiDraft.mutateAsync(id);
			const mapped = applyProductAiDraftToState(draft, categoryAttributes);
			if (mapped.productPatch.name) setEditName(mapped.productPatch.name);
			if (mapped.productPatch.description)
				setEditDescription(mapped.productPatch.description);
			if (mapped.productPatch.ingredients)
				setEditIngredients(mapped.productPatch.ingredients);
			if (mapped.productPatch.usage_instructions)
				setEditUsageInstructions(mapped.productPatch.usage_instructions);
			if (mapped.productPatch.meta_title)
				setEditMetaTitle(mapped.productPatch.meta_title);
			if (mapped.productPatch.meta_description)
				setEditMetaDescription(mapped.productPatch.meta_description);
			if (mapped.productPatch.tags) setEditTags(mapped.productPatch.tags);
			setEditTranslations(mapped.translationPatch);
			setProductAttributes((prev) => ({ ...prev, ...mapped.attributePatch }));
			setEditing(true);
			setAiDialogOpen(false);
			toast({
				title: "AI draft applied",
				description: mapped.warnings.length
					? mapped.warnings.join(" ")
					: "Review the draft before saving.",
			});
		} catch (err: unknown) {
			toast({
				title: "AI generation failed",
				description: getApiErrorMessage(
					err,
					"Could not generate product draft.",
				),
				variant: "destructive",
			});
		}
	}

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-64 w-full rounded-xl" />
			</div>
		);
	}

	if (!product) {
		return (
			<div className="text-center py-12 text-taupe">Product not found.</div>
		);
	}

	return (
		<div className="space-y-6">
			<ProductHeader
				product={product}
				editing={editing}
				setEditing={setEditing}
				updating={updating}
				approving={approving}
				rejecting={rejecting}
				publishing={publishing}
				onSave={handleSave}
				onBack={() => router.back()}
				onDelete={() => {
					if (confirm("Delete this product?")) {
						deleteProduct(id, {
							onSuccess: () => {
								toast({ title: "Product deleted" });
								router.push("/catalog/products");
							},
						});
					}
				}}
				onApprove={() =>
					approveProduct(id, statusActionCallbacks("Product approved", "Couldn't approve product"))
				}
				onRejectOpen={() => setRejectOpen(true)}
				onPublish={() =>
					publishProduct(id, statusActionCallbacks("Product published", "Couldn't publish product"))
				}
				onUnpublish={() =>
					unpublishProduct(
						id,
						statusActionCallbacks("Product unpublished", "Couldn't unpublish product"),
					)
				}
				onToggleFeature={() =>
					toggleFeature(id, statusActionCallbacks("Featured flag updated", "Couldn't update featured flag"))
				}
				onAiEnhanceOpen={() => setAiDialogOpen(true)}
				aiEnhanceBusy={generateAiDraft.isPending}
			/>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="basic">Basic Info</TabsTrigger>
					<TabsTrigger value="attributes">Attributes</TabsTrigger>
					<TabsTrigger value="media">Media</TabsTrigger>
					<TabsTrigger value="pricing">Pricing & Inventory</TabsTrigger>
					<TabsTrigger value="variants">Variants</TabsTrigger>
					<TabsTrigger value="editorial">Editorial</TabsTrigger>
					<TabsTrigger value="seo">SEO & Settings</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="mt-4">
					<OverviewTab
						product={product}
						formatPrice={formatPrice}
						formatDate={formatDate}
					/>
				</TabsContent>

				<TabsContent value="basic" className="mt-4">
					<BasicInfoTab
						product={product}
						editing={editing}
						editName={editName}
						setEditName={setEditName}
						editDescription={editDescription}
						setEditDescription={setEditDescription}
						editIngredients={editIngredients}
						setEditIngredients={setEditIngredients}
						editUsageInstructions={editUsageInstructions}
						setEditUsageInstructions={setEditUsageInstructions}
						editCategoryId={editCategoryId}
						setEditCategoryId={setEditCategoryId}
						editBrandId={editBrandId}
						setEditBrandId={setEditBrandId}
						editTags={editTags}
						setEditTags={setEditTags}
						categoryItems={categoryItems}
						brandItems={brandItems}
						searchCategories={searchCategories}
						getCategoryById={getCategoryById}
						searchBrands={searchBrands}
						getBrandById={getBrandById}
						editTranslations={editTranslations}
						setEditTranslations={setEditTranslations}
					/>
				</TabsContent>

				<TabsContent value="attributes" className="mt-4">
					<ProductAttributesEditor
						categoryAttributes={descriptiveAttributes}
						value={productAttributes}
						onChange={setProductAttributes}
						editing={editing}
					/>
				</TabsContent>

				<TabsContent value="media" className="mt-4">
					<MediaTab
						product={product}
						editing={editing}
						processImage={processImage}
						deleteImage={deleteImage}
					/>
				</TabsContent>

				<TabsContent value="pricing" className="mt-4">
					<PricingTab
						product={product}
						editing={editing}
						editPrice={editPrice}
						setEditPrice={setEditPrice}
						editCompareAtPrice={editCompareAtPrice}
						setEditCompareAtPrice={setEditCompareAtPrice}
						editCostPrice={editCostPrice}
						setEditCostPrice={setEditCostPrice}
						editSku={editSku}
						setEditSku={setEditSku}
						editBarcode={editBarcode}
						setEditBarcode={setEditBarcode}
						formatPrice={formatPrice}
						restockInventory={restockInventory}
						adjustInventory={adjustInventory}
					/>
				</TabsContent>

				<TabsContent value="variants" className="mt-4">
					<VariantsTab
						product={product}
						editing={editing}
						attributes={attributes}
						attrValuesMap={attrValuesMap}
						loadAttrValues={loadAttrValues}
						reloadAttrValues={reloadAttrValues}
						createAttrValue={createAttrValue}
						searchAttributes={searchAttributes}
						getAttributeById={getAttributeById}
						processImage={processImage}
						deleteImage={deleteImage}
						deleteVariant={deleteVariant}
						generateVariants={generateVariants}
						updateVariant={updateVariant}
						restockInventory={restockInventory}
						adjustInventory={adjustInventory}
						formatPrice={formatPrice}
					/>
				</TabsContent>

				<TabsContent value="editorial" className="mt-4">
					<EditorialTab
						product={product}
						editing={editing}
						onSave={async (editorial: ProductEditorial | null) => {
							await new Promise<void>((resolve, reject) => {
								updateProduct(
									{ id, editorial },
									{
										onSuccess: () => resolve(),
										onError: (err: unknown) =>
											reject(new Error(getApiErrorMessage(err))),
									},
								);
							});
						}}
					/>
				</TabsContent>

				<TabsContent value="seo" className="mt-4">
					<SeoTab
						product={product}
						editing={editing}
						editMetaTitle={editMetaTitle}
						setEditMetaTitle={setEditMetaTitle}
						editMetaDescription={editMetaDescription}
						setEditMetaDescription={setEditMetaDescription}
						editIsFeatured={editIsFeatured}
						setEditIsFeatured={setEditIsFeatured}
						editIsDigital={editIsDigital}
						setEditIsDigital={setEditIsDigital}
						editTranslations={editTranslations}
						setEditTranslations={setEditTranslations}
					/>
				</TabsContent>
			</Tabs>

			<RejectDialog
				open={rejectOpen}
				onOpenChange={setRejectOpen}
				rejectReason={rejectReason}
				setRejectReason={setRejectReason}
				onSubmit={handleRejectSubmit}
				rejecting={rejecting}
			/>

			<ProductAiEnhanceDialog
				open={aiDialogOpen}
				onOpenChange={setAiDialogOpen}
				configured={Boolean(
					productAiSettings.data?.enabled &&
						productAiSettings.data?.model &&
						productAiSettings.data?.base_url &&
						(productAiSettings.data?.api_key_set ||
							productAiSettings.data?.env_key_set),
				)}
				generating={generateAiDraft.isPending}
				onGenerate={applyAiDraft}
			/>
		</div>
	);
}
