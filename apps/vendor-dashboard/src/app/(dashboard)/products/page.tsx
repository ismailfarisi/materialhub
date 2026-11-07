"use client";

import { ProductExportDialog } from "@/components/product-export/ProductExportDialog";
import { ProductStatusControl } from "@/components/products/ProductStatusControl";
import { type BulkActionResult, summarizeBulkResult } from "@/lib/product-status";
import {
	useBulkAction,
	useDeleteProduct,
	useVendorProducts,
} from "@/lib/queries/products";
import {
	type AttributeFilter,
	AttributeFilterSidebar,
	Button,
	DataTable,
	EmptyState,
	FiltersBar,
	StatusBadge,
} from "@materialhub/ui";
import {
	DownloadSimple,
	Package,
	PencilSimple,
	Plus,
	Trash,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

const STATUS_OPTIONS = [
	{ label: "All Statuses", value: "" },
	{ label: "Draft", value: "draft" },
	{ label: "Pending Review", value: "pending_review" },
	{ label: "Approved", value: "approved" },
	{ label: "Published", value: "published" },
	{ label: "Rejected", value: "rejected" },
	{ label: "Unpublished", value: "unpublished" },
	{ label: "Archived", value: "archived" },
];

function formatPrice(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

interface VendorProduct {
	id: string;
	name: string;
	status?: string;
	price?: number | null;
	thumbnail_url?: string | null;
	created_at?: string | number;
}

function formatDate(val: string | number | undefined) {
	if (!val) return "—";
	const d = typeof val === "number" ? new Date(val * 1000) : new Date(val);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function ProductsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
	const [exportOpen, setExportOpen] = useState(false);
	const [bulkMessage, setBulkMessage] = useState<string | null>(null);
	const selectedIds = useMemo(
		() => Object.keys(rowSelection).filter((k) => rowSelection[k]),
		[rowSelection],
	);

	const search = searchParams.get("search") ?? "";
	const status = searchParams.get("status") ?? "";
	const page = Number(searchParams.get("page") ?? "1");

	const onChangeParam = useCallback(
		(key: string, next: string | null) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next) params.set(key, next);
			else params.delete(key);
			if (key !== "page") {
				params.delete("page");
			}
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
		},
		[router, searchParams],
	);

	const { data, isLoading } = useVendorProducts({
		search: search || undefined,
		status: status || undefined,
		page,
		limit: 20,
	});

	const { mutate: bulkMutate, isPending: bulkPending } = useBulkAction();
	const verbs: Record<string, string> = {
		archive: "archived",
		delete: "deleted",
		publish: "published",
		unpublish: "unpublished",
	};
	const bulkAction = (
		vars: { ids: string[]; action: string },
		opts?: { onSuccess?: () => void },
	) => {
		setBulkMessage(null);
		bulkMutate(vars, {
			onSuccess: (result: BulkActionResult) => {
				setBulkMessage(summarizeBulkResult(verbs[vars.action] ?? "updated", result));
				opts?.onSuccess?.();
			},
			onError: (err: unknown) => {
				const e = err as { response?: { data?: { message?: string } } };
				setBulkMessage(e?.response?.data?.message ?? "Bulk action failed. Try again.");
			},
		});
	};
	const { mutate: deleteProduct } = useDeleteProduct();

	const products: VendorProduct[] = data?.items ?? [];
	const total: number = data?.total ?? 0;
	const totalPages = data?.totalPages ?? Math.ceil(total / 20);

	const columns = [
		{
			id: "image",
			header: "",
			cell: ({ row }: { row: { original: VendorProduct } }) => {
				const p = row.original;
				return p.thumbnail_url ? (
					<Image
						src={p.thumbnail_url}
						alt={p.name}
						width={40}
						height={40}
						className="rounded object-cover"
					/>
				) : (
					<div className="w-10 h-10 rounded bg-pearl/20 flex items-center justify-center">
						<Package size={16} className="text-muted-foreground" />
					</div>
				);
			},
		},
		{
			id: "name",
			header: "Product",
			cell: ({ row }: { row: { original: VendorProduct } }) => {
				const p = row.original;
				return (
					<Link
						href={`/products/${p.id}/edit`}
						className="font-medium hover:underline text-sm"
					>
						{p.name}
					</Link>
				);
			},
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }: { row: { original: VendorProduct } }) => {
				const p = row.original;
				return p.status ? (
					<StatusBadge status={p.status} />
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				);
			},
		},
		{
			id: "price",
			header: "Price",
			cell: ({ row }: { row: { original: VendorProduct } }) => {
				const p = row.original;
				return (
					<span className="text-sm">
						{p.price != null ? formatPrice(p.price) : "—"}
					</span>
				);
			},
		},
		{
			id: "created_at",
			header: "Created",
			cell: ({ row }: { row: { original: VendorProduct } }) => {
				const p = row.original;
				return (
					<span className="text-sm text-muted-foreground">
						{formatDate(p.created_at)}
					</span>
				);
			},
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }: { row: { original: VendorProduct } }) => {
				const p = row.original;
				return (
					<div className="flex items-start gap-2 justify-end">
						<ProductStatusControl productId={p.id} status={p.status} compact />
						<Button variant="ghost" size="sm" asChild aria-label="Edit product">
							<Link href={`/products/${p.id}/edit`}>
								<PencilSimple size={16} />
							</Link>
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
							aria-label="Delete product"
							onClick={() => {
								if (confirm(`Delete "${p.name}"?`)) {
									deleteProduct(p.id);
								}
							}}
						>
							<Trash size={16} />
						</Button>
					</div>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao">Products</h1>
					<p className="text-sm text-taupe">Manage your product catalogue</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						className="gap-2"
						onClick={() => setExportOpen(true)}
					>
						<DownloadSimple size={16} />
						Export
					</Button>
					<Button variant="outline" asChild>
						<Link href="/products/groups/new">
							<Plus size={16} className="mr-2" />
							New Color Family
						</Link>
					</Button>
					<Button asChild>
						<Link href="/products/new">
							<Plus size={16} className="mr-2" />
							New Product
						</Link>
					</Button>
				</div>
			</div>

			<FiltersBar
				search={{
					placeholder: "Search products…",
					value: search,
					onChange: (v: string) => {
						onChangeParam("search", v || null);
					},
				}}
				filters={[
					{
						key: "status",
						label: "Status",
						options: STATUS_OPTIONS,
						value: status,
						onChange: (v: string) => {
							onChangeParam("status", v || null);
						},
					},
				]}
			/>

			{selectedIds.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 p-3 bg-pearl/20 rounded-lg text-sm">
					<span className="text-muted-foreground">
						{selectedIds.length} selected
					</span>
					<Button
						size="sm"
						variant="outline"
						disabled={bulkPending}
						onClick={() =>
							bulkAction(
								{ ids: selectedIds, action: "publish" },
								{ onSuccess: () => setRowSelection({}) },
							)
						}
					>
						Publish Selected
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={bulkPending}
						onClick={() =>
							bulkAction(
								{ ids: selectedIds, action: "unpublish" },
								{ onSuccess: () => setRowSelection({}) },
							)
						}
					>
						Unpublish Selected
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={bulkPending}
						onClick={() =>
							bulkAction(
								{ ids: selectedIds, action: "archive" },
								{ onSuccess: () => setRowSelection({}) },
							)
						}
					>
						Archive Selected
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="text-destructive"
						disabled={bulkPending}
						onClick={() => {
							if (confirm(`Delete ${selectedIds.length} products?`)) {
								bulkAction(
									{ ids: selectedIds, action: "delete" },
									{ onSuccess: () => setRowSelection({}) },
								);
							}
						}}
					>
						Delete Selected
					</Button>
				</div>
			)}

			{bulkMessage ? (
				<p role="status" className="text-sm text-muted-foreground">
					{bulkMessage}
				</p>
			) : null}

			<div className="flex">
				{(data?.facets?.attributes?.length ?? 0) > 0 && (
					<aside className="w-64 shrink-0 space-y-6 pr-6">
						<AttributeFilterSidebar
							attributes={(data?.facets?.attributes ?? []) as AttributeFilter[]}
							getParam={(k) => searchParams.get(k)}
							onChangeParam={onChangeParam}
						/>
					</aside>
				)}
				<div className="flex-1">
					{!isLoading && products.length === 0 ? (
						<EmptyState
							icon={<Package size={40} />}
							title="No products yet"
							description="Add your first product to start selling on MaterialHub."
							action={{
								label: "New Product",
								onClick: () => router.push("/products/new"),
							}}
						/>
					) : (
						<>
							<DataTable
								columns={columns}
								data={products}
								isLoading={isLoading}
								enableRowSelection
								onRowSelectionChange={setRowSelection}
								rowId="id"
							/>
							<div className="flex items-center justify-between pt-2">
								<span className="text-sm text-muted-foreground">
									{totalPages > 1
										? `Page ${page} of ${totalPages} (${total} products)`
										: `Total: ${total} ${total === 1 ? "product" : "products"}`}
								</span>
								{totalPages > 1 && (
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="outline"
											disabled={page === 1}
											onClick={() => onChangeParam("page", String(page - 1))}
										>
											Previous
										</Button>
										<Button
											size="sm"
											variant="outline"
											disabled={page >= totalPages}
											onClick={() => onChangeParam("page", String(page + 1))}
										>
											Next
										</Button>
									</div>
								)}
							</div>
						</>
					)}
				</div>
			</div>

			{exportOpen && (
				<ProductExportDialog
					open={exportOpen}
					onOpenChange={setExportOpen}
					filters={{ status: status || undefined, search: search || undefined }}
				/>
			)}
		</div>
	);
}
