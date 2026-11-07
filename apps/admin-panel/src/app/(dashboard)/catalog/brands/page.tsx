"use client";

import {
	type Brand,
	useBrands,
	useCreateBrand,
	useDeleteBrand,
	useRecomputeBrandCounts,
	useUpdateBrand,
} from "@/lib/queries/brands";
import { s3UploadClient } from "@/lib/s3-upload-client";
import {
	Button,
	DataTable,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	S3ImageUploadField,
	toast,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

interface BrandFormDialogProps {
	open: boolean;
	brand?: Brand | null;
	onClose: () => void;
}

function BrandFormDialog({ open, brand, onClose }: BrandFormDialogProps) {
	const [name, setName] = useState(brand?.name ?? "");
	const [slug, setSlug] = useState(brand?.slug ?? "");
	const [logoUrl, setLogoUrl] = useState(brand?.logo_url ?? "");

	const { mutate: create, isPending: creating } = useCreateBrand();
	const { mutate: update, isPending: updating } = useUpdateBrand();
	const isPending = creating || updating;

	// Keep form in sync when brand prop changes
	useState(() => {
		setName(brand?.name ?? "");
		setSlug(brand?.slug ?? "");
		setLogoUrl(brand?.logo_url ?? "");
	});

	function handleSubmit() {
		if (!name.trim()) return;
		const body = {
			name: name.trim(),
			slug: slug.trim() || name.toLowerCase().replace(/\s+/g, "-"),
			logo_url: logoUrl.trim() || undefined,
		};
		if (brand) {
			update({ id: brand.id, ...body }, { onSuccess: onClose });
		} else {
			create(body, { onSuccess: onClose });
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{brand ? "Edit Brand" : "Add Brand"}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div>
						<label className="block text-sm font-medium text-cacao mb-1">
							Brand Name
						</label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Gulf Board Mills"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-cacao mb-1">
							Slug <span className="text-taupe font-normal">(optional)</span>
						</label>
						<Input
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							placeholder="e.g. gulf-board-mills"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-cacao mb-1">
							Brand Logo
						</label>
						<S3ImageUploadField
							assetType="brand_logo"
							value={logoUrl || null}
							onChange={(url) => setLogoUrl(url ?? "")}
							client={s3UploadClient}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
						{isPending ? "Saving..." : brand ? "Save Changes" : "Create Brand"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function BrandsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const searchParam = searchParams.get("search") ?? "";
	const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
	const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

	const [addOpen, setAddOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Brand | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

	const updateParam = useCallback(
		(updates: Record<string, string | null | undefined>, resetPage = true) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value) params.set(key, value);
				else params.delete(key);
			}
			if (resetPage && !updates.page) params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
		},
		[router, searchParams],
	);

	const [search, setSearch] = useState(searchParam);
	useEffect(() => {
		setSearch(searchParam);
	}, [searchParam]);

	useEffect(() => {
		const t = setTimeout(() => {
			if (search !== searchParam) {
				updateParam({ search: search || null }, true);
			}
		}, 400);
		return () => clearTimeout(t);
	}, [search, searchParam, updateParam]);

	const { data, isLoading } = useBrands({
		search: searchParam || undefined,
		page,
		limit: pagination.pageSize,
	});

	const { mutate: deleteBrand, isPending: deleting } = useDeleteBrand();
	const { mutate: recomputeCounts, isPending: recomputing } =
		useRecomputeBrandCounts();

	function handleRecompute() {
		recomputeCounts(undefined, {
			onSuccess: ({ updated, total }) => {
				toast({
					title: "Recomputed product counts",
					description:
						updated === 0
							? `All ${total} brands were already in sync.`
							: `${updated} of ${total} brand${total === 1 ? "" : "s"} updated.`,
				});
			},
			onError: (err: any) => {
				toast({
					title: "Failed to recompute counts",
					description: err?.response?.data?.message ?? "Unknown error.",
					variant: "destructive",
				});
			},
		});
	}

	const brands: Brand[] = data?.data ?? [];
	const total: number = data?.total ?? 0;
	const pageCount = Math.ceil(total / pagination.pageSize) || 1;

	const columns: ColumnDef<Brand>[] = [
		{
			id: "logo",
			header: "Logo",
			cell: ({ row }) =>
				row.original.logo_url ? (
					<img
						src={row.original.logo_url}
						alt={row.original.name}
						className="h-8 w-auto object-contain"
						onError={(e) =>
							((e.target as HTMLImageElement).style.display = "none")
						}
					/>
				) : (
					<span className="text-taupe text-xs">—</span>
				),
		},
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium text-cacao">{row.original.name}</span>
			),
		},
		{
			accessorKey: "slug",
			header: "Slug",
			cell: ({ row }) => (
				<span className="text-taupe text-sm font-mono">
					{row.original.slug}
				</span>
			),
		},
		{
			accessorKey: "product_count",
			header: "Products",
			cell: ({ row }) => row.original.product_count ?? "—",
		},
		{
			accessorKey: "created_at",
			header: "Created",
			cell: ({ row }) => formatDate(row.original.created_at),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex items-center gap-2 justify-end">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setEditTarget(row.original)}
					>
						<Pencil size={14} />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="text-red-500 hover:text-red-700 hover:bg-red-50"
						onClick={() => setDeleteTarget(row.original)}
					>
						<Trash2 size={14} />
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao mb-1">Brands</h1>
					<p className="text-taupe text-sm">Manage product brands and logos.</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={handleRecompute}
						disabled={recomputing}
						title="Recalculate product_count for every brand from the live products table."
					>
						<RefreshCw
							size={16}
							className={`mr-2 ${recomputing ? "animate-spin" : ""}`}
						/>
						{recomputing ? "Recomputing..." : "Recompute counts"}
					</Button>
					<Button onClick={() => setAddOpen(true)}>
						<Plus size={16} className="mr-2" />
						Add Brand
					</Button>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<Input
					placeholder="Search by name or slug..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="max-w-xs"
				/>
				{searchParam && (
					<span className="text-sm text-taupe">
						{total} result{total === 1 ? "" : "s"}
					</span>
				)}
			</div>

			<DataTable
				columns={columns}
				data={brands}
				isLoading={isLoading}
				pagination={pagination}
				pageCount={pageCount}
				totalCount={total}
				itemLabel="brands"
				onPaginationChange={(updater) => {
					const next = typeof updater === "function" ? updater(pagination) : updater;
					updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
				}}
			/>

			{/* Add / Edit Dialog */}
			<BrandFormDialog
				open={addOpen}
				brand={null}
				onClose={() => setAddOpen(false)}
			/>
			{editTarget && (
				<BrandFormDialog
					open={!!editTarget}
					brand={editTarget}
					onClose={() => setEditTarget(null)}
				/>
			)}

			{/* Delete Confirm Dialog */}
			<Dialog
				open={!!deleteTarget}
				onOpenChange={(o) => !o && setDeleteTarget(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete Brand</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe py-2">
						Are you sure you want to delete{" "}
						<strong>{deleteTarget?.name}</strong>? This cannot be undone.
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleting}
							onClick={() => {
								if (deleteTarget) {
									deleteBrand(deleteTarget.id, {
										onSuccess: () => setDeleteTarget(null),
									});
								}
							}}
						>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
