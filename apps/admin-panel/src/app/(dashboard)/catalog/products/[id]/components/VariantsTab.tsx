"use client";

import { s3UploadClient } from "@/lib/s3-upload-client";
import {
	Button,
	Card,
	CardContent,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ImageUploader,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
	useS3Upload,
} from "@materialhub/ui";
import { toast } from "@materialhub/ui";
import {
	Check,
	ChevronDown,
	ChevronRight,
	ImagePlus,
	Plus,
	RotateCw,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EntityCombobox, type LookupItem } from "@/components/ui/entity-combobox";
import { AttributeValueQuickAdd } from "@/components/products/attribute-value-quick-add";
import { useVendorWarehouses } from "@/lib/queries/warehouses";

interface EditableVariantFields {
	price: string;
	compare_at_price: string;
	cost_price: string;
	sku: string;
	barcode: string;
	weight_grams: string;
	dimensions_length: string;
	dimensions_width: string;
	dimensions_height: string;
	sort_order: string;
}

interface VariantsTabProps {
	product: any;
	editing: boolean;
	attributes: any[];
	attrValuesMap: Record<
		string,
		Array<{
			id: string;
			value: string;
			label?: string;
			display_value?: string | null;
			color_hex?: string | null;
		}>
	>;
	loadAttrValues: (attrId: string) => void;
	reloadAttrValues: (attrId: string) => Promise<void>;
	createAttrValue: (
		attrId: string,
		body: { value: string; display_value?: string; color_hex?: string | null },
	) => Promise<{ id: string; value: string; display_value?: string | null; color_hex?: string | null }>;
	searchAttributes: (q: string) => Promise<LookupItem[]>;
	getAttributeById: (id: string) => Promise<LookupItem | null>;
	processImage: (
		params: {
			productId: string;
			key: string;
			altText?: string;
			isPrimary?: boolean;
			variantId?: string;
		},
		opts?: { onSuccess?: () => void; onError?: (e: unknown) => void },
	) => void;
	deleteImage: (params: any) => void;
	deleteVariant: (params: any, options?: any) => void;
	generateVariants: (params: any, options?: any) => void;
	updateVariant: (params: any, options?: any) => void;
	restockInventory: (params: any, options?: any) => void;
	adjustInventory: (params: any, options?: any) => void;
	formatPrice: (fils: number) => string;
}

function VariantImageUpload({
	productId,
	variantId,
	processImage,
}: {
	productId: string;
	variantId: string;
	processImage: (params: any, opts?: any) => void;
}) {
	const { upload, isUploading } = useS3Upload({
		assetType: "product_image",
		client: s3UploadClient,
	});
	return (
		<ImageUploader
			images={[]}
			isUploading={isUploading}
			maxImages={1}
			onUpload={async (files) => {
				const file = files[0];
				if (!file) return;
				try {
					const result = await upload(file);
					if (!("key" in result)) throw new Error("Expected key");
					processImage({ productId, key: result.key, variantId });
					toast({ title: "Variant image added" });
				} catch (e) {
					toast({
						title: "Upload failed",
						description: (e as Error).message,
						variant: "destructive",
					});
				}
			}}
			onRemove={() => {}}
			onReorder={() => {}}
		/>
	);
}

export function VariantsTab({
	product,
	editing,
	attributes,
	attrValuesMap,
	loadAttrValues,
	reloadAttrValues,
	createAttrValue,
	searchAttributes,
	getAttributeById,
	processImage,
	deleteImage,
	deleteVariant,
	generateVariants,
	updateVariant,
	restockInventory,
	adjustInventory,
	formatPrice,
}: VariantsTabProps) {
	const [expandedVariantId, setExpandedVariantId] = useState<string | null>(
		null,
	);
	const [editingVariant, setEditingVariant] =
		useState<EditableVariantFields | null>(null);
	const [generateOpen, setGenerateOpen] = useState(false);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [activeOverrides, setActiveOverrides] = useState<
		Record<string, boolean>
	>({});

	// Inventory action state
	const [inventoryAction, setInventoryAction] = useState<
		"restock" | "adjust" | null
	>(null);
	const [inventoryQty, setInventoryQty] = useState("");
	const [inventoryReason, setInventoryReason] = useState("");
	const [inventoryWarehouseId, setInventoryWarehouseId] = useState("");
	const { data: vendorWarehouses } = useVendorWarehouses(
		(product as any).vendor_id,
		false,
	);
	const defaultWarehouseId =
		vendorWarehouses?.find((w) => w.is_default)?.id ?? "";

	// Generate section state
	const [variantOptions, setVariantOptions] = useState<
		Array<{ attribute_id: string; values: string; selectedValueIds: string[] }>
	>([]);
	const [refreshingAttrId, setRefreshingAttrId] = useState<string | null>(null);
	const [creatingValueForAttrId, setCreatingValueForAttrId] = useState<string | null>(null);

	async function handleRefreshValues(attrId: string) {
		if (!attrId) return;
		setRefreshingAttrId(attrId);
		try {
			await reloadAttrValues(attrId);
		} finally {
			setRefreshingAttrId(null);
		}
	}

	async function handleQuickAddValue(
		attrId: string,
		optionIdx: number,
		body: { value: string; display_value?: string; color_hex?: string | null },
	) {
		setCreatingValueForAttrId(attrId);
		try {
			const created = await createAttrValue(attrId, body);
			await reloadAttrValues(attrId);
			setVariantOptions((prev) => {
				const next = [...prev];
				const opt = next[optionIdx];
				if (opt && opt.attribute_id === attrId && !opt.selectedValueIds.includes(created.id)) {
					next[optionIdx] = { ...opt, selectedValueIds: [...opt.selectedValueIds, created.id] };
				}
				return next;
			});
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

	const variants = product.variants ?? [];
	const activeCount = variants.filter(
		(v: any) => activeOverrides[v.id] ?? v.is_active,
	).length;
	const useTableView = variants.length >= 10;

	// Map inventory records to variants by variant_id
	const inventoryByVariant: Record<string, any[]> = {};
	for (const inv of product.inventoryRecords ?? []) {
		const key = inv.variant_id ?? "__product__";
		if (!inventoryByVariant[key]) inventoryByVariant[key] = [];
		inventoryByVariant[key].push(inv);
	}

	// Auto-expand generate section when no variants and editing
	useEffect(() => {
		if (editing && !product.variants?.length) {
			setGenerateOpen(true);
		}
	}, [editing, product.variants?.length]);

	function handleExpand(v: any) {
		if (expandedVariantId === v.id) {
			setExpandedVariantId(null);
			setEditingVariant(null);
			return;
		}
		setExpandedVariantId(v.id);
		setInventoryAction(null);
		setInventoryQty("");
		setInventoryReason("");
		setEditingVariant({
			price: v.price ? (v.price / 100).toString() : "0",
			compare_at_price: v.compare_at_price
				? (v.compare_at_price / 100).toString()
				: "",
			cost_price: v.cost_price ? (v.cost_price / 100).toString() : "",
			sku: v.sku ?? "",
			barcode: v.barcode ?? "",
			weight_grams: v.weight_grams?.toString() ?? "",
			dimensions_length: v.dimensions_cm?.length?.toString() ?? "",
			dimensions_width: v.dimensions_cm?.width?.toString() ?? "",
			dimensions_height: v.dimensions_cm?.height?.toString() ?? "",
			sort_order: v.sort_order?.toString() ?? "0",
		});
	}

	function handleSaveVariant(variantId: string) {
		if (!editingVariant) return;

		const payload: Record<string, any> = {
			productId: product.id,
			variantId,
			price: Math.round(Number(editingVariant.price) * 100),
		};

		if (editingVariant.compare_at_price) {
			payload.compare_at_price = Math.round(
				Number(editingVariant.compare_at_price) * 100,
			);
		} else {
			payload.compare_at_price = null;
		}

		if (editingVariant.cost_price) {
			payload.cost_price = Math.round(Number(editingVariant.cost_price) * 100);
		} else {
			payload.cost_price = null;
		}

		payload.sku = editingVariant.sku || undefined;
		payload.barcode = editingVariant.barcode || null;
		payload.weight_grams = editingVariant.weight_grams
			? Number(editingVariant.weight_grams)
			: null;
		payload.sort_order = Number(editingVariant.sort_order) || 0;

		if (
			editingVariant.dimensions_length ||
			editingVariant.dimensions_width ||
			editingVariant.dimensions_height
		) {
			payload.dimensions_cm = {
				length: Number(editingVariant.dimensions_length) || 0,
				width: Number(editingVariant.dimensions_width) || 0,
				height: Number(editingVariant.dimensions_height) || 0,
			};
		} else {
			payload.dimensions_cm = null;
		}

		updateVariant(payload, {
			onSuccess: () => {
				toast({ title: "Variant updated" });
				setExpandedVariantId(null);
				setEditingVariant(null);
			},
			onError: (err: any) =>
				toast({
					title: "Error",
					description:
						err?.response?.data?.message ?? "Failed to update variant",
					variant: "destructive",
				}),
		});
	}

	function StockBadge({ variant }: { variant: any }) {
		const inventory = inventoryByVariant[variant.id];
		if (!inventory || inventory.length === 0) {
			return (
				<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-pearl/50 text-taupe">
					&mdash;
				</span>
			);
		}
		const qty = inventory.reduce(
			(sum: number, inv: any) => sum + (inv.quantity_available ?? 0),
			0,
		);
		const threshold = inventory.reduce(
			(sum: number, inv: any) => sum + (inv.low_stock_threshold ?? 5),
			0,
		);

		const color =
			qty === 0
				? "bg-red-50 text-red-700"
				: qty <= threshold
					? "bg-yellow-50 text-yellow-700"
					: "bg-green-50 text-green-700";

		return (
			<span
				className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
			>
				{qty}
			</span>
		);
	}

	const compareAtPriceInvalid =
		editingVariant &&
		editingVariant.compare_at_price &&
		Number(editingVariant.compare_at_price) < Number(editingVariant.price);

	return (
		<Card>
			<CardContent className="p-6 space-y-4">
				{/* Summary header */}
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-4">
						<h3 className="text-sm font-semibold text-cacao">
							Variants ({variants.length})
						</h3>
						{variants.length > 0 && (
							<div className="flex items-center gap-3 text-xs text-taupe">
								<span className="flex items-center gap-1">
									<span className="w-2 h-2 rounded-full bg-green-500" />
									Active: {activeCount}
								</span>
								<span className="flex items-center gap-1">
									<span className="w-2 h-2 rounded-full bg-pearl/300" />
									Inactive: {variants.length - activeCount}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Empty state */}
				{variants.length === 0 && !editing && (
					<p className="text-sm text-taupe text-center py-8">
						No variants defined. Click Edit to add variants.
					</p>
				)}

				{/* Table header (10+ variants) */}
				{useTableView && variants.length > 0 && (
					<div className="flex items-center gap-4 px-3 py-2 text-xs font-medium text-taupe uppercase tracking-wider border-b border-gray-200">
						<span className="w-4" />
						<span className="flex-1">Variant</span>
						<span className="w-24">Price</span>
						<span className="w-28">SKU</span>
						<span className="w-16">Stock</span>
						<span className="w-6">Active</span>
					</div>
				)}

				{/* Variant list */}
				{variants.map((v: any) => {
					const variantImages =
						product.images?.filter((img: any) => img.variant_id === v.id) ?? [];

					return (
						<div
							key={v.id}
							className={`cursor-pointer ${useTableView ? "border-b border-gray-100" : "rounded-lg border border-gray-200 mb-2"}`}
						>
							{/* Collapsed row */}
							<div
								className="flex items-center gap-4 p-3 hover:bg-pearl/50 transition-colors"
								onClick={() => handleExpand(v)}
							>
								<span className="text-taupe shrink-0">
									{expandedVariantId === v.id ? (
										<ChevronDown size={16} />
									) : (
										<ChevronRight size={16} />
									)}
								</span>
								{/* Variant image thumbnail */}
								{(() => {
									const variantImg =
										product.images?.find(
											(img: any) => img.variant_id === v.id,
										) ??
										product.images?.find((img: any) => img.is_primary) ??
										product.images?.[0];
									return variantImg ? (
										<div className="w-10 h-10 rounded border border-gray-200 overflow-hidden shrink-0">
											<img
												src={variantImg.url}
												alt={variantImg.alt_text || ""}
												className="w-full h-full object-cover"
											/>
										</div>
									) : (
										<div className="w-10 h-10 rounded border border-gray-200 bg-pearl/50 flex items-center justify-center shrink-0">
											<ImagePlus size={14} className="text-gray-300" />
										</div>
									);
								})()}
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-cacao truncate">
										{v.name || "Variant"}
									</p>
									<div className="flex flex-wrap gap-1 mt-0.5">
										{v.option_values &&
											Object.entries(v.option_values).map(([key, val]) => {
												const attrName =
													attributes.find((a: any) => a.id === key)?.name ??
													key.replace(/-/g, " ");
												return (
													<span
														key={key}
														className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-pearl/100 text-xs text-taupe capitalize"
													>
														{attrName}: {String(val)}
													</span>
												);
											})}
									</div>
								</div>
								<span className="text-sm font-medium text-cacao shrink-0">
									{formatPrice(v.price)}
								</span>
								<span className="text-xs text-taupe font-mono w-28 truncate shrink-0">
									{v.sku || "\u2014"}
								</span>
								<StockBadge variant={v} />
								<span
									className={`w-2.5 h-2.5 rounded-full shrink-0 ${(activeOverrides[v.id] ?? v.is_active) ? "bg-green-500" : "bg-pearl/300"}`}
								/>
							</div>

							{/* Expanded view */}
							{expandedVariantId === v.id && (
								<div className="bg-pearl/50 border-t border-gray-100 p-4 space-y-4">
									{/* Variant Name (read-only) */}
									{v.name && (
										<div>
											<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-1">
												Variant
											</h4>
											<p className="text-sm font-medium text-cacao">{v.name}</p>
										</div>
									)}

									{/* Section 1 - Pricing */}
									<div>
										<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
											Pricing
										</h4>
										<div className="grid grid-cols-3 gap-4">
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Price (AED)
												</label>
												{editing ? (
													<Input
														type="number"
														step="0.01"
														value={editingVariant?.price ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? { ...prev, price: e.target.value }
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.price ? formatPrice(v.price) : "\u2014"}
													</p>
												)}
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Compare-at Price (AED)
												</label>
												{editing ? (
													<>
														<Input
															type="number"
															step="0.01"
															value={editingVariant?.compare_at_price ?? ""}
															onChange={(e) =>
																setEditingVariant((prev) =>
																	prev
																		? {
																				...prev,
																				compare_at_price: e.target.value,
																			}
																		: prev,
																)
															}
															className="h-8 text-sm"
														/>
														{compareAtPriceInvalid && (
															<p className="text-xs text-red-500 mt-0.5">
																Must be &gt;= price
															</p>
														)}
													</>
												) : (
													<p className="text-sm text-cacao">
														{v.compare_at_price
															? formatPrice(v.compare_at_price)
															: "\u2014"}
													</p>
												)}
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Cost Price (AED)
												</label>
												{editing ? (
													<Input
														type="number"
														step="0.01"
														value={editingVariant?.cost_price ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? { ...prev, cost_price: e.target.value }
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.cost_price
															? formatPrice(v.cost_price)
															: "\u2014"}
													</p>
												)}
											</div>
										</div>
									</div>

									{/* Section 2 - Identification */}
									<div>
										<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
											Identification
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													SKU
												</label>
												{editing ? (
													<Input
														value={editingVariant?.sku ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev ? { ...prev, sku: e.target.value } : prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao font-mono">
														{v.sku || "\u2014"}
													</p>
												)}
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Barcode
												</label>
												{editing ? (
													<Input
														value={editingVariant?.barcode ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? { ...prev, barcode: e.target.value }
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao font-mono">
														{v.barcode || "\u2014"}
													</p>
												)}
											</div>
										</div>
									</div>

									{/* Section 3 - Shipping */}
									<div>
										<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
											Shipping
										</h4>
										<div className="grid grid-cols-4 gap-4">
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Weight (g)
												</label>
												{editing ? (
													<Input
														type="number"
														value={editingVariant?.weight_grams ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? { ...prev, weight_grams: e.target.value }
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.weight_grams ?? "\u2014"}
													</p>
												)}
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Length (cm)
												</label>
												{editing ? (
													<Input
														type="number"
														value={editingVariant?.dimensions_length ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? {
																			...prev,
																			dimensions_length: e.target.value,
																		}
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.dimensions_cm?.length ?? "\u2014"}
													</p>
												)}
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Width (cm)
												</label>
												{editing ? (
													<Input
														type="number"
														value={editingVariant?.dimensions_width ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? {
																			...prev,
																			dimensions_width: e.target.value,
																		}
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.dimensions_cm?.width ?? "\u2014"}
													</p>
												)}
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Height (cm)
												</label>
												{editing ? (
													<Input
														type="number"
														value={editingVariant?.dimensions_height ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? {
																			...prev,
																			dimensions_height: e.target.value,
																		}
																	: prev,
															)
														}
														className="h-8 text-sm"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.dimensions_cm?.height ?? "\u2014"}
													</p>
												)}
											</div>
										</div>
									</div>

									{/* Section 4 - Settings */}
									<div>
										<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
											Settings
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div className="flex items-center gap-3">
												<label className="text-xs font-medium text-taupe">
													Active
												</label>
												<Switch
													checked={activeOverrides[v.id] ?? v.is_active}
													onCheckedChange={(checked) => {
														setActiveOverrides((prev) => ({
															...prev,
															[v.id]: checked,
														}));
														updateVariant(
															{
																productId: product.id,
																variantId: v.id,
																is_active: checked,
															},
															{
																onSuccess: () => {
																	setActiveOverrides((prev) => {
																		const next = { ...prev };
																		delete next[v.id];
																		return next;
																	});
																},
																onError: () => {
																	setActiveOverrides((prev) => {
																		const next = { ...prev };
																		delete next[v.id];
																		return next;
																	});
																	toast({
																		title: "Failed to update",
																		variant: "destructive",
																	});
																},
															},
														);
													}}
												/>
											</div>
											<div>
												<label className="block text-xs font-medium text-taupe mb-1">
													Sort Order
												</label>
												{editing ? (
													<Input
														type="number"
														value={editingVariant?.sort_order ?? ""}
														onChange={(e) =>
															setEditingVariant((prev) =>
																prev
																	? { ...prev, sort_order: e.target.value }
																	: prev,
															)
														}
														className="h-8 text-sm w-24"
													/>
												) : (
													<p className="text-sm text-cacao">
														{v.sort_order ?? 0}
													</p>
												)}
											</div>
										</div>
									</div>

									{/* Section 5 - Inventory (read-only) */}
									<div>
										<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
											Inventory
										</h4>
										{(inventoryByVariant[v.id]?.length ?? 0) > 0 ? (
											<table className="w-full text-sm">
												<thead>
													<tr className="text-xs text-taupe uppercase tracking-wider border-b border-gray-200">
														<th className="text-left py-1.5 font-medium">
															Warehouse
														</th>
														<th className="text-right py-1.5 font-medium">
															On Hand
														</th>
														<th className="text-right py-1.5 font-medium">
															Reserved
														</th>
														<th className="text-right py-1.5 font-medium">
															Available
														</th>
														<th className="text-right py-1.5 font-medium">
															Status
														</th>
													</tr>
												</thead>
												<tbody>
													{inventoryByVariant[v.id].map(
														(inv: any, i: number) => {
															const qty = inv.quantity_available ?? 0;
															const threshold = inv.low_stock_threshold ?? 5;
															const statusColor =
																qty === 0
																	? "bg-red-50 text-red-700"
																	: qty <= threshold
																		? "bg-yellow-50 text-yellow-700"
																		: "bg-green-50 text-green-700";
															const statusLabel =
																qty === 0
																	? "Out of Stock"
																	: qty <= threshold
																		? "Low Stock"
																		: "In Stock";
															return (
																<tr
																	key={i}
																	className="border-b border-gray-100"
																>
																	<td className="py-1.5 text-cacao">
																		{inv.warehouse?.name ??
																			(inv.warehouse_id
																				? `WH-${inv.warehouse_id.slice(0, 6)}`
																				: "Default")}
																	</td>
																	<td className="py-1.5 text-right text-cacao">
																		{inv.quantity_on_hand ?? 0}
																	</td>
																	<td className="py-1.5 text-right text-cacao">
																		{inv.quantity_reserved ?? 0}
																	</td>
																	<td className="py-1.5 text-right text-cacao">
																		{qty}
																	</td>
																	<td className="py-1.5 text-right">
																		<span
																			className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
																		>
																			{statusLabel}
																		</span>
																	</td>
																</tr>
															);
														},
													)}
												</tbody>
											</table>
										) : (
											<p className="text-xs text-taupe">
												No inventory data available.
											</p>
										)}

										{/* Inventory actions */}
										{editing && (
											<div className="mt-3 space-y-2">
												{!inventoryAction ? (
													<div className="flex gap-2">
														<Button
															variant="outline"
															size="sm"
															onClick={() => {
																setInventoryAction("restock");
																setInventoryQty("");
															}}
														>
															<Plus size={14} className="mr-1" /> Restock
														</Button>
														<Button
															variant="outline"
															size="sm"
															onClick={() => {
																setInventoryAction("adjust");
																setInventoryQty("");
																setInventoryReason("");
															}}
														>
															Adjust Stock
														</Button>
													</div>
												) : (
													<div className="p-3 rounded-lg border border-gray-200 bg-linen space-y-2">
														<div className="flex items-center justify-between">
															<p className="text-xs font-semibold text-cacao">
																{inventoryAction === "restock"
																	? "Restock Inventory"
																	: "Adjust Stock"}
															</p>
															<button
																onClick={() => setInventoryAction(null)}
																className="text-taupe hover:text-taupe"
															>
																<Trash2 size={12} />
															</button>
														</div>
														<div className="flex items-end gap-2 flex-wrap">
															{(vendorWarehouses ?? []).length > 0 && (
																<div className="w-44">
																	<label className="block text-xs text-taupe mb-0.5">
																		Warehouse
																	</label>
																	<Select
																		value={inventoryWarehouseId || defaultWarehouseId}
																		onValueChange={setInventoryWarehouseId}
																	>
																		<SelectTrigger className="h-8 text-sm">
																			<SelectValue placeholder="Default" />
																		</SelectTrigger>
																		<SelectContent>
																			{(vendorWarehouses ?? []).map((w) => (
																				<SelectItem key={w.id} value={w.id}>
																					{w.name}
																					{w.is_default ? " (default)" : ""}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																</div>
															)}
															<div className="w-28">
																<label className="block text-xs text-taupe mb-0.5">
																	{inventoryAction === "restock"
																		? "Quantity"
																		: "Qty (+/-)"}
																</label>
																<Input
																	type="number"
																	value={inventoryQty}
																	onChange={(e) =>
																		setInventoryQty(e.target.value)
																	}
																	placeholder={
																		inventoryAction === "restock" ? "50" : "-10"
																	}
																	className="h-8 text-sm"
																	min={
																		inventoryAction === "restock"
																			? 1
																			: undefined
																	}
																/>
															</div>
															{inventoryAction === "adjust" && (
																<div className="flex-1">
																	<label className="block text-xs text-taupe mb-0.5">
																		Reason
																	</label>
																	<Input
																		value={inventoryReason}
																		onChange={(e) =>
																			setInventoryReason(e.target.value)
																		}
																		placeholder="e.g. Damaged goods, stock count correction"
																		className="h-8 text-sm"
																	/>
																</div>
															)}
															<Button
																size="sm"
																className="h-8"
																disabled={
																	!inventoryQty ||
																	Number(inventoryQty) === 0 ||
																	(inventoryAction === "adjust" &&
																		!inventoryReason.trim())
																}
																onClick={() => {
																	const qty = Number(inventoryQty);
																	if (!qty) return;
																	const params: any = {
																		productId: product.id,
																		variant_id: v.id,
																		quantity:
																			inventoryAction === "restock"
																				? Math.abs(qty)
																				: qty,
																	};
																	if (inventoryAction === "adjust")
																		params.reason = inventoryReason;
																	const whId =
																		inventoryWarehouseId || defaultWarehouseId;
																	if (whId) params.warehouse_id = whId;

																	const fn =
																		inventoryAction === "restock"
																			? restockInventory
																			: adjustInventory;
																	fn(params, {
																		onSuccess: () => {
																			toast({
																				title:
																					inventoryAction === "restock"
																						? "Stock added"
																						: "Stock adjusted",
																			});
																			setInventoryAction(null);
																			setInventoryQty("");
																			setInventoryReason("");
																		},
																		onError: (err: any) =>
																			toast({
																				title: "Error",
																				description:
																					err?.response?.data?.message ??
																					"Failed",
																				variant: "destructive",
																			}),
																	});
																}}
															>
																{inventoryAction === "restock"
																	? "Add Stock"
																	: "Apply"}
															</Button>
														</div>
														{inventoryAction === "adjust" && (
															<p className="text-xs text-taupe">
																Use positive numbers to add, negative to remove.
															</p>
														)}
													</div>
												)}
											</div>
										)}
									</div>

									{/* Section 6 - Images (editing only) */}
									{editing && (
										<div>
											<h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
												Images
											</h4>
											{variantImages.length > 0 && (
												<div className="flex flex-wrap gap-2 mb-3">
													{variantImages.map((img: any) => (
														<div
															key={img.id}
															className="relative group w-20 h-20 rounded border border-gray-200 overflow-hidden"
														>
															<img
																src={img.url}
																alt={img.alt_text || ""}
																className="w-full h-full object-cover"
															/>
															<button
																onClick={() =>
																	deleteImage({
																		productId: product.id,
																		imageId: img.id,
																	})
																}
																className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
															>
																<Trash2 size={10} />
															</button>
														</div>
													))}
												</div>
											)}
											<VariantImageUpload
												productId={product.id}
												variantId={v.id}
												processImage={processImage}
											/>
										</div>
									)}

									{/* Actions bar (editing only) */}
									{editing && (
										<div className="flex items-center justify-between pt-3 border-t border-gray-200">
											<Button
												variant="ghost"
												size="sm"
												className="text-red-500 hover:text-red-700 hover:bg-red-50"
												onClick={(e) => {
													e.stopPropagation();
													setDeleteConfirmId(v.id);
												}}
											>
												<Trash2 size={14} className="mr-1" /> Delete Variant
											</Button>
											<Button
												size="sm"
												disabled={!!compareAtPriceInvalid}
												onClick={(e) => {
													e.stopPropagation();
													handleSaveVariant(v.id);
												}}
											>
												Save Variant
											</Button>
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}

				{/* Collapsible Generate Section */}
				{editing && (
					<div className="border-t border-gray-200 mt-4">
						<button
							type="button"
							className="flex items-center justify-between w-full py-3 text-sm font-semibold text-cacao hover:text-cacao"
							onClick={() => setGenerateOpen(!generateOpen)}
						>
							<span>Generate Variants</span>
							{generateOpen ? (
								<ChevronDown size={16} />
							) : (
								<ChevronRight size={16} />
							)}
						</button>
						{generateOpen && (
							<div className="space-y-3 pb-4">
								<p className="text-xs text-taupe">
									Select variant attributes and pick values to generate
									combinations.
								</p>
								{variantOptions.map((opt, idx) => {
									const selectedAttr = attributes.find(
										(a: any) => a.id === opt.attribute_id,
									);
									const isSelectable =
										selectedAttr &&
										(selectedAttr.type === "select" ||
											selectedAttr.type === "color");
									const attrValues = attrValuesMap[opt.attribute_id] ?? [];

									return (
										<div
											key={idx}
											className="p-3 rounded-lg border border-gray-200 space-y-3"
										>
											<div className="flex items-end gap-3">
												<div className="flex-1">
													<label className="block text-sm font-medium text-cacao mb-1">
														Attribute
													</label>
													<EntityCombobox
														value={opt.attribute_id || null}
														onChange={(id) => {
															const v = id ?? "";
															const updated = [...variantOptions];
															updated[idx] = {
																attribute_id: v,
																values: "",
																selectedValueIds: [],
															};
															setVariantOptions(updated);
															if (v) loadAttrValues(v);
														}}
														search={searchAttributes}
														getById={getAttributeById}
														placeholder="Search attributes…"
														emptyMessage="No matching attributes"
													/>
												</div>
												<Button
													variant="ghost"
													size="sm"
													className="text-red-500"
													onClick={() =>
														setVariantOptions(
															variantOptions.filter((_, i) => i !== idx),
														)
													}
												>
													<Trash2 size={14} />
												</Button>
											</div>
											{opt.attribute_id && (
												<div>
													<div className="flex items-center justify-between mb-1">
														<label className="block text-sm font-medium text-cacao">
															Values
														</label>
														{isSelectable && (
															<button
																type="button"
																onClick={() => handleRefreshValues(opt.attribute_id)}
																disabled={refreshingAttrId === opt.attribute_id}
																className="p-1 rounded text-taupe hover:text-cacao hover:bg-pearl/50 disabled:opacity-50"
																title="Refresh values"
															>
																<RotateCw
																	size={12}
																	className={
																		refreshingAttrId === opt.attribute_id
																			? "animate-spin"
																			: ""
																	}
																/>
															</button>
														)}
													</div>
													{isSelectable ? (
														<>
															{attrValuesMap[opt.attribute_id] === undefined ? (
																<p className="text-xs text-taupe">Loading values…</p>
															) : attrValues.length > 0 ? (
																<div className="flex flex-wrap gap-2">
																	{attrValues.map((av) => {
																		const isSelected =
																			opt.selectedValueIds.includes(av.id);
																		const swatchColor = av.color_hex ?? av.value;
																		return (
																			<button
																				key={av.id}
																				type="button"
																				onClick={() => {
																					const updated = [...variantOptions];
																					const ids = isSelected
																						? opt.selectedValueIds.filter(
																								(vid) => vid !== av.id,
																							)
																						: [...opt.selectedValueIds, av.id];
																					updated[idx] = {
																						...updated[idx],
																						selectedValueIds: ids,
																					};
																					setVariantOptions(updated);
																				}}
																				className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
																					isSelected
																						? "border-primary bg-primary/10 text-primary font-medium"
																						: "border-gray-200 text-taupe hover:border-gray-300"
																				}`}
																			>
																				{selectedAttr.type === "color" && (
																					<span
																						className="w-3 h-3 rounded-full border border-gray-300"
																						style={{ backgroundColor: swatchColor }}
																					/>
																				)}
																				{av.display_value || av.label || av.value}
																				{isSelected && <Check size={12} />}
																			</button>
																		);
																	})}
																</div>
															) : (
																<p className="text-xs text-taupe">No values yet.</p>
															)}
															<AttributeValueQuickAdd
																attributeType={selectedAttr.type}
																busy={creatingValueForAttrId === opt.attribute_id}
																onSubmit={(body) =>
																	handleQuickAddValue(opt.attribute_id, idx, body)
																}
															/>
														</>
													) : (
														<>
															<Input
																value={opt.values}
																onChange={(e) => {
																	const updated = [...variantOptions];
																	updated[idx] = {
																		...updated[idx],
																		values: e.target.value,
																	};
																	setVariantOptions(updated);
																}}
																placeholder="S, M, L, XL"
															/>
															<p className="mt-0.5 text-xs text-taupe">
																Comma-separated values
															</p>
														</>
													)}
												</div>
											)}
										</div>
									);
								})}
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											setVariantOptions([
												...variantOptions,
												{ attribute_id: "", values: "", selectedValueIds: [] },
											])
										}
									>
										<Plus size={14} className="mr-1" /> Add Variant Attribute
									</Button>
									{variantOptions.length > 0 && (
										<Button
											size="sm"
											onClick={() => {
												const options = variantOptions
													.filter((o) => {
														if (!o.attribute_id) return false;
														const attr = attributes.find(
															(a: any) => a.id === o.attribute_id,
														);
														const selectable =
															attr &&
															(attr.type === "select" || attr.type === "color");
														return selectable
															? o.selectedValueIds.length > 0
															: o.values.trim().length > 0;
													})
													.map((o) => {
														const attr = attributes.find(
															(a: any) => a.id === o.attribute_id,
														);
														const selectable =
															attr &&
															(attr.type === "select" || attr.type === "color");
														return {
															attribute_id: o.attribute_id,
															values: selectable
																? o.selectedValueIds
																: o.values
																		.split(",")
																		.map((v) => v.trim())
																		.filter(Boolean),
														};
													});
												if (!options.length) {
													toast({
														title: "Please select an attribute and pick values",
														variant: "destructive",
													});
													return;
												}
												generateVariants(
													{ productId: product.id, options },
													{
														onSuccess: () => {
															toast({ title: "Variants generated" });
															setVariantOptions([]);
														},
														onError: (err: any) =>
															toast({
																title: "Error",
																description:
																	err?.response?.data?.message ?? "Failed",
																variant: "destructive",
															}),
													},
												);
											}}
										>
											Generate Variants
										</Button>
									)}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Delete confirmation dialog */}
				<Dialog
					open={!!deleteConfirmId}
					onOpenChange={(open) => !open && setDeleteConfirmId(null)}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete Variant</DialogTitle>
						</DialogHeader>
						<p className="text-sm text-taupe">
							Are you sure you want to delete the variant &ldquo;
							{variants.find((v: any) => v.id === deleteConfirmId)?.name}
							&rdquo;? This action cannot be undone.
						</p>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setDeleteConfirmId(null)}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								onClick={() => {
									if (!deleteConfirmId) return;
									deleteVariant(
										{ productId: product.id, variantId: deleteConfirmId },
										{
											onSuccess: () => {
												toast({ title: "Variant deleted" });
												setDeleteConfirmId(null);
												if (expandedVariantId === deleteConfirmId) {
													setExpandedVariantId(null);
													setEditingVariant(null);
												}
											},
											onError: (err: any) =>
												toast({
													title: "Error",
													description: err?.response?.data?.message ?? "Failed",
													variant: "destructive",
												}),
										},
									);
								}}
							>
								Delete
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}
