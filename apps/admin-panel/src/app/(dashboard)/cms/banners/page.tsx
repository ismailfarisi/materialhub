"use client";

import {
	useBanners,
	useCreateBanner,
	useDeleteBanner,
	useUpdateBanner,
} from "@/lib/queries/cms";
import { s3UploadClient } from "@/lib/s3-upload-client";
import {
	Button,
	DataTable,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	EmptyState,
	Input,
	S3ImageUploadField,
	SimpleSelect,
	Skeleton,
	StatusBadge,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Banner {
	id: string;
	title: string;
	placement: string;
	starts_at?: string;
	expires_at?: string;
	is_active: boolean;
	sort_order?: number;
	subtitle?: string;
	image_url?: string;
	mobile_image_url?: string;
	link_url?: string;
	locale?: string;
}

const PLACEMENT_OPTIONS = [
	{ label: "Homepage Hero", value: "homepage_hero" },
	{ label: "Homepage Secondary", value: "homepage_secondary" },
	{ label: "Category Top", value: "category_top" },
	{ label: "App Splash", value: "app_splash" },
];

const LOCALE_OPTIONS = [
	{ label: "English", value: "en" },
	{ label: "Arabic", value: "ar" },
	{ label: "Hindi", value: "hi" },
	{ label: "Urdu", value: "ur" },
	{ label: "Malayalam", value: "ml" },
];

function formatDate(iso?: string) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function placementLabel(value: string) {
	return PLACEMENT_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

const emptyBanner = {
	title: "",
	subtitle: "",
	image_url: "",
	mobile_image_url: "",
	link_url: "",
	placement: "homepage_hero",
	starts_at: "",
	expires_at: "",
	locale: "en",
	is_active: true,
	sort_order: 0,
};

type BannerFormState = typeof emptyBanner;

export default function BannersPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<BannerFormState>(emptyBanner);
	const [formError, setFormError] = useState("");

	const updateParam = useCallback(
		(updates: Record<string, string | null | undefined>) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value) params.set(key, value);
				else params.delete(key);
			}
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
		},
		[router, searchParams],
	);

	const { data, isLoading } = useBanners({
		page,
		limit: pagination.pageSize,
	});
	const { mutate: createBanner, isPending: creating } = useCreateBanner();
	const { mutate: updateBanner, isPending: updating } = useUpdateBanner();
	const { mutate: deleteBanner } = useDeleteBanner();

	const banners: Banner[] = data?.banners ?? data?.items ?? [];
	const total: number = data?.total ?? 0;
	const pageCount = Math.ceil(total / pagination.pageSize) || 1;

	function openCreate() {
		setEditingId(null);
		setForm(emptyBanner);
		setFormError("");
		setDialogOpen(true);
	}

	function openEdit(banner: Banner) {
		setEditingId(banner.id);
		setForm({
			title: banner.title ?? "",
			subtitle: banner.subtitle ?? "",
			image_url: banner.image_url ?? "",
			mobile_image_url: banner.mobile_image_url ?? "",
			link_url: banner.link_url ?? "",
			placement: banner.placement ?? "homepage_hero",
			starts_at: banner.starts_at ? banner.starts_at.slice(0, 10) : "",
			expires_at: banner.expires_at ? banner.expires_at.slice(0, 10) : "",
			locale: banner.locale ?? "en",
			is_active: banner.is_active ?? true,
			sort_order: banner.sort_order ?? 0,
		});
		setFormError("");
		setDialogOpen(true);
	}

	function handleSave() {
		if (!form.title.trim()) {
			setFormError("Title is required.");
			return;
		}
		if (!form.image_url.trim()) {
			setFormError("Image URL is required.");
			return;
		}
		setFormError("");

		const payload = {
			title: form.title,
			subtitle: form.subtitle || undefined,
			image_url: form.image_url,
			mobile_image_url: form.mobile_image_url || undefined,
			link_url: form.link_url || undefined,
			placement: form.placement,
			starts_at: form.starts_at || undefined,
			expires_at: form.expires_at || undefined,
			locale: form.locale,
			is_active: form.is_active,
			sort_order: form.sort_order,
		};

		if (editingId) {
			updateBanner(
				{ id: editingId, payload },
				{
					onSuccess: () => setDialogOpen(false),
					onError: () => setFormError("Failed to update banner."),
				},
			);
		} else {
			createBanner(payload, {
				onSuccess: () => setDialogOpen(false),
				onError: () => setFormError("Failed to create banner."),
			});
		}
	}

	function field<K extends keyof BannerFormState>(
		key: K,
		value: BannerFormState[K],
	) {
		setForm((prev) => ({ ...prev, [key]: value }));
	}

	const columns: ColumnDef<Banner>[] = [
		{
			id: "preview",
			header: "",
			cell: ({ row }) => {
				const src = row.original.image_url;
				if (!src) {
					return (
						<div className="w-14 h-9 rounded bg-pearl/100 flex items-center justify-center text-taupe">
							<ImageIcon size={14} />
						</div>
					);
				}
				return (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={src}
						alt={row.original.title}
						className="w-14 h-9 rounded object-cover bg-pearl/100"
					/>
				);
			},
		},
		{
			accessorKey: "title",
			header: "Title",
			cell: ({ row }) => (
				<span className="font-medium text-cacao">{row.original.title}</span>
			),
		},
		{
			accessorKey: "placement",
			header: "Placement",
			cell: ({ row }) => (
				<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-amber">
					{placementLabel(row.original.placement)}
				</span>
			),
		},
		{
			accessorKey: "starts_at",
			header: "Starts",
			cell: ({ row }) => formatDate(row.original.starts_at),
		},
		{
			accessorKey: "expires_at",
			header: "Expires",
			cell: ({ row }) => formatDate(row.original.expires_at),
		},
		{
			accessorKey: "is_active",
			header: "Active",
			cell: ({ row }) => (
				<StatusBadge status={row.original.is_active ? "active" : "inactive"} />
			),
		},
		{
			accessorKey: "sort_order",
			header: "Order",
			cell: ({ row }) => (
				<span className="text-taupe text-sm">
					{row.original.sort_order ?? 0}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex items-center gap-2 justify-end">
					<button
						className="p-1.5 rounded hover:bg-pearl/100 text-taupe hover:text-cacao"
						onClick={() => openEdit(row.original)}
						aria-label="Edit banner"
						title="Edit banner"
					>
						<Pencil size={15} />
					</button>
					<button
						className="p-1.5 rounded hover:bg-red-50 text-taupe hover:text-red-600"
						onClick={() => {
							if (confirm(`Delete banner "${row.original.title}"?`)) {
								deleteBanner(row.original.id);
							}
						}}
						aria-label="Delete banner"
						title="Delete banner"
					>
						<Trash2 size={15} />
					</button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-baseline gap-2">
						<h1 className="text-2xl font-bold text-cacao">Banners</h1>
						{!isLoading && total > 0 && (
							<span className="text-sm text-taupe">
								({total.toLocaleString("en-AE")})
							</span>
						)}
					</div>
					<p className="text-taupe text-sm mt-1">
						Promotional banners shown on homepage, category pages, and the
						mobile app splash.
					</p>
				</div>
				<Button onClick={openCreate}>
					<Plus size={16} className="mr-1.5" />
					Add Banner
				</Button>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-12 w-full rounded-lg" />
					))}
				</div>
			) : banners.length === 0 ? (
				<div className="rounded-xl border border-stone-200 bg-linen">
					<EmptyState
						icon={<ImageIcon size={28} />}
						title="No banners yet"
						description="Add a banner with desktop and mobile imagery, set a placement, and choose when it should run."
						action={{
							label: "Add your first banner",
							onClick: openCreate,
						}}
					/>
				</div>
			) : (
				<DataTable
					columns={columns}
					data={banners}
					isLoading={isLoading}
					pagination={pagination}
					pageCount={pageCount}
					totalCount={total}
					itemLabel="banners"
					onPaginationChange={(updater) => {
						const next = typeof updater === "function" ? updater(pagination) : updater;
						updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null });
					}}
				/>
			)}

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editingId ? "Edit Banner" : "Add Banner"}
						</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 py-2">
						{formError && (
							<div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
								{formError}
							</div>
						)}

						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Title *
							</label>
							<Input
								value={form.title}
								onChange={(e) => field("title", e.target.value)}
								placeholder="Banner title"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Subtitle
							</label>
							<Input
								value={form.subtitle}
								onChange={(e) => field("subtitle", e.target.value)}
								placeholder="Optional subtitle"
							/>
						</div>

						<div>
							<S3ImageUploadField
								assetType="banner_image"
								value={form.image_url || null}
								onChange={(url) => setForm({ ...form, image_url: url ?? "" })}
								client={s3UploadClient}
								label="Desktop image"
							/>
						</div>

						<div>
							<S3ImageUploadField
								assetType="banner_image"
								value={form.mobile_image_url || null}
								onChange={(url) =>
									setForm({ ...form, mobile_image_url: url ?? "" })
								}
								client={s3UploadClient}
								label="Mobile image (optional)"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Link URL
							</label>
							<Input
								value={form.link_url}
								onChange={(e) => field("link_url", e.target.value)}
								placeholder="https://..."
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Placement
							</label>
							<SimpleSelect
								value={form.placement}
								onValueChange={(v) => field("placement", v)}
								options={PLACEMENT_OPTIONS}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Starts At
								</label>
								<Input
									type="date"
									value={form.starts_at}
									onChange={(e) => field("starts_at", e.target.value)}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Expires At
								</label>
								<Input
									type="date"
									value={form.expires_at}
									onChange={(e) => field("expires_at", e.target.value)}
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Locale
								</label>
								<SimpleSelect
									value={form.locale}
									onValueChange={(v) => field("locale", v)}
									options={LOCALE_OPTIONS}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Sort Order
								</label>
								<Input
									type="number"
									value={String(form.sort_order)}
									onChange={(e) => field("sort_order", Number(e.target.value))}
									min="0"
								/>
							</div>
						</div>

						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => field("is_active", !form.is_active)}
								className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
									form.is_active ? "bg-blue-600" : "bg-pearl/200"
								}`}
								role="switch"
								aria-checked={form.is_active}
							>
								<span
									className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-linen shadow ring-0 transition duration-200 ease-in-out ${
										form.is_active ? "translate-x-5" : "translate-x-0"
									}`}
								/>
							</button>
							<span className="text-sm font-medium text-cacao">Active</span>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={creating || updating}>
							{creating || updating
								? "Saving…"
								: editingId
									? "Save Changes"
									: "Add Banner"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
