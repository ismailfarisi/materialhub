"use client";

import { ProductExportDialog } from "@/components/product-export/ProductExportDialog";
import { useBrands } from "@/lib/queries/brands";
import { type Category, useAdminCategoryTree } from "@/lib/queries/categories";
import {
  useAdminProducts,
  useApproveProduct,
  useBulkProductAction,
  useDeleteAdminProduct,
  useRejectProduct,
  useToggleFeatureProduct,
} from "@/lib/queries/products";
import { useVendors } from "@/lib/queries/vendors";
import {
  type AttributeFilter,
  AttributeFilterSidebar,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FiltersBar,
  Input,
  Skeleton,
  StatusBadge,
  Textarea,
} from "@materialhub/ui";
import { toast } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Check, Download, Eye, Globe, Plus, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Product {
  id: string;
  name: string;
  status: string;
  price: number;
  is_featured: boolean;
  created_at: string;
  vendor?: { id: string; name: string };
  brand?: { id: string; name: string } | null;
  images?: Array<{ url: string; thumbnail_url: string | null; is_primary: boolean }>;
  category_id: string;
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Pending Review", value: "pending_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Published", value: "published" },
  { label: "Unpublished", value: "unpublished" },
  { label: "Archived", value: "archived" },
];

// Flatten the category tree into select options, keeping the ancestry visible
// ("Skincare / Cleansers") since leaf names alone are often ambiguous.
function flattenCategories(
  categories: Category[],
  prefix = "",
): Array<{ label: string; value: string }> {
  return categories.flatMap((category) => {
    const label = prefix ? `${prefix} / ${category.name}` : category.name;
    return [
      { label, value: category.id },
      ...flattenCategories(category.children ?? [], label),
    ];
  });
}

function formatPrice(fils: number) {
  return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
  const brandFilter = searchParams.get("brand_id") ?? "__all__";
  const categoryFilter = searchParams.get("category_id") ?? "__all__";
  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const updateParam = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "__all__") params.set(key, value);
        else params.delete(key);
      }
      if (resetPage && !updates.page) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const onChangeParam = useCallback(
    (key: string, next: string | null) => {
      updateParam({ [key]: next });
    },
    [updateParam],
  );

  const [search, setSearch] = useState(searchParam);
  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  // Debounce search
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchTimer) clearTimeout(searchTimer);
    const timer = setTimeout(() => {
      updateParam({ search: val || null }, true);
    }, 400);
    setSearchTimer(timer);
  }

  const { data, isLoading } = useAdminProducts({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    vendor_id: vendorFilter === "__all__" ? undefined : vendorFilter,
    brand_id: brandFilter === "__all__" ? undefined : brandFilter,
    category_id: categoryFilter === "__all__" ? undefined : categoryFilter,
    search: searchParam || undefined,
    page,
    limit: pagination.pageSize,
  });

  const { data: vendorsData } = useVendors({ limit: 200 });
  const vendorOptions = useMemo(() => {
    const vendors = vendorsData?.items ?? vendorsData?.data ?? [];
    return vendors.map((v: any) => ({ label: v.name, value: v.id }));
  }, [vendorsData]);

  const { data: brandsData } = useBrands({ limit: 200 });
  const brandOptions = useMemo(() => {
    const brands = brandsData?.data ?? brandsData?.items ?? [];
    return brands.map((b: any) => ({ label: b.name, value: b.id }));
  }, [brandsData]);

  const { data: categoryTree } = useAdminCategoryTree();
  const categoryOptions = useMemo(() => flattenCategories(categoryTree ?? []), [categoryTree]);

  const { mutate: approveProduct } = useApproveProduct();
  const { mutate: rejectProduct } = useRejectProduct();
  const { mutate: toggleFeature } = useToggleFeatureProduct();
  const { mutate: deleteProduct } = useDeleteAdminProduct();
  const { mutate: bulkAction, isPending: bulkPending } = useBulkProductAction();

  const products: Product[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function handleApprove(id: string) {
    approveProduct(id, {
      onSuccess: () => toast({ title: "Product approved" }),
      onError: (err: any) =>
        toast({
          title: "Error",
          description: err?.response?.data?.message ?? "Failed",
          variant: "destructive",
        }),
    });
  }

  function handleRejectSubmit() {
    if (!rejectTargetId || !rejectReason.trim()) return;
    rejectProduct(
      { id: rejectTargetId, reason: rejectReason },
      {
        onSuccess: () => {
          toast({ title: "Product rejected" });
          setRejectOpen(false);
          setRejectReason("");
          setRejectTargetId(null);
        },
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err?.response?.data?.message ?? "Failed",
            variant: "destructive",
          }),
      },
    );
  }

  function handleBulkAction(action: string) {
    if (selectedIds.length === 0) return;
    if (action === "reject") {
      setBulkRejectOpen(true);
      return;
    }
    bulkAction(
      { action, ids: selectedIds },
      {
        onSuccess: (data: any) => {
          toast({
            title: `${action} completed`,
            description: `${data?.affected ?? selectedIds.length} products affected`,
          });
          setSelectedIds([]);
        },
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err?.response?.data?.message ?? "Failed",
            variant: "destructive",
          }),
      },
    );
  }

  function handleBulkRejectSubmit() {
    if (!bulkRejectReason.trim()) return;
    bulkAction(
      { action: "reject", ids: selectedIds, reason: bulkRejectReason },
      {
        onSuccess: (data: any) => {
          toast({
            title: "Products rejected",
            description: `${data?.affected ?? selectedIds.length} products rejected`,
          });
          setSelectedIds([]);
          setBulkRejectOpen(false);
          setBulkRejectReason("");
        },
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err?.response?.data?.message ?? "Failed",
            variant: "destructive",
          }),
      },
    );
  }

  const columns: ColumnDef<Product>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => {
            table.toggleAllPageRowsSelected(e.target.checked);
            if (e.target.checked) {
              setSelectedIds(products.map((p) => p.id));
            } else {
              setSelectedIds([]);
            }
          }}
          className="rounded"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.original.id)}
          onChange={(e) => {
            setSelectedIds((prev) =>
              e.target.checked
                ? [...prev, row.original.id]
                : prev.filter((id) => id !== row.original.id),
            );
          }}
          className="rounded"
        />
      ),
      size: 40,
    },
    {
      id: "image",
      header: "",
      cell: ({ row }) => {
        const img = row.original.images?.find((i) => i.is_primary) ?? row.original.images?.[0];
        return (
          <div className="w-10 h-10 rounded-lg bg-pearl/100 overflow-hidden">
            {img ? (
              <img
                src={img.thumbnail_url || img.url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                No img
              </div>
            )}
          </div>
        );
      },
      size: 56,
    },
    {
      accessorKey: "name",
      header: "Product",
      cell: ({ row }) => (
        <Link
          href={`/catalog/products/${row.original.id}`}
          className="font-medium text-cacao hover:text-primary hover:underline"
        >
          {row.original.name}
          {row.original.is_featured && (
            <Star size={12} className="inline ml-1 text-yellow-500 fill-yellow-500" />
          )}
        </Link>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) =>
        row.original.vendor ? (
          <Link
            href={`/vendors/${row.original.vendor.id}`}
            className="text-sm text-taupe hover:text-primary hover:underline"
          >
            {row.original.vendor.name}
          </Link>
        ) : (
          <span className="text-taupe">&mdash;</span>
        ),
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => <span className="text-sm">{formatPrice(row.original.price)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-1">
            <Link href={`/catalog/products/${p.id}`}>
              <Button variant="ghost" size="sm">
                <Eye size={14} />
              </Button>
            </Link>
            {p.status === "pending_review" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleApprove(p.id)}
                  title="Approve"
                >
                  <Check size={14} className="text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRejectTargetId(p.id);
                    setRejectOpen(true);
                  }}
                  title="Reject"
                >
                  <X size={14} className="text-red-600" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleFeature(p.id)}
              title={p.is_featured ? "Unfeature" : "Feature"}
            >
              <Star
                size={14}
                className={p.is_featured ? "text-yellow-500 fill-yellow-500" : "text-taupe"}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Delete this product?")) deleteProduct(p.id);
              }}
              title="Delete"
            >
              <Trash2 size={14} className="text-red-500" />
            </Button>
          </div>
        );
      },
      size: 180,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Products</h1>
          <p className="text-taupe text-sm">Manage all marketplace products.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setExportOpen(true)}>
            <Download size={16} />
            Export
          </Button>
          <Link href="/catalog/products/new">
            <Button className="gap-1.5">
              <Plus size={16} />
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-6">
        {(data?.facets?.attributes?.length ?? 0) > 0 && (
          <aside className="w-64 shrink-0 space-y-6">
            <AttributeFilterSidebar
              attributes={(data?.facets?.attributes ?? []) as AttributeFilter[]}
              getParam={(k) => searchParams.get(k)}
              onChangeParam={onChangeParam}
            />
          </aside>
        )}

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="max-w-xs"
            />
            <FiltersBar
              filters={[
                {
                  key: "status",
                  label: "Status",
                  options: STATUS_OPTIONS,
                  value: statusFilter,
                  onChange: (v) => updateParam({ status: v }),
                },
                {
                  key: "vendor",
                  label: "Vendor",
                  options: vendorOptions,
                  value: vendorFilter,
                  onChange: (v) => updateParam({ vendor_id: v }),
                },
                {
                  key: "brand",
                  label: "Brand",
                  options: brandOptions,
                  value: brandFilter,
                  onChange: (v) => updateParam({ brand_id: v }),
                },
                {
                  key: "category",
                  label: "Category",
                  options: categoryOptions,
                  value: categoryFilter,
                  onChange: (v) => updateParam({ category_id: v }),
                },
              ]}
            />
          </div>

          {/* Bulk actions bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-amber">{selectedIds.length} selected</span>
              <div className="flex items-center gap-1 ml-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("approve")}
                  disabled={bulkPending}
                >
                  <Check size={14} className="mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("publish")}
                  disabled={bulkPending}
                >
                  <Globe size={14} className="mr-1" /> Publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("unpublish")}
                  disabled={bulkPending}
                >
                  Unpublish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("reject")}
                  disabled={bulkPending}
                >
                  <X size={14} className="mr-1" /> Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("archive")}
                  disabled={bulkPending}
                >
                  <Archive size={14} className="mr-1" /> Archive
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("feature")}
                  disabled={bulkPending}
                >
                  <Star size={14} className="mr-1" /> Feature
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction("unfeature")}
                  disabled={bulkPending}
                >
                  Unfeature
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600"
                  onClick={() => handleBulkAction("delete")}
                  disabled={bulkPending}
                >
                  <Trash2 size={14} className="mr-1" /> Delete
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={products}
              isLoading={isLoading}
              pagination={pagination}
              pageCount={pageCount}
              totalCount={total}
              itemLabel="products"
              onPaginationChange={(updater) => {
                const next = typeof updater === "function" ? updater(pagination) : updater;
                updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
              }}
            />
          )}
        </div>
      </div>

      {/* Reject dialog (single) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Product</DialogTitle>
          </DialogHeader>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Reason *</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this product is being rejected..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={!rejectReason.trim()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk reject dialog */}
      <Dialog open={bulkRejectOpen} onOpenChange={setBulkRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {selectedIds.length} Products</DialogTitle>
          </DialogHeader>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Reason *</label>
            <Textarea
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
              placeholder="Rejection reason for all selected products..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkRejectSubmit}
              disabled={!bulkRejectReason.trim() || bulkPending}
            >
              Reject All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {exportOpen && (
        <ProductExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          filters={{
            status: statusFilter === "__all__" ? undefined : statusFilter,
            vendorId: vendorFilter === "__all__" ? undefined : vendorFilter,
            brandId: brandFilter === "__all__" ? undefined : brandFilter,
            categoryId: categoryFilter === "__all__" ? undefined : categoryFilter,
            search: searchParam || undefined,
          }}
        />
      )}
    </div>
  );
}
