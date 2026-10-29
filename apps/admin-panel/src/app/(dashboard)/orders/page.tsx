"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";
import {
  DataTable,
  StatusBadge,
  FiltersBar,
  Skeleton,
  Button,
} from "@materialhub/ui";
import { Download } from "lucide-react";
import { useAllOrders, useExportOrdersCsv } from "@/lib/queries/orders";
import { toast } from "@materialhub/ui";

interface Order {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  customer_email: string;
  total: number;
  vendor_count: number;
  created_at: string;
}

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Returned", value: "returned" },
];

function formatCurrency(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const dateRange: DateRange | undefined = useMemo(() => {
    if (!dateFromParam && !dateToParam) return undefined;
    return {
      from: dateFromParam ? new Date(dateFromParam) : undefined,
      to: dateToParam ? new Date(dateToParam) : undefined,
    };
  }, [dateFromParam, dateToParam]);

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
    status: statusFilter === "__all__" ? undefined : statusFilter,
    vendor_id: vendorFilter === "__all__" ? undefined : vendorFilter,
    date_from: dateFromParam || undefined,
    date_to: dateToParam || undefined,
    page,
    limit: pagination.pageSize,
  };

  const { data, isLoading } = useAllOrders(filters);
  const { mutate: exportCsv, isPending: exporting } = useExportOrdersCsv({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    vendor_id: vendorFilter === "__all__" ? undefined : vendorFilter,
    date_from: dateFromParam || undefined,
    date_to: dateToParam || undefined,
  });

  // Map API fields to table fields
  const rawOrders: any[] = Array.isArray(data) ? data : data?.items ?? [];
  const orders: Order[] = rawOrders.map((o: any) => ({
    ...o,
    customer_name: o.customer_name || (o.shipping_address
      ? o.shipping_address.full_name || `${o.shipping_address.first_name || ""} ${o.shipping_address.last_name || ""}`.trim()
      : "—"),
    customer_email: o.customer_email || o.user?.email || "",
    total: o.total ?? o.grand_total ?? 0,
    vendor_count: o.vendor_count ?? o.vendorOrders?.length ?? 1,
  }));
  const total: number = data?.total ?? rawOrders.length;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function handleExport() {
    exportCsv(undefined, {
      onSuccess: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orders-export-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      onError: () => {
        toast({ title: "Export failed", description: "Could not export orders.", variant: "destructive" });
      },
    });
  }

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "order_number",
      header: "Order #",
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/orders/${row.original.id}`)}
          className="font-mono text-primary hover:underline font-medium"
        >
          {row.original.order_number}
        </button>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-cacao">{row.original.customer_name || "—"}</p>
          <p className="text-xs text-taupe">{row.original.customer_email}</p>
        </div>
      ),
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{formatCurrency(row.original.total)}</span>
      ),
    },
    {
      accessorKey: "vendor_count",
      header: "Vendors",
      cell: ({ row }) => (
        <span className="text-taupe">{row.original.vendor_count ?? 1}</span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Orders</h1>
          <p className="text-taupe text-sm">View and manage all platform orders.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="gap-1.5 flex-shrink-0"
        >
          <Download size={16} />
          {exporting ? "Exporting..." : "Export CSV"}
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
        dateRange={{
          from: dateRange?.from,
          to: dateRange?.to,
          onChange: (range) => {
            updateParam({
              date_from: range?.from?.toISOString().split("T")[0],
              date_to: range?.to?.toISOString().split("T")[0],
            });
          },
        }}
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
          data={orders}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="orders"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
