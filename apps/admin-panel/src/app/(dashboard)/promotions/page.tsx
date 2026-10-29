"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, StatusBadge, FiltersBar, Skeleton, Input } from "@materialhub/ui";
import { Tag, Zap } from "lucide-react";
import { usePromotionsOverview } from "@/lib/queries/promotions";

interface PromotionRow {
  id: string;
  type: "coupon" | "flash_deal";
  name: string;
  discount_display: string;
  status: "active" | "scheduled" | "expired" | "disabled";
  starts_at: string | null;
  expires_at: string | null;
  usage: string;
  vendor_name: string | null;
}

const TYPE_OPTIONS = [
  { label: "Coupon", value: "coupon" },
  { label: "Flash Deal", value: "flash_deal" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Expired", value: "expired" },
  { label: "Disabled", value: "disabled" },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  scheduled: "bg-blue-100 text-amber",
  expired: "bg-pearl/100 text-taupe",
  disabled: "bg-red-100 text-red-700",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PromotionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const typeFilter = searchParams.get("type") ?? "__all__";
  const statusFilter = searchParams.get("status") ?? "__all__";
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
    type: typeFilter,
    status: statusFilter,
    search: searchParam || undefined,
    page,
    limit: pagination.pageSize,
  };

  const { data, isLoading } = usePromotionsOverview(filters);

  const items: PromotionRow[] = data?.data ?? data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<PromotionRow>[] = [
    {
      id: "type_icon",
      header: "Type",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-pearl/100 text-cacao">
          {row.original.type === "coupon" ? <Tag size={12} /> : <Zap size={12} />}
          {row.original.type === "coupon" ? "Coupon" : "Flash Deal"}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const { id, type, name } = row.original;
        const href =
          type === "coupon"
            ? `/promotions/coupons/${id}`
            : `/promotions/flash-deals/${id}`;
        return (
          <button
            onClick={() => router.push(href)}
            className="text-primary hover:underline font-medium text-sm"
          >
            {name}
          </button>
        );
      },
    },
    {
      accessorKey: "discount_display",
      header: "Discount",
      cell: ({ row }) => (
        <span className="text-sm text-cacao">{row.original.discount_display}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[s] ?? "bg-pearl/100 text-taupe"}`}
          >
            {s}
          </span>
        );
      },
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => (
        <span className="text-sm text-taupe whitespace-nowrap">
          {formatDate(row.original.starts_at)} → {formatDate(row.original.expires_at)}
        </span>
      ),
    },
    {
      accessorKey: "usage",
      header: "Usage",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-taupe">{row.original.usage ?? "—"}</span>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">
          {row.original.vendor_name ?? "Platform"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Promotions</h1>
          <p className="text-taupe text-sm">Manage all coupons and flash deals.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FiltersBar
          filters={[
            {
              key: "type",
              label: "Type",
              options: TYPE_OPTIONS,
              value: typeFilter,
              onChange: (v) => updateParam({ type: v }),
            },
            {
              key: "status",
              label: "Status",
              options: STATUS_OPTIONS,
              value: statusFilter,
              onChange: (v) => updateParam({ status: v }),
            },
          ]}
        />
        <Input
          placeholder="Search promotions..."
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
          data={items}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="promotions"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
