"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, FiltersBar, StatusBadge } from "@materialhub/ui";
import { useAdminAssignees, useDisputes, type Dispute } from "@/lib/queries/disputes";
import {
  DISPUTE_STATUSES,
  DISPUTE_STATUS_COLORS,
  DISPUTE_STATUS_LABELS,
  disputeCategoryLabel,
} from "@/lib/disputes.helpers";

const STATUS_OPTIONS = DISPUTE_STATUSES.map((value) => ({
  value,
  label: DISPUTE_STATUS_LABELS[value] ?? value,
}));

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DisputesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const assigneeFilter = searchParams.get("assigned_to") ?? "__all__";
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

  const { data, isLoading, isError } = useDisputes({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    assigned_to: assigneeFilter === "__all__" ? undefined : assigneeFilter,
    page,
    limit: pagination.pageSize,
  });
  const { data: admins = [] } = useAdminAssignees();

  const disputes = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<Dispute>[] = [
    {
      accessorKey: "dispute_number",
      header: "Dispute",
      cell: ({ row }) => (
        <Link
          href={`/disputes/${row.original.id}`}
          className="font-mono text-xs font-medium text-cacao underline decoration-cacao/30 underline-offset-4 hover:decoration-amber"
        >
          {row.original.dispute_number}
        </Link>
      ),
    },
    {
      accessorKey: "order_number",
      header: "Order",
      cell: ({ row }) =>
        row.original.order_number ? (
          <Link
            href={`/orders/${row.original.order_id}`}
            className="font-mono text-xs text-cacao hover:text-amber"
          >
            #{row.original.order_number}
          </Link>
        ) : (
          <span className="text-taupe">—</span>
        ),
    },
    {
      accessorKey: "vendor_name",
      header: "Supplier",
      cell: ({ row }) => (
        <span className="text-sm text-cacao">{row.original.vendor_name ?? "—"}</span>
      ),
    },
    {
      accessorKey: "buyer_name",
      header: "Buyer",
      cell: ({ row }) => (
        <span className="text-sm text-cacao">{row.original.buyer_name ?? "—"}</span>
      ),
    },
    {
      accessorKey: "category",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">{disputeCategoryLabel(row.original.category)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} colorMap={DISPUTE_STATUS_COLORS} />
      ),
    },
    {
      accessorKey: "assigned_to_name",
      header: "Assigned to",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">
          {row.original.assigned_to_name ?? <span className="italic">Unassigned</span>}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Opened",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Link
            href={`/disputes/${row.original.id}`}
            className="rounded-md border border-cacao/15 px-3 py-1.5 text-sm font-medium text-cacao hover:bg-pearl/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            Open case
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Disputes</h1>
        <p className="text-taupe text-sm">
          Buyer disputes against suppliers. Open a case to assign it, read and reply on the thread,
          escalate, resolve with a refund, or close it.
        </p>
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
          {
            key: "assigned_to",
            label: "Assigned to",
            options: admins.map((a) => ({ value: a.id, label: a.name })),
            value: assigneeFilter,
            onChange: (v) => updateParam({ assigned_to: v }),
          },
        ]}
      />

      {isError ? (
        <p role="alert" className="rounded-lg border border-russet/30 bg-russet/5 px-4 py-3 text-sm text-russet">
          Disputes could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={disputes}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="disputes"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
