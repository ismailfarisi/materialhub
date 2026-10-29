"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, FiltersBar, Skeleton, Button } from "@materialhub/ui";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@materialhub/ui";
import { useAdminFlashDeals, useDeleteFlashDeal } from "@/lib/queries/promotions";

interface FlashDealProduct {
  name: string;
}

interface FlashDealVendor {
  name: string;
}

interface FlashDeal {
  id: string;
  title: string | null;
  product: FlashDealProduct | null;
  vendor: FlashDealVendor | null;
  deal_price: number;
  original_price: number;
  discount_percentage: number;
  quantity_sold: number | null;
  quantity_limit: number | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Expired", value: "expired" },
  { label: "Disabled", value: "disabled" },
];

function formatCurrency(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function deriveStatus(deal: FlashDeal): { label: string; color: string } {
  const now = new Date();
  if (!deal.is_active) return { label: "Disabled", color: "bg-red-100 text-red-700" };
  if (deal.starts_at && new Date(deal.starts_at) > now)
    return { label: "Scheduled", color: "bg-blue-100 text-amber" };
  if (deal.expires_at && new Date(deal.expires_at) < now)
    return { label: "Expired", color: "bg-pearl/100 text-taupe" };
  return { label: "Active", color: "bg-green-100 text-green-700" };
}

export default function FlashDealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

  const filters = {
    status: statusFilter,
    page,
    limit: pagination.pageSize,
  };

  const { data, isLoading } = useAdminFlashDeals(filters);
  const { mutate: deleteDeal, isPending: deleting } = useDeleteFlashDeal();

  const deals: FlashDeal[] = data?.data?.data ?? data?.data ?? data?.items ?? [];
  const total: number = data?.total ?? data?.data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function handleDelete(id: string) {
    deleteDeal(id, {
      onSuccess: () => {
        toast({ title: "Flash deal deleted", description: "The flash deal has been removed." });
        setDeleteConfirm(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete flash deal.", variant: "destructive" });
      },
    });
  }

  const columns: ColumnDef<FlashDeal>[] = [
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-cacao">
            {row.original.product?.name ?? row.original.title ?? "—"}
          </p>
        </div>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">{row.original.vendor?.name ?? "—"}</span>
      ),
    },
    {
      id: "pricing",
      header: "Deal / Original Price",
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <span className="text-sm font-medium text-cacao">
            {formatCurrency(row.original.deal_price)}
          </span>
          <span className="text-xs text-taupe line-through ml-2">
            {formatCurrency(row.original.original_price)}
          </span>
        </div>
      ),
    },
    {
      id: "discount_pct",
      header: "Discount",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          {Number(row.original.discount_percentage).toFixed(1)}%
        </span>
      ),
    },
    {
      id: "qty",
      header: "Qty Sold / Limit",
      cell: ({ row }) => {
        const { quantity_sold, quantity_limit } = row.original;
        return (
          <span className="text-sm tabular-nums text-taupe">
            {quantity_limit != null
              ? `${quantity_sold ?? 0}/${quantity_limit}`
              : String(quantity_sold ?? 0)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const { label, color } = deriveStatus(row.original);
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
            {label}
          </span>
        );
      },
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="text-xs text-taupe whitespace-nowrap">
          {formatDate(row.original.starts_at)} → {formatDate(row.original.expires_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/promotions/flash-deals/${id}`)}
              className="h-7 px-2"
            >
              <Pencil size={13} />
            </Button>
            {deleteConfirm === id ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-600 hover:bg-red-50"
                  disabled={deleting}
                  onClick={() => handleDelete(id)}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-taupe"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-red-500 hover:bg-red-50"
                onClick={() => setDeleteConfirm(id)}
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Flash Deals</h1>
          <p className="text-taupe text-sm">Manage time-limited flash sale deals.</p>
        </div>
        <Button asChild className="flex-shrink-0 gap-1.5">
          <Link href="/promotions/flash-deals/new">
            <Plus size={16} />
            New Flash Deal
          </Link>
        </Button>
      </div>

      <FiltersBar
        filters={[
          {
            key: "status",
            label: "Status",
            options: STATUS_OPTIONS,
            value: statusFilter,
            onChange: (v) => updateParam({ status: v }),
          },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={deals}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="deals"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
