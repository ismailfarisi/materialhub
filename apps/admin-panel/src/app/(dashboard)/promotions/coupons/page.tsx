"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, FiltersBar, Skeleton, Button, Input } from "@materialhub/ui";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@materialhub/ui";
import { useAdminCoupons, useDeleteCoupon } from "@/lib/queries/promotions";

interface Coupon {
  id: string;
  code: string;
  name: string;
  type: "percentage" | "fixed_amount" | "free_shipping" | "buy_x_get_y";
  discount_value: number | null;
  usage_count: number;
  usage_limit: number | null;
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

const TYPE_OPTIONS = [
  { label: "Percentage", value: "percentage" },
  { label: "Fixed Amount", value: "fixed_amount" },
  { label: "Free Shipping", value: "free_shipping" },
  { label: "Buy X Get Y", value: "buy_x_get_y" },
];

const TYPE_BADGE_COLORS: Record<string, string> = {
  percentage: "bg-purple-100 text-purple-700",
  fixed_amount: "bg-blue-100 text-amber",
  free_shipping: "bg-green-100 text-green-700",
  buy_x_get_y: "bg-orange-100 text-orange-700",
};

function formatCurrency(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDiscount(coupon: Coupon): string {
  switch (coupon.type) {
    case "percentage":
      return coupon.discount_value != null ? `${coupon.discount_value}%` : "—";
    case "fixed_amount":
      return coupon.discount_value != null ? formatCurrency(coupon.discount_value) : "—";
    case "free_shipping":
      return "Free Shipping";
    case "buy_x_get_y":
      return "Buy X Get Y";
    default:
      return "—";
  }
}

function deriveStatus(coupon: Coupon): { label: string; color: string } {
  const now = new Date();
  if (!coupon.is_active) return { label: "Disabled", color: "bg-red-100 text-red-700" };
  if (coupon.starts_at && new Date(coupon.starts_at) > now)
    return { label: "Scheduled", color: "bg-blue-100 text-amber" };
  if (coupon.expires_at && new Date(coupon.expires_at) < now)
    return { label: "Expired", color: "bg-pearl/100 text-taupe" };
  return { label: "Active", color: "bg-green-100 text-green-700" };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CouponsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const typeFilter = searchParams.get("type") ?? "__all__";
  const searchParam = searchParams.get("search") ?? "";
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

  const filters = {
    status: statusFilter,
    type: typeFilter,
    search: searchParam || undefined,
    page,
    limit: pagination.pageSize,
  };

  const { data, isLoading } = useAdminCoupons(filters);
  const { mutate: deleteCoupon, isPending: deleting } = useDeleteCoupon();

  const coupons: Coupon[] = data?.data?.data ?? data?.data ?? data?.items ?? [];
  const total: number = data?.total ?? data?.data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function handleDelete(id: string) {
    deleteCoupon(id, {
      onSuccess: () => {
        toast({ title: "Coupon deleted", description: "The coupon has been removed." });
        setDeleteConfirm(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete coupon.", variant: "destructive" });
      },
    });
  }

  const columns: ColumnDef<Coupon>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/promotions/coupons/${row.original.id}`)}
          className="font-mono text-sm text-primary hover:underline font-medium"
        >
          {row.original.code}
        </button>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="text-sm text-cacao">{row.original.name}</span>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const t = row.original.type;
        const label = TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE_COLORS[t] ?? "bg-pearl/100 text-taupe"}`}
          >
            {label}
          </span>
        );
      },
    },
    {
      id: "discount",
      header: "Discount",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-cacao">{formatDiscount(row.original)}</span>
      ),
    },
    {
      id: "usage",
      header: "Usage",
      cell: ({ row }) => {
        const { usage_count, usage_limit } = row.original;
        return (
          <span className="text-sm tabular-nums text-taupe">
            {usage_limit != null ? `${usage_count ?? 0}/${usage_limit}` : String(usage_count ?? 0)}
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
      id: "dates",
      header: "Dates",
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
              onClick={() => router.push(`/promotions/coupons/${id}`)}
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
          <h1 className="text-2xl font-bold text-cacao mb-1">Coupons</h1>
          <p className="text-taupe text-sm">Manage discount coupons for the platform.</p>
        </div>
        <Button asChild className="flex-shrink-0 gap-1.5">
          <Link href="/promotions/coupons/new">
            <Plus size={16} />
            New Coupon
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
              key: "type",
              label: "Type",
              options: TYPE_OPTIONS,
              value: typeFilter,
              onChange: (v) => updateParam({ type: v }),
            },
          ]}
        />
        <Input
          placeholder="Search coupons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={coupons}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="coupons"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
