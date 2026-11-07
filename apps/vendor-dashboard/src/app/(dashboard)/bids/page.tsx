"use client";

import { WEB_URL } from "@/lib/urls";
import {
	useAvailableSections,
	useCancelBid,
	useMyBids,
	usePlaceBid,
	usePreviewBidToken,
	useProductSearch,
	useUpdateBid,
} from "@/lib/queries/bids";
import {
	Badge,
	Button,
	DataTable,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Separator,
	StatusBadge,
} from "@materialhub/ui";
import {
	ArrowSquareOut,
	Gavel,
	ImageIcon,
	MagnifyingGlass,
	Megaphone,
	Pencil,
	ShoppingBag,
	Storefront,
	X,
	XCircle,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AvailableSection {
	id: string;
	section_type?: {
		name?: string;
		label?: Record<string, string>;
		icon?: string;
		supports_bidding?: boolean;
	};
	settings?: Record<string, unknown>;
	bid_config?: { slots?: number; min_bid_fils?: number; ranking?: string };
	bid_stats?: { highest_bid_fils: number | null; total_bids: number };
	layout_slug?: string | null;
	layout_title?: Record<string, string> | null;
	position?: number | null;
}

interface Bid {
	id: string;
	section_id: string;
	section?: {
		id?: string;
		type_name?: string;
		type_label?: Record<string, string>;
		layout_slug?: string;
		layout_title?: Record<string, string>;
		position?: number;
		slots?: number;
	} | null;
	bid_amount_fils: number;
	status: string;
	starts_at?: string;
	expires_at?: string;
	product_id?: string;
	content?: Record<string, unknown>;
}

interface Product {
	id: string;
	name: string;
	slug?: string;
	price?: number;
	images?: string[];
}

function formatAED(fils: number) {
	return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso?: string) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

const sectionIcons: Record<string, typeof Storefront> = {
	vendor_showcase: Storefront,
	product_carousel: ShoppingBag,
	promotional_banner: Megaphone,
};

const STOREFRONT_BASE = WEB_URL;

// Banner-type sections that need image content
const bannerTypes = new Set([
	"promotional_banner",
	"editorial_post",
	"hero_carousel",
]);
// Product-type sections that need product selection
const productTypes = new Set(["product_carousel"]);

// ─── Product Autocomplete ───────────────────────────────────────────────────

function ProductAutocomplete({
	selectedProduct,
	onSelect,
	onClear,
}: {
	selectedProduct: Product | null;
	onSelect: (product: Product) => void;
	onClear: () => void;
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const { data: results, isLoading } = useProductSearch(query);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	if (selectedProduct) {
		return (
			<div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-2.5">
				{selectedProduct.images?.[0] && (
					<Image
						src={selectedProduct.images[0]}
						alt={selectedProduct.name}
						width={40}
						height={40}
						className="rounded object-cover"
					/>
				)}
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-stone-900 truncate">
						{selectedProduct.name}
					</p>
					{selectedProduct.price != null && (
						<p className="text-xs text-stone-500">
							{formatAED(selectedProduct.price)}
						</p>
					)}
				</div>
				<button
					type="button"
					onClick={onClear}
					className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600"
				>
					<X size={14} />
				</button>
			</div>
		);
	}

	return (
		<div ref={ref} className="relative">
			<div className="relative">
				<MagnifyingGlass
					size={14}
					className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
				/>
				<Input
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => query.length >= 2 && setOpen(true)}
					placeholder="Search products by name..."
					className="pl-9 h-9 text-sm"
				/>
			</div>

			{open && query.length >= 2 && (
				<div className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg max-h-60 overflow-auto">
					{isLoading ? (
						<div className="px-3 py-4 text-center text-sm text-stone-400">
							Searching...
						</div>
					) : !results?.length ? (
						<div className="px-3 py-4 text-center text-sm text-stone-400">
							No products found
						</div>
					) : (
						results.map((product: Product) => (
							<button
								key={product.id}
								type="button"
								onClick={() => {
									onSelect(product);
									setQuery("");
									setOpen(false);
								}}
								className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 transition-colors text-left"
							>
								{product.images?.[0] ? (
									<Image
										src={product.images[0]}
										alt={product.name}
										width={32}
										height={32}
										className="rounded object-cover flex-shrink-0"
									/>
								) : (
									<div className="w-8 h-8 rounded bg-stone-100 flex-shrink-0" />
								)}
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-stone-900 truncate">
										{product.name}
									</p>
									{product.price != null && (
										<p className="text-xs text-stone-500">
											{formatAED(product.price)}
										</p>
									)}
								</div>
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}

// ─── Banner Content Editor ──────────────────────────────────────────────────

function BannerContentFields({
	content,
	onChange,
}: {
	content: Record<string, unknown>;
	onChange: (content: Record<string, unknown>) => void;
}) {
	const image = (content.image as Record<string, unknown>) ?? {};
	const desktop = (image.desktop as Record<string, unknown>) ?? {};
	const mobile = (image.mobile as Record<string, unknown>) ?? {};

	function setImageField(
		device: "desktop" | "mobile",
		key: string,
		value: unknown,
	) {
		const currentDevice = device === "desktop" ? desktop : mobile;
		const updated = { ...image, [device]: { ...currentDevice, [key]: value } };
		onChange({ ...content, image: updated });
	}

	return (
		<div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
			<div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">
				<ImageIcon size={13} />
				Banner Creative
			</div>

			<div>
				<Label className="text-xs text-stone-600">Desktop Image URL *</Label>
				<Input
					value={(desktop.url as string) ?? ""}
					onChange={(e) => setImageField("desktop", "url", e.target.value)}
					placeholder="https://..."
					className="h-9 text-sm mt-1"
				/>
				{(desktop.url as string) && (
					<img
						src={desktop.url as string}
						alt="Desktop preview"
						className="mt-2 w-full max-h-24 object-cover rounded border border-stone-200"
						onError={(e) => {
							(e.target as HTMLImageElement).style.display = "none";
						}}
					/>
				)}
			</div>

			<div>
				<Label className="text-xs text-stone-600">
					Mobile Image URL (optional)
				</Label>
				<Input
					value={(mobile.url as string) ?? ""}
					onChange={(e) => setImageField("mobile", "url", e.target.value)}
					placeholder="https://..."
					className="h-9 text-sm mt-1"
				/>
			</div>

			<div>
				<Label className="text-xs text-stone-600">CTA Link</Label>
				<Input
					value={(content.cta_link as string) ?? ""}
					onChange={(e) => onChange({ ...content, cta_link: e.target.value })}
					placeholder="/your-store or /products/..."
					className="h-9 text-sm mt-1"
				/>
			</div>
		</div>
	);
}

// ─── Available Section Card ─────────────────────────────────────────────────

function AvailableSectionCard({
	section,
	myBids,
	onBidNow,
	onEditBid,
	onCancelBid,
}: {
	section: AvailableSection;
	myBids: Bid[];
	onBidNow: () => void;
	onEditBid: (bid: Bid) => void;
	onCancelBid: (bidId: string) => void;
}) {
	const typeName = section.section_type?.name ?? "unknown";
	const typeLabel = section.section_type?.label?.en ?? typeName;
	const title =
		(section.settings?.title as Record<string, string>)?.en ?? typeLabel;
	const slots = section.bid_config?.slots ?? 0;
	const minBid = section.bid_config?.min_bid_fils ?? 0;
	const Icon = sectionIcons[typeName] || Gavel;
	const isBanner = bannerTypes.has(typeName);
	const isProduct = productTypes.has(typeName);

	const { mutateAsync: requestPreview, isPending: previewLoading } =
		usePreviewBidToken();
	const firstBidId = useMemo(() => {
		const active = myBids.find(
			(b) =>
				b.status === "pending" || b.status === "active" || b.status === "won",
		);
		return active?.id;
	}, [myBids]);

	async function openPreview() {
		if (!firstBidId) return;
		try {
			const { token, layout_slug } = await requestPreview(firstBidId);
			const params = new URLSearchParams({
				preview_token: token,
				preview_layout_slug: layout_slug,
			});
			const url = `${STOREFRONT_BASE}/en/?${params.toString()}`;
			window.open(url, "_blank", "noopener,noreferrer");
		} catch {
			alert("Could not open preview — try again.");
		}
	}

	const layoutSubtitle = section.layout_slug
		? `Appears on ${section.layout_title?.en ?? section.layout_slug}${section.position != null ? ` · position ${section.position}` : ""}`
		: null;

	return (
		<div className="rounded-xl border border-stone-200 bg-white overflow-hidden hover:border-stone-300 transition-colors">
			<div className="flex items-center gap-4 p-4">
				<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
					<Icon size={20} />
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						{firstBidId ? (
							<button
								type="button"
								onClick={openPreview}
								disabled={previewLoading}
								className="font-semibold text-stone-900 text-sm hover:underline inline-flex items-center gap-1 group"
								title="Preview on storefront"
							>
								{title}
								<ArrowSquareOut
									size={12}
									className="opacity-0 group-hover:opacity-60 transition-opacity"
								/>
							</button>
						) : (
							<h3 className="font-semibold text-stone-900 text-sm">{title}</h3>
						)}
						{isBanner && (
							<Badge
								variant="outline"
								className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-200"
							>
								Banner
							</Badge>
						)}
						{isProduct && (
							<Badge
								variant="outline"
								className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-200"
							>
								Product
							</Badge>
						)}
					</div>
					<div className="text-xs text-stone-500 mt-0.5 space-x-2">
						<span>{typeLabel}</span>
						{layoutSubtitle && <span>· {layoutSubtitle}</span>}
					</div>
				</div>

				<Button size="sm" onClick={onBidNow}>
					<Gavel size={14} className="mr-1.5" />
					Bid Now
				</Button>
			</div>

			<div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
				<span className="inline-flex items-center gap-1.5 text-xs text-stone-500 bg-stone-50 rounded-md px-2 py-1">
					<span className="font-medium text-stone-700">{slots}</span> slots
				</span>
				{minBid > 0 && (
					<span className="inline-flex items-center gap-1.5 text-xs text-stone-500 bg-stone-50 rounded-md px-2 py-1">
						Min:{" "}
						<span className="font-medium text-stone-700">
							{formatAED(minBid)}
						</span>
					</span>
				)}
				{section.bid_stats?.highest_bid_fils != null && (
					<span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-md px-2 py-1 font-medium">
						Highest bid: {formatAED(section.bid_stats.highest_bid_fils)}
					</span>
				)}
				{section.bid_stats != null && section.bid_stats.total_bids > 0 && (
					<span className="inline-flex items-center gap-1.5 text-xs text-stone-500 bg-stone-50 rounded-md px-2 py-1">
						<span className="font-medium text-stone-700">
							{section.bid_stats.total_bids}
						</span>{" "}
						active bid{section.bid_stats.total_bids !== 1 ? "s" : ""}
					</span>
				)}
				{section.bid_stats?.total_bids === 0 && (
					<span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-md px-2 py-1">
						No bids yet — be first!
					</span>
				)}
				{isBanner && (
					<span className="inline-flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 rounded-md px-2 py-1">
						Requires banner image
					</span>
				)}
				{isProduct && (
					<span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1">
						Select a product to feature
					</span>
				)}
			</div>

			{myBids.length > 0 && (
				<div className="border-t border-stone-100 bg-stone-50/50">
					<div className="px-4 py-2">
						<p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
							Your Bids
						</p>
					</div>
					{myBids.map((bid) => (
						<div
							key={bid.id}
							className="flex items-center gap-3 px-4 py-2.5 border-t border-stone-100 first:border-t-0"
						>
							<StatusBadge status={bid.status} />
							<span className="text-sm font-semibold text-stone-900">
								{formatAED(bid.bid_amount_fils)}
							</span>
							<span className="text-xs text-stone-400">
								{formatDate(bid.starts_at)} – {formatDate(bid.expires_at)}
							</span>
							{bid.product_id && (
								<span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
									Product linked
								</span>
							)}
							{!!bid.content?.image && (
								<span className="text-[10px] text-orange-600 bg-orange-50 rounded px-1.5 py-0.5">
									Banner attached
								</span>
							)}
							<div className="ml-auto flex items-center gap-1">
								{bid.status === "pending" && (
									<button
										onClick={() => onEditBid(bid)}
										className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
										title="Edit bid"
									>
										<Pencil size={13} />
									</button>
								)}
								{(bid.status === "pending" || bid.status === "active") && (
									<button
										onClick={() => {
											if (confirm("Cancel this bid?")) onCancelBid(bid.id);
										}}
										className="p-1 rounded hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
										title="Cancel bid"
									>
										<XCircle size={13} />
									</button>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Page ───────────────────────────────────────────────────────────────────

interface BidForm {
	section_id: string;
	section_name: string;
	section_type_name: string;
	bid_amount_aed: string;
	starts_at: string;
	expires_at: string;
	// Product selection
	selected_product: Product | null;
	// Banner content
	content: Record<string, unknown>;
}

const emptyForm: BidForm = {
	section_id: "",
	section_name: "",
	section_type_name: "",
	bid_amount_aed: "",
	starts_at: "",
	expires_at: "",
	selected_product: null,
	content: {},
};

export default function VendorBidsPage() {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<BidForm>(emptyForm);
	const [formError, setFormError] = useState("");

	const { data: bidsData, isLoading: bidsLoading } = useMyBids();
	const { data: availableSections, isLoading: sectionsLoading } =
		useAvailableSections();
	const { mutate: placeBid, isPending: placing } = usePlaceBid();
	const { mutate: updateBid, isPending: updating } = useUpdateBid();
	const { mutate: cancelBid } = useCancelBid();

	const bids: Bid[] = bidsData ?? [];
	const sections: AvailableSection[] = availableSections ?? [];

	const bidsBySection: Record<string, Bid[]> = {};
	for (const bid of bids) {
		if (!bidsBySection[bid.section_id]) bidsBySection[bid.section_id] = [];
		bidsBySection[bid.section_id].push(bid);
	}

	const sectionIds = new Set(sections.map((s) => s.id));
	const orphanBids = bids.filter((b) => !sectionIds.has(b.section_id));

	const isBannerBid = bannerTypes.has(form.section_type_name);
	const isProductBid = productTypes.has(form.section_type_name);

	function openBidForSection(section: AvailableSection) {
		const typeLabel =
			section.section_type?.label?.en ?? section.section_type?.name ?? "";
		const title =
			(section.settings?.title as Record<string, string>)?.en ?? typeLabel;
		setEditingId(null);
		setForm({
			...emptyForm,
			section_id: section.id,
			section_name: title,
			section_type_name: section.section_type?.name ?? "",
		});
		setFormError("");
		setDialogOpen(true);
	}

	function openEdit(bid: Bid) {
		const label = bid.section?.type_label?.en ?? bid.section?.type_name ?? "";
		const section = sections.find((s) => s.id === bid.section_id);
		setEditingId(bid.id);
		setForm({
			section_id: bid.section_id,
			section_name: label,
			section_type_name:
				section?.section_type?.name ?? bid.section?.type_name ?? "",
			bid_amount_aed: String((bid.bid_amount_fils / 100).toFixed(2)),
			starts_at: bid.starts_at ? bid.starts_at.slice(0, 16) : "",
			expires_at: bid.expires_at ? bid.expires_at.slice(0, 16) : "",
			selected_product: bid.product_id
				? { id: bid.product_id, name: bid.product_id }
				: null,
			content: bid.content ?? {},
		});
		setFormError("");
		setDialogOpen(true);
	}

	function handleSubmit() {
		const amountAed = Number.parseFloat(form.bid_amount_aed);
		if (isNaN(amountAed) || amountAed <= 0) {
			setFormError("Bid amount must be a positive number.");
			return;
		}
		if (!editingId && !form.starts_at) {
			setFormError("Start date/time is required.");
			return;
		}
		if (!editingId && !form.expires_at) {
			setFormError("Expiry date/time is required.");
			return;
		}
		if (isBannerBid && !editingId) {
			const img = form.content.image as Record<string, unknown>;
			const desktopUrl = (img?.desktop as Record<string, unknown>)?.url;
			if (!desktopUrl) {
				setFormError("Desktop banner image URL is required.");
				return;
			}
		}
		setFormError("");

		const bid_amount_fils = Math.round(amountAed * 100);

		if (editingId) {
			updateBid(
				{
					id: editingId,
					bid_amount_fils,
					content: isBannerBid ? form.content : undefined,
				},
				{
					onSuccess: () => setDialogOpen(false),
					onError: () => setFormError("Failed to update bid."),
				},
			);
		} else {
			placeBid(
				{
					section_id: form.section_id,
					bid_amount_fils,
					product_id: form.selected_product?.id || undefined,
					content: isBannerBid ? form.content : undefined,
					starts_at: new Date(form.starts_at).toISOString(),
					expires_at: new Date(form.expires_at).toISOString(),
				},
				{
					onSuccess: () => setDialogOpen(false),
					onError: () => setFormError("Failed to place bid. Please try again."),
				},
			);
		}
	}

	const columns = [
		{
			accessorKey: "section" as const,
			header: "Section",
			cell: ({ row }: { row: { original: Bid } }) => (
				<span className="text-sm font-medium">
					{row.original.section?.type_label?.en ??
						row.original.section?.type_name ??
						row.original.section_id?.slice(0, 8) ??
						"—"}
				</span>
			),
		},
		{
			accessorKey: "bid_amount_fils" as const,
			header: "Bid Amount",
			cell: ({ row }: { row: { original: Bid } }) => (
				<span className="font-semibold text-sm">
					{formatAED(row.original.bid_amount_fils)}
				</span>
			),
		},
		{
			accessorKey: "status" as const,
			header: "Status",
			cell: ({ row }: { row: { original: Bid } }) => (
				<StatusBadge status={row.original.status} />
			),
		},
		{
			id: "dates",
			header: "Date Range",
			cell: ({ row }: { row: { original: Bid } }) => (
				<span className="text-xs text-muted-foreground">
					{formatDate(row.original.starts_at)} –{" "}
					{formatDate(row.original.expires_at)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }: { row: { original: Bid } }) => {
				const canCancel =
					row.original.status === "pending" || row.original.status === "active";
				return canCancel ? (
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive hover:text-destructive"
						onClick={() => {
							if (confirm("Cancel this bid?")) cancelBid(row.original.id);
						}}
					>
						<XCircle size={14} className="mr-1" />
						Cancel
					</Button>
				) : null;
			},
		},
	];

	return (
		<div className="space-y-8">
			{/* Available Sections */}
			<div>
				<h1 className="text-2xl font-bold text-stone-900">
					Sponsored Placements
				</h1>
				<p className="text-sm text-stone-500 mt-1">
					Bid for premium placement on the storefront. Higher bids win the slot.
				</p>

				<div className="mt-4 space-y-3">
					{sectionsLoading ? (
						<div className="space-y-3">
							{[1, 2, 3].map((i) => (
								<div
									key={i}
									className="h-24 rounded-xl border border-stone-100 bg-stone-50 animate-pulse"
								/>
							))}
						</div>
					) : sections.length === 0 ? (
						<div className="rounded-xl border-2 border-dashed border-stone-200 py-10 text-center text-stone-400">
							<Gavel size={24} className="mx-auto mb-2 opacity-50" />
							<p className="text-sm">
								No sections are currently open for bidding.
							</p>
						</div>
					) : (
						sections.map((section) => (
							<AvailableSectionCard
								key={section.id}
								section={section}
								myBids={bidsBySection[section.id] ?? []}
								onBidNow={() => openBidForSection(section)}
								onEditBid={openEdit}
								onCancelBid={(id) => cancelBid(id)}
							/>
						))
					)}
				</div>
			</div>

			{orphanBids.length > 0 && (
				<>
					<Separator />
					<div>
						<h2 className="text-lg font-bold text-stone-900">Past Bids</h2>
						<p className="text-sm text-stone-500 mt-1">
							Bids for sections that are no longer available for bidding.
						</p>
						<div className="mt-4">
							<DataTable
								columns={columns}
								data={orphanBids}
								isLoading={false}
							/>
							<div className="flex items-center justify-between pt-2">
								<span className="text-sm text-muted-foreground">
									Total: {orphanBids.length}{" "}
									{orphanBids.length === 1 ? "past bid" : "past bids"}
								</span>
							</div>
						</div>
					</div>
				</>
			)}

			{/* Bid Dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editingId ? "Edit Bid" : `Bid on "${form.section_name}"`}
						</DialogTitle>
						{!editingId && (
							<p className="text-sm text-stone-500 mt-1">
								{isBannerBid &&
									"Upload a banner creative for this placement."}
								{isProductBid &&
									"Select a product to feature in this placement."}
								{!isBannerBid &&
									!isProductBid &&
									"Set your bid amount and schedule."}
							</p>
						)}
					</DialogHeader>

					<div className="space-y-4 py-2">
						{formError && (
							<div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
								{formError}
							</div>
						)}

						{/* Bid Amount */}
						<div>
							<Label className="text-sm font-medium text-stone-700">
								Bid Amount (AED) *
							</Label>
							<Input
								type="number"
								step="0.01"
								min="0"
								value={form.bid_amount_aed}
								onChange={(e) =>
									setForm((f) => ({ ...f, bid_amount_aed: e.target.value }))
								}
								placeholder="e.g. 500.00"
								className="mt-1"
								autoFocus
							/>
						</div>

						{/* Product Selection (for product-type sections) */}
						{isProductBid && !editingId && (
							<div>
								<Label className="text-sm font-medium text-stone-700">
									Featured Product
								</Label>
								<div className="mt-1">
									<ProductAutocomplete
										selectedProduct={form.selected_product}
										onSelect={(product) =>
											setForm((f) => ({ ...f, selected_product: product }))
										}
										onClear={() =>
											setForm((f) => ({ ...f, selected_product: null }))
										}
									/>
								</div>
							</div>
						)}

						{/* Banner Content (for banner-type sections) */}
						{isBannerBid && (
							<BannerContentFields
								content={form.content}
								onChange={(content) => setForm((f) => ({ ...f, content }))}
							/>
						)}

						{/* Schedule (new bids only) */}
						{!editingId && (
							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label className="text-sm font-medium text-stone-700">
										Starts At *
									</Label>
									<Input
										type="datetime-local"
										value={form.starts_at}
										onChange={(e) =>
											setForm((f) => ({ ...f, starts_at: e.target.value }))
										}
										className="mt-1"
									/>
								</div>
								<div>
									<Label className="text-sm font-medium text-stone-700">
										Expires At *
									</Label>
									<Input
										type="datetime-local"
										value={form.expires_at}
										onChange={(e) =>
											setForm((f) => ({ ...f, expires_at: e.target.value }))
										}
										className="mt-1"
									/>
								</div>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={placing || updating}>
							{placing || updating
								? "Saving…"
								: editingId
									? "Update Bid"
									: "Place Bid"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
