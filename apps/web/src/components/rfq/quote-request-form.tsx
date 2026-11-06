"use client";

import {
	Field,
	FieldError,
	Input,
	Panel,
	PanelHead,
	Select,
	Skeleton,
	Textarea,
} from "@/components/account/account-ui";
import {
	buildSpecs,
	normaliseVariants,
	resolveUnit,
} from "@/components/product/pdp-data";
import { Button, formatFils } from "@/components/swatch";
import { api } from "@/lib/api";
import { UAE_EMIRATES } from "@/lib/emirates";
import {
	QUOTE_ATTACHMENT_MAX_BYTES,
	QUOTE_ATTACHMENT_TYPES,
	QUOTE_UNITS,
	type QuoteAttachment,
	type QuoteUnit,
	uploadQuoteAttachment,
	useCategorySuppliers,
	useCreateQuoteRequest,
} from "@/lib/queries/rfq";
import { useQuery } from "@tanstack/react-query";
import { FileText, Paperclip, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { dubaiTodayIso } from "./status";
import { SupplierPicker } from "./supplier-picker";

const UNIT_ALIASES: Record<string, QuoteUnit> = {
	sheet: "sheet",
	sheets: "sheet",
	roll: "roll",
	rolls: "roll",
	metre: "metre",
	meter: "metre",
	m: "metre",
	pack: "pack",
	packs: "pack",
	carton: "carton",
	cartons: "carton",
	piece: "piece",
	pieces: "piece",
	pc: "piece",
	pcs: "piece",
	kg: "kg",
};

interface CategoryNode {
	id: string;
	name: string;
	slug: string;
	children?: CategoryNode[];
}

function flatten(
	nodes: CategoryNode[],
	depth = 0,
	out: { node: CategoryNode; depth: number }[] = [],
) {
	for (const n of nodes) {
		out.push({ node: n, depth });
		if (n.children?.length) flatten(n.children, depth + 1, out);
	}
	return out;
}

type Errors = Partial<
	Record<
		| "spec"
		| "quantity"
		| "emirate"
		| "suppliers"
		| "needBy"
		| "files"
		| "submit",
		string
	>
>;

/**
 * Request a quote. Opened from a product page (prefilled, its seller locked
 * in), a category page (that category's suppliers to pick from), or the
 * quotes list (pick a category first).
 */
export function QuoteRequestForm() {
	const t = useTranslations("rfq.form");
	const tUnits = useTranslations("rfq.units");
	const tEmirates = useTranslations("emirates");
	const tPdp = useTranslations("pdp");
	const locale = useLocale();
	const router = useRouter();
	const params = useSearchParams();
	const productId = params.get("product");
	const variantId = params.get("variant");
	const initialQty = Number.parseInt(params.get("qty") ?? "", 10);
	const [categorySlug, setCategorySlug] = useState(
		params.get("category") ?? "",
	);

	// ── Context ─────────────────────────────────────────────────────────
	const productQuery = useQuery({
		queryKey: ["rfq", "product", productId],
		enabled: !!productId,
		queryFn: async () => {
			const { data } = await api.get(`/products/${productId}`);
			// biome-ignore lint/suspicious/noExplicitAny: untyped product payload
			return data.data as any;
		},
	});
	const product = productQuery.data;
	const variant = useMemo(() => {
		if (!product) return undefined;
		return normaliseVariants(product).find((v) => v.id === variantId);
	}, [product, variantId]);

	const treeQuery = useQuery({
		queryKey: ["rfq", "category-tree"],
		enabled: !productId && !params.get("category"),
		staleTime: 10 * 60_000,
		queryFn: async () => {
			const { data } = await api.get("/categories/tree");
			return (data.data ?? []) as CategoryNode[];
		},
	});
	const categoryOptions = useMemo(
		() => flatten(treeQuery.data ?? []),
		[treeQuery.data],
	);
	const categoryName = useMemo(() => {
		const hit = categoryOptions.find((o) => o.node.slug === categorySlug);
		return hit?.node.name ?? null;
	}, [categoryOptions, categorySlug]);

	const suppliersQuery = useCategorySuppliers(categorySlug || undefined);
	const lockedSupplier = product?.vendor?.slug
		? {
				slug: product.vendor.slug as string,
				name: product.vendor.name as string,
			}
		: null;

	// ── Fields ──────────────────────────────────────────────────────────
	const [title, setTitle] = useState("");
	const [spec, setSpec] = useState("");
	const [quantity, setQuantity] = useState(
		Number.isFinite(initialQty) && initialQty > 0 ? String(initialQty) : "",
	);
	const [unit, setUnit] = useState<QuoteUnit>("sheet");
	const [needBy, setNeedBy] = useState("");
	const [emirate, setEmirate] = useState("");
	const [suppliers, setSuppliers] = useState<string[]>([]);
	const [files, setFiles] = useState<QuoteAttachment[]>([]);
	const [uploading, setUploading] = useState(false);
	const [errors, setErrors] = useState<Errors>({});
	const fileRef = useRef<HTMLInputElement>(null);
	const prefilled = useRef(false);
	const create = useCreateQuoteRequest();

	// Prefill once from the product: name, spec lines, unit.
	useEffect(() => {
		if (!product || prefilled.current) return;
		prefilled.current = true;
		setTitle(
			[product.name, variant?.name].filter(Boolean).join(" · ").slice(0, 200),
		);
		const specs = buildSpecs(product, variant, {
			dimensions: tPdp("dimensions"),
			weight: tPdp("weight"),
			origin: tPdp("origin"),
			sku: tPdp("sku"),
		});
		const lines = specs.map((s) => `${s.label}: ${s.value}`);
		setSpec(lines.join("\n"));
		const u = resolveUnit(product, variant);
		if (u && UNIT_ALIASES[u]) setUnit(UNIT_ALIASES[u]);
	}, [product, variant, tPdp]);

	const today = dubaiTodayIso();

	async function onFiles(list: FileList | null) {
		if (!list?.length) return;
		const next: QuoteAttachment[] = [];
		setErrors((e) => ({ ...e, files: undefined }));
		setUploading(true);
		try {
			for (const file of Array.from(list).slice(
				0,
				Math.max(0, 5 - files.length),
			)) {
				if (!QUOTE_ATTACHMENT_TYPES.includes(file.type)) {
					setErrors((e) => ({
						...e,
						files: t("errors.fileType", { name: file.name }),
					}));
					continue;
				}
				if (file.size > QUOTE_ATTACHMENT_MAX_BYTES) {
					setErrors((e) => ({
						...e,
						files: t("errors.fileSize", { name: file.name }),
					}));
					continue;
				}
				try {
					next.push(await uploadQuoteAttachment(file));
				} catch {
					setErrors((e) => ({
						...e,
						files: t("errors.upload", { name: file.name }),
					}));
				}
			}
			setFiles((f) => [...f, ...next].slice(0, 5));
		} finally {
			setUploading(false);
			if (fileRef.current) fileRef.current.value = "";
		}
	}

	function validate(): Errors {
		const e: Errors = {};
		if (spec.trim().length < 10) e.spec = t("errors.spec");
		const q = Number(quantity);
		if (!Number.isInteger(q) || q <= 0) e.quantity = t("errors.quantity");
		if (!emirate) e.emirate = t("errors.emirate");
		if (needBy && needBy < today) e.needBy = t("errors.needBy");
		if (!lockedSupplier && suppliers.length === 0)
			e.suppliers = t("errors.suppliers");
		return e;
	}

	async function submit(ev: FormEvent) {
		ev.preventDefault();
		const e = validate();
		setErrors(e);
		if (Object.keys(e).length) {
			const first = document.querySelector<HTMLElement>(
				"[aria-invalid='true'], #rfq-suppliers-error",
			);
			first?.focus();
			return;
		}
		const categoryId =
			categoryOptions.find((o) => o.node.slug === categorySlug)?.node.id ??
			undefined;
		try {
			const created = await create.mutateAsync({
				product_id: product?.id ?? null,
				variant_id: variant?.id ?? null,
				category_id: categoryId ?? null,
				title: title.trim() || null,
				specification: spec.trim(),
				quantity: Number(quantity),
				unit,
				need_by: needBy || null,
				delivery_emirate: emirate,
				attachments: files,
				vendor_slugs: suppliers,
			});
			router.push(`/${locale}/account/quotes/${created.id}`);
		} catch {
			setErrors({ submit: t("errors.submit") });
		}
	}

	const contextLoading = productId ? productQuery.isLoading : false;
	const productImage =
		product?.images?.find((i: { is_primary?: boolean }) => i.is_primary) ??
		product?.images?.[0];

	return (
		<form
			onSubmit={submit}
			noValidate
			className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6"
		>
			<Panel className="grid gap-5 p-4 md:p-6">
				{/* Where the request starts */}
				{productId && (
					<div className="flex items-center gap-3 rounded-md bg-nl-linen p-3">
						{contextLoading ? (
							<>
								<Skeleton className="h-14 w-14 rounded-sm" />
								<div className="grid flex-1 gap-2">
									<Skeleton className="h-4 w-2/3" />
									<Skeleton className="h-3 w-1/3" />
								</div>
							</>
						) : product ? (
							<>
								{productImage?.thumbnail_url || productImage?.url ? (
									<img
										src={productImage.thumbnail_url ?? productImage.url}
										alt=""
										className="h-14 w-14 shrink-0 rounded-sm bg-nl-pearl object-cover"
									/>
								) : (
									<span
										className="grid h-14 w-14 shrink-0 place-items-center rounded-sm bg-nl-pearl text-nl-russet"
										aria-hidden="true"
									>
										<FileText className="h-5 w-5" strokeWidth={1.5} />
									</span>
								)}
								<div className="grid min-w-0 gap-0.5">
									<span className="text-[12.5px] text-nl-russet">
										{t("forProduct")}
									</span>
									<Link
										href={`/${locale}/product/${product.slug}`}
										className="truncate text-sm font-medium text-nl-cacao underline-offset-4 hover:underline"
									>
										{product.name}
										{variant ? ` · ${variant.name}` : ""}
									</Link>
									<span className="font-mono text-[12.5px] tabular-nums text-nl-russet [unicode-bidi:isolate]">
										AED{" "}
										{formatFils(variant?.price ?? product.price ?? 0, locale)}
									</span>
								</div>
							</>
						) : null}
					</div>
				)}

				{!productId && !params.get("category") && (
					<Field
						label={t("suppliersLabel")}
						hint={
							categoryName
								? t("fromCategory", { category: categoryName })
								: undefined
						}
					>
						{(p) => (
							<Select
								{...p}
								value={categorySlug}
								onChange={(e) => {
									setCategorySlug(e.target.value);
									setSuppliers([]);
								}}
							>
								<option value="">—</option>
								{categoryOptions.map(({ node, depth }) => (
									<option key={node.id} value={node.slug}>
										{`${" ".repeat(depth * 2)}${node.name}`}
									</option>
								))}
							</Select>
						)}
					</Field>
				)}

				<Field label={t("titleLabel")} hint={t("titleHint")} optional>
					{(p) => (
						<Input
							{...p}
							value={title}
							maxLength={200}
							onChange={(e) => setTitle(e.target.value)}
						/>
					)}
				</Field>

				<Field
					label={t("specLabel")}
					hint={errors.spec ? undefined : t("specHint")}
					error={errors.spec}
				>
					{(p) => (
						<Textarea
							{...p}
							rows={6}
							value={spec}
							maxLength={5000}
							placeholder={t("specPlaceholder")}
							onChange={(e) => setSpec(e.target.value)}
							className="font-mono text-[14px] md:text-[14px]"
						/>
					)}
				</Field>

				<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<Field label={t("quantityLabel")} error={errors.quantity}>
						{(p) => (
							<Input
								{...p}
								inputMode="numeric"
								pattern="[0-9]*"
								value={quantity}
								onChange={(e) =>
									setQuantity(e.target.value.replace(/[^\d]/g, ""))
								}
								className="font-mono tabular-nums"
								dir="ltr"
							/>
						)}
					</Field>
					<Field label={t("unitLabel")}>
						{(p) => (
							<Select
								{...p}
								value={unit}
								onChange={(e) => setUnit(e.target.value as QuoteUnit)}
							>
								{QUOTE_UNITS.map((u) => (
									<option key={u} value={u}>
										{tUnits(u)}
									</option>
								))}
							</Select>
						)}
					</Field>
					<Field label={t("needByLabel")} error={errors.needBy} optional>
						{(p) => (
							<Input
								{...p}
								type="date"
								min={today}
								value={needBy}
								onChange={(e) => setNeedBy(e.target.value)}
								className="font-mono tabular-nums"
							/>
						)}
					</Field>
					<Field label={t("emirateLabel")} error={errors.emirate}>
						{(p) => (
							<Select
								{...p}
								value={emirate}
								onChange={(e) => setEmirate(e.target.value)}
							>
								<option value="" disabled>
									{t("emiratePlaceholder")}
								</option>
								{UAE_EMIRATES.map((em) => (
									<option key={em.value} value={em.value}>
										{tEmirates(em.labelKey)}
									</option>
								))}
							</Select>
						)}
					</Field>
				</div>

				{/* Attachments */}
				<div className="grid gap-2">
					<span className="text-[13px] font-medium text-nl-cacao">
						{t("attachmentsLabel")}
					</span>
					<p className="m-0 text-[13px] text-nl-russet">
						{t("attachmentsHint")}
					</p>
					{files.length > 0 && (
						<ul className="m-0 flex list-none flex-wrap gap-2 p-0">
							{files.map((f) => (
								<li
									key={f.key}
									className="inline-flex h-9 items-center gap-2 rounded-sm bg-nl-linen ps-3 pe-1 text-[13px] text-nl-cacao"
								>
									<Paperclip
										className="h-3.5 w-3.5 text-nl-russet"
										strokeWidth={1.75}
										aria-hidden="true"
									/>
									<span className="max-w-[24ch] truncate">{f.filename}</span>
									<button
										type="button"
										onClick={() =>
											setFiles((all) => all.filter((x) => x.key !== f.key))
										}
										className="grid h-7 w-7 place-items-center rounded-sm text-nl-russet hover:bg-nl-cacao/[0.06] hover:text-nl-cacao"
										aria-label={t("remove", { name: f.filename })}
									>
										<X
											className="h-3.5 w-3.5"
											strokeWidth={2}
											aria-hidden="true"
										/>
									</button>
								</li>
							))}
						</ul>
					)}
					<div>
						<input
							ref={fileRef}
							type="file"
							multiple
							accept={QUOTE_ATTACHMENT_TYPES.join(",")}
							className="sr-only"
							id="rfq-files"
							onChange={(e) => onFiles(e.target.files)}
							disabled={uploading || files.length >= 5}
						/>
						<Button
							asChild
							variant="outline"
							size="sm"
							aria-disabled={uploading || files.length >= 5}
						>
							<label htmlFor="rfq-files" className="cursor-pointer">
								<Paperclip
									className="h-4 w-4"
									strokeWidth={1.75}
									aria-hidden="true"
								/>
								{uploading ? t("uploading") : t("attach")}
							</label>
						</Button>
					</div>
					{errors.files && <FieldError>{errors.files}</FieldError>}
				</div>
			</Panel>

			{/* Suppliers + send */}
			<Panel as="div" className="lg:sticky lg:top-24">
				<PanelHead title={t("suppliersLabel")} />
				<div className="grid gap-4 p-4 md:p-5">
					{categorySlug || lockedSupplier ? (
						<SupplierPicker
							options={suppliersQuery.data ?? []}
							selected={suppliers}
							onChange={setSuppliers}
							locked={lockedSupplier}
							loading={suppliersQuery.isLoading && !!categorySlug}
							error={errors.suppliers}
						/>
					) : (
						<p
							className="m-0 text-[13px] text-nl-russet"
							id="rfq-suppliers-error"
						>
							{errors.suppliers ?? t("suppliersHint", { max: 3 })}
						</p>
					)}
					{errors.submit && <FieldError>{errors.submit}</FieldError>}
					<div className="grid gap-2">
						<Button
							type="submit"
							variant="signal"
							size="lg"
							disabled={create.isPending || uploading}
						>
							{create.isPending ? t("submitting") : t("submit")}
						</Button>
						<Button asChild variant="ghost">
							<Link
								href={
									product
										? `/${locale}/product/${product.slug}`
										: `/${locale}/account/quotes`
								}
							>
								{t("cancel")}
							</Link>
						</Button>
					</div>
				</div>
			</Panel>
		</form>
	);
}
