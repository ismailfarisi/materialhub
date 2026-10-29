"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import {
  Button,
  DataTable,
  StatusBadge,
  FiltersBar,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Skeleton,
} from "@materialhub/ui";
import { useVendors } from "@/lib/queries/vendors";

interface Vendor {
  id: string;
  name: string;
  business_name: string;
  status: string;
  contact_email: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Pending", value: "pending" },
  { label: "Under Review", value: "under_review" },
  { label: "Rejected", value: "rejected" },
  { label: "Suspended", value: "suspended" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}


export default function VendorsPage() {
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

  // Approval queue query
  const { data: queueData, isLoading: queueLoading } = useVendors({
    status: "pending",
    page: tab === "queue" ? page : 1,
    limit: pagination.pageSize,
  });

  // All vendors query
  const { data: allData, isLoading: allLoading } = useVendors({
    status: allStatusFilter === "__all__" ? undefined : allStatusFilter,
    page: tab === "all" ? page : 1,
    limit: pagination.pageSize,
  });

  const queueVendors: Vendor[] = (queueData?.data ?? queueData?.items ?? []).filter(
    (v: Vendor) => v.status === "pending" || v.status === "under_review"
  );
  const allVendors: Vendor[] = allData?.data ?? allData?.items ?? [];
  const allTotal: number = allData?.total ?? 0;
  const allPageCount = Math.ceil(allTotal / pagination.pageSize) || 1;

  const columns: ColumnDef<Vendor>[] = [
    {
      accessorKey: "name",
      header: "Store Name",
      cell: ({ row }) => (
        <Link href={`/vendors/${row.original.id}`} className="font-medium text-cacao hover:text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "business_name",
      header: "Business Name",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "contact_email",
      header: "Contact Email",
    },
    {
      accessorKey: "created_at",
      header: "Joined",
      cell: ({ row }) => formatDate(row.original.created_at),
    },
  ];

  const queueTotal: number = queueVendors.length;
  const queuePageCount = Math.max(1, Math.ceil(queueTotal / pagination.pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Vendors</h1>
          <p className="text-taupe text-sm">Manage vendor accounts and approval requests.</p>
        </div>
        <Link href="/vendors/new">
          <Button className="gap-1.5">
            <Plus size={16} />
            Add Vendor
          </Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(t) => updateParam({ tab: t })}>
        <TabsList>
          <TabsTrigger value="queue">
            Approval Queue
            {queueVendors.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
                {queueVendors.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Vendors</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          {queueLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={queueVendors}
              isLoading={queueLoading}
              pagination={pagination}
              pageCount={queuePageCount}
              totalCount={queueData?.total ?? queueVendors.length}
              itemLabel="vendors"
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
            <DataTable
              columns={columns}
              data={allVendors}
              isLoading={allLoading}
              pagination={pagination}
              pageCount={allPageCount}
              totalCount={allTotal}
              itemLabel="vendors"
              onPaginationChange={(updater) => {
                const next = typeof updater === "function" ? updater(pagination) : updater;
                updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
