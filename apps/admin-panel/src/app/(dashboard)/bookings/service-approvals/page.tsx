"use client";

import { QueryError } from "@/components/query-error";
import { formatDate, formatFils } from "@/lib/booking-format";
import { useAdminOfferings } from "@/lib/queries/service-offerings";
import {
  DataTable,
  FiltersBar,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

interface AdminOffering {
  id: string;
  name: string;
  vendor_id: string;
  status: string;
  price_fils: number;
  duration_minutes: number;
  created_at: string;
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Pending Review", value: "pending_review" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
];

const columns: ColumnDef<AdminOffering>[] = [
  {
    accessorKey: "name",
    header: "Service",
    cell: ({ row }) => (
      <Link
        href={`/bookings/service-approvals/${row.original.id}`}
        className="font-medium text-cacao hover:text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "price_fils",
    header: "Price",
    cell: ({ row }) => formatFils(row.original.price_fils),
  },
  {
    accessorKey: "duration_minutes",
    header: "Duration",
    cell: ({ row }) => `${row.original.duration_minutes} min`,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "created_at",
    header: "Submitted",
    cell: ({ row }) => formatDate(row.original.created_at),
  },
];

export default function ServiceApprovalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = searchParams.get("tab") ?? "queue";
  const allStatusFilter = searchParams.get("status") ?? "__all__";
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

  const {
    data: queueData,
    isLoading: queueLoading,
    isError: queueError,
    error: queueErrorObj,
    refetch: refetchQueue,
  } = useAdminOfferings({
    status: "pending_review",
    page: tab === "queue" ? page : 1,
    limit: pagination.pageSize,
  });

  const {
    data: allData,
    isLoading: allLoading,
    isError: allError,
    error: allErrorObj,
    refetch: refetchAll,
  } = useAdminOfferings({
    status: allStatusFilter,
    page: tab === "all" ? page : 1,
    limit: pagination.pageSize,
  });

  const queueOfferings: AdminOffering[] = queueData?.data ?? [];
  const queueTotal: number = queueData?.total ?? 0;
  const queuePageCount = Math.ceil(queueTotal / pagination.pageSize) || 1;

  const allOfferings: AdminOffering[] = allData?.data ?? [];
  const allTotal: number = allData?.total ?? 0;
  const allPageCount = Math.ceil(allTotal / pagination.pageSize) || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Service Approvals</h1>
        <p className="text-taupe text-sm">
          Review the first service a vendor submits. Once approved, that vendor publishes
          future services without review.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(t) => updateParam({ tab: t })}>
        <TabsList>
          <TabsTrigger value="queue">
            Approval Queue
            {queueTotal > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
                {queueTotal}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Services</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          {queueError ? (
            <QueryError
              title="Could not load the approval queue."
              error={queueErrorObj}
              onRetry={() => refetchQueue()}
            />
          ) : (
            <DataTable
              columns={columns}
              data={queueOfferings}
              isLoading={queueLoading}
              pagination={pagination}
              pageCount={queuePageCount}
              totalCount={queueTotal}
              itemLabel="services"
              onPaginationChange={(updater) => {
                const next = typeof updater === "function" ? updater(pagination) : updater;
                updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="space-y-4">
            <FiltersBar
              filters={[
                {
                  key: "status",
                  label: "Status",
                  options: STATUS_OPTIONS,
                  value: allStatusFilter,
                  onChange: (v) => updateParam({ status: v }),
                },
              ]}
            />
            {allError ? (
              <QueryError
                title="Could not load services."
                error={allErrorObj}
                onRetry={() => refetchAll()}
              />
            ) : (
              <DataTable
                columns={columns}
                data={allOfferings}
                isLoading={allLoading}
                pagination={pagination}
                pageCount={allPageCount}
                totalCount={allTotal}
                itemLabel="services"
                onPaginationChange={(updater) => {
                  const next = typeof updater === "function" ? updater(pagination) : updater;
                  updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
                }}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
