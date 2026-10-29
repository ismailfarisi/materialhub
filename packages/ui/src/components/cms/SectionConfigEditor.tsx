"use client";

import type { AxiosInstance } from "axios";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type {
	LayoutBlockVideo,
	MediaAssetType,
	S3UploadClient,
} from "../../hooks/use-s3-upload";
import { S3ImageUploadField } from "../forms/s3-image-upload-field";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SimpleSelect } from "../ui/select";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { VideoField } from "./VideoField";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SectionConfigEditorProps {
	apiClient: AxiosInstance;
	sectionTypeName: string;
	sourceMode: string;
	settings: Record<string, unknown>;
	blocks: unknown[];
	dataSource: Record<string, unknown>;
	bidConfig: Record<string, unknown>;
	s3Client?: S3UploadClient;
	vendorId?: string;
	onSettingsChange: (settings: Record<string, unknown>) => void;
	onBlocksChange: (blocks: unknown[]) => void;
	onDataSourceChange: (dataSource: Record<string, unknown>) => void;
	onBidConfigChange: (bidConfig: Record<string, unknown>) => void;
}

type CollectionLookupItem = {
	id: string;
	slug: string;
	name: string;
	kind?: string;
	is_active?: boolean;
};

// Context lets the deeply nested image fields read the upload client without
// each editor accepting it as an explicit prop. Keeps the per-section editor
// signatures the same as before.
interface UploadCtx {
	client?: S3UploadClient;
	vendorId?: string;
}
const UploadContext = createContext<UploadCtx>({});

function ImageField({
	label,
	value,
	onChange,
	assetType = "banner_image",
	placeholder = "https://...",
}: {
	label: string;
	value: string;
	onChange: (url: string) => void;
	assetType?: Exclude<MediaAssetType, "product_image" | "kyc_document">;
	placeholder?: string;
}) {
	const { client, vendorId } = useContext(UploadContext);
	if (client) {
		return (
			<S3ImageUploadField
				assetType={assetType}
				value={value || null}
				onChange={(url) => onChange(url ?? "")}
				client={client}
				vendorId={vendorId}
				label={label}
			/>
		);
	}
	return (
		<FieldItem label={label}>
			<Input
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="h-9 text-sm"
			/>
			<ImagePreview url={value} />
		</FieldItem>
	);
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function FieldGroup({ children }: { children: React.ReactNode }) {
	return <div className="space-y-3">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-xs font-semibold text-taupe uppercase tracking-wide">
			{children}
		</p>
	);
}

function FieldRow({ children }: { children: React.ReactNode }) {
	return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function FieldItem({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<Label className="text-xs text-taupe">{label}</Label>
			{children}
		</div>
	);
}

function SwitchField({
	label,
	checked,
	onCheckedChange,
}: {
	label: string;
	checked: boolean;
	onCheckedChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between py-1">
			<Label className="text-sm text-cacao">{label}</Label>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
		</div>
	);
}

function collectionSublabel(item: CollectionLookupItem) {
	const parts = [`/${item.slug}`];
	if (item.is_active === false) parts.push("Inactive");
	return parts.join(" - ");
}

function ProductCollectionPicker({
	apiClient,
	value,
	onChange,
}: {
	apiClient: AxiosInstance;
	value: string;
	onChange: (slug: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<CollectionLookupItem[]>([]);
	const [selectedItem, setSelectedItem] = useState<CollectionLookupItem | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => {
		function onDoc(e: globalThis.MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, []);

	useEffect(() => {
		if (!value) {
			setSelectedItem(null);
			return;
		}
		if (selectedItem?.slug === value) return;
		let cancelled = false;
		apiClient
			.get("/admin/collections", { params: { search: value, limit: 20 } })
			.then(({ data }) => {
				if (cancelled) return;
				const collections = ((data.data?.data ?? []) as CollectionLookupItem[])
					.filter((item) => item.kind !== "variant")
					.filter((item) => item.slug === value);
				setSelectedItem(collections[0] ?? null);
			})
			.catch(() => {
				if (!cancelled) setSelectedItem(null);
			});
		return () => {
			cancelled = true;
		};
	}, [apiClient, selectedItem?.slug, value]);

	useEffect(() => {
		if (!open) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		setLoading(true);
		debounceRef.current = setTimeout(async () => {
			try {
				const { data } = await apiClient.get("/admin/collections", {
					params: { search: query || undefined, limit: 20 },
				});
				const collections = ((data.data?.data ?? []) as CollectionLookupItem[])
					.filter((item) => item.kind !== "variant")
					.sort((a, b) => a.name.localeCompare(b.name));
				setItems(collections);
			} finally {
				setLoading(false);
			}
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [apiClient, open, query]);

	function handleSelect(item: CollectionLookupItem) {
		onChange(item.slug);
		setSelectedItem(item);
		setOpen(false);
		setQuery("");
	}

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => {
					setOpen(true);
					setTimeout(() => inputRef.current?.focus(), 0);
				}}
				className="flex w-full items-center justify-between rounded-xs border border-pearl/28 bg-linen px-3 py-2 text-left text-sm text-cacao ring-offset-amber focus:outline-none focus:ring-2 focus:ring-amber focus:ring-offset-amber"
			>
				<span className={selectedItem ? "truncate" : "truncate text-taupe"}>
					{selectedItem?.name ??
						(value ? `/${value}` : "Search collections...")}
				</span>
				<ChevronDown size={14} className="ms-2 shrink-0 text-taupe" />
			</button>
			{open && (
				<div className="absolute z-50 mt-1 w-full rounded-xs border border-pearl/28 bg-linen shadow-lg">
					<div className="border-b border-pearl/28 p-2">
						<input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Type to search..."
							className="w-full rounded-xs border border-pearl/28 bg-linen px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber/30"
						/>
					</div>
					<div className="max-h-64 overflow-y-auto p-1">
						{loading ? (
							<div className="flex items-center justify-center py-6 text-taupe">
								<Loader2 size={16} className="animate-spin" />
							</div>
						) : items.length === 0 ? (
							<div className="px-3 py-6 text-center text-sm text-taupe">
								No collections found.
							</div>
						) : (
							items.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => handleSelect(item)}
									className="flex w-full items-start gap-2 rounded-xs px-2 py-2 text-left text-sm hover:bg-pearl/60"
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-cacao">
											{item.name}
										</span>
										<span className="block truncate text-xs text-taupe">
											{collectionSublabel(item)}
										</span>
									</span>
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function ImagePreview({ url }: { url: string }) {
	if (!url) return null;
	return (
		<img
			src={url}
			alt="preview"
			className="w-16 h-16 object-cover rounded border border-gray-200 mt-1"
			onError={(e) => {
				(e.currentTarget as HTMLImageElement).style.display = "none";
			}}
		/>
	);
}

function AddButton({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg py-2.5 text-sm text-taupe hover:border-blue-300 hover:text-amber hover:bg-blue-50/50 transition-colors"
		>
			<Plus size={14} />
			{label}
		</button>
	);
}

function BlockCard({
	index,
	onRemove,
	showRemove = true,
	children,
}: {
	index: number;
	onRemove: () => void;
	showRemove?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-lg border border-gray-200 bg-linen overflow-hidden">
			<div className="flex items-center justify-between px-3 py-2 bg-pearl/50 border-b border-gray-100">
				<span className="text-xs font-semibold text-taupe uppercase tracking-wide">
					Item {index + 1}
				</span>
				{showRemove && (
					<button
						type="button"
						onClick={onRemove}
						className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-taupe hover:text-red-600 hover:bg-red-50 transition-colors"
						aria-label="Remove"
						title="Remove item"
					>
						<Trash2 size={14} />
						<span>Remove</span>
					</button>
				)}
			</div>
			<div className="p-3 space-y-3">{children}</div>
		</div>
	);
}

// ─── Bid Config (shared between product_carousel and vendor_showcase) ────────

function BidConfigEditor({
	bidConfig,
	onBidConfigChange,
}: {
	bidConfig: Record<string, unknown>;
	onBidConfigChange: (v: Record<string, unknown>) => void;
}) {
	function set(key: string, value: unknown) {
		onBidConfigChange({ ...bidConfig, [key]: value });
	}

	const fallbackQuery =
		(bidConfig.fallback_query as Record<string, unknown>) ?? {};
	const fallbackQueryInner =
		(fallbackQuery.query as Record<string, unknown>) ?? {};

	function setFallbackType(value: string) {
		onBidConfigChange({
			...bidConfig,
			fallback_query: { ...fallbackQuery, type: value },
		});
	}

	function setFallbackLimit(value: number) {
		onBidConfigChange({
			...bidConfig,
			fallback_query: {
				...fallbackQuery,
				query: { ...fallbackQueryInner, limit: value },
			},
		});
	}

	return (
		<FieldGroup>
			<SectionLabel>Bid Configuration</SectionLabel>
			<FieldRow>
				<FieldItem label="Slots">
					<Input
						type="number"
						min={1}
						value={(bidConfig.slots as number) ?? ""}
						onChange={(e) => set("slots", Number(e.target.value))}
						className="h-9 text-sm"
					/>
				</FieldItem>
				<FieldItem label="Min Bid (fils)">
					<Input
						type="number"
						min={0}
						value={(bidConfig.min_bid_fils as number) ?? ""}
						onChange={(e) => set("min_bid_fils", Number(e.target.value))}
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldRow>
			<FieldItem label="Ranking">
				<SimpleSelect
					value={(bidConfig.ranking as string) ?? "bid_amount"}
					onValueChange={(v) => set("ranking", v)}
					options={[{ label: "Bid Amount", value: "bid_amount" }]}
				/>
			</FieldItem>
			<Separator />
			<SectionLabel>Fallback Query</SectionLabel>
			<FieldRow>
				<FieldItem label="Type">
					<SimpleSelect
						value={(fallbackQuery.type as string) ?? "products"}
						onValueChange={(v) => setFallbackType(v)}
						options={[
							{ label: "Products", value: "products" },
							{ label: "Flash Deals", value: "flash_deals" },
						]}
					/>
				</FieldItem>
				<FieldItem label="Limit">
					<Input
						type="number"
						min={1}
						value={(fallbackQueryInner.limit as number) ?? ""}
						onChange={(e) => setFallbackLimit(Number(e.target.value))}
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldRow>
		</FieldGroup>
	);
}

// ─── Banner / Editorial block (shared shape) ─────────────────────────────────

function BannerBlockEditor({
	block,
	index,
	onChange,
	onRemove,
	showRemove,
	allowVideo = false,
}: {
	block: Record<string, unknown>;
	index: number;
	onChange: (v: Record<string, unknown>) => void;
	onRemove: () => void;
	showRemove: boolean;
	allowVideo?: boolean;
}) {
	const { client } = useContext(UploadContext);
	// All content lives under block.data
	const data = (block.data as Record<string, unknown>) ?? {};
	const image = (data.image as Record<string, unknown>) ?? {};
	const desktop = (image.desktop as Record<string, unknown>) ?? {};
	const mobile = (image.mobile as Record<string, unknown>) ?? {};
	const focalPoint = (image.focal_point as Record<string, unknown>) ?? {};
	const alt = (image.alt as Record<string, unknown>) ?? {};
	const title = (data.title as Record<string, unknown>) ?? {};
	const ctaText = (data.cta_text as Record<string, unknown>) ?? {};

	function setData(key: string, value: unknown) {
		onChange({ ...block, data: { ...data, [key]: value } });
	}

	function setImageField(key: string, value: unknown) {
		onChange({
			...block,
			data: { ...data, image: { ...image, [key]: value } },
		});
	}

	function setVideo(v: LayoutBlockVideo | null) {
		const next = { ...data } as Record<string, unknown>;
		if (v) next.video = v;
		else delete next.video;
		onChange({ ...block, data: next });
	}

	function setDesktopUrl(url: string) {
		onChange({
			...block,
			data: {
				...data,
				image: { ...image, desktop: { ...desktop, url } },
			},
		});
	}

	function setMobileUrl(url: string) {
		onChange({
			...block,
			data: {
				...data,
				image: { ...image, mobile: { ...mobile, url } },
			},
		});
	}

	function setFocalPoint(axis: "x" | "y", value: number) {
		setImageField("focal_point", { ...focalPoint, [axis]: value });
	}

	function setAlt(lang: string, value: string) {
		setImageField("alt", { ...alt, [lang]: value });
	}

	function setTitle(lang: string, value: string) {
		setData("title", { ...title, [lang]: value });
	}

	function setCtaText(lang: string, value: string) {
		setData("cta_text", { ...ctaText, [lang]: value });
	}

	return (
		<BlockCard index={index} onRemove={onRemove} showRemove={showRemove}>
			{!showRemove && (
				<p className="text-xs text-taupe italic">Single banner block</p>
			)}

			<SectionLabel>Images</SectionLabel>
			<ImageField
				label="Desktop image"
				value={(desktop.url as string) ?? ""}
				onChange={setDesktopUrl}
			/>
			<ImageField
				label="Mobile image (optional)"
				value={(mobile.url as string) ?? ""}
				onChange={setMobileUrl}
			/>

			{allowVideo && client && (
				<>
					<Separator />
					<SectionLabel>Background video (optional)</SectionLabel>
					<p className="text-xs text-taupe">
						Muted, looping, desktop only. MP4 or WebM, up to 15 seconds and 25MB. The desktop
						image is still required — it is shown on mobile, while the video loads, and for
						visitors who prefer reduced motion.
					</p>
					<VideoField
						value={(data.video as LayoutBlockVideo | undefined) ?? null}
						onChange={setVideo}
						client={client}
					/>
				</>
			)}

			<Separator />
			<SectionLabel>Focal Point</SectionLabel>
			<FieldRow>
				<FieldItem label="X (0–1)">
					<Input
						type="number"
						step={0.01}
						min={0}
						max={1}
						value={(focalPoint.x as number) ?? ""}
						onChange={(e) =>
							setFocalPoint("x", Number.parseFloat(e.target.value))
						}
						className="h-9 text-sm"
					/>
				</FieldItem>
				<FieldItem label="Y (0–1)">
					<Input
						type="number"
						step={0.01}
						min={0}
						max={1}
						value={(focalPoint.y as number) ?? ""}
						onChange={(e) =>
							setFocalPoint("y", Number.parseFloat(e.target.value))
						}
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldRow>

			<Separator />
			<SectionLabel>Alt Text</SectionLabel>
			<FieldRow>
				<FieldItem label="EN">
					<Input
						value={(alt.en as string) ?? ""}
						onChange={(e) => setAlt("en", e.target.value)}
						className="h-9 text-sm"
					/>
				</FieldItem>
				<FieldItem label="AR">
					<Input
						value={(alt.ar as string) ?? ""}
						onChange={(e) => setAlt("ar", e.target.value)}
						dir="rtl"
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldRow>

			<Separator />
			<SectionLabel>Title</SectionLabel>
			<FieldRow>
				<FieldItem label="EN">
					<Input
						value={(title.en as string) ?? ""}
						onChange={(e) => setTitle("en", e.target.value)}
						className="h-9 text-sm"
					/>
				</FieldItem>
				<FieldItem label="AR">
					<Input
						value={(title.ar as string) ?? ""}
						onChange={(e) => setTitle("ar", e.target.value)}
						dir="rtl"
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldRow>

			<Separator />
			<SectionLabel>CTA</SectionLabel>
			<FieldRow>
				<FieldItem label="Text EN">
					<Input
						value={(ctaText.en as string) ?? ""}
						onChange={(e) => setCtaText("en", e.target.value)}
						className="h-9 text-sm"
					/>
				</FieldItem>
				<FieldItem label="Text AR">
					<Input
						value={(ctaText.ar as string) ?? ""}
						onChange={(e) => setCtaText("ar", e.target.value)}
						dir="rtl"
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldRow>
			<FieldItem label="CTA Link">
				<Input
					value={(data.cta_link as string) ?? ""}
					onChange={(e) => setData("cta_link", e.target.value)}
					placeholder="/products/..."
					className="h-9 text-sm"
				/>
			</FieldItem>
		</BlockCard>
	);
}

// ─── 1. hero_carousel ────────────────────────────────────────────────────────

function HeroCarouselEditor({
	settings,
	blocks,
	onSettingsChange,
	onBlocksChange,
}: Pick<
	SectionConfigEditorProps,
	"settings" | "blocks" | "onSettingsChange" | "onBlocksChange"
>) {
	const slides = blocks as Record<string, unknown>[];

	function addSlide() {
		onBlocksChange([
			...slides,
			{
				id: `slide-${Date.now()}`,
				type: "slide",
				data: {
					image: {
						desktop: { url: "", width: 1920, height: 640 },
						mobile: { url: "", width: 1080, height: 1350 },
						focal_point: { x: 0.5, y: 0.5 },
						alt: { en: "", ar: "" },
					},
					title: { en: "", ar: "" },
					cta_text: { en: "", ar: "" },
					cta_link: "",
				},
			},
		]);
	}

	function updateSlide(index: number, slide: Record<string, unknown>) {
		const next = [...slides];
		next[index] = slide;
		onBlocksChange(next);
	}

	function removeSlide(index: number) {
		onBlocksChange(slides.filter((_, i) => i !== index));
	}

	return (
		<div className="space-y-5">
			{/* Settings */}
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<SwitchField
					label="Autoplay"
					checked={Boolean(settings.autoplay)}
					onCheckedChange={(v) =>
						onSettingsChange({ ...settings, autoplay: v })
					}
				/>
				<FieldItem label="Slide Duration (ms)">
					<Input
						type="number"
						min={500}
						step={100}
						value={(settings.interval_ms as number) ?? ""}
						onChange={(e) =>
							onSettingsChange({
								...settings,
								interval_ms: Number(e.target.value),
							})
						}
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldGroup>

			<Separator />

			{/* Slides */}
			<FieldGroup>
				<SectionLabel>Slides ({slides.length})</SectionLabel>
				<div className="space-y-3">
					{slides.map((slide, i) => (
						<BannerBlockEditor
							key={((slide as Record<string, unknown>).id as string) ?? i}
							block={slide}
							index={i}
							onChange={(v) => updateSlide(i, v)}
							onRemove={() => removeSlide(i)}
							showRemove
							allowVideo
						/>
					))}
				</div>
				<AddButton label="Add Slide" onClick={addSlide} />
			</FieldGroup>
		</div>
	);
}

// ─── 2. category_grid ────────────────────────────────────────────────────────

function CategoryGridEditor({
	settings,
	blocks,
	onSettingsChange,
	onBlocksChange,
}: Pick<
	SectionConfigEditorProps,
	"settings" | "blocks" | "onSettingsChange" | "onBlocksChange"
>) {
	const categories = blocks as Record<string, unknown>[];

	function addCategory() {
		onBlocksChange([
			...categories,
			{
				id: `cat-${Date.now()}`,
				type: "category_card",
				data: { name: { en: "", ar: "" }, image_url: "", link: "" },
			},
		]);
	}

	function updateCategory(index: number, cat: Record<string, unknown>) {
		const next = [...categories];
		next[index] = cat;
		onBlocksChange(next);
	}

	function removeCategory(index: number) {
		onBlocksChange(categories.filter((_, i) => i !== index));
	}

	const title = (settings.title as Record<string, unknown>) ?? {};
	const columns = (settings.columns as Record<string, unknown>) ?? {};

	return (
		<div className="space-y-5">
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<FieldRow>
					<FieldItem label="Title EN">
						<Input
							value={(title.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, en: e.target.value },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Title AR">
						<Input
							value={(title.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, ar: e.target.value },
								})
							}
							dir="rtl"
							className="h-9 text-sm"
						/>
					</FieldItem>
				</FieldRow>
				<SectionLabel>Columns</SectionLabel>
				<div className="grid grid-cols-3 gap-3">
					<FieldItem label="Desktop">
						<Input
							type="number"
							min={1}
							max={12}
							value={(columns.desktop as number) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									columns: { ...columns, desktop: Number(e.target.value) },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Tablet">
						<Input
							type="number"
							min={1}
							max={8}
							value={(columns.tablet as number) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									columns: { ...columns, tablet: Number(e.target.value) },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Mobile">
						<Input
							type="number"
							min={1}
							max={4}
							value={(columns.mobile as number) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									columns: { ...columns, mobile: Number(e.target.value) },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
				</div>
			</FieldGroup>

			<Separator />

			<FieldGroup>
				<SectionLabel>Categories ({categories.length})</SectionLabel>
				<div className="space-y-3">
					{categories.map((cat, i) => {
						const catData = (cat.data as Record<string, unknown>) ?? {};
						const name = (catData.name as Record<string, unknown>) ?? {};
						function setCatData(key: string, value: unknown) {
							updateCategory(i, { ...cat, data: { ...catData, [key]: value } });
						}
						return (
							<BlockCard
								key={((cat as Record<string, unknown>).id as string) ?? i}
								index={i}
								onRemove={() => removeCategory(i)}
							>
								<FieldRow>
									<FieldItem label="Name EN">
										<Input
											value={(name.en as string) ?? ""}
											onChange={(e) =>
												setCatData("name", { ...name, en: e.target.value })
											}
											className="h-9 text-sm"
										/>
									</FieldItem>
									<FieldItem label="Name AR">
										<Input
											value={(name.ar as string) ?? ""}
											onChange={(e) =>
												setCatData("name", { ...name, ar: e.target.value })
											}
											dir="rtl"
											className="h-9 text-sm"
										/>
									</FieldItem>
								</FieldRow>
								<ImageField
									label="Image"
									value={(catData.image_url as string) ?? ""}
									onChange={(url) => setCatData("image_url", url)}
								/>
								<FieldItem label="Link">
									<Input
										value={(catData.link as string) ?? ""}
										onChange={(e) => setCatData("link", e.target.value)}
										placeholder="/category/..."
										className="h-9 text-sm"
									/>
								</FieldItem>
							</BlockCard>
						);
					})}
				</div>
				<AddButton label="Add Category" onClick={addCategory} />
			</FieldGroup>
		</div>
	);
}

// ─── 3. product_carousel ─────────────────────────────────────────────────────

function ProductCarouselEditor({
	apiClient,
	settings,
	dataSource,
	bidConfig,
	sourceMode,
	onSettingsChange,
	onDataSourceChange,
	onBidConfigChange,
}: Pick<
	SectionConfigEditorProps,
	| "apiClient"
	| "settings"
	| "dataSource"
	| "bidConfig"
	| "sourceMode"
	| "onSettingsChange"
	| "onDataSourceChange"
	| "onBidConfigChange"
>) {
	const title = (settings.title as Record<string, unknown>) ?? {};

	return (
		<div className="space-y-5">
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<FieldRow>
					<FieldItem label="Title EN">
						<Input
							value={(title.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, en: e.target.value },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Title AR">
						<Input
							value={(title.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, ar: e.target.value },
								})
							}
							dir="rtl"
							className="h-9 text-sm"
						/>
					</FieldItem>
				</FieldRow>
				<SwitchField
					label="Show Price"
					checked={Boolean(settings.show_price)}
					onCheckedChange={(v) =>
						onSettingsChange({ ...settings, show_price: v })
					}
				/>
				<SwitchField
					label="Show Rating"
					checked={Boolean(settings.show_rating)}
					onCheckedChange={(v) =>
						onSettingsChange({ ...settings, show_rating: v })
					}
				/>
			</FieldGroup>

			<Separator />

			{sourceMode === "query" && (
				<FieldGroup>
					<SectionLabel>Data Source</SectionLabel>
					{(() => {
						const dsQuery = (dataSource.query as Record<string, unknown>) ?? {};
						const dataSourceType = (dataSource.type as string) ?? "products";
						function setDsQuery(key: string, value: unknown) {
							onDataSourceChange({
								...dataSource,
								query: { ...dsQuery, [key]: value },
							});
						}
						function setDataSourceType(value: string) {
							const nextQuery =
								value === "collection"
									? { limit: dsQuery.limit, sort: dsQuery.sort }
									: {
											limit: dsQuery.limit,
											sort: dsQuery.sort,
											featured: dsQuery.featured,
										};
							onDataSourceChange({
								...dataSource,
								type: value,
								query: nextQuery,
							});
						}
						return (
							<>
								<FieldRow>
									<FieldItem label="Type">
										<SimpleSelect
											value={dataSourceType}
											onValueChange={setDataSourceType}
											options={[
												{ label: "Products", value: "products" },
												{ label: "Flash Deals", value: "flash_deals" },
												{ label: "Collection", value: "collection" },
											]}
										/>
									</FieldItem>
									<FieldItem label="Sort">
										<SimpleSelect
											value={(dsQuery.sort as string) ?? "newest"}
											onValueChange={(v) => setDsQuery("sort", v)}
											options={[
												{ label: "Newest", value: "newest" },
												{ label: "Popular", value: "popular" },
												{ label: "Price: Low to High", value: "price_asc" },
												{ label: "Price: High to Low", value: "price_desc" },
											]}
										/>
									</FieldItem>
								</FieldRow>
								{dataSourceType === "collection" && (
									<FieldItem label="Collection">
										<ProductCollectionPicker
											apiClient={apiClient}
											value={(dsQuery.collection_slug as string) ?? ""}
											onChange={(slug) => setDsQuery("collection_slug", slug)}
										/>
									</FieldItem>
								)}
								<FieldItem label="Limit">
									<Input
										type="number"
										min={1}
										value={(dsQuery.limit as number) ?? ""}
										onChange={(e) =>
											setDsQuery("limit", Number(e.target.value))
										}
										className="h-9 text-sm"
									/>
								</FieldItem>
								{dataSourceType !== "collection" && (
									<SwitchField
										label="Featured Only"
										checked={Boolean(dsQuery.featured)}
										onCheckedChange={(v) => setDsQuery("featured", v)}
									/>
								)}
							</>
						);
					})()}
				</FieldGroup>
			)}

			{sourceMode === "bidded" && (
				<BidConfigEditor
					bidConfig={bidConfig}
					onBidConfigChange={onBidConfigChange}
				/>
			)}
		</div>
	);
}

// ─── 4. flash_deals ──────────────────────────────────────────────────────────

function FlashDealsEditor({
	settings,
	dataSource,
	onSettingsChange,
	onDataSourceChange,
}: Pick<
	SectionConfigEditorProps,
	"settings" | "dataSource" | "onSettingsChange" | "onDataSourceChange"
>) {
	const title = (settings.title as Record<string, unknown>) ?? {};

	return (
		<div className="space-y-5">
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<FieldRow>
					<FieldItem label="Title EN">
						<Input
							value={(title.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, en: e.target.value },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Title AR">
						<Input
							value={(title.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, ar: e.target.value },
								})
							}
							dir="rtl"
							className="h-9 text-sm"
						/>
					</FieldItem>
				</FieldRow>
				<SwitchField
					label="Show Countdown"
					checked={Boolean(settings.show_countdown)}
					onCheckedChange={(v) =>
						onSettingsChange({ ...settings, show_countdown: v })
					}
				/>
			</FieldGroup>

			<Separator />

			<FieldGroup>
				<SectionLabel>Data Source</SectionLabel>
				<FieldItem label="Limit">
					<Input
						type="number"
						min={1}
						value={
							((dataSource.query as Record<string, unknown>)
								?.limit as number) ?? ""
						}
						onChange={(e) =>
							onDataSourceChange({
								...dataSource,
								query: {
									...((dataSource.query as Record<string, unknown>) ?? {}),
									limit: Number(e.target.value),
								},
							})
						}
						className="h-9 text-sm"
					/>
				</FieldItem>
			</FieldGroup>
		</div>
	);
}

// ─── 5. vendor_showcase ──────────────────────────────────────────────────────

function VendorShowcaseEditor({
	settings,
	dataSource,
	bidConfig,
	sourceMode,
	onSettingsChange,
	onDataSourceChange,
	onBidConfigChange,
}: Pick<
	SectionConfigEditorProps,
	| "settings"
	| "dataSource"
	| "bidConfig"
	| "sourceMode"
	| "onSettingsChange"
	| "onDataSourceChange"
	| "onBidConfigChange"
>) {
	const title = (settings.title as Record<string, unknown>) ?? {};

	return (
		<div className="space-y-5">
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<FieldRow>
					<FieldItem label="Title EN">
						<Input
							value={(title.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, en: e.target.value },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Title AR">
						<Input
							value={(title.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, ar: e.target.value },
								})
							}
							dir="rtl"
							className="h-9 text-sm"
						/>
					</FieldItem>
				</FieldRow>
				<FieldItem label="Layout">
					<SimpleSelect
						value={(settings.layout as string) ?? "horizontal_scroll"}
						onValueChange={(v) => onSettingsChange({ ...settings, layout: v })}
						options={[
							{ label: "Horizontal Scroll", value: "horizontal_scroll" },
							{ label: "Grid", value: "grid" },
						]}
					/>
				</FieldItem>
			</FieldGroup>

			<Separator />

			{sourceMode === "query" && (
				<FieldGroup>
					<SectionLabel>Data Source</SectionLabel>
					{(() => {
						const dsQuery = (dataSource.query as Record<string, unknown>) ?? {};
						function setDsQuery(key: string, value: unknown) {
							onDataSourceChange({
								...dataSource,
								query: { ...dsQuery, [key]: value },
							});
						}
						return (
							<>
								<SwitchField
									label="Featured Only"
									checked={Boolean(dsQuery.featured)}
									onCheckedChange={(v) => setDsQuery("featured", v)}
								/>
								<FieldItem label="Limit">
									<Input
										type="number"
										min={1}
										value={(dsQuery.limit as number) ?? ""}
										onChange={(e) =>
											setDsQuery("limit", Number(e.target.value))
										}
										className="h-9 text-sm"
									/>
								</FieldItem>
							</>
						);
					})()}
				</FieldGroup>
			)}

			{sourceMode === "bidded" && (
				<BidConfigEditor
					bidConfig={bidConfig}
					onBidConfigChange={onBidConfigChange}
				/>
			)}
		</div>
	);
}

// ─── 6. brand_spotlight ──────────────────────────────────────────────────────

function BrandSpotlightEditor({
	settings,
	blocks,
	dataSource,
	sourceMode,
	onSettingsChange,
	onBlocksChange,
	onDataSourceChange,
}: Pick<
	SectionConfigEditorProps,
	| "settings"
	| "blocks"
	| "dataSource"
	| "sourceMode"
	| "onSettingsChange"
	| "onBlocksChange"
	| "onDataSourceChange"
>) {
	const title = (settings.title as Record<string, unknown>) ?? {};

	// Auto-init data_source.type when the section is in query mode. Without this,
	// switching to query mode leaves data_source.type unset, so the resolver has
	// nothing to dispatch on and returns []. Idempotent: only writes when the
	// type isn't already correct.
	useEffect(() => {
		if (sourceMode !== "query") return;
		if (dataSource.type === "brand_spotlight") return;
		const dsQuery = (dataSource.query as Record<string, unknown>) ?? {};
		onDataSourceChange({
			...dataSource,
			type: "brand_spotlight",
			query: { ...dsQuery, limit: (dsQuery.limit as number) ?? 8 },
		});
	}, [sourceMode, dataSource, onDataSourceChange]);

	return (
		<div className="space-y-5">
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<FieldRow>
					<FieldItem label="Title EN">
						<Input
							value={(title.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, en: e.target.value },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Title AR">
						<Input
							value={(title.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, ar: e.target.value },
								})
							}
							dir="rtl"
							className="h-9 text-sm"
						/>
					</FieldItem>
				</FieldRow>
			</FieldGroup>

			<Separator />

			{sourceMode === "query" && (
				<FieldGroup>
					<SectionLabel>Data Source</SectionLabel>
					{(() => {
						const dsQuery = (dataSource.query as Record<string, unknown>) ?? {};
						function setDsQuery(key: string, value: unknown) {
							onDataSourceChange({
								...dataSource,
								query: { ...dsQuery, [key]: value },
							});
						}
						return (
							<>
								<FieldItem label="Limit">
									<Input
										type="number"
										min={4}
										max={12}
										value={(dsQuery.limit as number) ?? 8}
										onChange={(e) =>
											setDsQuery("limit", Number(e.target.value))
										}
										className="h-9 text-sm"
									/>
								</FieldItem>
								<div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-3 leading-relaxed">
									Brands are pulled automatically from{" "}
									<a
										href="/catalog/brands"
										className="font-medium text-primary underline-offset-2 hover:underline"
									>
										Catalog → Brands
									</a>
									. Toggle <code className="text-[11px]">is_featured</code> and
									adjust <code className="text-[11px]">sort_order</code> there.
									Featured brands appear first; the rest fill in by product
									count.
								</div>
							</>
						);
					})()}
				</FieldGroup>
			)}

			{sourceMode === "manual" && (
				<FieldGroup>
					<SectionLabel>
						Brands ({(blocks as Record<string, unknown>[]).length})
					</SectionLabel>
					<div className="space-y-3">
						{(blocks as Record<string, unknown>[]).map((brand, i) => {
							const brandData = (brand.data as Record<string, unknown>) ?? {};
							function setBrandData(key: string, value: unknown) {
								const next = [...(blocks as Record<string, unknown>[])];
								next[i] = { ...brand, data: { ...brandData, [key]: value } };
								onBlocksChange(next);
							}
							return (
								<BlockCard
									key={((brand as Record<string, unknown>).id as string) ?? i}
									index={i}
									onRemove={() =>
										onBlocksChange(
											(blocks as Record<string, unknown>[]).filter(
												(_, j) => j !== i,
											),
										)
									}
								>
									<FieldItem label="Name">
										<Input
											value={(brandData.name as string) ?? ""}
											onChange={(e) => setBrandData("name", e.target.value)}
											className="h-9 text-sm"
										/>
									</FieldItem>
									<ImageField
										label="Logo"
										value={(brandData.logo_url as string) ?? ""}
										onChange={(url) => setBrandData("logo_url", url)}
										assetType="brand_logo"
									/>
									<FieldItem label="Link">
										<Input
											value={(brandData.link as string) ?? ""}
											onChange={(e) => setBrandData("link", e.target.value)}
											placeholder="/brand/..."
											className="h-9 text-sm"
										/>
									</FieldItem>
								</BlockCard>
							);
						})}
					</div>
					<AddButton
						label="Add Brand"
						onClick={() =>
							onBlocksChange([
								...(blocks as Record<string, unknown>[]),
								{
									id: `brand-${Date.now()}`,
									type: "brand",
									data: { name: "", logo_url: "", link: "" },
								},
							])
						}
					/>
				</FieldGroup>
			)}
		</div>
	);
}

// ─── 7. promotional_banner ───────────────────────────────────────────────────

function PromotionalBannerEditor({
	blocks,
	onBlocksChange,
	allowVideo = false,
}: Pick<SectionConfigEditorProps, "blocks" | "onBlocksChange"> & { allowVideo?: boolean }) {
	const banners = blocks as Record<string, unknown>[];

	// Ensure at least one banner block exists
	const singleBanner: Record<string, unknown> = banners[0] ?? {
		id: `promo-${Date.now()}`,
		type: "banner",
		data: {
			image: {
				desktop: { url: "", width: 1920, height: 500 },
				mobile: { url: "", width: 1080, height: 600 },
				focal_point: { x: 0.5, y: 0.5 },
				alt: { en: "", ar: "" },
			},
			title: { en: "", ar: "" },
			cta_text: { en: "", ar: "" },
			cta_link: "",
		},
	};

	function updateBanner(v: Record<string, unknown>) {
		onBlocksChange([v]);
	}

	return (
		<div className="space-y-5">
			<BannerBlockEditor
				block={singleBanner}
				index={0}
				onChange={updateBanner}
				onRemove={() => {}}
				showRemove={false}
				allowVideo={allowVideo}
			/>
		</div>
	);
}

// ─── 8. editorial_post ───────────────────────────────────────────────────────

function EditorialPostEditor({
	blocks,
	onBlocksChange,
}: Pick<SectionConfigEditorProps, "blocks" | "onBlocksChange">) {
	// Same shape as promotional banner
	return (
		<PromotionalBannerEditor blocks={blocks} onBlocksChange={onBlocksChange} />
	);
}

// ─── 9. newsletter_signup ────────────────────────────────────────────────────

function NewsletterSignupEditor({
	settings,
	onSettingsChange,
}: Pick<SectionConfigEditorProps, "settings" | "onSettingsChange">) {
	const title = (settings.title as Record<string, unknown>) ?? {};
	const subtitle = (settings.subtitle as Record<string, unknown>) ?? {};

	return (
		<div className="space-y-5">
			<FieldGroup>
				<SectionLabel>Settings</SectionLabel>
				<FieldRow>
					<FieldItem label="Title EN">
						<Input
							value={(title.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, en: e.target.value },
								})
							}
							className="h-9 text-sm"
						/>
					</FieldItem>
					<FieldItem label="Title AR">
						<Input
							value={(title.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									title: { ...title, ar: e.target.value },
								})
							}
							dir="rtl"
							className="h-9 text-sm"
						/>
					</FieldItem>
				</FieldRow>

				<Separator />
				<SectionLabel>Subtitle</SectionLabel>
				<FieldRow>
					<FieldItem label="EN">
						<Textarea
							value={(subtitle.en as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									subtitle: { ...subtitle, en: e.target.value },
								})
							}
							rows={3}
							className="text-sm resize-none"
						/>
					</FieldItem>
					<FieldItem label="AR">
						<Textarea
							value={(subtitle.ar as string) ?? ""}
							onChange={(e) =>
								onSettingsChange({
									...settings,
									subtitle: { ...subtitle, ar: e.target.value },
								})
							}
							dir="rtl"
							rows={3}
							className="text-sm resize-none"
						/>
					</FieldItem>
				</FieldRow>
			</FieldGroup>
		</div>
	);
}

// ─── Fallback JSON editor ────────────────────────────────────────────────────

function FallbackJsonEditor({
	settings,
	blocks,
	dataSource,
	bidConfig,
	sourceMode,
	onSettingsChange,
	onBlocksChange,
	onDataSourceChange,
	onBidConfigChange,
}: SectionConfigEditorProps) {
	return (
		<div className="space-y-4">
			<div>
				<label
					htmlFor="fallback-settings"
					className="block text-xs font-semibold text-taupe uppercase tracking-wide mb-1"
				>
					Settings (JSON)
				</label>
				<textarea
					id="fallback-settings"
					value={JSON.stringify(settings, null, 2)}
					onChange={(e) => {
						try {
							onSettingsChange(JSON.parse(e.target.value));
						} catch {
							// ignore parse errors while typing
						}
					}}
					rows={4}
					className="w-full rounded-lg border border-gray-200 bg-linen px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			{sourceMode === "query" && (
				<div>
					<label
						htmlFor="fallback-datasource"
						className="block text-xs font-semibold text-taupe uppercase tracking-wide mb-1"
					>
						Data Source (JSON)
					</label>
					<textarea
						id="fallback-datasource"
						value={JSON.stringify(dataSource, null, 2)}
						onChange={(e) => {
							try {
								onDataSourceChange(JSON.parse(e.target.value));
							} catch {
								// ignore
							}
						}}
						rows={4}
						className="w-full rounded-lg border border-gray-200 bg-linen px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			)}
			{sourceMode === "manual" && (
				<div>
					<label
						htmlFor="fallback-blocks"
						className="block text-xs font-semibold text-taupe uppercase tracking-wide mb-1"
					>
						Blocks (JSON array)
					</label>
					<textarea
						id="fallback-blocks"
						value={JSON.stringify(blocks, null, 2)}
						onChange={(e) => {
							try {
								onBlocksChange(JSON.parse(e.target.value));
							} catch {
								// ignore
							}
						}}
						rows={4}
						className="w-full rounded-lg border border-gray-200 bg-linen px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			)}
			{sourceMode === "bidded" && (
				<div>
					<label
						htmlFor="fallback-bidconfig"
						className="block text-xs font-semibold text-taupe uppercase tracking-wide mb-1"
					>
						Bid Config (JSON)
					</label>
					<textarea
						id="fallback-bidconfig"
						value={JSON.stringify(bidConfig, null, 2)}
						onChange={(e) => {
							try {
								onBidConfigChange(JSON.parse(e.target.value));
							} catch {
								// ignore
							}
						}}
						rows={4}
						className="w-full rounded-lg border border-gray-200 bg-linen px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			)}
		</div>
	);
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function SectionConfigEditor(props: SectionConfigEditorProps) {
	const {
		apiClient,
		sectionTypeName,
		sourceMode,
		settings,
		blocks,
		dataSource,
		bidConfig,
		s3Client,
		vendorId,
		onSettingsChange,
		onBlocksChange,
		onDataSourceChange,
		onBidConfigChange,
	} = props;

	return (
		<UploadContext.Provider value={{ client: s3Client, vendorId }}>
			<SectionConfigEditorBody
				apiClient={apiClient}
				sectionTypeName={sectionTypeName}
				sourceMode={sourceMode}
				settings={settings}
				blocks={blocks}
				dataSource={dataSource}
				bidConfig={bidConfig}
				onSettingsChange={onSettingsChange}
				onBlocksChange={onBlocksChange}
				onDataSourceChange={onDataSourceChange}
				onBidConfigChange={onBidConfigChange}
			/>
		</UploadContext.Provider>
	);
}

function SectionConfigEditorBody(
	props: Omit<SectionConfigEditorProps, "s3Client" | "vendorId">,
) {
	const {
		apiClient,
		sectionTypeName,
		sourceMode,
		settings,
		blocks,
		dataSource,
		bidConfig,
		onSettingsChange,
		onBlocksChange,
		onDataSourceChange,
		onBidConfigChange,
	} = props;

	switch (sectionTypeName) {
		case "hero_carousel":
			return (
				<HeroCarouselEditor
					settings={settings}
					blocks={blocks}
					onSettingsChange={onSettingsChange}
					onBlocksChange={onBlocksChange}
				/>
			);

		case "category_grid":
			return (
				<CategoryGridEditor
					settings={settings}
					blocks={blocks}
					onSettingsChange={onSettingsChange}
					onBlocksChange={onBlocksChange}
				/>
			);

		case "product_carousel":
			return (
				<ProductCarouselEditor
					apiClient={apiClient}
					settings={settings}
					dataSource={dataSource}
					bidConfig={bidConfig}
					sourceMode={sourceMode}
					onSettingsChange={onSettingsChange}
					onDataSourceChange={onDataSourceChange}
					onBidConfigChange={onBidConfigChange}
				/>
			);

		case "flash_deals":
			return (
				<FlashDealsEditor
					settings={settings}
					dataSource={dataSource}
					onSettingsChange={onSettingsChange}
					onDataSourceChange={onDataSourceChange}
				/>
			);

		case "vendor_showcase":
			return (
				<VendorShowcaseEditor
					settings={settings}
					dataSource={dataSource}
					bidConfig={bidConfig}
					sourceMode={sourceMode}
					onSettingsChange={onSettingsChange}
					onDataSourceChange={onDataSourceChange}
					onBidConfigChange={onBidConfigChange}
				/>
			);

		case "brand_spotlight":
			return (
				<BrandSpotlightEditor
					settings={settings}
					blocks={blocks}
					dataSource={dataSource}
					sourceMode={sourceMode}
					onSettingsChange={onSettingsChange}
					onBlocksChange={onBlocksChange}
					onDataSourceChange={onDataSourceChange}
				/>
			);

		case "promotional_banner":
			return (
				<PromotionalBannerEditor
					blocks={blocks}
					onBlocksChange={onBlocksChange}
					allowVideo
				/>
			);

		case "editorial_post":
			return (
				<EditorialPostEditor blocks={blocks} onBlocksChange={onBlocksChange} />
			);

		case "newsletter_signup":
			return (
				<NewsletterSignupEditor
					settings={settings}
					onSettingsChange={onSettingsChange}
				/>
			);

		default:
			return <FallbackJsonEditor {...props} />;
	}
}
