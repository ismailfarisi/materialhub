"use client";

import { QueryError } from "@/components/query-error";
import { formatDateTime, formatFils, marketplaceDayRange } from "@/lib/booking-format";
import { useAdminBookings } from "@/lib/queries/bookings";
import { useVendors } from "@/lib/queries/vendors";
import { DataTable, FiltersBar, Input, StatusBadge } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

interface AdminBooking {
  id: string;
  booking_number: string;
  customer_name: string | null;
  vendor_id: string;
  vendor_name: string | null;
  service_name: string;
  staff_member_id: string | null;
  starts_at: string;
  status: string;
  price_fils: number;
}

const STATUS_OPTIONS = [
  { label: "Pending Payment", value: "pending_payment" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Rescheduled", value: "rescheduled" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "No Show", value: "no_show" },
  { label: "Expired", value: "expired" },
];

export default function BookingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
  const dateFromParam = searchParams.get("date_from");
  const dateToParam = searchParams.get("date_to");
  const searchParam = searchParams.get("search") ?? "";
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

  const { data, isLoading, isError, error, refetch } = useAdminBookings({
    status: statusFilter,
    vendorId: vendorFilter === "__all__" ? undefined : vendorFilter,
    ...marketplaceDayRange(dateRange?.from, dateRange?.to),
    search: searchParam || undefined,
    page,
    limit: pagination.pageSize,
  });

  const { data: vendorsData } = useVendors({ limit: 200 });
  const vendorOptions = useMemo(() => {
    const vendors = vendorsData?.items ?? vendorsData?.data ?? [];
    // biome-ignore lint/suspicious/noExplicitAny: loosely-typed API response
    return vendors.map((v: any) => ({ label: v.name, value: v.id }));
  }, [vendorsData]);

  const bookings: AdminBooking[] = data?.data ?? data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<AdminBooking>[] = [
    {
      accessorKey: "booking_number",
      header: "Booking #",
      cell: ({ row }) => (
        <Link
          href={`/bookings/${row.original.id}`}
          className="font-medium text-cacao hover:text-primary hover:underline"
        >
          {row.original.booking_number}
        </Link>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => row.original.customer_name ?? "—",
    },
    {
      accessorKey: "vendor_name",
      header: "Vendor",
      cell: ({ row }) => row.original.vendor_name ?? "—",
    },
    { accessorKey: "service_name", header: "Service" },
    {
      accessorKey: "starts_at",
      header: "Starts",
      cell: ({ row }) => formatDateTime(row.original.starts_at),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "price_fils",
      header: "Amount",
      cell: ({ row }) => formatFils(row.original.price_fils),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Bookings</h1>
        <p className="text-taupe text-sm">
          All appointments across every vendor on the marketplace.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
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
          <Input
            placeholder="Search booking number..."
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isError ? (
          <QueryError
            title="Could not load bookings."
            error={error}
            onRetry={() => refetch()}
          />
        ) : (
          <DataTable
            columns={columns}
            data={bookings}
            isLoading={isLoading}
            pagination={pagination}
            pageCount={pageCount}
            totalCount={total}
            itemLabel="bookings"
            onPaginationChange={(updater) => {
              const next = typeof updater === "function" ? updater(pagination) : updater;
              updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
            }}
          />
        )}
      </div>
    </div>
  );
}
