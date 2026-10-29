"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  StatusBadge,
  FiltersBar,
  Button,
} from "@materialhub/ui";
import { Star } from "lucide-react";
import {
  usePendingReviews,
  useApproveReview,
  useRejectReview,
  type Review,
} from "@/lib/queries/reviews";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Flagged", value: "flagged" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          className={i < rating ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-200"}
        />
      ))}
      <span className="ml-1 text-xs text-taupe">{rating}/5</span>
    </div>
  );
}

export default function ReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "pending";
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

  const { data, isLoading } = usePendingReviews({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    page,
    limit: pagination.pageSize,
  });

  const { mutate: approve, isPending: approving } = useApproveReview();
  const { mutate: reject, isPending: rejecting } = useRejectReview();

  const reviews: Review[] = data?.reviews ?? data?.items ?? data ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<Review>[] = [
    {
      accessorKey: "product_name",
      header: "Product",
      cell: ({ row }) => (
        <span className="font-medium text-cacao max-w-[180px] truncate block">
          {row.original.product_name}
        </span>
      ),
    },
    {
      accessorKey: "rating",
      header: "Rating",
      cell: ({ row }) => <StarRating rating={row.original.rating} />,
    },
    {
      accessorKey: "body",
      header: "Review",
      cell: ({ row }) => (
        <span className="text-sm text-taupe max-w-xs truncate block" title={row.original.body}>
          {row.original.body.length > 100
            ? row.original.body.slice(0, 97) + "…"
            : row.original.body}
        </span>
      ),
    },
    {
      accessorKey: "reviewer_name",
      header: "Reviewer",
      cell: ({ row }) => (
        <span className="text-sm text-cacao">{row.original.reviewer_name}</span>
      ),
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        const isPendingOrFlagged = r.status === "pending" || r.status === "flagged";
        if (!isPendingOrFlagged) return null;
        return (
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 border-green-300 hover:bg-green-50"
              disabled={approving}
              onClick={() => approve(r.id)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-300 hover:bg-red-50"
              disabled={rejecting}
              onClick={() => reject(r.id)}
            >
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Review Moderation</h1>
        <p className="text-taupe text-sm">
          Approve or reject customer product reviews. Flagged reviews are automatically surfaced here.
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
        ]}
      />

      <DataTable
        columns={columns}
        data={reviews}
        isLoading={isLoading}
        pagination={pagination}
        pageCount={pageCount}
        totalCount={total}
        itemLabel="reviews"
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater;
          updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
        }}
      />
    </div>
  );
}
