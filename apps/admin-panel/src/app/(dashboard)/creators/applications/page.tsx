"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
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
import { toast } from "@materialhub/ui";
import { Trash2 } from "lucide-react";
import { useBulkRemoveCreatorStatus, useCreatorApplications } from "@/lib/queries/creators";

interface CreatorApp {
  id: string;
  user_id: string;
  display_name: string;
  primary_category: string;
  follower_estimate?: number | null;
  status: string;
  submitted_at: string;
}

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Needs info", value: "needs_info" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFollowers(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const val = n / 1000;
    const formatted = val >= 100 ? Math.round(val) : Number(val.toFixed(1));
    return `${formatted}k`;
  }
  const val = n / 1_000_000;
  const formatted = Number(val.toFixed(1));
  return `${formatted}m`;
}

export default function CreatorApplicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = searchParams.get("tab") ?? "queue";
  const allStatus = searchParams.get("status") ?? "__all__";
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

  const { data: queueData, isLoading: queueLoading } = useCreatorApplications({
    status: "pending",
    page: 1,
    limit: 100,
  });
  const { data: allData, isLoading: allLoading } = useCreatorApplications({
    status: allStatus === "__all__" ? undefined : allStatus,
    page,
    limit: pagination.pageSize,
  });

  const queueItems: CreatorApp[] = queueData?.items ?? [];
  const allItems: CreatorApp[] = allData?.items ?? [];
  const allTotal: number = allData?.total ?? 0;
  const allPageCount = Math.ceil(allTotal / pagination.pageSize) || 1;

  // Only an approved application corresponds to a live creator — selection
  // and the bulk-delete action are scoped to those rows.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const { mutate: bulkRemoveCreatorStatus, isPending: bulkRemovePending } =
    useBulkRemoveCreatorStatus();

  const selectableAllItems = useMemo(
    () => allItems.filter((a) => a.status === "approved"),
    [allItems],
  );
  const allSelectableSelected =
    selectableAllItems.length > 0 &&
    selectableAllItems.every((a) => selectedUserIds.includes(a.user_id));

  function handleBulkDelete() {
    if (selectedUserIds.length === 0) return;
    if (
      !confirm(
        `Remove creator status from ${selectedUserIds.length} creator${selectedUserIds.length === 1 ? "" : "s"}? Their accounts stay active — they just stop appearing as creators.`,
      )
    ) {
      return;
    }
    bulkRemoveCreatorStatus(selectedUserIds, {
      onSuccess: ({ succeeded, failed }) => {
        toast({
          title: "Creator status removed",
          description:
            failed > 0
              ? `${succeeded} succeeded, ${failed} failed.`
              : `${succeeded} creator${succeeded === 1 ? "" : "s"} updated.`,
          variant: failed > 0 ? "destructive" : undefined,
        });
        setSelectedUserIds([]);
      },
      onError: () =>
        toast({
          title: "Error",
          description: "Failed to remove creator status.",
          variant: "destructive",
        }),
    });
  }

  const columns: ColumnDef<CreatorApp>[] = [
    {
      accessorKey: "display_name",
      header: "Creator",
      cell: ({ row }) => (
        <Link
          href={`/creators/applications/${row.original.id}`}
          className="font-medium text-cacao hover:text-primary hover:underline"
        >
          {row.original.display_name}
        </Link>
      ),
    },
    { accessorKey: "primary_category", header: "Niche" },
    {
      accessorKey: "follower_estimate",
      header: "Followers",
      cell: ({ row }) => (
        <span className="text-sm text-taupe tabular-nums">
          {formatFollowers(row.original.follower_estimate)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "submitted_at",
      header: "Submitted",
      cell: ({ row }) => formatDate(row.original.submitted_at),
    },
  ];

  // Separate column set for the "all" tab only — selection only makes sense
  // where an approved (i.e. live) creator can appear.
  const allColumns: ColumnDef<CreatorApp>[] = [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          checked={allSelectableSelected}
          disabled={selectableAllItems.length === 0}
          onChange={(e) => {
            const ids = selectableAllItems.map((a) => a.user_id);
            setSelectedUserIds((prev) =>
              e.target.checked
                ? Array.from(new Set([...prev, ...ids]))
                : prev.filter((id) => !ids.includes(id)),
            );
          }}
          className="rounded"
        />
      ),
      cell: ({ row }) =>
        row.original.status === "approved" ? (
          <input
            type="checkbox"
            checked={selectedUserIds.includes(row.original.user_id)}
            onChange={(e) => {
              const id = row.original.user_id;
              setSelectedUserIds((prev) =>
                e.target.checked ? [...prev, id] : prev.filter((sid) => sid !== id),
              );
            }}
            className="rounded"
          />
        ) : null,
      size: 40,
    },
    ...columns,
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Creator Applications</h1>
        <p className="text-taupe text-sm">Review and decide creator onboarding applications.</p>
      </div>

      <Tabs value={tab} onValueChange={(t) => updateParam({ tab: t })}>
        <TabsList>
          <TabsTrigger value="queue">
            Review Queue
            {queueItems.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
                {queueItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Applications</TabsTrigger>
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
              data={queueItems}
              isLoading={queueLoading}
              totalCount={queueData?.total ?? queueItems.length}
              itemLabel="applications"
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
                  value: allStatus,
                  onChange: (v) => updateParam({ status: v }),
                },
              ]}
            />

            {selectedUserIds.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-medium text-amber">
                  {selectedUserIds.length} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-3 text-red-600"
                  onClick={handleBulkDelete}
                  disabled={bulkRemovePending}
                >
                  <Trash2 size={14} className="mr-1" /> Remove creator status
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setSelectedUserIds([])}
                >
                  Clear
                </Button>
              </div>
            )}

            <DataTable
              columns={allColumns}
              data={allItems}
              isLoading={allLoading}
              pagination={pagination}
              pageCount={allPageCount}
              totalCount={allTotal}
              itemLabel="applications"
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
