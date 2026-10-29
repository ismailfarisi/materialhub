"use client";

import { EntityCombobox } from "@/components/ui/entity-combobox";
import {
	getAdminProductByIdLookup,
	getAdminProductPricing,
	getAdminVariantByIdLookup,
	getAdminVariantPricing,
	searchAdminProductsLookup,
	searchAdminVariantsLookup,
} from "@/lib/queries/lookups";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DealPreviewCard,
	Input,
} from "@materialhub/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

export interface FlashDealFormInitial {
	product_id: string;
	variant_id: string | null;
	title: string;
	original_price: number; // fils
	deal_price: number; // fils
	starts_at: string; // ISO
	expires_at: string; // ISO
	quantity_limit: number | null;
}

export interface FlashDealFormSubmit {
	product_id: string;
	variant_id?: string;
	title?: string;
	original_price: number;
	deal_price: number;
	starts_at: string;
	expires_at: string;
	quantity_limit?: number;
}

export interface FlashDealFormProps {
	mode: "create" | "edit";
	initial?: FlashDealFormInitial;
	isSubmitting: boolean;
	serverError: string | null;
	onSubmit: (payload: FlashDealFormSubmit) => void;
	onCancel: () => void;
	submitLabel?: string;
}

function toLocalDateTimeInput(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const QUICK_DURATIONS: Array<{ label: string; ms: number }> = [
	{ label: "24h", ms: 24 * 3600 * 1000 },
	{ label: "3d", ms: 3 * 86400 * 1000 },
	{ label: "7d", ms: 7 * 86400 * 1000 },
	{ label: "30d", ms: 30 * 86400 * 1000 },
];

export function FlashDealForm(props: FlashDealFormProps) {
	const {
		mode,
		initial,
		isSubmitting,
		serverError,
		onSubmit,
		onCancel,
		submitLabel,
	} = props;
	const isEdit = mode === "edit";

	// Form state
	const [productId, setProductId] = useState<string | null>(
		initial?.product_id ?? null,
	);
	const [variantId, setVariantId] = useState<string | null>(
		initial?.variant_id ?? null,
	);
	const [originalPrice, setOriginalPrice] = useState<string>(
		initial ? String(initial.original_price) : "",
	);
	const [dealPrice, setDealPrice] = useState<string>(
		initial ? String(initial.deal_price) : "",
	);
	const [startsAt, setStartsAt] = useState<string>(
		toLocalDateTimeInput(initial?.starts_at ?? null),
	);
	const [expiresAt, setExpiresAt] = useState<string>(
		toLocalDateTimeInput(initial?.expires_at ?? null),
	);
	const [quantityLimit, setQuantityLimit] = useState<string>(
		initial?.quantity_limit != null ? String(initial.quantity_limit) : "",
	);
	const [title, setTitle] = useState<string>(initial?.title ?? "");

	// Field-level errors
	const [errors, setErrors] = useState<Record<string, string>>({});

	// Pricing fetches
	const productPricingQuery = useQuery({
		queryKey: ["admin", "product-pricing", productId],
		queryFn: () => getAdminProductPricing(productId as string),
		enabled: !!productId,
	});
	const variantPricingQuery = useQuery({
		queryKey: ["admin", "variant-pricing", productId, variantId],
		queryFn: () =>
			getAdminVariantPricing(productId as string, variantId as string),
		enabled: !!productId && !!variantId,
	});

	// Variant search/getById bound to the chosen productId
	const variantSearch = useCallback(
		(_q: string) => searchAdminVariantsLookup(productId ?? ""),
		[productId],
	);
	const variantGetById = useCallback(
		(vid: string) => getAdminVariantByIdLookup(productId ?? "", vid),
		[productId],
	);

	const productUnavailable =
		isEdit &&
		!productPricingQuery.isPending &&
		productPricingQuery.data == null;

	function handleProductChange(id: string | null) {
		setProductId(id);
		setVariantId(null);
	}

	// Pre-fill original_price from product/variant — create mode only, untouched fields only
	const lastPrefilledRef = useRef<string>("");
	useEffect(() => {
		if (isEdit) return;
		const referencePrice =
			(variantId ? variantPricingQuery.data?.price : null) ??
			productPricingQuery.data?.price ??
			null;
		if (referencePrice == null) return;
		const refStr = String(referencePrice);
		const currentlyEmpty = originalPrice === "";
		const stillUntouched = originalPrice === lastPrefilledRef.current;
		if (currentlyEmpty || stillUntouched) {
			setOriginalPrice(refStr);
			lastPrefilledRef.current = refStr;
		}
	}, [
		isEdit,
		variantId,
		productPricingQuery.data?.price,
		variantPricingQuery.data?.price,
		originalPrice,
	]);

	function applyDuration(ms: number) {
		const baseMs = startsAt ? new Date(startsAt).getTime() : Date.now();
		const end = new Date(baseMs + ms);
		setExpiresAt(toLocalDateTimeInput(end.toISOString()));
		if (!startsAt)
			setStartsAt(toLocalDateTimeInput(new Date(baseMs).toISOString()));
	}

	// Validation
	function validate(): boolean {
		const next: Record<string, string> = {};
		if (!productId) next.product_id = "Pick a product";
		const op = Number(originalPrice);
		const dp = Number(dealPrice);
		if (!originalPrice || !Number.isFinite(op) || op < 1)
			next.original_price = "Required";
		if (!dealPrice || !Number.isFinite(dp) || dp < 1)
			next.deal_price = "Required";
		if (!next.original_price && !next.deal_price && dp >= op) {
			next.deal_price = "Deal price must be lower than the original price";
		}
		if (!startsAt) next.starts_at = "Pick a start time";
		if (!expiresAt) next.expires_at = "Pick an end time";
		if (
			!next.starts_at &&
			!next.expires_at &&
			new Date(expiresAt).getTime() <= new Date(startsAt).getTime()
		) {
			next.expires_at = "End must be after start";
		}
		if (quantityLimit) {
			const ql = Number(quantityLimit);
			if (!Number.isFinite(ql) || ql < 1)
				next.quantity_limit = "Must be at least 1";
		}
		setErrors(next);
		return Object.keys(next).length === 0;
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!validate()) return;
		const fallbackTitle = productPricingQuery.data?.name || "Flash Deal";
		onSubmit({
			product_id: productId as string,
			variant_id: variantId ?? undefined,
			title: title.trim() || fallbackTitle,
			original_price: Number(originalPrice),
			deal_price: Number(dealPrice),
			starts_at: new Date(startsAt).toISOString(),
			expires_at: new Date(expiresAt).toISOString(),
			quantity_limit: quantityLimit ? Number(quantityLimit) : undefined,
		});
	}

	// Preview props
	const product = productPricingQuery.data ?? null;
	const variant = variantId ? (variantPricingQuery.data ?? null) : null;
	const previewProduct = product
		? {
				name: product.name,
				image_url: product.image_url,
				vendor_name: product.vendor.business_name,
				price: product.price,
				compare_at_price: product.compare_at_price,
			}
		: null;
	const startsAtDate = startsAt ? new Date(startsAt) : null;
	const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
	const op = Number(originalPrice);
	const dp = Number(dealPrice);
	const showMsrp =
		product?.compare_at_price != null &&
		product.compare_at_price > product.price;
	const helperBits: string[] = [];
	if (product) {
		helperBits.push(
			`Current selling price: ${(product.price / 100).toFixed(2)} ${product.currency}`,
		);
		if (showMsrp) {
			helperBits.push(
				`MSRP: ${((product.compare_at_price ?? 0) / 100).toFixed(2)} ${product.currency}`,
			);
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="grid grid-cols-1 lg:grid-cols-12 gap-6"
		>
			<div className="lg:col-span-8 space-y-6">
				{serverError && (
					<div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
						{serverError}
					</div>
				)}

				{/* Product */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-semibold uppercase tracking-wide">
							Product
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<span className="block text-sm font-medium mb-1">Product *</span>
							{isEdit ? (
								<div className="px-3 py-2 rounded-md border bg-muted text-sm">
									{productUnavailable ? (
										<span className="text-destructive">Product unavailable (deleted)</span>
									) : (
										product?.name ?? "Loading…"
									)}
								</div>
							) : (
								<EntityCombobox
									value={productId}
									onChange={handleProductChange}
									search={searchAdminProductsLookup}
									getById={getAdminProductByIdLookup}
									placeholder="Search products by name or SKU…"
								/>
							)}
							{errors.product_id && (
								<p className="mt-1 text-xs text-destructive">
									{errors.product_id}
								</p>
							)}
						</div>
						<div>
							<span className="block text-sm font-medium mb-1">
								Variant (optional)
							</span>
							{isEdit ? (
								<div className="px-3 py-2 rounded-md border bg-muted text-sm">
									{variant?.sku ?? (variantId ? variantId.slice(0, 8) : "—")}
								</div>
							) : (
								<EntityCombobox
									value={variantId}
									onChange={setVariantId}
									search={variantSearch}
									getById={variantGetById}
									placeholder={
										productId ? "Pick a variant…" : "Pick a product first"
									}
									emptyMessage={
										productId
											? "This product has no variants"
											: "Pick a product first"
									}
									disabled={!productId}
								/>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Pricing */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-semibold uppercase tracking-wide">
							Pricing
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label
									htmlFor="fd-original-price"
									className="block text-sm font-medium mb-1"
								>
									Original Price (fils) *
								</label>
								<Input
									id="fd-original-price"
									type="number"
									value={originalPrice}
									onChange={(e) => setOriginalPrice(e.target.value)}
									onBlur={validate}
									placeholder="10000"
								/>
								{errors.original_price && (
									<p className="mt-1 text-xs text-destructive">
										{errors.original_price}
									</p>
								)}
								{helperBits.length > 0 && !errors.original_price && (
									<p className="mt-1 text-xs text-muted-foreground">
										{helperBits.join(" · ")}
									</p>
								)}
							</div>
							<div>
								<label
									htmlFor="fd-deal-price"
									className="block text-sm font-medium mb-1"
								>
									Deal Price (fils) *
								</label>
								<Input
									id="fd-deal-price"
									type="number"
									value={dealPrice}
									onChange={(e) => setDealPrice(e.target.value)}
									onBlur={validate}
									placeholder="7500"
								/>
								{errors.deal_price && (
									<p className="mt-1 text-xs text-destructive">
										{errors.deal_price}
									</p>
								)}
							</div>
						</div>
						{Number.isFinite(op) &&
							Number.isFinite(dp) &&
							op > 0 &&
							dp > 0 &&
							dp < op && (
								<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
									<span className="text-sm text-orange-700 font-medium">
										-{Math.round(((op - dp) / op) * 100)}% · Saves{" "}
										{((op - dp) / 100).toFixed(2)} {product?.currency ?? "AED"}
									</span>
								</div>
							)}
					</CardContent>
				</Card>

				{/* Schedule */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-semibold uppercase tracking-wide">
							Schedule
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label
									htmlFor="fd-starts-at"
									className="block text-sm font-medium mb-1"
								>
									Starts At *
								</label>
								<Input
									id="fd-starts-at"
									type="datetime-local"
									value={startsAt}
									onChange={(e) => setStartsAt(e.target.value)}
									onBlur={validate}
								/>
								{errors.starts_at && (
									<p className="mt-1 text-xs text-destructive">
										{errors.starts_at}
									</p>
								)}
							</div>
							<div>
								<label
									htmlFor="fd-expires-at"
									className="block text-sm font-medium mb-1"
								>
									Expires At *
								</label>
								<Input
									id="fd-expires-at"
									type="datetime-local"
									value={expiresAt}
									onChange={(e) => setExpiresAt(e.target.value)}
									onBlur={validate}
								/>
								{errors.expires_at && (
									<p className="mt-1 text-xs text-destructive">
										{errors.expires_at}
									</p>
								)}
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<span className="text-xs text-muted-foreground self-center">
								Quick:
							</span>
							{QUICK_DURATIONS.map((d) => (
								<Button
									key={d.label}
									type="button"
									variant="outline"
									size="sm"
									onClick={() => applyDuration(d.ms)}
								>
									{d.label}
								</Button>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Limits & Title */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-semibold uppercase tracking-wide">
							Limits &amp; Title
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label
								htmlFor="fd-quantity-limit"
								className="block text-sm font-medium mb-1"
							>
								Quantity Limit
							</label>
							<Input
								id="fd-quantity-limit"
								type="number"
								value={quantityLimit}
								onChange={(e) => setQuantityLimit(e.target.value)}
								onBlur={validate}
								placeholder="Unlimited"
							/>
							{errors.quantity_limit && (
								<p className="mt-1 text-xs text-destructive">
									{errors.quantity_limit}
								</p>
							)}
							<p className="mt-1 text-xs text-muted-foreground">
								Maximum number of units that can be sold at this price.
							</p>
						</div>
						<div>
							<label
								htmlFor="fd-title"
								className="block text-sm font-medium mb-1"
							>
								Deal Title
							</label>
							<Input
								id="fd-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="e.g. Weekend Flash Sale"
							/>
						</div>
					</CardContent>
				</Card>

				<div className="flex items-center justify-between">
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting
							? "Saving…"
							: (submitLabel ??
								(isEdit ? "Save changes" : "Create flash deal"))}
					</Button>
				</div>
			</div>

			<div className="lg:col-span-4 order-first lg:order-none">
				<div className="lg:sticky lg:top-6">
					{productUnavailable ? (
						<div className="rounded-xl border-2 border-dashed border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
							Product unavailable. The product for this deal has been deleted, but you can still adjust the deal's pricing and schedule.
						</div>
					) : (
						<DealPreviewCard
							product={previewProduct}
							variant={
								variant
									? {
											sku: variant.sku,
											options: variant.options,
											price: variant.price,
											compare_at_price: variant.compare_at_price,
										}
									: null
							}
							dealPrice={Number.isFinite(dp) && dp > 0 ? dp : null}
							originalPrice={Number.isFinite(op) && op > 0 ? op : null}
							startsAt={startsAtDate}
							expiresAt={expiresAtDate}
							quantityLimit={quantityLimit ? Number(quantityLimit) : null}
							currency={product?.currency ?? "AED"}
						/>
					)}
				</div>
			</div>
		</form>
	);
}
